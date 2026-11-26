import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
async function load(path) { const result = await build({ entryPoints:[path], bundle:true, write:false, platform:'node', format:'esm' }); return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`); }
const { references, referencesOf, dependencyEdges, routeEdges, roundedEdgePath } = await load('src/dataflow/edges.ts');
const shape = (id, props = {}, meta = {}) => ({ id:`shape:${id}`, type:'block', props, meta });
const block = (alias, content, extraProps = {}, meta = {}) => ({ id:`shape:${alias}`, type:'block', props:{ kind:'idea', content, title:'%element_1% no título', origin:'%element_1%', ...extraProps }, meta:{ metalboard:{ id:alias, input:'', output:{ source:'default', value:'', parseJson:false, path:'', mapPath:'', template:'' } }, ...meta } });

test('references coleta aliases em strings aninhadas de arrays e objetos', () => {
  assert.deepEqual([...references({ a:'x %element_1% y', list:['%element_2.name%', { b:'%input%' }], n: 42 })].sort(), ['element_1','element_2','input']);
});

test('references desscapeia markdown do editor de documentos (%element\\_3%)', () => {
  // O Milkdown grava underscores e outros sinais escapados: %element\_3%.
  assert.deepEqual([...references('Resultado: %element\\_3% e %element\\_4.path%')].sort(), ['element_3','element_4']);
  const produtor = block('element_3', 'pwd'), consumidor = block('element_9', 'Resultado: %element\\_3%');
  assert.deepEqual(dependencyEdges([produtor, consumidor]), [
    { source:'shape:element_3', consumer:'shape:element_9', refs:['element_3'] },
  ]);
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

const box = (x, y, w = 100, h = 80) => ({ x, y, w, h });
const link = (source, consumer) => ({ source, consumer, refs: [source] });

function crossesBox(points, rect) {
  return points.slice(1).some((b, index) => {
    const a = points[index];
    if (a.y === b.y) {
      return a.y > rect.y && a.y < rect.y + rect.h &&
        Math.min(a.x, b.x) < rect.x + rect.w && Math.max(a.x, b.x) > rect.x;
    }
    return a.x > rect.x && a.x < rect.x + rect.w &&
      Math.min(a.y, b.y) < rect.y + rect.h && Math.max(a.y, b.y) > rect.y;
  });
}

test('routeEdges ancora fora dos cartões e arredonda os desvios ao redor de obstáculos', () => {
  const obstacle = box(170, -20, 100, 120);
  const boxes = new Map([['a', box(0, 0)], ['x', obstacle], ['b', box(340, 0)]]);
  const [edge] = routeEdges([link('a', 'b')], boxes);
  assert.deepEqual(edge.points[0], { x: 105, y: 40 });
  assert.deepEqual(edge.points.at(-1), { x: 333, y: 40 });
  assert.equal(crossesBox(edge.points, obstacle), false);
  assert.match(roundedEdgePath(edge.points, 12), / Q /);
});

test('routeEdges troca de face quando outro cartão está encostado na saída', () => {
  const obstacle = box(100, 0);
  const boxes = new Map([['a', box(0, 0)], ['x', obstacle], ['b', box(340, 0)]]);
  const [edge] = routeEdges([link('a', 'b')], boxes);
  assert.notEqual(edge.points[0].x, 105);
  assert.equal(crossesBox(edge.points, obstacle), false);
});

test('routeEdges escolhe corredores diferentes para saídas que contornam o mesmo cartão', () => {
  const obstacle = box(155, -10, 90, 100);
  const boxes = new Map([['a', box(0, 0)], ['x', obstacle], ['b', box(350, 0)], ['c', box(540, 0)]]);
  const edges = routeEdges([link('a', 'b'), link('a', 'c')], boxes);
  const corridorY = ({ points }) => points.find((end, index) => {
    const start = points[index - 1];
    return start && start.y === end.y && start.x < 200 && end.x > 200;
  })?.y;
  const rails = edges.map(corridorY);
  assert.ok(rails.every(Number.isFinite));
  assert.notEqual(rails[0], rails[1]);
  assert.ok(edges.every(({ points }) => !crossesBox(points, obstacle)));
});

test('routeEdges distribui entradas e saídas na mesma face em ordem estável', () => {
  const boxes = new Map([['up', box(0, 0)], ['down', box(0, 90)], ['a', box(300, 45)], ['b', box(600, 0)], ['c', box(600, 90)]]);
  const links = [link('a', 'b'), link('up', 'a'), link('a', 'c'), link('down', 'a')];
  const edges = routeEdges(links, boxes);
  assert.deepEqual(edges, routeEdges([...links].reverse(), boxes));
  const [upperOut, lowerOut] = edges.filter(edge => edge.source === 'a').map(edge => edge.points[0]);
  const [upperIn, lowerIn] = ['up', 'down'].map(source => edges.find(edge => edge.source === source).points.at(-1));
  assert.equal(upperOut.x, lowerOut.x);
  assert.equal(upperIn.x, lowerIn.x);
  assert.ok(upperOut.y < lowerOut.y);
  assert.ok(upperIn.y < lowerIn.y);
});

test('routeEdges desvia ao ligar cartões sobrepostos e ignora extremos de outra página', () => {
  const boxes = new Map([['a', box(0, 0)], ['b', box(0, 0)]]);
  const edges = routeEdges([link('a', 'b'), link('b', 'a'), link('a', 'unavailable')], boxes);
  assert.equal(edges.length, 2);
  for (const { points } of edges) {
    assert.ok(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
    assert.equal(crossesBox(points, boxes.get('a')), false);
  }
  assert.notDeepEqual(edges[0].points, [...edges[1].points].reverse());
});
