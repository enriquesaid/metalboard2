export const toolbarDocks = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
] as const;
export type ToolbarDock = (typeof toolbarDocks)[number];
export type Rect = { x: number; y: number; w: number; h: number };
export const dockLabels: Record<ToolbarDock, string> = {
  'top-left': 'Canto superior esquerdo', 'top-center': 'Topo', 'top-right': 'Canto superior direito',
  'middle-left': 'Meio à esquerda', 'middle-center': 'Centro', 'middle-right': 'Meio à direita',
  'bottom-left': 'Canto inferior esquerdo', 'bottom-center': 'Embaixo', 'bottom-right': 'Canto inferior direito',
};

export function dockAtPoint(x: number, y: number, width: number, height: number): ToolbarDock {
  const column = Math.max(0, Math.min(2, Math.floor(x / width * 3)));
  const row = Math.max(0, Math.min(2, Math.floor(y / height * 3)));
  return toolbarDocks[row * 3 + column];
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
