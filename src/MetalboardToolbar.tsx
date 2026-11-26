import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, DefaultToolbar, createShapeId, useEditor, useValue, type Editor } from "tldraw";
import { AppWindow, Code2, FileText, Terminal, Globe, GitBranch, PanelRight, ChevronDown, PanelBottomOpen, Grip } from "lucide-react";
import { requestDocumentEditing, type BlockShape } from "./shapes";
import { exampleSource } from "./preview";
import { useInspector } from "./InspectorContext";
import { useToolbarDock } from "./useToolbarDock";
import { dockLabels } from "./toolbar-position";

export const boardBlockTools = [
  { kind: "idea", label: "Documento", title: "Novo documento", icon: FileText },
  { kind: "terminal", label: "Terminal", title: "Terminal", icon: Terminal },
  { kind: "code", label: "Componente", title: "Novo componente", icon: Code2 },
  { kind: "fetch", label: "Requisição HTTP", title: "Requisição HTTP", icon: Globe },
  { kind: "embed", label: "Página web", title: "Página web", icon: AppWindow },
  { kind: "mermaid", label: "Diagrama Mermaid", title: "Novo diagrama", icon: GitBranch },
] as const;

type BlockTool = (typeof boardBlockTools)[number];

function blockPlacement(editor: Editor, w: number, h: number) {
  const viewport = editor.getViewportPageBounds();
  const center = viewport.center;
  const centered = new Box(center.x - w / 2, center.y - h / 2, w, h);
  const occupied = editor.getCurrentPageShapes().flatMap((shape) => {
    if (shape.type !== "block" || editor.isShapeHidden(shape)) return [];
    const bounds = editor.getShapePageBounds(shape);
    return bounds ? [bounds.clone().expandBy(40)] : [];
  });
  const fits = (box: Box) => occupied.every((bounds) => !bounds.collides(box));
  if (fits(centered)) return centered;

  const candidates = occupied.flatMap((bounds) => [
    new Box(bounds.maxX + 1, centered.y, w, h),
    new Box(bounds.minX - w - 1, centered.y, w, h),
    new Box(centered.x, bounds.maxY + 1, w, h),
    new Box(centered.x, bounds.minY - h - 1, w, h),
  ]);
  const distance = (box: Box) => Math.hypot(box.x - centered.x, box.y - centered.y);
  candidates.sort((first, second) => distance(first) - distance(second));
  return candidates.find((box) => viewport.contains(box) && fits(box)) ?? candidates.find(fits) ?? centered;
}

export function addBoardBlock(editor: Editor, kind: BlockTool["kind"], fromEmptyPage = false) {
  if (editor.getIsReadonly()) return;
  const block = boardBlockTools.find((tool) => tool.kind === kind);
  if (!block) return;
  const id = createShapeId();
  const w = block.kind === "embed" ? 620 : block.kind === "fetch" ? 580 : block.kind === "code" ? 460 : block.kind === "mermaid" ? 520 : 400;
  const h = block.kind === "embed" ? 470 : block.kind === "fetch" ? 440 : block.kind === "code" ? 390 : block.kind === "mermaid" ? 430 : 300;
  editor.updateViewportScreenBounds(editor.getContainer());
  const placement = blockPlacement(editor, w, h);
  editor.markHistoryStoppingPoint();
  editor.setCurrentTool("select");
  if (fromEmptyPage && kind === "idea") requestDocumentEditing(editor, id);
  editor.createShape<BlockShape>({
    id, type: "block", x: placement.x, y: placement.y,
    props: { kind: block.kind, title: block.title, w, h,
      content: block.kind === "terminal" ? "pwd" : block.kind === "code" ? exampleSource : block.kind === "mermaid" ? "flowchart LR\n  idea[Ideia] --> api[API]\n  api --> result[Resultado]" : "" },
  });
  editor.select(id).focus();
  const viewport = editor.getViewportScreenBounds();
  const needsFit = fromEmptyPage && (viewport.w < w + 24 || viewport.h < h + 128 || editor.getZoomLevel() !== 1);
  if (needsFit || !editor.getViewportPageBounds().contains(placement)) {
    const targetZoom = fromEmptyPage ? 1 : editor.getZoomLevel();
    editor.zoomToBounds({ x: placement.x, y: placement.y, w, h: h + 96 }, { inset: 24, targetZoom });
  }
}

