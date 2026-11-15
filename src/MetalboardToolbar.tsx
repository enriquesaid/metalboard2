import { useCallback, useEffect, useRef, useState } from "react";
import { DefaultToolbar, createShapeId, useEditor, useValue } from "tldraw";
import { AppWindow, Code2, FileText, Terminal, Globe, GitBranch, PanelRight, ChevronDown, PanelBottomOpen } from "lucide-react";
import { type BlockShape } from "./shapes";
import { exampleSource } from "./preview";
import { useInspector } from "./InspectorContext";

const blocks = [
  { kind: "idea", label: "Documento", title: "Novo documento", icon: FileText },
  { kind: "terminal", label: "Terminal", title: "Terminal", icon: Terminal },
  { kind: "code", label: "Componente", title: "Novo componente", icon: Code2 },
  { kind: "fetch", label: "Fetch", title: "Fetch", icon: Globe },
  { kind: "embed", label: "Embed", title: "Embed de URL", icon: AppWindow },
  { kind: "mermaid", label: "Mermaid", title: "Novo diagrama", icon: GitBranch },
] as const;

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
  const readonly = useValue("readonly", () => editor.getIsReadonly(), [editor]);
  const narrow = useValue("compact drawing tools", () => editor.getViewportScreenBounds().w <= 620, [editor]);
  const add = useCallback((block: (typeof blocks)[number]) => {
    const center = editor.getViewportPageBounds().center;
    const id = createShapeId();
    const w = block.kind === "embed" ? 620 : block.kind === "fetch" ? 580 : block.kind === "code" ? 460 : block.kind === "mermaid" ? 520 : 400;
    const h = block.kind === "embed" ? 470 : block.kind === "fetch" ? 440 : block.kind === "code" ? 390 : block.kind === "mermaid" ? 430 : 300;
    editor.setCurrentTool("select");
    editor.createShape<BlockShape>({
      id, type: "block", x: center.x - w / 2, y: center.y - h / 2,
      props: { kind: block.kind, title: block.title, w, h,
        content: block.kind === "terminal" ? "pwd" : block.kind === "code" ? exampleSource : block.kind === "mermaid" ? "flowchart LR\n  idea[Ideia] --> api[API]\n  api --> result[Resultado]" : "" },
    });
    editor.select(id);
    editor.focus();
  }, [editor]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || event.isComposing || event.defaultPrevented) return;
      if (!editor.getInstanceState().isFocused || editor.getEditingShapeId()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [aria-modal="true"]')) return;
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
      add(blocks[Number(match[1]) - 1]);
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [editor, add, setInspectorOpen]);
  const optionKey = /mac/i.test(navigator.platform) ? "⌥" : "Alt+";
  return <div className={`metalboard-toolbar${collapsed ? " is-collapsed" : ""}`}>
    <div className="toolbar-content" id="metalboard-toolset" hidden={collapsed}>
    <div className="drawing-tools"><DefaultToolbar maxItems={narrow ? 4 : 5} /></div>
    {!readonly && <div className="metalboard-tools" role="group" aria-label="Ferramentas Metalboard">
      <div className="block-tool-keys">{blocks.map((block, index) => <button className="tlui-button metalboard-tool" key={block.kind} type="button" title={`Adicionar ${block.label.toLowerCase()} · ${optionKey}${index + 1}`} aria-label={`Adicionar ${block.label.toLowerCase()}`} aria-keyshortcuts={`Alt+${index + 1}`} onClick={() => add(block)}>
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
  </div>;
}
