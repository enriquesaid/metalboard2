export const toolbarDocks = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
] as const;
export type ToolbarDock = (typeof toolbarDocks)[number];
export type Rect = { x: number; y: number; w: number; h: number };
export const dockLabels: Record<ToolbarDock, string> = {
  'top-left': 'Canto superior esquerdo', 'top-center': 'Topo', 'top-right': 'Canto superior direito',
  'middle-left': 'Meio à esquerda', 'middle-right': 'Meio à direita',
  'bottom-left': 'Canto inferior esquerdo', 'bottom-center': 'Embaixo', 'bottom-right': 'Canto inferior direito',
};

export function dockAtPoint(x: number, y: number, width: number, height: number): ToolbarDock {
  const horizontal = x < width / 3 ? 'left' : x > width * 2 / 3 ? 'right' : 'center';
  const vertical = y < height / 3 ? 'top' : y > height * 2 / 3 ? 'bottom' : 'middle';
  if (vertical === 'middle') return `middle-${x < width / 2 ? 'left' : 'right'}`;
  return `${vertical}-${horizontal}` as ToolbarDock;
}

export function moveToolbarDock(dock: ToolbarDock, key: string): ToolbarDock | undefined {
  const row = dock.startsWith('top') ? 'top' : dock.startsWith('bottom') ? 'bottom' : 'middle';
  const column = dock.endsWith('left') ? 'left' : dock.endsWith('right') ? 'right' : 'center';
  switch (key) {
    case 'ArrowLeft': return row === 'middle' ? 'middle-left' : `${row}-${column === 'right' ? 'center' : 'left'}`;
    case 'ArrowRight': return row === 'middle' ? 'middle-right' : `${row}-${column === 'left' ? 'center' : 'right'}`;
    case 'ArrowUp': return row === 'bottom' ? `middle-${column === 'right' ? 'right' : 'left'}` : `top-${column}`;
    case 'ArrowDown': return row === 'top' ? `middle-${column === 'right' ? 'right' : 'left'}` : `bottom-${column}`;
  }
}

export function overlaps(a: Rect, b: Rect, gap = 8) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

/** Prefer the saved dock; use a free corner when a panel would cover it. */
export function placeToolbar(dock: ToolbarDock, viewport: { w: number; h: number }, size: { w: number; h: number }, obstacles: Rect[]) {
  const margin = 8;
  const right = Math.max(margin, viewport.w - size.w - margin);
  const bottom = Math.max(margin, viewport.h - size.h - margin);
  const at = (candidate: ToolbarDock): Rect => ({
    x: candidate.endsWith('left') ? margin : candidate.endsWith('right') ? right : (margin + right) / 2,
    y: candidate.startsWith('top') ? margin : candidate.startsWith('bottom') ? bottom : (margin + bottom) / 2,
    ...size,
  });
  const candidates = [dock, 'bottom-left', 'top-left', 'bottom-right', 'top-right', ...toolbarDocks] as ToolbarDock[];
  for (const candidate of candidates) {
    const rect = at(candidate);
    if (!obstacles.some(obstacle => overlaps(rect, obstacle))) return { ...rect, dock: candidate };
  }
  return { ...at(dock), dock };
}
