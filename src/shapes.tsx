import { useEffect, useMemo, useRef, useState } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  type TLBaseShape,
  useEditor,
  useValue,
} from "tldraw";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  AppWindow,
  Check,
  Code2,
  Copy,
  FileText,
  GitBranch,
  Globe,
  Play,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { buildPreview } from "./preview";
import { desktopAvailable, startTerminal } from "./runtime";
import { FetchBlock } from "./FetchBlock";
import { EmbedBlock } from "./EmbedBlock";
import { useDataResolver, updateMeta } from "./dataflow/editor";
import { config, display } from "./dataflow/core";
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
      title: "Nova ideia",
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
  const [noteFocused, setNoteFocused] = useState(false);
  const [pending, setPending] = useState<{command: string; cwd: string} | null>(null);
  const titleDraft = useRef("");
  const titleInput = useRef<HTMLInputElement>(null);
  const titleEditing = useValue(
    "title editing",
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id],
  );
  const resolvedContent = data.attempt(() => data.text(shape, p.content));
  const contentText = resolvedContent.ok ? display(resolvedContent.value) : `⚠ ${resolvedContent.error}`;
  const noteHtml = useMemo(
    () => (p.kind === "idea" && resolvedContent.ok ? renderNoteMarkdown(contentText) : ""),
    [p.kind, resolvedContent.ok, contentText],
  );
  const noteArea = useRef<HTMLTextAreaElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!noteFocused) return;
    // mesmo rAF do título: focar durante o pointerdown que abriu a edição
    // deixa a ação padrão do clique roubar o foco de volta
    const frame = requestAnimationFrame(() => noteArea.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [noteFocused]);
  const [editing, setEditing] = useState(false),
    [confirm, setConfirm] = useState(false),
    [running, setRunning] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const frame = requestAnimationFrame(() => confirmButton.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [confirm]);
  const [output, setOutput] = useState(""),
    [result, setResult] = useState(""),
    [cancel, setCancel] = useState<null | (() => void)>(null);
  const [previewSource, setPreviewSource] = useState(p.content),
    [copied, setCopied] = useState(false);
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
      void activeRun.current?.cancel().catch(() => {});
    };
  }, []);
  const update = (props: Partial<BlockShape["props"]>) =>
    editor.updateShape<BlockShape>({ id: shape.id, type: "block", props });
  const preview = useMemo(() => {
    if (p.kind !== "code") return { html: "", error: "" };
    try {
      const source = display(data.text(shape, previewSource));
      return { html: buildPreview(source, p.language, data.input(shape)), error: "" };
    } catch (e) {
      return { html: "", error: String(e) };
    }
  }, [previewSource, p.language, p.kind, data, shape.id]);
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
  function copyContent() {
    const result = data.result(shape);
    const text = result.ok ? display(result.value) : p.content;
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setResult("Não foi possível copiar."));
  }
  const icon =
    p.kind === "fetch" ? <Globe size={14} /> : p.kind === "embed" ? (
      <AppWindow size={14} />
    ) : p.kind === "terminal" ? (
      <Terminal size={14} />
    ) : p.kind === "code" ? (
      <Code2 size={14} />
    ) : p.kind === "mermaid" ? (
      <GitBranch size={14} />
    ) : (
      <FileText size={14} />
    );
  return (
    <HTMLContainer
      className={`block block-${p.kind}`}
      style={{ width: p.w, height: p.h }}
    >
      <div className="block-header">
        <span className="block-symbol">{icon}</span>
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
          <span className="block-title" title="Arraste para mover · duplo clique para renomear">
            {p.title}
          </span>
        )}
        <span className="block-tag">
          {p.kind === "code"
            ? p.language.toUpperCase()
            : p.kind === "mermaid"
              ? "DIAGRAM"
              : p.kind === "terminal"
                ? "LOCAL"
                : p.kind === "output"
                  ? "SNAPSHOT"
                  : p.kind === "fetch" ? "REST" : p.kind === "embed" ? "WEB" : "NOTA"}
        </span>
        <button
          className="block-copy"
          title="Copiar conteúdo do bloco"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={copyContent}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <div
        className="block-body"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {p.kind === 'fetch' && <FetchBlock shape={shape} />}
        {p.kind === 'embed' && <EmbedBlock shape={shape} />}
        {p.kind === "mermaid" && <MermaidBlock shape={shape} />}
        {p.kind === "idea" &&
          (noteFocused || !contentText.trim() ? (
            <textarea
              ref={noteArea}
              aria-label="Conteúdo da ideia"
              className="note-input"
              value={p.content}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setNoteFocused(false)}
              onChange={(e) => update({ content: e.target.value })}
              placeholder={"Uma ideia começa aqui… · markdown suportado"}
            />
          ) : resolvedContent.ok ? (
            <>
              <button className="note-edit" type="button" onClick={() => setNoteFocused(true)}>Editar ideia</button>
              <div
                className="note-markdown"
                onDoubleClick={() => setNoteFocused(true)}
                dangerouslySetInnerHTML={{ __html: noteHtml }}
              />
            </>
          ) : (
            <div className="note-markdown note-error">{contentText}</div>
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
                disabled={false}
                onChange={(e) => update({ cwd: e.target.value })}
              />
            </div>
            <div className="command-line">
              <span>❯</span>
              <textarea
                aria-label="Comando ou entrada do terminal"
                spellCheck={false}
                value={p.content}
                disabled={false}
                onKeyDown={(e) => {
                  if (running && e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendInput();
                  }
                }}
                onChange={(e) => update({ content: e.target.value })}
              />
            </div>
            <pre className="terminal-output">
              {output ||
                (running
                  ? "Sessão ativa. Envie comandos, inputs ou Ctrl+C."
                  : "A saída aparece aqui. Inicie uma sessão para rodar CLIs, servidores e watch.")}
            </pre>
            {result && <div className="run-result">{result}</div>}
            <div className="block-actions">
              <button disabled={!output || running} onClick={pin}>
                <Copy size={12} />
                Fixar output
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
                  disabled={!p.content.trim() || !desktopAvailable}
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
            <div className="output-meta">
              {p.origin || "Output fixado no canvas"}
            </div>
            <pre className="saved-output">{contentText}</pre>
            <div className="block-actions">
              <span>Somente leitura</span>
              <button
                onClick={() =>
                  void navigator.clipboard.writeText(p.content).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                }
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </>
        )}
        {p.kind === "code" && (
          <>
            <div className="code-tabs" role="tablist" aria-label="Visualização do componente">
              <button
                type="button"
                role="tab"
                id={`preview-tab-${shape.id}`}
                aria-selected={!editing}
                aria-controls={`preview-panel-${shape.id}`}
                tabIndex={!editing ? 0 : -1}
                className={!editing ? "selected" : ""}
                onClick={() => setEditing(false)}
                onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setEditing(true); (event.currentTarget.nextElementSibling as HTMLButtonElement)?.focus(); } }}
              >
                Preview
              </button>
              <button
                type="button"
                role="tab"
                id={`code-tab-${shape.id}`}
                aria-selected={editing}
                aria-controls={`code-panel-${shape.id}`}
                tabIndex={editing ? 0 : -1}
                className={editing ? "selected" : ""}
                onClick={() => setEditing(true)}
                onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setEditing(false); (event.currentTarget.previousElementSibling as HTMLButtonElement)?.focus(); } }}
              >
                Código
              </button>
              <select
                aria-label="Linguagem"
                value={p.language}
                onChange={(e) => update({ language: e.target.value })}
              >
                <option value="tsx">React / TSX</option>
                <option value="html">HTML</option>
              </select>
              <button
                className="refresh-preview"
                onClick={() => {
                  setPreviewSource(p.content);
                  setEditing(false);
                }}
              >
                <Play size={11} />
                Renderizar
              </button>
            </div>
            {editing ? (
              <textarea
                id={`code-panel-${shape.id}`}
                role="tabpanel"
                aria-labelledby={`code-tab-${shape.id}`}
                className="code-input"
                aria-label="Código do componente"
                spellCheck={false}
                value={p.content}
                onChange={(e) => update({ content: e.target.value })}
              />
            ) : preview.error ? (
              <pre id={`preview-panel-${shape.id}`} role="tabpanel" aria-labelledby={`preview-tab-${shape.id}`} className="preview-error">{preview.error}</pre>
            ) : (
              <iframe
                id={`preview-panel-${shape.id}`}
                aria-labelledby={`preview-tab-${shape.id}`}
                title={p.title}
                sandbox="allow-scripts"
                srcDoc={preview.html}
              />
            )}
            <div className="preview-footer">
              <span className="status-dot active" />
              Preview isolado<span>Sem rede · sem acesso ao host</span>
            </div>
          </>
        )}
      </div>
      {!['fetch', 'embed'].includes(p.kind) && <div className="element-reference" title="Configure no painel Dados do elemento">%{config(shape).id}%</div>}
    </HTMLContainer>
  );
}

