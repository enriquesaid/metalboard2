import { useEffect, useMemo, useRef, useState } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  type Editor,
  type TLBaseShape,
  type TLShapeId,
  useEditor,
  useValue,
} from "tldraw";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  AppWindow,
  Braces,
  Check,
  Code2,
  Copy,
  FileText,
  GitBranch,
  Globe,
  Link2,
  Pencil,
  Pin,
  Play,
  SlidersHorizontal,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { desktopAvailable, startTerminal } from "./runtime";
import { FetchBlock } from "./FetchBlock";
import { EmbedBlock } from "./EmbedBlock";
import { ComponentBlock } from "./ComponentBlock";
import { MarkdownDoc } from "./MarkdownDoc";
import { useDataResolver, updateMeta } from "./dataflow/editor";
import { config, display, unescapeMarkdown } from "./dataflow/core";
import { useInspector } from "./InspectorContext";
import "./block-card.css";
export type BlockShape = TLBaseShape<
  "block",
  {
    w: number;
    h: number;
    kind: string;
    title: string;
    content: string;
    language: string;
    cwd: string;
    origin: string;
  }
>;
declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    block: BlockShape["props"];
  }
}
marked.setOptions({ gfm: true, breaks: true, async: false });
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});
// Notas renderizam markdown do conteúdo já resolvido pelo dataflow — valores
// vindos de fetch/embed chegam aqui, então sanitizar antes do innerHTML é
// obrigatório.
function renderNoteMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source) as string);
}

const blockKinds = {
  idea: { label: "Documento", icon: FileText },
  terminal: { label: "Terminal", icon: Terminal },
  code: { label: "Componente", icon: Code2 },
  mermaid: { label: "Mermaid", icon: GitBranch },
  output: { label: "Saída", icon: Braces },
  fetch: { label: "Requisição HTTP", icon: Globe },
  embed: { label: "Página web", icon: AppWindow },
} as const;
const pendingDocumentEdit = new WeakMap<Editor, TLShapeId>();

