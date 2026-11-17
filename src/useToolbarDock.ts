import { useLayoutEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { useEditor, useValue } from 'tldraw';
import { dockAtPoint, placeToolbar, toolbarDocks, type ToolbarDock } from './toolbar-position';

const storageKey = 'metalboard-toolbar-position';
export function useToolbarDock(inspectorOpen: boolean, collapsed: boolean) {
  const editor = useEditor();
  const toolbar = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState<ToolbarDock>(() => {
    const saved = localStorage.getItem(storageKey);
    return toolbarDocks.includes(saved as ToolbarDock) ? saved as ToolbarDock : 'bottom-center';
  });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; dock: ToolbarDock; moved: boolean } | null>(null);
  const [position, setPosition] = useState({ x: 8, y: 8, dock });
  const narrow = useValue('toolbar dock viewport', () => editor.getViewportScreenBounds().w <= 620, [editor]);
  // On a phone the inspector leaves a horizontal strip below it.
  const vertical = dock.startsWith('middle') && !(narrow && inspectorOpen);

  useLayoutEffect(() => { localStorage.setItem(storageKey, dock); }, [dock]);
  useLayoutEffect(() => {
    const element = toolbar.current;
    if (!element) return;
    const container = editor.getContainer();
    let frame = 0;
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const panels = Array.from(container.querySelectorAll<HTMLElement>('.data-panel, .tlui-style-panel'));
      const obstacles = panels.filter(panel => panel.getClientRects().length > 0).map(panel => {
        const r = panel.getBoundingClientRect();
        return { x: r.left - bounds.left, y: r.top - bounds.top, w: r.width, h: r.height };
      });
      const next = placeToolbar(dock, { w: bounds.width, h: bounds.height }, { w: rect.width, h: rect.height }, obstacles);
      setPosition(previous => previous.x === next.x && previous.y === next.y && previous.dock === next.dock ? previous : next);
      panels.forEach(panel => resize.observe(panel));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    resize.observe(element);
    const mutation = new MutationObserver(schedule);
    mutation.observe(container, { childList: true, subtree: true });
    measure();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); };
  }, [editor, dock, vertical, inspectorOpen, collapsed]);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dock, moved: false };
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    event.stopPropagation();
    if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;
    start.moved = true;
    setDragging(true);
    const bounds = editor.getContainer().getBoundingClientRect();
    setDock(dockAtPoint(event.clientX - bounds.left, event.clientY - bounds.top, bounds.width, bounds.height));
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    if (event.type === 'pointercancel') setDock(drag.current.dock);
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = toolbarDocks.indexOf(dock);
    let row = Math.floor(index / 3), column = index % 3;
    if (event.key === 'ArrowUp') row = Math.max(0, row - 1);
    else if (event.key === 'ArrowDown') row = Math.min(2, row + 1);
    else if (event.key === 'ArrowLeft') column = Math.max(0, column - 1);
    else if (event.key === 'ArrowRight') column = Math.min(2, column + 1);
    else if (event.key === 'Escape' && drag.current) {
      setDock(drag.current.dock); drag.current = null; setDragging(false);
    } else return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key !== 'Escape') setDock(toolbarDocks[row * 3 + column]);
  }
  return { toolbar, dock, position, vertical, dragging, grip: {
    onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag,
    onLostPointerCapture: endDrag, onKeyDown,
  } };
}
