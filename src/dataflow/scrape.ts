/**
 * Extração de conteúdo para o elemento Embed: converte o HTML da página em
 * Markdown ou em um relatório JSON utilizável como output (%element%).
 * Módulo puro, sem DOM — o transporte (nativo ou navegador) fica no bloco.
 */
export type ScrapeFormat = 'markdown' | 'json';
export type EmbedConfig = { format: ScrapeFormat; loadedUrl: string };
export const defaultEmbed: EmbedConfig = { format: 'markdown', loadedUrl: '' };
export type ScrapePayload = { url: string; status: number; contentType: string; body: string; durationMs: number; warnings: string[] };
export type PageHeading = { level: number; text: string };
export type PageLink = { href: string; text: string };
export type PageReport = {
  url: string; status: number; title: string; description: string; siteName: string; image: string;
  canonical: string; favicon: string; lang: string; headings: PageHeading[]; links: PageLink[];
  wordCount: number; text: string; markdown: string;
};

export function parseEmbedUrl(source: string): URL {
  let url: URL;
  try { url = new URL(source.trim()); } catch { throw new Error('Informe uma URL completa, como https://exemplo.com/pagina.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error('Use uma URL HTTP/HTTPS sem credenciais embutidas.');
  return url;
}

const namedEntities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  deg: '°', plusmn: '±', times: '×', divide: '÷', middot: '·', bull: '•', dagger: '†', euro: '€', pound: '£',
  yen: '¥', cent: '¢', sect: '§', para: '¶', frac12: '½', frac14: '¼', frac34: '¾', infin: '∞', ne: '≠',
  le: '≤', ge: '≥', minus: '−', rarr: '→', larr: '←', harr: '↔', aacute: 'á', eacute: 'é', iacute: 'í',
  oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', auml: 'ä', ouml: 'ö', uuml: 'ü', szlig: 'ß',
};
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, code: string) => {
    if (code[0] === '#') {
      const hex = code[1] === 'x' || code[1] === 'X';
      const value = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(value) || value < 9 || (value > 13 && value < 32) || value > 0x10ffff) return match;
      try { return String.fromCodePoint(value); } catch { return match; }
    }
    return namedEntities[code] ?? namedEntities[code.toLowerCase()] ?? match;
  });
}

export type HtmlNode = { type: 'text'; text: string } | { type: 'element'; tag: string; attrs: Record<string, string>; children: HtmlNode[] };
type HtmlElement = Extract<HtmlNode, { type: 'element' }>;
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const rawTags = new Set(['script', 'style']);
const closesParagraph = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);

function findTagEnd(html: string, start: number): number {
  let quote = '';
  for (let i = start + 1; i < html.length; i++) {
    const ch = html[i];
    if (quote) { if (ch === quote) quote = ''; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return i;
  }
  return -1;
}
function parseTagHead(raw: string): { name: string; attrs: Record<string, string> } {
  const name = /^([a-zA-Z][a-zA-Z0-9:-]*)/.exec(raw)?.[1]?.toLowerCase() ?? '';
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const [, key, double, single, bare] of raw.slice(name.length).matchAll(pattern)) attrs[key.toLowerCase()] = decodeEntities(double ?? single ?? bare ?? '');
  return { name, attrs };
}

/** Parser leniente: fecha <p>/<li> implicitamente e ignora tags não fechadas. */
export function parseHtml(source: string): HtmlNode {
  const root: HtmlNode = { type: 'element', tag: '#root', attrs: {}, children: [] };
  const stack: Extract<HtmlNode, { type: 'element' }>[] = [root as Extract<HtmlNode, { type: 'element' }>];
  const top = () => stack[stack.length - 1];
  const pushText = (text: string) => { if (text) top().children.push({ type: 'text', text: decodeEntities(text) }); };
  let i = 0;
  while (i < source.length) {
    const open = source.indexOf('<', i);
    if (open < 0) { pushText(source.slice(i)); break; }
    if (open > i) pushText(source.slice(i, open));
    if (source.startsWith('<!--', open)) { const end = source.indexOf('-->', open + 4); i = end < 0 ? source.length : end + 3; continue; }
    if (source[open + 1] === '!' || source[open + 1] === '?') { const end = source.indexOf('>', open); i = end < 0 ? source.length : end + 1; continue; }
    const close = findTagEnd(source, open);
    if (close < 0) { pushText(source.slice(open)); break; }
    const inner = source.slice(open + 1, close);
    i = close + 1;
    if (inner.startsWith('/')) {
      const name = inner.slice(1).trim().toLowerCase();
      for (let depth = stack.length - 1; depth > 0; depth--) if (stack[depth].tag === name) { stack.length = depth; break; }
      continue;
    }
    const selfClosing = inner.endsWith('/');
    const { name, attrs } = parseTagHead(selfClosing ? inner.slice(0, -1) : inner);
    if (!name) continue;
    if (name === 'li') while (top().tag === 'li' || top().tag === 'p') stack.pop();
    else if (closesParagraph.has(name) && top().tag === 'p') stack.pop();
    const element: HtmlNode = { type: 'element', tag: name, attrs, children: [] };
    top().children.push(element);
    if (rawTags.has(name)) {
      const end = new RegExp(`</${name}\\s*>`, 'i').exec(source.slice(i));
      i = end ? i + end.index + end[0].length : source.length;
      continue;
    }
    if (!selfClosing && !voidTags.has(name)) stack.push(element as Extract<HtmlNode, { type: 'element' }>);
  }
  return root;
}

