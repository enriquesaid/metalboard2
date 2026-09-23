import { DefaultToolbar, createShapeId, useEditor, useValue } from "tldraw";
import { AppWindow, Code2, FileText, Terminal, Globe, GitBranch } from "lucide-react";
import { type BlockShape } from "./shapes";
import { exampleSource } from "./preview";

const blocks = [
  { kind: "idea", label: "Ideia", title: "Nova ideia", icon: FileText },
  { kind: "terminal", label: "Terminal", title: "Terminal", icon: Terminal },
  { kind: "code", label: "Componente", title: "Novo componente", icon: Code2 },
  { kind: "fetch", label: "Fetch", title: "Fetch", icon: Globe },
  { kind: "embed", label: "Embed", title: "Embed de URL", icon: AppWindow },
  { kind: "mermaid", label: "Mermaid", title: "Novo diagrama", icon: GitBranch },
] as const;

export function MetalboardToolbar() {
  const editor = useEditor();
  const readonly = useValue("readonly", () => editor.getIsReadonly(), [editor]);
  function add(block: (typeof blocks)[number]) {
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
  }
  return <div className="metalboard-toolbar">
    <DefaultToolbar />
    {!readonly && <div className="metalboard-tools" role="group" aria-label="Ferramentas Metalboard">
      {blocks.map(block => <button className="tlui-button tlui-button__tool metalboard-tool" key={block.kind} type="button" title={`Metalboard · ${block.label}`} aria-label={`Adicionar ${block.label.toLowerCase()}`} onClick={() => add(block)}>
        <block.icon size={20} strokeWidth={1.75} />
      </button>)}
    </div>}
  </div>;
}
