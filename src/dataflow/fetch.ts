export type Pair = { key: string; value: string; enabled: boolean };
export type FetchConfig = { url: string; method: string; headers: Pair[]; query: Pair[]; params: Pair[]; bodyType: 'none' | 'json' | 'raw' | 'form'; body: string; auth: 'none' | 'bearer' | 'basic' | 'apiKey'; apiKeyName: string; apiKeyIn: 'header' | 'query'; timeoutMs: number; credentials: 'omit' | 'include' };
export const defaultFetch: FetchConfig = { url: '', method: 'GET', headers: [], query: [], params: [], bodyType: 'none', body: '', auth: 'none', apiKeyName: 'X-API-Key', apiKeyIn: 'header', timeoutMs: 30000, credentials: 'omit' };
export type Secrets = { token: string; username: string; password: string };
export type PreparedRequest = { url: string; method: string; headers: Record<string, string>; body: string | null; timeoutMs: number; credentials: 'omit' | 'include' };
export type HttpResponse = { status: number; statusText: string; headers: Record<string, string>; body: unknown; durationMs: number };
// Mesma política de SSRF do scraper de embed (src-tauri/src/scrape.rs): os
// elementos de rede nunca conversam com a rede interna do usuário — loopback,
// redes privadas, link-local (inclui o metadata 169.254.169.254) e faixas
// reservadas. O WHATWG URL já normaliza formas ofuscadas de IPv4
// (2130706433, 0x7f.1, octal) em hostname pontilhado antes da checagem.
const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function ipv4Disallowed(o: number[]): boolean {
  const [a, b, c] = o;
  return a === 0 // 0.0.0.0/8 "esta rede"
    || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) // privadas
    || a === 127 // loopback
    || (a === 169 && b === 254) // link-local
    || (a === 100 && (b & 0xc0) === 64) // CGNAT 100.64/10
    || (a === 192 && b === 0 && (c === 0 || c === 2)) // tradução 192.0.0/24 e documentação 192.0.2/24
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) // benchmarking e documentação
    || (a === 203 && b === 0 && c === 113) // documentação
    || a >= 224; // multicast, broadcast e reservado
}
function ipv6Groups(host: string): number[] | null {
  const parts = host.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] === '' ? [] : parts[0].split(':');
  const tail = parts.length === 2 && parts[1] !== '' ? parts[1].split(':') : [];
  if (parts.length === 1 ? head.length !== 8 : head.length + tail.length > 7) return null;
  const groups: number[] = [];
  for (const group of [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail]) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    groups.push(parseInt(group, 16));
  }
  return groups;
}
function ipv6Disallowed(host: string): boolean {
  const g = ipv6Groups(host);
  if (!g) return true; // não interpretável → bloqueia
  const trailingV4 = () => ipv4Disallowed([(g[6] >> 8) & 0xff, g[6] & 0xff, (g[7] >> 8) & 0xff, g[7] & 0xff]);
  if (g.slice(0, 5).every((v) => v === 0) && (g[5] === 0 || g[5] === 0xffff)) return trailingV4(); // mapeada ::ffff:0:0/96 e compatível (inclui :: e ::1)
  return (g[0] & 0xff00) === 0xff00 // multicast ff00::/8
    || (g[0] & 0xfe00) === 0xfc00 // único local fc00::/7
    || (g[0] & 0xffc0) === 0xfe80 // link-local fe80::/10
    || (g[0] === 0x64 && g[1] === 0xff9b) // NAT64 64:ff9b::/96
    || (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0x0db8)) // Teredo 2001::/32 e documentação 2001:db8::/32
}
function hostDisallowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (ipv4Pattern.test(host)) return ipv4Disallowed(host.split('.').map(Number));
  if (host.includes(':')) return ipv6Disallowed(host.replace(/^\[|\]$/g, ''));
  return false;
}
export function prepareRequest(settings: FetchConfig, resolve: (s: string) => unknown, secrets: Secrets): PreparedRequest {
  const str = (s: string) => { const v = resolve(s); return typeof v === 'string' ? v : JSON.stringify(v); };
  let endpoint = str(settings.url);
  for (const pair of settings.params.filter(p => p.enabled && p.key)) {
    const key = pair.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    endpoint = endpoint.replace(new RegExp(`\\{${key}\\}|:${key}(?=/|[?#]|$)`, 'g'), encodeURIComponent(str(pair.value)));
  }
  if (/\{[^}]+\}|\/[\:][\w]+/.test(endpoint)) throw new Error('Preencha todos os parâmetros da URL.');
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use URL HTTP/HTTPS sem credenciais embutidas.');
  if (hostDisallowed(url.hostname)) throw new Error('Use uma URL pública: localhost e redes privadas são bloqueados.');
  for (const pair of settings.query.filter(p => p.enabled && p.key)) url.searchParams.append(str(pair.key), str(pair.value));
  const headers = new Headers();
  for (const pair of settings.headers.filter(p => p.enabled && p.key)) headers.set(str(pair.key), str(pair.value));
  if (settings.auth === 'bearer' || settings.auth === 'apiKey') {
    if (!secrets.token) throw new Error('Informe a credencial desta sessão.');
    const token = str(secrets.token);
    if (settings.auth === 'bearer') headers.set('Authorization', `Bearer ${token}`);
    else if (settings.apiKeyIn === 'query') url.searchParams.set(settings.apiKeyName, token);
    else headers.set(settings.apiKeyName, token);
  }
  if (settings.auth === 'basic') {
    if (!secrets.username) throw new Error('Informe o usuário Basic Auth.');
    const bytes = new TextEncoder().encode(`${str(secrets.username)}:${str(secrets.password)}`);
    headers.set('Authorization', `Basic ${btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))}`);
  }
  let body: string | null = null;
  if (settings.bodyType !== 'none') {
    if (['GET', 'HEAD'].includes(settings.method)) throw new Error(`${settings.method} não aceita body. Selecione Nenhum.`);
    if (settings.bodyType === 'json') {
      // Parse first so string placeholders can become typed objects, arrays or primitives.
      const walk = (value: unknown): unknown => typeof value === 'string' ? resolve(value) : Array.isArray(value) ? value.map(walk) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)])) : value;
      body = JSON.stringify(walk(JSON.parse(settings.body)));
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    } else if (settings.bodyType === 'form') {
      const parsed = JSON.parse(settings.body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Form exige um objeto JSON de campos.');
      body = new URLSearchParams(Object.entries(parsed).map(([k, v]) => [k, str(String(v))])).toString();
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/x-www-form-urlencoded');
    } else body = str(settings.body);
  }
  if (!['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(settings.method)) throw new Error('Método inválido.');
  if (settings.timeoutMs < 100 || settings.timeoutMs > 120000 || !Number.isFinite(settings.timeoutMs)) throw new Error('Timeout deve estar entre 100 e 120000 ms.');
  return { url: url.toString(), method: settings.method, headers: Object.fromEntries(headers), body, timeoutMs: settings.timeoutMs, credentials: settings.credentials };
}
export async function browserRequest(request: PreparedRequest, controller: AbortController): Promise<HttpResponse> {
  // Revalida no sink: o destino final (após interpolação de %refs%) nunca
  // pode apontar para a rede interna, mesmo que a origem do valor mude.
  if (hostDisallowed(new URL(request.url).hostname)) throw new Error('Use uma URL pública: localhost e redes privadas são bloqueados.');
  const timer = setTimeout(() => controller.abort('Tempo limite excedido.'), request.timeoutMs);
  const start = performance.now();
  try {
    const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body, credentials: request.credentials, redirect: 'error', signal: controller.signal });
    const reader = response.body?.getReader(); let text = '', count = 0; const decoder = new TextDecoder();
    if (reader) while (true) { const { value, done } = await reader.read(); if (done) break; count += value.byteLength; if (count > 2_000_000) { await reader.cancel(); throw new Error('Resposta excede o limite de 2 MB.'); } text += decoder.decode(value, { stream: true }); }
    text += decoder.decode();
    let body: unknown = text; try { body = JSON.parse(text); } catch { /* Text responses remain text. */ }
    return { status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers), body, durationMs: Math.round(performance.now() - start) };
  } catch (e) {
    if (controller.signal.aborted) throw new Error(typeof controller.signal.reason === 'string' ? controller.signal.reason : 'Requisição cancelada.');
    if (e instanceof TypeError) throw new Error('Falha de rede, CORS ou redirecionamento. No desktop, use o transporte nativo para APIs sem CORS.');
    throw e;
  } finally { clearTimeout(timer); }
}