const skippedTags = new Set(['script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'title', 'svg', 'canvas', 'object', 'embed', 'iframe', 'nav', 'footer', 'aside', 'form', 'button', 'input', 'select', 'textarea', 'option', 'label']);
// Cabeçalho/rodapé de site (filhos diretos de <body>) é chrome, mas header
// aninhado em article costuma carregar o título — só o primeiro é descartado.
const chromeTags = new Set(['header', 'nav', 'footer', 'aside']);
const blockTags = new Set(['address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'details', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);

function element(node: HtmlNode): HtmlElement | null { return node.type === 'element' ? node : null; }
function children(node: HtmlNode): HtmlNode[] { return node.type === 'element' ? node.children : []; }
function absolutize(href: string, base: string): string {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#')) return '';
  try { const url = new URL(trimmed, base); return /^https?:$/.test(url.protocol) ? url.toString() : ''; } catch { return ''; }
}
function escapeMarkdown(text: string): string { return text.replace(/([\\`*_[\]])/g, '\\$1'); }
function collapse(text: string): string { return text.replace(/\s+/g, ' '); }

/** Conteúdo inline de um elemento, sem marcadores Markdown (usado no relatório). */
function inlinePlain(node: HtmlNode): string {
  if (node.type === 'text') return collapse(node.text);
  if (skippedTags.has(node.tag)) return '';
  if (node.tag === 'br') return ' ';
  return node.children.map(inlinePlain).join('');
}

/** Conteúdo inline com marcadores Markdown (links, ênfase, código, imagens). */
function inlineMarkdown(node: HtmlNode, base: string): string {
  if (node.type === 'text') return escapeMarkdown(collapse(node.text));
  if (skippedTags.has(node.tag)) return '';
  const inner = () => node.children.map(child => inlineMarkdown(child, base)).join('');
  switch (node.tag) {
    case 'br': return '\n';
    case 'img': {
      const src = absolutize(node.attrs.src ?? '', base);
      const alt = collapse(decodeEntities(node.attrs.alt ?? '')).replace(/[[\]]/g, '');
      return src ? `![${alt}](${src})` : alt;
    }
    case 'a': {
      const href = absolutize(node.attrs.href ?? '', base);
      const text = inner().trim() || collapse(decodeEntities(node.attrs.title ?? ''));
      return href && text ? `[${text}](${href})` : text;
    }
    case 'strong': case 'b': { const text = inner().trim(); return text ? `**${text}**` : ''; }
    case 'em': case 'i': { const text = inner().trim(); return text ? `*${text}*` : ''; }
    case 'del': case 's': case 'strike': { const text = inner().trim(); return text ? `~~${text}~~` : ''; }
    case 'code': case 'kbd': case 'samp': {
      const text = collapse(node.children.map(inlinePlain).join(''));
      if (!text) return '';
      const fence = text.includes('`') ? '``' : '`';
      return `${fence}${text}${fence}`;
    }
    case 'ul': case 'ol': case 'dl': case 'pre': case 'blockquote': case 'table': return '';
    default: return inner();
  }
}

function renderList(list: HtmlElement, base: string, depth: number): string {
  const ordered = list.tag === 'ol';
  const start = Number(list.attrs.start) || 1;
  const lines: string[] = [];
  let index = 0;
  for (const child of children(list)) {
    const item = element(child);
    if (!item || item.tag !== 'li') continue;
    const parts: string[] = [];
    const nested: string[] = [];
    for (const part of item.children) {
      const el = element(part);
      if (el && (el.tag === 'ul' || el.tag === 'ol')) nested.push(renderList(el, base, depth + 1));
      else if (el && (el.tag === 'p' || el.tag === 'div')) parts.push(el.children.map(grand => inlineMarkdown(grand, base)).join(''));
      else parts.push(inlineMarkdown(part, base));
    }
    const content = parts.join('').replace(/\n{2,}/g, '\n').trim();
    const indent = '  '.repeat(depth);
    lines.push(`${indent}${ordered ? `${start + index++}. ` : '- '}${content}`);
    lines.push(...nested.filter(Boolean));
  }
  return lines.join('\n');
}

function renderTable(table: HtmlNode, base: string): string {
  const rows: string[][] = [];
  for (const row of children(table)) {
    const tr = element(row);
    if (!tr || tr.tag !== 'tr') continue;
    const cells = children(tr).map(cell => { const el = element(cell); return el && (el.tag === 'td' || el.tag === 'th') ? collapse(el.children.map(c => inlineMarkdown(c, base)).join('')).trim() : null; }).filter((cell): cell is string => cell !== null);
    if (cells.length) rows.push(cells);
  }
  const width = Math.max(...rows.map(row => row.length), 1);
  const padded = rows.map(row => [...row, ...Array(width - row.length).fill('')].map(cell => cell.replace(/\|/g, '\\|')));
  if (!padded.length) return '';
  const [header, ...body] = padded;
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [line(header), `| ${Array(width).fill('---').join(' | ')} |`, ...body.map(line)].join('\n');
}

function preText(node: HtmlNode): string {
  if (node.type === 'text') return node.text;
  if (skippedTags.has(node.tag)) return '';
  return node.children.map(preText).join('');
}

function renderBlock(node: HtmlNode, base: string, blocks: string[]) {
  if (node.type === 'text') {
    const text = collapse(node.text).trim();
    if (text) blocks.push(escapeMarkdown(text));
    return;
  }
  if (skippedTags.has(node.tag)) return;
  const heading = /^h([1-6])$/.exec(node.tag);
  if (heading) { const text = node.children.map(child => inlineMarkdown(child, base)).join('').trim(); blocks.push(text ? `${'#'.repeat(Number(heading[1]))} ${text}` : ''); return; }
  switch (node.tag) {
    case 'p': { const text = node.children.map(child => inlineMarkdown(child, base)).join('').trim(); if (text) blocks.push(text); return; }
    case 'ul': case 'ol': { const list = renderList(node, base, 0); if (list) blocks.push(list); return; }
    case 'blockquote': {
      const inner = renderBlocks(node.children, base).trim();
      if (inner) blocks.push(inner.split('\n').map(line => `> ${line}`).join('\n'));
      return;
    }
    case 'pre': {
      const code = element(children(node)[0]);
      const language = code?.attrs.class?.match(/(?:^|\s)(?:language|lang)-([\w+-]+)/)?.[1] ?? '';
      const text = preText(code ?? node).replace(/\s+$/, '');
      blocks.push(`\`\`\`${language}\n${text}\n\`\`\``);
      return;
    }
    case 'hr': blocks.push('---'); return;
    case 'table': { const table = renderTable(node, base); if (table) blocks.push(table); return; }
    case 'br': return;
    case 'dl': {
      const entries: string[] = [];
      for (const child of children(node)) {
        const el = element(child);
        if (!el) continue;
        if (el.tag === 'dt') entries.push(`**${el.children.map(c => inlineMarkdown(c, base)).join('').trim()}**`);
        else if (el.tag === 'dd') entries.push(`: ${el.children.map(c => inlineMarkdown(c, base)).join('').trim()}`);
      }
      if (entries.length) blocks.push(entries.join('\n'));
      return;
    }
    default: {
      // Contêineres transparentes (div, section, article, figure…) descem para os filhos.
      const hasBlockChild = children(node).some(child => child.type === 'element' && blockTags.has(child.tag));
      if (hasBlockChild) { for (const child of node.children) renderBlock(child, base, blocks); }
      else { const text = node.children.map(child => inlineMarkdown(child, base)).join('').trim(); if (text) blocks.push(text); }
    }
  }
}
function renderBlocks(nodes: HtmlNode[], base: string): string {
  const blocks: string[] = [];
  for (const node of nodes) renderBlock(node, base, blocks);
  return blocks.filter(Boolean).join('\n\n');
}
export function htmlToMarkdown(root: HtmlNode, base: string): string {
  const body = bodyOf(root);
  const content = body.tag === 'body' ? children(body).filter(child => { const el = element(child); return !(el && chromeTags.has(el.tag)); }) : children(body);
  return renderBlocks(content, base).trim();
}
function findBody(node: HtmlNode): HtmlElement | null {
  for (const child of children(node)) {
    const el = element(child);
    if (!el) continue;
    if (el.tag === 'body') return el;
    const nested = findBody(el);
    if (nested) return nested;
  }
  return null;
}
function bodyOf(node: HtmlNode): HtmlElement {
  return findBody(node) ?? (node.type === 'element' ? node : { type: 'element', tag: '#root', attrs: {}, children: [node] });
}

function walkVisible(node: HtmlNode, visit: (el: HtmlElement) => void) {
  if (node.type === 'text') return;
  for (const child of node.children) {
    const el = element(child);
    if (!el || skippedTags.has(el.tag)) continue;
    if (node.tag === 'body' && chromeTags.has(el.tag)) continue;
    visit(el);
    walkVisible(el, visit);
  }
}
function visibleText(node: HtmlNode): string {
  const body = bodyOf(node);
  const parts: string[] = [];
  const collect = (current: HtmlNode) => {
    if (current.type === 'text') { parts.push(collapse(current.text)); return; }
    for (const child of current.children) {
      if (child.type === 'text') { parts.push(collapse(child.text)); continue; }
      if (skippedTags.has(child.tag)) continue;
      if (child.tag === 'br' || blockTags.has(child.tag)) parts.push('\n');
      collect(child);
    }
  };
  if (body.tag === 'body') for (const child of body.children) { const el = element(child); if (!(el && chromeTags.has(el.tag))) collect(child); }
  else collect(body);
  return collapse(parts.join('')).trim();
}

export function pageReport(root: HtmlNode, base: string, url: string, status: number, markdown: string): PageReport {
  const metas = new Map<string, string>();
  let title = '';
  let lang = '';
  let canonical = '';
  let favicon = '';
  for (const el of iterateElements(root)) {
    if (el.tag === 'title' && !title) title = collapse(el.children.map(inlinePlain).join('')).trim();
    if (el.tag === 'html' && typeof el.attrs.lang === 'string') lang = el.attrs.lang;
    if (el.tag === 'meta') {
      const key = el.attrs.name || el.attrs.property || el.attrs.itemprop;
      if (key && el.attrs.content !== undefined) metas.set(key.toLowerCase(), collapse(decodeEntities(el.attrs.content)).trim());
    }
    if (el.tag === 'link' && el.attrs.rel && el.attrs.href) {
      const rels = el.attrs.rel.toLowerCase().split(/\s+/);
      if (rels.includes('canonical') && !canonical) canonical = absolutize(el.attrs.href, base);
      if (rels.includes('icon') && !favicon) favicon = absolutize(el.attrs.href, base);
    }
  }
  const headings: PageHeading[] = [];
  walkVisible(root, el => {
    const match = /^h([1-6])$/.exec(el.tag);
    if (!match || headings.length >= 120) return;
    const text = collapse(el.children.map(inlinePlain).join('')).trim();
    if (text) headings.push({ level: Number(match[1]), text });
  });
  const links: PageLink[] = [];
  const seenHrefs = new Set<string>();
  walkVisible(root, el => {
    if (el.tag !== 'a' || links.length >= 150) return;
    const href = absolutize(el.attrs.href ?? '', base);
    if (!href || seenHrefs.has(href)) return;
    seenHrefs.add(href);
    links.push({ href, text: collapse(el.children.map(inlinePlain).join('')).trim() });
  });
  const text = visibleText(root);
  return {
    url, status,
    title: metas.get('og:title') || title,
    description: metas.get('og:description') || metas.get('description') || '',
    siteName: metas.get('og:site_name') || '',
    image: absolutize(metas.get('og:image') || metas.get('twitter:image') || '', base),
    canonical, favicon, lang, headings, links,
    wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
    text: text.length > 50_000 ? `${text.slice(0, 50_000)}…` : text,
    markdown,
  };
}
function* iterateElements(node: HtmlNode): Generator<Extract<HtmlNode, { type: 'element' }>> {
  for (const child of children(node)) {
    const el = element(child);
    if (!el) continue;
    yield el;
    yield* iterateElements(el);
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max).trimEnd()}\n\n…(conteúdo truncado em ${max} caracteres)`;
}

/** Converte a resposta da página no output do elemento conforme o formato escolhido. */
export function runScrape(payload: ScrapePayload, format: ScrapeFormat): { value: string | PageReport; warnings: string[] } {
  const warnings = [...payload.warnings];
  const body = payload.body.replace(/\r\n/g, '\n');
  const isHtml = /html/i.test(payload.contentType) || /<(?:!doctype\s+html|html|head|body|div|p|main|section|article|title)[\s/>]/i.test(body);
  const root = parseHtml(body);
  let markdown = isHtml ? htmlToMarkdown(root, payload.url) : `\`\`\`\n${body.trim()}\n\`\`\``;
  if (!isHtml) warnings.push('A resposta não é HTML — o conteúdo bruto foi mantido como texto.');
  markdown = truncate(markdown, 150_000);
  if (!markdown.trim()) warnings.push('A página não gerou conteúdo legível.');
  if (format === 'markdown') return { value: markdown, warnings };
  return { value: pageReport(root, payload.url, payload.url, payload.status, markdown), warnings };
}