export function MetalboardToolbar() {
  const editor = useEditor();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("metalboard-toolbar-collapsed") === "true");
  const visibilityButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    localStorage.setItem("metalboard-toolbar-collapsed", String(collapsed));
  }, [collapsed]);
  function toggleToolbar() {
    setCollapsed(previous => !previous);
    requestAnimationFrame(() => visibilityButton.current?.focus({ preventScroll: true }));
  }
  const { open: inspectorOpen, setOpen: setInspectorOpen } = useInspector();
  const { toolbar, position, vertical, dragging, grip } = useToolbarDock(inspectorOpen, collapsed, setCollapsed);
  const readonly = useValue("readonly", () => editor.getIsReadonly(), [editor]);
  const narrow = useValue("compact drawing tools", () => editor.getViewportScreenBounds().w <= 620, [editor]);
  const add = useCallback((kind: BlockTool["kind"]) => addBoardBlock(editor, kind), [editor]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || event.isComposing || event.defaultPrevented) return;
      if (!editor.getInstanceState().isFocused || editor.getEditingShapeId()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      if (document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"]')) return;
      if (event.code === "KeyB") {
        event.preventDefault();
        event.stopPropagation();
        setCollapsed(previous => !previous);
        editor.focus();
        return;
      }
      if (event.code === "KeyP") {
        event.preventDefault();
        event.stopPropagation();
        setInspectorOpen(previous => !previous);
        editor.focus();
        return;
      }
      if (editor.getIsReadonly()) return;
      const match = /^Digit([1-6])$/.exec(event.code);
      if (!match) return;
      event.preventDefault();
      event.stopPropagation();
      add(boardBlockTools[Number(match[1]) - 1].kind);
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [editor, add, setInspectorOpen]);
  const optionKey = /mac/i.test(navigator.platform) ? "⌥" : "Alt+";
  return createPortal(<div className="toolbar-dock-layer">
    <div ref={toolbar} data-dock={position.dock} data-orientation={vertical ? 'vertical' : 'horizontal'} className={`metalboard-toolbar dockable-toolbar${collapsed ? " is-collapsed" : ""}${dragging ? " is-dragging" : ""}`} style={{ left: position.x, top: position.y }} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <button className="toolbar-grip" type="button" aria-label={`Mover ferramentas: ${dockLabels[position.dock]}. Use as setas para posicionar.`} title="Arraste para posicionar · ou use as setas" {...grip}><Grip size={16} aria-hidden="true" /></button>
    <div className="toolbar-content" id="metalboard-toolset" hidden={collapsed}>
    <div className="drawing-tools"><DefaultToolbar orientation={vertical ? 'vertical' : 'horizontal'} minItems={narrow ? 3 : 4} maxItems={narrow ? 3 : 5} /></div>
    {!readonly && <div className="metalboard-tools" role="group" aria-label="Ferramentas Metalboard">
      <div className="block-tool-keys">{boardBlockTools.map((block, index) => <button className="tlui-button metalboard-tool" key={block.kind} type="button" title={`Adicionar ${block.label} · ${optionKey}${index + 1}`} aria-label={`Adicionar ${block.label}`} aria-keyshortcuts={`Alt+${index + 1}`} onClick={() => add(block.kind)}>
        <block.icon size={18} strokeWidth={1.6} aria-hidden="true" />
        <kbd className="tool-shortcut" aria-hidden="true">{optionKey}{index + 1}</kbd>
      </button>)}</div>
    </div>}
    <div className="inspector-tools">
      <button className="tlui-button inspector-tool" type="button" aria-label="Propriedades" aria-expanded={inspectorOpen} aria-controls="element-inspector" aria-keyshortcuts="Alt+P" title={`Propriedades · ${optionKey}P`} onClick={() => setInspectorOpen(previous => !previous)}>
        <PanelRight size={18} strokeWidth={1.6} aria-hidden="true" />
        <kbd className="tool-shortcut" aria-hidden="true">{optionKey}P</kbd>
      </button>
    </div>
    </div>
    <div className="toolbar-visibility">
      <button ref={visibilityButton} className="tlui-button toolbar-toggle" type="button" aria-label={collapsed ? "Mostrar ferramentas" : "Recolher ferramentas"} aria-expanded={!collapsed} aria-controls="metalboard-toolset" aria-keyshortcuts="Alt+B" title={`${collapsed ? "Mostrar" : "Recolher"} ferramentas · ${optionKey}B`} onClick={toggleToolbar}>
        {collapsed ? <PanelBottomOpen size={18} strokeWidth={1.6} aria-hidden="true" /> : <ChevronDown size={16} strokeWidth={1.6} aria-hidden="true" />}
        <kbd className="tool-shortcut" aria-hidden="true">{optionKey}B</kbd>
      </button>
    </div>
  </div></div>, editor.getContainer());
}
