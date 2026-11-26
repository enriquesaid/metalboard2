import { useLayoutEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { useEditor } from 'tldraw';
import { dockAtPoint, moveToolbarDock, placeToolbar, toolbarDocks, type ToolbarDock } from './toolbar-position';

const storageKey = 'metalboard-toolbar-position';
export function useToolbarDock(inspectorOpen: boolean, collapsed: boolean, setCollapsed: (collapsed: boolean) => void) {
  const editor = useEditor();
  const toolbar = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState<ToolbarDock>(() => {
    const saved = localStorage.getItem(storageKey);
    return toolbarDocks.includes(saved as ToolbarDock) ? saved as ToolbarDock : 'bottom-center';
  });
  const [preview, setPreview] = useState<{ x: number; y: number }>();
  const drag = useRef<{ id: number; x: number; y: number; offsetX: number; offsetY: number; moved: boolean; restoreExpanded: boolean } | null>(null);
  const [position, setPosition] = useState({ x: 8, y: 8, dock });
  const [compactOverlay, setCompactOverlay] = useState(false);
  const vertical = dock.startsWith('middle') && !compactOverlay;

  useLayoutEffect(() => { localStorage.setItem(storageKey, dock); }, [dock]);
  useLayoutEffect(() => {
    const element = toolbar.current;
    if (!element) return;
    const container = editor.getContainer();
    const compact = window.matchMedia('(max-width: 620px)');
    let observedPanels = new Set<HTMLElement>();
    let frame = 0;
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const panels = Array.from(container.querySelectorAll<HTMLElement>('.data-panel, .tlui-style-panel, .selection-actions[data-inspector-open], .board-start, .legacy-example'))
        .filter(panel => panel.getClientRects().length > 0);
      // A stacked side dock cannot share the width of a compact start card or inspector.
      setCompactOverlay(compact.matches && panels.some(panel => panel.matches('.data-panel, .board-start, .legacy-example')));
      const obstacles = panels.map(panel => {
        const r = panel.getBoundingClientRect();
        return { x: r.left - bounds.left, y: r.top - bounds.top, w: r.width, h: r.height };
      });
      const next = placeToolbar(dock, { w: bounds.width, h: bounds.height }, { w: rect.width, h: rect.height }, obstacles);
      setPosition(previous => previous.x === next.x && previous.y === next.y && previous.dock === next.dock ? previous : next);
      const currentPanels = new Set(panels);
      observedPanels.forEach(panel => { if (!currentPanels.has(panel)) resize.unobserve(panel); });
      currentPanels.forEach(panel => { if (!observedPanels.has(panel)) resize.observe(panel); });
      observedPanels = currentPanels;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    resize.observe(element);
    const mutation = new MutationObserver(schedule);
    mutation.observe(container, { childList: true, subtree: true });
    compact.addEventListener('change', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      compact.removeEventListener('change', schedule);
    };
  }, [editor, dock, vertical, inspectorOpen, collapsed]);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || drag.current) return;
    event.stopPropagation();
    const rect = toolbar.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
      moved: false, restoreExpanded: !collapsed,
    };
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    event.stopPropagation();
    if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;
    if (!start.moved) {
      start.moved = true;
      if (start.restoreExpanded) setCollapsed(true);
    }
    const bounds = editor.getContainer().getBoundingClientRect();
    const width = toolbar.current?.offsetWidth ?? 0;
    const height = toolbar.current?.offsetHeight ?? 0;
    setPreview({
      x: Math.max(0, Math.min(bounds.width - width, event.clientX - bounds.left - Math.min(start.offsetX, width / 2))),
      y: Math.max(0, Math.min(bounds.height - height, event.clientY - bounds.top - Math.min(start.offsetY, height / 2))),
    });
  }
  function resetDrag(grip: HTMLButtonElement) {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    setPreview(undefined);
    if (start.moved && start.restoreExpanded) setCollapsed(false);
    if (grip.hasPointerCapture(start.id)) grip.releasePointerCapture(start.id);
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    if (event.type === 'pointerup' && start.moved) {
      const bounds = editor.getContainer().getBoundingClientRect();
      setDock(dockAtPoint(event.clientX - bounds.left, event.clientY - bounds.top, bounds.width, bounds.height));
    }
    resetDrag(event.currentTarget);
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = moveToolbarDock(position.dock, event.key);
    if (event.key === 'Escape' && drag.current) resetDrag(event.currentTarget);
    else if (!next || drag.current) return;
    else if (next !== position.dock) setDock(next);
    event.preventDefault();
    event.stopPropagation();
  }
  return { toolbar, position: { ...position, ...preview }, vertical, dragging: !!preview, grip: {
    onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag,
    onLostPointerCapture: endDrag, onKeyDown,
  } };
}