export function requestDocumentEditing(editor: Editor, id: TLShapeId) {
  pendingDocumentEdit.set(editor, id);
}
export class BlockUtil extends BaseBoxShapeUtil<BlockShape> {
  static override type = "block" as const;
  static override props = {
    w: T.number,
    h: T.number,
    kind: T.string,
    title: T.string,
    content: T.string,
    language: T.string,
    cwd: T.string,
    origin: T.string,
  };
  override getDefaultProps(): BlockShape["props"] {
    return {
      w: 400,
      h: 300,
      kind: "idea",
      title: "Novo documento",
      content: "",
      language: "tsx",
      cwd: "",
      origin: "",
    };
  }
  override getGeometry(shape: BlockShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }
  override component(shape: BlockShape) {
    return <Block shape={shape} />;
  }
  override getIndicatorPath(shape: BlockShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
  override canEdit() {
    // O estado de edição do tldraw (duplo clique / Enter) controla a renomeação
    // do título. Com false, o duplo clique cairia no fallback que cria um shape
    // de texto vazio por cima do bloco.
    return true;
  }
  override canCull() {
    return false;
  }
}
function Block({ shape }: { shape: BlockShape }) {
  const editor = useEditor(),
    p = shape.props;
  const data = useDataResolver();
  const { open: inspectorOpen, setOpen: setInspectorOpen } = useInspector();
  const selected = useValue("block inspector selection", () => editor.getOnlySelectedShapeId() === shape.id, [editor, shape.id]);
  const [noteEditing, setNoteEditing] = useState(false);
  const [docFocus, setDocFocus] = useState(0);
  const noteEditButton = useRef<HTMLButtonElement>(null);
  const readonly = useValue("readonly", () => editor.getIsReadonly(), [editor]);
  const [pending, setPending] = useState<{command: string; cwd: string} | null>(null);
  const titleDraft = useRef("");
  const titleInput = useRef<HTMLInputElement>(null);
  const titleEditing = useValue(
    "title editing",
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id],
  );
  const unescapedContent = unescapeMarkdown(p.content);
  const resolvedContent = data.attempt(() => data.text(shape, unescapedContent));
  const contentText = resolvedContent.ok ? display(resolvedContent.value) : `⚠ ${resolvedContent.error}`;
  const noteHtml = useMemo(
    () => (p.kind === "idea" && resolvedContent.ok ? renderNoteMarkdown(contentText) : ""),
    [p.kind, resolvedContent.ok, contentText],
  );
  const reference = `%${config(shape).id}%`;
  const { label: kindLabel, icon: BlockIcon } = blockKinds[p.kind as keyof typeof blockKinds] ?? blockKinds.idea;
  const title = p.title.trim() || kindLabel;
  const distinctTitle = title.toLocaleLowerCase('pt-BR') !== kindLabel.toLocaleLowerCase('pt-BR');
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState(false),
    [running, setRunning] = useState(false);
  const [clipboard, setClipboard] = useState<{ source: 'reference' | 'content' | 'output'; successful: boolean } | null>(null);
  const clipboardTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (p.kind !== 'idea' || pendingDocumentEdit.get(editor) !== shape.id) return;
    pendingDocumentEdit.delete(editor);
    if (!readonly) {
      setNoteEditing(true);
      setDocFocus(1);
    }
  }, [editor, p.kind, readonly, shape.id]);
  useEffect(() => {
    if (!selected) setNoteEditing(false);
  }, [selected]);
  useEffect(() => {
    if (!confirm) return;
    const frame = requestAnimationFrame(() => confirmButton.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [confirm]);
  const [output, setOutput] = useState(""),
    [result, setResult] = useState(""),
    [cancel, setCancel] = useState<null | (() => void)>(null);
  const activeRun = useRef<null | { write: (input: string) => Promise<unknown>; cancel: () => Promise<void> }>(null);
  const mounted = useRef(true);
  useEffect(() => {
    if (titleEditing) titleDraft.current = p.title;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleEditing]);
  useEffect(() => {
    if (!titleEditing) return;
    const el = titleInput.current;
    if (!el) return;
    // O foco precisa esperar o clique que abriu a edição terminar de despachar:
    // focar durante o evento faz a ação padrão (focar o canvas) roubar o foco
    // de volta, o blur encerra a edição no mesmo instante em que ela abre.
    const frame = requestAnimationFrame(() => {
      el.focus();
      el.select();
    });
    // O Escape precisa ser tratado no próprio input: o listener do container do
    // tldraw chama editor.cancel() durante a fase de bubble e desmonta o input
    // antes de o React processar o onKeyDown (perderíamos a reversão do título).
    const revert = (e: KeyboardEvent) => {
      if (e.key === "Escape") update({ title: titleDraft.current });
    };
    el.addEventListener("keydown", revert);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("keydown", revert);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleEditing]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(clipboardTimer.current);
      void activeRun.current?.cancel().catch(() => {});
    };
  }, []);
  const update = (props: Partial<BlockShape["props"]>) =>
    editor.updateShape<BlockShape>({ id: shape.id, type: "block", props });
  function prepareRun() {
    try { setPending({command:display(data.text(shape, p.content)),cwd:display(data.text(shape, p.cwd))}); setConfirm(true); }
    catch (e) { setResult(String(e)); }
  }
  async function run() {
    if (!pending) return;
    const request = pending;
    setConfirm(false);
    setRunning(true);
    setOutput("");
    setResult("");
    updateMeta(editor, shape.id, { execution: { status: 'running' } });
    let collected = '';
    try {
      const session = await startTerminal(request.cwd, (event) => {
        if (event.type === "output") {
          collected = (collected + (event.data || '')).slice(-100_000);
          setOutput(collected);
        }
        else {
          updateMeta(editor, shape.id, { execution: { status: event.type === 'completed' && event.exitCode === 0 ? 'success' : 'error', value: collected, error: event.data || `Exit ${event.exitCode}`, completedAt: new Date().toISOString() } });
          activeRun.current = null;
          setRunning(false);
          setCancel(null);
          setResult(
            event.type === "failed"
              ? event.data || "Falha"
              : `Exit ${event.exitCode}`,
          );
        }
      });
      activeRun.current = session;
      if (!mounted.current) {
        void session.cancel();
        return;
      }
      setCancel(() => () => {
        void session.cancel().catch((e) => setResult(String(e)));
      });
      await session.write(`${request.command}\n`);
    } catch (e) {
      updateMeta(editor, shape.id, { execution: { status: 'error', error: String(e) } });
      setRunning(false);
      setResult(String(e));
    }
  }
  function pin() {
    editor.createShape<BlockShape>({
      type: "block",
      x: shape.x + p.w + 50,
      y: shape.y + 40,
      props: {
        kind: "output",
        title: `${p.title} · output`,
        content: output,
        origin: `${p.content} · ${result} · ${new Date().toLocaleString("pt-BR")}`,
        w: 400,
        h: 280,
      },
    });
  }
  function sendInput() {
    if (!activeRun.current || !p.content.trim()) return;
    void activeRun.current.write(`${p.content}\n`).then(() => update({ content: "" })).catch((e) => setResult(String(e)));
  }
  function openDoc() {
    if (readonly) return;
    editor.setCurrentTool("select");
    editor.select(shape.id);
    setNoteEditing(true);
    setDocFocus((n) => n + 1);
  }
  function closeDoc() {
    setNoteEditing(false);
    noteEditButton.current?.focus({ preventScroll: true });
  }
  function openInspector() {
    editor.setCurrentTool("select");
    editor.select(shape.id);
    setInspectorOpen(true);
  }
  async function copy(text: string, source: 'reference' | 'content' | 'output') {
    let successful = true;
    try { await navigator.clipboard.writeText(text); }
    catch { successful = false; }
    if (!mounted.current) return;
    clearTimeout(clipboardTimer.current);
    setClipboard({ source, successful });
    clipboardTimer.current = setTimeout(() => setClipboard(null), 1800);
  }
  // O corpo do bloco deixa o pointerdown subir para o tldraw (arrastar por
  // qualquer área), exceto quando o alvo é interativo — inputs, botões e o
  // editor de documento precisam do evento para focar/sem arrastar o shape.
  function bodyPointerDown(e: React.PointerEvent) {
    if (e.target instanceof Element && e.target.closest(
      "input, textarea, select, button, a, summary, [contenteditable=true], .confirm-overlay, .block-readable",
    )) {
      e.stopPropagation();
    }
  }
  function copyContent() {
    const result = data.result(shape);
    void copy(result.ok ? display(result.value) : p.content, 'content');
  }
  const copied = clipboard?.successful ? clipboard.source : null;
  return (
    <HTMLContainer
      className={`block block-${p.kind} board-block`}
      style={{ width: p.w, height: p.h }}
      role="group"
      aria-label={distinctTitle ? `${kindLabel}: ${title}` : title}
    >
      <div className="block-header">
        <span className="block-symbol" aria-hidden="true"><BlockIcon size={15} /></span>
        <div className="block-identity">
          {(distinctTitle || p.kind === 'code') && <span className="block-tag">
            {distinctTitle && kindLabel}{p.kind === 'code' && `${distinctTitle ? ' · ' : ''}${p.language.toUpperCase()}`}
          </span>}
          {titleEditing ? (
            <input
              aria-label="Título do bloco"
              ref={titleInput}
              value={p.title}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editor.setEditingShape(null);
                }
              }}
              onBlur={() => editor.setEditingShape(null)}
              onChange={(e) => update({ title: e.target.value })}
            />
          ) : (
            <span className="block-title" title={title}>{title}</span>
          )}
        </div>
        <div className="block-header-actions" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {!readonly && <button
            type="button"
            className="block-copy"
            title="Renomear bloco"
            aria-label={`Renomear ${title}`}
            onClick={() => {
              editor.setCurrentTool("select");
              editor.select(shape.id);
              editor.setEditingShape(shape.id);
            }}
          ><Pencil size={13} aria-hidden="true" /></button>}
          <button type="button" className="block-copy" title="Copiar conteúdo do bloco" aria-label={`Copiar conteúdo de ${title}`} onClick={copyContent}>
            {copied === 'content' ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div
        className="block-body"
        onPointerDown={bodyPointerDown}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' && !e.defaultPrevented && noteEditing && !e.nativeEvent.isComposing) closeDoc();
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {p.kind === 'fetch' && <FetchBlock shape={shape} readonly={readonly} />}
        {p.kind === 'embed' && <EmbedBlock shape={shape} readonly={readonly} />}
        {p.kind === "mermaid" && <MermaidBlock shape={shape} readonly={readonly} />}
        {p.kind === "idea" &&
          (!readonly && noteEditing ? (
            <MarkdownDoc
              value={p.content}
              onChange={(markdown) => update({ content: markdown })}
              focusSignal={docFocus}
              placeholder="Escreva aqui…"
              ariaLabel="Conteúdo do documento"
            />
          ) : !p.content.trim() ? (
            <div className="block-empty">
              <FileText size={22} aria-hidden="true" />
              <strong>Documento em branco</strong>
              {!readonly && <button type="button" className="ui-action" onClick={openDoc}><Pencil size={12} aria-hidden="true" /> Começar a escrever</button>}
            </div>
          ) : resolvedContent.ok ? (
            <div className="note-markdown block-readable" dangerouslySetInnerHTML={{ __html: noteHtml }} />
          ) : (
            <div className="note-markdown note-error block-readable">{contentText}</div>
          ))}
        {p.kind === "terminal" && (
          <>
            <div className="terminal-path">
              <span className={`status-dot ${running ? "active" : ""}`} />
              {running
                ? "Sessão ativa"
                : desktopAvailable
                  ? "Computador conectado"
                  : "Desktop necessário"}
              <input
                aria-label="Diretório de trabalho"
                placeholder="Diretório padrão"
                value={p.cwd}
                readOnly={readonly}
                onChange={(e) => update({ cwd: e.target.value })}
              />
            </div>
            <div className="command-line">
              <span>❯</span>
              <textarea
                aria-label="Comando ou entrada do terminal"
                spellCheck={false}
                value={p.content}
                readOnly={readonly}
                onKeyDown={(e) => {
                  if (running && e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendInput();
                  }
                }}
                onChange={(e) => update({ content: e.target.value })}
              />
            </div>
            <pre className="terminal-output block-readable">
              {output ||
                (running
                  ? "Sessão ativa. Envie comandos, inputs ou Ctrl+C."
                  : "A saída aparece aqui. Inicie uma sessão para rodar CLIs, servidores e watch.")}
            </pre>
            {result && <div className="run-result">{result}</div>}
            <div className="block-actions">
              <button disabled={readonly || !output || running} onClick={pin}>
                <Pin size={12} aria-hidden="true" />
                Fixar saída
              </button>
              {running ? (
                <>
                  <button onClick={sendInput} disabled={!p.content.trim()}>
                    <Play size={12} />
                    Enviar
                  </button>
                  <button onClick={() => cancel?.()}>
                    <Square size={12} />
                    Encerrar sessão
                  </button>
                </>
              ) : (
                <button
                  className="primary-small"
                  disabled={readonly || !p.content.trim() || !desktopAvailable}
                  onClick={prepareRun}
                >
                  <Play size={12} />
                  Iniciar sessão
                </button>
              )}
            </div>
            {confirm && (
              <div
                className="confirm-overlay"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={`terminal-confirm-title-${shape.id}`}
                aria-describedby={`terminal-confirm-description-${shape.id}`}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setConfirm(false);
                  if (event.key === "Tab") {
                    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
                    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                    const next = event.shiftKey ? (index <= 0 ? buttons.length - 1 : index - 1) : (index + 1) % buttons.length;
                    event.preventDefault();
                    buttons[next]?.focus();
                  }
                }}
              >
                <button
                  className="close-confirm"
                  aria-label="Fechar confirmação"
                  onClick={() => setConfirm(false)}
                >
                  <X size={16} />
                </button>
                <b id={`terminal-confirm-title-${shape.id}`}>Executar no computador?</b>
                <p id={`terminal-confirm-description-${shape.id}`}>Diretório: {pending?.cwd || "padrão do aplicativo"}</p>
                <pre>{pending?.command}</pre>
                <button ref={confirmButton} className="primary-small" onClick={() => void run()}>
                  <Play size={12} />
                  Confirmar execução
                </button>
              </div>
            )}
          </>
        )}
        {p.kind === "output" && (
          <>
            <pre className="saved-output block-readable">{contentText}</pre>
            <div className="block-actions output-actions">
              <span className="output-origin" title={p.origin || "Saída fixada no quadro"}>{p.origin || "Saída fixada no quadro"}</span>
              {p.content !== contentText && <button type="button" onClick={() => void copy(p.content, 'output')}>
                {copied === 'output' ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                {copied === 'output' ? "Copiada" : "Copiar fonte"}
              </button>}
            </div>
          </>
        )}
        {p.kind === "code" && <ComponentBlock shape={shape} title={title} data={data} />}
      </div>
      <div className="block-footer" onPointerDown={bodyPointerDown} onKeyDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="element-reference"
          title={`Copiar referência ${reference}`}
          aria-label={`Copiar referência ${reference}`}
          onClick={() => void copy(reference, 'reference')}
        >
          {copied === 'reference' ? <Check size={13} aria-hidden="true" /> : <Link2 size={13} aria-hidden="true" />}
          <span>{copied === 'reference' ? 'Copiada' : reference}</span>
        </button>
        <div className="block-footer-actions">
          {p.kind === 'idea' && !readonly && <button type="button" ref={noteEditButton} className="block-footer-action" aria-label={noteEditing ? "Concluir edição do documento" : "Editar documento"} title={noteEditing ? "Concluir edição" : "Editar documento"} onClick={noteEditing ? closeDoc : openDoc}>
            {noteEditing ? <Check size={13} aria-hidden="true" /> : <Pencil size={13} aria-hidden="true" />}
            <span>{noteEditing ? 'Concluir' : 'Editar'}</span>
          </button>}
          <button type="button" className="block-footer-action" title="Dados do elemento" aria-label="Dados do elemento" data-block-inspector={shape.id} aria-controls="element-inspector" aria-expanded={selected && inspectorOpen} onClick={openInspector}>
            <SlidersHorizontal size={13} aria-hidden="true" /> <span>Dados</span>
          </button>
        </div>
        <span className="block-copy-feedback" data-copy-error={clipboard?.successful === false || undefined} role="status">{clipboard && (clipboard.successful ? (clipboard.source === 'reference' ? 'Referência copiada' : 'Conteúdo copiado') : 'Não foi possível copiar')}</span>
      </div>
    </HTMLContainer>
  );
}

