import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
async function load(path) { const result = await build({ entryPoints:[path], bundle:true, write:false, platform:'node', format:'esm' }); return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`); }
const { parseEmbedUrl, parseHtml, htmlToMarkdown, pageReport, runScrape, decodeEntities } = await load('src/dataflow/scrape.ts');
const { resolver, defaultOutput } = await load('src/dataflow/core.ts');

const page = `<!doctype html><html lang="pt-BR"><head><title>Metalboard &amp; fluxos</title>
<meta name="viewport" content="width=device-width">
<meta name="description" content="Board para &quot;pensar e fazer&quot;">
<meta property="og:title" content="Metalboard og">
<meta property="og:image" content="/social/card.png">
<link rel="canonical" href="/guia">
<link rel="icon" href="/favicon.ico">
<script>var ignored = "<p>não sou parágrafo</p>";</script>
<style>p{color:red}</style></head>
<body>
<nav><a href="/nav">Navegação</a></nav>
<header>topo do site</header>
<h1 id="sobre">Sobre o <strong>Metalboard</strong></h1>
<p>Um board <em>local</em> com &lt;blocos&gt; conectados &#8212; veja <a href="/docs">a documenta&ccedil;&atilde;o</a>.</p>
<p>Imagem: <img src="img/tela.png" alt="Tela do app"></p>
<h2>Recursos</h2>
<ul><li>Terminal <code>pwd &amp;&amp; ls</code></li><li>Fetch<ul><li>CORS livre no desktop</li><li>2&nbsp;MB de limite</li></ul></li></ul>
<ol start="3"><li>Terceiro</li><li>Quarto</li></ol>
<blockquote><p>Pense em fluxo.</p></blockquote>
<pre><code class="language-python">print("olá")</code></pre>
<hr>
<table><tr><th>Nome</th><th>Nota</th></tr><tr><td>Ana</td><td>10</td></tr></table>
<p>Contato <a href="mailto:a@b.com">por e-mail</a> ou <a href="#top">voltar ao topo</a>.</p>
<footer>rodapé</footer>
<p>parágrafo sem fechar
<p>outro parágrafo
</body></html>`;
const root = parseHtml(page);

test('markdown: blocos, inline, entidades e estruturas', () => {
  const md = htmlToMarkdown(root, 'https://metalboard.dev/guia/fluxo');
  assert.match(md, /^# Sobre o \*\*Metalboard\*\*$/m);
  assert.match(md, /Um board \*local\* com <blocos> conectados — veja \[a documentação\]\(https:\/\/metalboard\.dev\/docs\)/);
  assert.match(md, /!\[Tela do app\]\(https:\/\/metalboard\.dev\/guia\/img\/tela\.png\)/);
  assert.match(md, /## Recursos/);
  assert.match(md, /- Terminal `pwd && ls`/);
  assert.match(md, /  - CORS livre no desktop/);
  assert.match(md, /3\. Terceiro\n4\. Quarto/);
  assert.match(md, /> Pense em fluxo\./);
  assert.match(md, /```python\nprint\("olá"\)\n```/);
  assert.match(md, /\n---\n/);
  assert.match(md, /\| Nome \| Nota \|\n\| --- \| --- \|\n\| Ana \| 10 \|/);
  // script/style/nav/header/footer não vazam; mailto e âncora não viram link
  assert.doesNotMatch(md, /não sou parágrafo|color:red|Navegação|rodapé/);
  assert.doesNotMatch(md, /mailto|#top/);
  // <p> implícito: cada parágrafo em seu próprio bloco
  assert.match(md, /parágrafo sem fechar\n\noutro parágrafo/);
  // &nbsp; vira espaço contável
  assert.match(md, /2 MB de limite/);
});

test('markdown: caracteres de sintese são escapados em texto', () => {
  const md = htmlToMarkdown(parseHtml('<p>use a [syntax](x) e *asterisco*</p>'), 'https://a.dev/');
  assert.equal(md, 'use a \\[syntax\\](x) e \\*asterisco\\*');
});

test('relatório JSON: metadados, headings, links e texto visível', () => {
  const md = htmlToMarkdown(root, 'https://metalboard.dev/guia/fluxo');
  const report = pageReport(root, 'https://metalboard.dev/guia/fluxo', 'https://metalboard.dev/guia/fluxo', 200, md);
  assert.equal(report.title, 'Metalboard og');
  assert.equal(report.description, 'Board para "pensar e fazer"');
  assert.equal(report.image, 'https://metalboard.dev/social/card.png');
  assert.equal(report.canonical, 'https://metalboard.dev/guia');
  assert.equal(report.favicon, 'https://metalboard.dev/favicon.ico');
  assert.equal(report.lang, 'pt-BR');
  assert.deepEqual(report.headings, [
    { level: 1, text: 'Sobre o Metalboard' },
    { level: 2, text: 'Recursos' },
  ]);
  assert.deepEqual(report.links.map(l => l.href), ['https://metalboard.dev/docs']);
  assert.ok(report.wordCount > 10);
  assert.match(report.text, /Sobre o Metalboard/);
  assert.ok(report.markdown.includes('## Recursos'));
});

test('relatório: links repetidos são deduplicados', () => {
  const doc = parseHtml('<body><a href="/a">um</a><a href="/a">dois</a><a href="/b">três</a></body>');
  const report = pageReport(doc, 'https://x.dev/', 'https://x.dev/', 200, '');
  assert.deepEqual(report.links.map(l => l.href), ['https://x.dev/a', 'https://x.dev/b']);
  assert.equal(report.links[0].text, 'um');
});

test('runScrape: html → markdown e json; não-html vira texto cercado', () => {
  const payload = { url: 'https://metalboard.dev/', status: 200, contentType: 'text/html; charset=utf-8', body: '<main><p>Olá</p></main>', durationMs: 5, warnings: [] };
  assert.equal(runScrape(payload, 'markdown').value, 'Olá');
  const json = runScrape(payload, 'json');
  assert.equal(json.value.title, '');
  assert.equal(json.value.text, 'Olá');
  const plain = runScrape({ ...payload, contentType: 'text/plain', body: 'apenas texto\ncom linhas' }, 'markdown');
  assert.equal(plain.value, '```\napenas texto\ncom linhas\n```');
  assert.match(plain.warnings.join(' '), /não é HTML/);
});

test('runScrape: truncamento avisa e mantém tamanho limitado', () => {
  const big = `<body>${'<p>conteúdo repetido</p>'.repeat(30_000)}</body>`;
  const { value, warnings } = runScrape({ url: 'https://x.dev/', status: 200, contentType: 'text/html', body: big, durationMs: 1, warnings: [] }, 'markdown');
  assert.ok(value.length < 160_000);
  assert.match(String(value), /truncado em 150000 caracteres/);
});

test('entidades numéricas e nomeadas decaem corretamente', () => {
  assert.equal(decodeEntities('a&amp;b &#65; &#x42; &copy; &unknown;'), 'a&b A B © &unknown;');
});

test('parseEmbedUrl aceita http/https e rejeita o resto', () => {
  assert.equal(parseEmbedUrl(' https://example.com/p?a=1 ').toString(), 'https://example.com/p?a=1');
  for (const bad of ['file:///etc/passwd', 'ftp://example.com', 'https://u:p@example.com', 'example.com', 'javascript:alert(1)']) assert.throws(() => parseEmbedUrl(bad));
});

test('embed expõe o output da extração como qualquer elemento do dataflow', () => {
  const embed = { id: 'shape:e', type: 'block', props: { kind: 'embed', content: 'https://example.com' }, meta: { metalboard: { id: 'page', input: '', output: { ...defaultOutput } }, execution: { status: 'success', value: { title: 'Exemplo', links: [{ href: 'https://a.dev' }] } } } };
  const consumer = { id: 'shape:c', type: 'block', props: { kind: 'idea', content: 'Título: %page.title% · %page.links[0].href%' }, meta: { metalboard: { id: 'c', input: '', output: { ...defaultOutput } } } };
  const r = resolver([embed, consumer]);
  assert.equal(r.output(consumer), 'Título: Exemplo · https://a.dev');
  for (const status of ['running', 'error', 'stale']) {
    const broken = { ...embed, meta: { ...embed.meta, execution: { status, value: 'antigo' } } };
    assert.equal(resolver([broken]).result(broken).ok, false);
  }
});
