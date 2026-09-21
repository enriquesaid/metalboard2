export type Pair = { key: string; value: string; enabled: boolean };
export type FetchConfig = { url: string; method: string; headers: Pair[]; query: Pair[]; params: Pair[]; bodyType: 'none' | 'json' | 'raw' | 'form'; body: string; auth: 'none' | 'bearer' | 'basic' | 'apiKey'; apiKeyName: string; apiKeyIn: 'header' | 'query'; timeoutMs: number; credentials: 'omit' | 'include' };
export const defaultFetch: FetchConfig = { url: '', method: 'GET', headers: [], query: [], params: [], bodyType: 'none', body: '', auth: 'none', apiKeyName: 'X-API-Key', apiKeyIn: 'header', timeoutMs: 30000, credentials: 'omit' };
export type Secrets = { token: string; username: string; password: string };
export type PreparedRequest = { url: string; method: string; headers: Record<string, string>; body: string | null; timeoutMs: number; credentials: 'omit' | 'include' };
export type HttpResponse = { status: number; statusText: string; headers: Record<string, string>; body: unknown; durationMs: number };
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
