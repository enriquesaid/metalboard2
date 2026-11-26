import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/toolbar-position.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { dockAtPoint, moveToolbarDock, placeToolbar, overlaps, toolbarDocks } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('arraste encaixa nos cantos, no topo ou no meio vertical das laterais', () => {
  assert.deepEqual([
    dockAtPoint(30, 20, 900, 600), dockAtPoint(450, 20, 900, 600), dockAtPoint(870, 20, 900, 600),
    dockAtPoint(30, 300, 900, 600), dockAtPoint(870, 300, 900, 600),
    dockAtPoint(30, 580, 900, 600), dockAtPoint(450, 580, 900, 600), dockAtPoint(870, 580, 900, 600),
  ], ['top-left','top-center','top-right','middle-left','middle-right','bottom-left','bottom-center','bottom-right']);
  assert.equal(dockAtPoint(-100, -100, 900, 600), 'top-left');
  assert.equal(dockAtPoint(1000, 700, 900, 600), 'bottom-right');
  assert.ok(!toolbarDocks.includes('middle-center'));
});

test('painel sobreposto move a toolbar para um canto livre; fechar restaura a preferência', () => {
  const viewport = { w: 1440, h: 900 }, size = { w: 650, h: 50 };
  const panel = { x: 900, y: 54, w: 356, h: 720 };
  const requested = 'middle-right';
  const moved = placeToolbar(requested, viewport, size, [panel]);
  assert.equal(moved.dock, 'bottom-left');
  assert.equal(overlaps(moved, panel), false);
  assert.equal(placeToolbar(requested, viewport, size, []).dock, requested);
});

test('toolbar vertical muda de lado quando as propriedades cobrem a lateral', () => {
  const panel = { x: 432, y: 58, w: 356, h: 600 };
  const moved = placeToolbar('middle-right', { w: 800, h: 720 }, { w: 90, h: 500 }, [panel]);
  assert.equal(overlaps(moved, panel), false);
  assert.equal(moved.x, 8);
});

test('setas movem entre os dois lados e mantêm a coluna nos cantos', () => {
  assert.equal(moveToolbarDock('middle-right', 'ArrowLeft'), 'middle-left');
  assert.equal(moveToolbarDock('middle-left', 'ArrowRight'), 'middle-right');
  assert.equal(moveToolbarDock('middle-right', 'ArrowUp'), 'top-right');
  assert.equal(moveToolbarDock('top-right', 'ArrowLeft'), 'top-center');
  assert.equal(moveToolbarDock('top-center', 'ArrowDown'), 'middle-left');
  assert.equal(moveToolbarDock('bottom-left', 'ArrowDown'), 'bottom-left');
  assert.equal(moveToolbarDock('bottom-left', 'Tab'), undefined);
});

test('toolbar mantém o cartão inicial visível quando o dock superior não cabe', () => {
  const viewport = { w: 302, h: 462 }, size = { w: 278, h: 134 };
  const welcome = { x: 16, y: 14, w: 270, h: 296 };
  const moved = placeToolbar('top-center', viewport, size, [welcome]);
  assert.equal(moved.dock, 'bottom-left');
  assert.equal(overlaps(moved, welcome), false);
});

test('em celular a faixa inferior mantém todas as ferramentas dentro do canvas', () => {
  const viewport = { w: 366, h: 680 }, size = { w: 284, h: 140 };
  const panel = { x: 28, y: 8, w: 330, h: 496 };
  const moved = placeToolbar('top-right', viewport, size, [panel]);
  assert.equal(overlaps(moved, panel), false);
  assert.ok(moved.x >= 8 && moved.x + moved.w <= viewport.w - 8);
  assert.ok(moved.y >= 8 && moved.y + moved.h <= viewport.h - 8);
});

test('redimensionamento limita todas as posições ao viewport', () => {
  for (const dock of toolbarDocks) {
    const placed = placeToolbar(dock, { w: 800, h: 600 }, { w: 600, h: 64 }, []);
    assert.ok(placed.x >= 8 && placed.x + placed.w <= 792);
    assert.ok(placed.y >= 8 && placed.y + placed.h <= 592);
  }
});