function MermaidBlock({ shape }: { shape: BlockShape }) {
  const editor = useEditor();
  const [source, setSource] = useState(shape.props.content);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [converting, setConverting] = useState(false);
  const render = async (value: string) => {
    try {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "neutral" });
      const result = await mermaid.render(`metalboard-mermaid-${shape.id.replace(/[^a-zA-Z0-9]/g, "")}`, value);
      setSvg(result.svg);
      setError("");
    } catch (e) {
      setSvg("");
      setError(String(e).replace(/^Error:\s*/, ""));
    }
  };
  useEffect(() => { void render(source); }, [source]);
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
  return <div className="mermaid-editor">
    <section className="mermaid-pane mermaid-pane--source">
      <div className="mermaid-pane-header"><span>Fonte</span><code>MERMAID</code></div>
      <textarea
        aria-label="Código Mermaid"
        className="mermaid-source"
        value={source}
        spellCheck={false}
        onChange={(e) => { setSource(e.target.value); editor.updateShape<BlockShape>({ id: shape.id, type: "block", props: { content: e.target.value } }); }}
      />
    </section>
    <section className="mermaid-pane mermaid-pane--preview">
      <div className="mermaid-pane-header"><span>Preview</span><em className={error ? 'is-error' : 'is-ready'}>{error ? 'Erro de sintaxe' : 'Sincronizado'}</em></div>
      {error ? <div className="mermaid-error" role="alert">{error}</div> : <div className="mermaid-preview" dangerouslySetInnerHTML={{ __html: svg }} />}
    </section>
    <div className="block-actions mermaid-actions">
      <span>Gera formas editáveis no board</span>
      <button className="ui-action ui-action--primary" disabled={converting || !!error} aria-busy={converting} onClick={() => void convert()}>
        <GitBranch size={12} />
        {converting ? "Convertendo…" : "Transformar no canvas"}
      </button>
    </div>
  </div>;
}
