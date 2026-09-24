import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
async function load(path) { const result = await build({ entryPoints:[path], bundle:true, write:false, platform:'node', format:'esm' }); return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`); }
const { references, referencesOf, dependencyEdges, edgeAnchors } = await load('src/dataflow/edges.ts');
const shape = (id, props = {}, meta = {}) => ({ id:`shape:${id}`, type:'block', props, meta });
const block = (alias, content, extraProps = {}, meta = {}) => ({ id:`shape:${alias}`, type:'block', props:{ kind:'idea', content, title:'%element_1% no título', origin:'%element_1%', ...extraProps }, meta:{ metalboard:{ id:alias, input:'', output:{ source:'default', value:'', parseJson:false, path:'', mapPath:'', template:'' } }, ...meta } });

test('references coleta aliases em strings aninhadas de arrays e objetos', () => {
  assert.deepEqual([...references({ a:'x %element_1% y', list:['%element_2.name%', { b:'%input%' }], n: 42 })].sort(), ['element_1','element_2','input']);
});

test('referencesOf cobre props, metalboard, fetch e embed; ignora título/origin e resultados de execução', () => {
  const s = shape('x',
    { kind:'fetch', content:'cmd %element_1%', richText:{ type:'doc', content:[{ type:'text', text:'%element_2[0]%' }] } },
    { metalboard:{ id:'x', input:'%element_1%', output:{ source:'value', value:'%element_3%', parseJson:false, path:'', mapPath:'', template:'%value% e %element_1%' } },
      fetch:{ url:'https://a.test/%element_2%', body:'{"q":"%element_3%"}', query:[{ key:'k', value:'%element_4%', enabled:true }] },
      embed:{ url:'%element_5%' },
      execution:{ status:'success', value:'%fantasma_exec%' },
      httpResponse:{ body:'%fantasma_http%' },
      scrape:{ markdown:'%fantasma_scrape%' } });
  const found = [...referencesOf(s)].sort();
  assert.deepEqual(found, ['element_1','element_2','element_3','element_4','element_5','value']);
});

test('dependencyEdges liga produtor ao consumidor, deduplica e descarta self/missing/duplicados/reservados', () => {
  const a = block('element_1', 'dados'), b = block('element_2', 'usa %element_1.x% e %element_1.y%'), c = block('element_3', 'Oi %element_2[0]%');
  assert.deepEqual(dependencyEdges([a, b, c]), [
    { source:'shape:element_1', consumer:'shape:element_2', refs:['element_1'] },
    { source:'shape:element_2', consumer:'shape:element_3', refs:['element_2'] },
  ]);
  const self = block('solo', '%solo%');
  assert.deepEqual(dependencyEdges([self]), []);
  const missing = block('orfa', '%nao_existe%');
  assert.deepEqual(dependencyEdges([missing]), []);
  const d1 = block('dup', 'a'), d2 = { ...block('dup', 'b'), id:'shape:dup2' };
  const usa = block('usa', '%dup%');
  assert.deepEqual(dependencyEdges([d1, d2, usa]), []);
  const reservado = block('res', ' %input% e %value%');
  assert.deepEqual(dependencyEdges([reservado]), []);
});

test('edgeAnchors ancora nas bordas com respiro e sem NaN em caixas sobrepostas', () => {
  const from = { x:0, y:0, w:100, h:50 }, to = { x:300, y:0, w:100, h:50 };
  const { start, end } = edgeAnchors(from, to);
  assert.equal(start.y, 25); assert.ok(Math.abs(start.x - 108) < 0.001);
  assert.equal(end.y, 25); assert.ok(Math.abs(end.x - 291) < 0.001);
  const diagonal = edgeAnchors(from, { x:300, y:200, w:100, h:50 });
  assert.ok(Number.isFinite(diagonal.start.x) && Number.isFinite(diagonal.end.y));
  const sobrepostas = edgeAnchors(from, { x:20, y:10, w:100, h:50 });
  assert.ok(Number.isFinite(sobrepostas.start.x) && Number.isFinite(sobrepostas.end.x));
});