function MermaidBlock({ shape, readonly }: { shape: BlockShape; readonly: boolean }) {
  const editor = useEditor();
  const source = shape.props.content;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [converting, setConverting] = useState(false);
  const [renderedSource, setRenderedSource] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        if (!current) return;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
        const result = await mermaid.render(`metalboard-mermaid-${shape.id.replace(/[^a-zA-Z0-9]/g, "")}`, source);
        if (!current) return;
        setSvg(result.svg);
        setError("");
      } catch (e) {
        if (!current) return;
        setSvg("");
        setError(String(e).replace(/^Error:\s*/, ""));
      }
      setRenderedSource(source);
    }
    const timer = source.trim() ? setTimeout(() => void render(), 160) : undefined;
    return () => { current = false; clearTimeout(timer); };
  }, [shape.id, source]);
  async function convert() {
    setConverting(true);
    try {
      const { createMermaidDiagram } = await import("@tldraw/mermaid");
      await createMermaidDiagram(editor, source, {
        blueprintRender: {
          centerOnPosition: false,
          position: { x: shape.x + shape.props.w + 60, y: shape.y },
        },
      });
      editor.selectNone();
      setError("");
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ""));
    } finally {
      setConverting(false);
    }
  }
  const hasSource = !!source.trim();
  const rendering = hasSource && renderedSource !== source;
  return <div className="mermaid-editor">
    <section className="mermaid-pane mermaid-pane--source">
      <div className="mermaid-pane-header"><span>Código do diagrama</span></div>
      <textarea
        aria-label="Código Mermaid"
        className="mermaid-source"
        value={source}
        spellCheck={false}
        readOnly={readonly}
        placeholder="flowchart LR"
        onChange={(e) => editor.updateShape<BlockShape>({ id: shape.id, type: "block", props: { content: e.target.value } })}
      />
    </section>
    <section className="mermaid-pane mermaid-pane--preview">
      <div className="mermaid-pane-header"><span>Visualização</span><em role="status" className={error && !rendering ? 'is-error' : undefined}>{!hasSource ? 'Aguardando código' : rendering ? 'Atualizando…' : error ? 'Revise o código' : 'Atualizada'}</em></div>
      {!hasSource ? <div className="block-empty">O diagrama aparece aqui.</div> : error && !rendering ? <div className="mermaid-error block-readable" role="alert">{error}</div> : <div className="mermaid-preview" dangerouslySetInnerHTML={{ __html: svg }} />}
    </section>
    <div className="block-actions mermaid-actions">
      <button className="ui-action ui-action--primary" disabled={readonly || !hasSource || rendering || converting || !!error} aria-busy={converting} onClick={() => void convert()}>
        <GitBranch size={12} aria-hidden="true" />
        {converting ? "Criando formas…" : "Criar formas editáveis"}
      </button>
    </div>
  </div>;
}
