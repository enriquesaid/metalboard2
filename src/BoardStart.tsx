import { useState } from "react";
import { ArrowRight, BookOpen, Code2, FilePlus2, Pencil, X } from "lucide-react";
import { DefaultStylePanel, PageRecordType, useEditor, useValue, type TLShape, type TLUiStylePanelProps } from "tldraw";
import { addBoardBlock } from "./MetalboardToolbar";
import { useInspector } from "./InspectorContext";
import { demoTips, type DemoId } from "./demos";
import "./board-start.css";

const originalBlocks = new Map([
  ["idea", "Pense em fluxo"],
  ["terminal", "Do pensamento ao comando"],
  ["code", "Rascunhe. Renderize."],
  ["output", "Seu próximo fluxo começa aqui"],
]);

export function boardHref(demo?: DemoId) {
  return demo ? `?demo=${demo}` : "?board";
}

export function DemoGuide({ demo }: { demo: DemoId }) {
  return (
    <section className="demo-guide" aria-label="Exemplos interativos">
      <nav aria-label="Escolher exemplo">
        <a href={boardHref("checkout")} aria-current={demo === "checkout" ? "page" : undefined}>Checkout</a>
        <a href={boardHref("suporte")} aria-current={demo === "suporte" ? "page" : undefined}>Suporte</a>
      </nav>
      <p>{demoTips[demo]}</p>
    </section>
  );
}

function hasOriginalExample(shapes: TLShape[]) {
  if (shapes.length !== originalBlocks.size) return false;
  const kinds = new Set<string>();
  for (const shape of shapes) {
    if (shape.type !== "block" || originalBlocks.get(shape.props.kind) !== shape.props.title) return false;
    kinds.add(shape.props.kind);
  }
  return kinds.size === originalBlocks.size;
}

export function BoardStylePanel(props: TLUiStylePanelProps) {
  const editor = useEditor();
  const emptySelect = useValue("unused styles on empty page", () =>
    editor.isIn("select") && editor.getCurrentPageShapeIds().size === 0, [editor]);
  if (!props.isMobile && emptySelect) return null;
  return <DefaultStylePanel {...props} />;
}

export function BoardStart() {
  const editor = useEditor();
  const { open: inspectorOpen } = useInspector();
  const [dismissedPage, setDismissedPage] = useState<string>();
  const page = useValue("active page", () => editor.getCurrentPageId(), [editor]);
  const state = useValue("board start", () => {
    if (editor.getIsReadonly() || !editor.isIn("select.idle") || editor.getSelectedShapeIds().length) return;
    const count = editor.getCurrentPageShapeIds().size;
    if (count === 0) return "empty";
    if (count === originalBlocks.size && editor.getPages().length === 1 && editor.options.maxPages > 1
      && hasOriginalExample(editor.getCurrentPageShapes())) return "legacy";
  }, [editor]);
  if (!state || dismissedPage === page || inspectorOpen) return null;

  function startPage() {
    const id = PageRecordType.createId();
    editor.markHistoryStoppingPoint();
    editor.createPage({ id, name: "Página em branco" }).setCurrentPage(id).focus();
  }
  function dismiss() {
    setDismissedPage(page);
    editor.focus();
  }
  if (state === "legacy") return (
    <aside className="legacy-example" aria-label="Exemplo inicial">
      <span>Esta página contém o exemplo inicial.</span>
      <button type="button" onClick={startPage}>Criar página vazia</button>
      <button type="button" className="start-dismiss" onClick={dismiss} aria-label="Ocultar aviso"><X size={14} /></button>
    </aside>
  );
  return (
    <section
      className="board-start"
      aria-labelledby="board-start-heading"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="board-start-content">
        <h1 id="board-start-heading">Monte seu fluxo</h1>
        <p>Escolha o que quer colocar na página.</p>
        <div className="board-start-actions" role="group" aria-label="Primeiro elemento">
          <button type="button" className="ui-action ui-action--primary" onClick={() => addBoardBlock(editor, "idea", true)}>
            <FilePlus2 size={16} aria-hidden="true" /> Criar documento
          </button>
          <button type="button" className="ui-action" onClick={() => addBoardBlock(editor, "code", true)}>
            <Code2 size={16} aria-hidden="true" /> Testar React
          </button>
          <button type="button" className="ui-action" onClick={() => editor.setCurrentTool("draw").focus()}>
            <Pencil size={16} aria-hidden="true" /> Desenhar
          </button>
        </div>
        <button type="button" className="start-dismiss" onClick={dismiss} aria-label="Ocultar sugestões" title="Ocultar sugestões"><X size={16} aria-hidden="true" /></button>
      </div>
      <a className="board-start-example" href={boardHref("checkout")}>
        <BookOpen size={19} aria-hidden="true" />
        <span><strong>Explorar um exemplo</strong><small>Veja dados, documentos e componentes conectados.</small></span>
        <ArrowRight size={16} aria-hidden="true" />
      </a>
    </section>
  );
}
