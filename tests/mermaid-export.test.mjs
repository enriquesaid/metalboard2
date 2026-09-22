import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
async function load(path) { const result = await build({ entryPoints:[path], bundle:true, write:false, platform:'node', format:'esm' }); return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`); }
const { shapesToMermaid, plainTextFromRichText } = await load('src/mermaid-export.ts');

const node = (id, label, extra = {}) => ({ id, type: 'geo', label, bounds: { x: 0, y: 0, w: 100, h: 60 }, geo: 'rectangle', ...extra });
const arrow = (id, startId, endId, extra = {}) => ({ id, type: 'arrow', links: { start: { toId: startId }, end: { toId: endId } }, ...extra });

test('caixas ligadas viram declarações e arestas em LR', () => {
  const a = node('shape:a', 'Ideia'), b = node('shape:b', 'API', { bounds: { x: 200, y: 0, w: 100, h: 60 } });
  assert.equal(shapesToMermaid([a, b, arrow('shape:e', 'shape:a', 'shape:b')]),
    'flowchart LR\n  ideia["Ideia"]\n  api["API"]\n  ideia --> api');
});

test('fluxo vertical escolhe TD', () => {
  const a = node('shape:a', 'Topo'), b = node('shape:b', 'Base', { bounds: { x: 0, y: 300, w: 100, h: 60 } });
  assert.match(shapesToMermaid([a, b, arrow('shape:e', 'shape:a', 'shape:b')]), /^flowchart TD$/m);
});

test('tipos geo mapeiam para as formas do mermaid', () => {
  const out = shapesToMermaid([
    node('a', 'Escolha?', { geo: 'diamond' }),
    node('b', 'Hex', { geo: 'hexagon' }),
    node('c', 'Redondo', { geo: 'ellipse' }),
    node('d', 'Pilha', { geo: 'trapezoid' }),
    node('e', 'Leque', { geo: 'rhombus' }),
    node('f', 'Nuvem', { geo: 'cloud' }),
  ]);
  assert.match(out, /escolha\{"Escolha\?"\}/);
  assert.match(out, /hex\{\{"Hex"\}\}/);
  assert.match(out, /redondo\(\["Redondo"\]\)/);
  assert.match(out, /pilha\[\/Pilha\\\]/);
  assert.match(out, /leque>Leque\]/);
  assert.match(out, /nuvem\["Nuvem"\]/);
});

test('estilos de seta viram marcadores mermaid', () => {
  const styles = [
    [arrow('e1', 'a', 'b'), 'a --> b'],
    [arrow('e2', 'a', 'b', { dash: 'dotted' }), 'a -.-> b'],
    [arrow('e3', 'a', 'b', { arrowheadEnd: 'dot' }), 'a --o b'],
    [arrow('e4', 'a', 'b', { arrowheadEnd: 'bar' }), 'a --x b'],
    [arrow('e5', 'a', 'b', { arrowheadStart: 'triangle' }), 'a <--> b'],
    [arrow('e6', 'a', 'b', { arrowheadEnd: 'none' }), 'a -- b'],
    [arrow('e7', 'a', 'b', { size: 'l' }), 'a ==> b'],
    [arrow('e8', 'a', 'b', { dash: 'dashed', arrowheadEnd: 'dot' }), 'a -.-o b'],
    [arrow('e9', 'a', 'b', { arrowheadStart: 'dot', arrowheadEnd: 'dot' }), 'a o--o b'],
  ];
  for (const [edge, expected] of styles) {
    const out = shapesToMermaid([node('a', 'A'), node('b', 'B'), edge]);
    assert.ok(out.includes(expected), `esperava "${expected}" em:\n${out}`);
  }
});

test('rótulo de aresta e caracteres especiais são escapados', () => {
  const out = shapesToMermaid([
    node('a', 'Diga "oi"'),
    node('b', 'linha1\nlinha2'),
    arrow('e', 'a', 'b', { label: 'sim?\n"ok"' }),
  ]);
  assert.match(out, /diga_oi\["Diga #quot;oi#quot;"\]/);
  assert.match(out, /linha1_linha2\["linha1<br\/>linha2"\]/);
  assert.match(out, /-->/);
  assert.match(out, /\|"sim\?<br\/>#quot;ok#quot;"\|/);
});

test('frames viram subgraphs com os nós contidos', () => {
  const out = shapesToMermaid([
    { id: 'f', type: 'frame', label: 'Sistema', bounds: { x: 0, y: 0, w: 300, h: 200 } },
    node('a', 'Dentro', { bounds: { x: 10, y: 10, w: 80, h: 40 } }),
    node('b', 'Fora', { bounds: { x: 500, y: 500, w: 80, h: 40 } }),
    arrow('e', 'a', 'b'),
  ]);
  assert.match(out, /subgraph sistema\["Sistema"\]/);
  assert.match(out, /^\s+dentro\["Dentro"\]$/m);
  assert.match(out, /^\s*end$/m);
  assert.match(out, /^  fora\["Fora"\]$/m);
  assert.match(out, /dentro --> fora/);
});

test('subgraphs aninhados preservam hierarquia', () => {
  const out = shapesToMermaid([
    { id: 'f1', type: 'frame', label: 'Fora', bounds: { x: 0, y: 0, w: 400, h: 300 } },
    { id: 'f2', type: 'frame', label: 'Dentro', bounds: { x: 20, y: 20, w: 200, h: 150 } },
    node('a', 'No', { bounds: { x: 40, y: 40, w: 60, h: 40 } }),
  ]);
  const outer = out.indexOf('subgraph fora["Fora"]');
  const inner = out.indexOf('subgraph dentro["Dentro"]');
  const leaf = out.indexOf('no["No"]');
  assert.ok(outer >= 0 && inner > outer && leaf > inner, out);
  assert.match(out, /^ {6}no\["No"\]$/m);
});

test('terminal livre da seta encosta no nó mais próximo', () => {
  const a = node('a', 'A', { bounds: { x: 0, y: 0, w: 100, h: 60 } });
  const b = node('b', 'B', { bounds: { x: 200, y: 0, w: 100, h: 60 } });
  const out = shapesToMermaid([a, b, { id: 'e', type: 'arrow', links: { start: { toId: 'a' }, end: { point: { x: 195, y: 30 } } } }]);
  assert.match(out, /a --> b/);
});

test('ids repetidos e reservados recebem nomes úteis; sem texto é ignorado', () => {
  const out = shapesToMermaid([
    node('a', 'API'), node('b', 'API'),
    node('c', 'end'), node('d', '2x'),
    node('e', ''), { id: 't', type: 'text', label: ' ' },
    { id: 'd1', type: 'draw' },
  ]);
  assert.match(out, /^  api\["API"\]$/m);
  assert.match(out, /^  api_2\["API"\]$/m);
  assert.match(out, /n\d+\["end"\]/);
  assert.match(out, /n\d+\["2x"\]/);
  assert.doesNotMatch(out, /\[""\]/);
  assert.equal((out.match(/\n  /g) || []).length, 4);
});

test('caixas e blocos sem texto somem junto com as setas que os apontam', () => {
  const out = shapesToMermaid([
    node('a', 'A'),
    node('b', ''),
    { id: 'bl', type: 'block', label: '   ', bounds: { x: 500, y: 0, w: 400, h: 300 } },
    arrow('e', 'a', 'b'),
    arrow('e2', 'a', 'bl'),
  ]);
  assert.equal(out, 'flowchart LR\n  a["A"]');
});

test('sem nós convertíveis retorna vazio', () => {
  assert.equal(shapesToMermaid([]), '');
  assert.equal(shapesToMermaid([arrow('e', 'a', 'b')]), '');
  assert.equal(shapesToMermaid([{ id: 'd', type: 'draw' }]), '');
});

test('richText do tldraw vira texto simples', () => {
  const rich = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Nome: ' }, { type: 'text', text: 'Ana' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Bia' }] },
  ] };
  assert.equal(plainTextFromRichText(rich), 'Nome: Ana\nBia');
  assert.equal(plainTextFromRichText(undefined), '');
  assert.equal(plainTextFromRichText({ type: 'doc', content: [] }), '');
});

test('bloco do metalboard exporta pelo título', () => {
  const out = shapesToMermaid([
    { id: 'b1', type: 'block', label: 'Terminal', bounds: { x: 0, y: 0, w: 400, h: 300 } },
    node('g1', 'Resultado'),
    arrow('e', 'b1', 'g1'),
  ]);
  assert.match(out, /terminal\["Terminal"\]/);
  assert.match(out, /terminal --> resultado/);
});
