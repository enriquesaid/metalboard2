import { useEffect, useMemo, useRef, useState } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  type TLBaseShape,
  useEditor,
} from "tldraw";
import {
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
  const resolvedContent = data.attempt(() => data.text(shape, p.content));
  const contentText = resolvedContent.ok ? display(resolvedContent.value) : `⚠ ${resolvedContent.error}`;
  const [editing, setEditing] = useState(false),
    [confirm, setConfirm] = useState(false),
    [running, setRunning] = useState(false);
  const [output, setOutput] = useState(""),
    [result, setResult] = useState(""),
    [cancel, setCancel] = useState<null | (() => void)>(null);
  const [previewSource, setPreviewSource] = useState(p.content),
    [copied, setCopied] = useState(false);
  const activeRun = useRef<null | { write: (input: string) => Promise<unknown>; cancel: () => Promise<void> }>(null);
  const mounted = useRef(true);
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
  const icon =
    p.kind === "fetch" ? <Globe size={14} /> : p.kind === "terminal" ? (
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
        <input
          aria-label="Título do bloco"
          value={p.title}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => update({ title: e.target.value })}
        />
        <span className="block-tag">
          {p.kind === "code"
            ? p.language.toUpperCase()
            : p.kind === "mermaid"
              ? "DIAGRAM"
              : p.kind === "terminal"
              ? "LOCAL"
              : p.kind === "output"
                ? "SNAPSHOT"
                : p.kind === "fetch" ? "REST" : "NOTA"}
        </span>
      </div>
      <div
        className="block-body"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {p.kind === 'fetch' && <FetchBlock shape={shape} />}
        {p.kind === "mermaid" && <MermaidBlock shape={shape} />}
        {p.kind === "idea" && (
          <textarea
            aria-label="Conteúdo da ideia"
            className="note-input"
            value={noteFocused ? p.content : contentText}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            onChange={(e) => update({ content: e.target.value })}
            placeholder="Uma ideia começa aqui…"
          />
        )}
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
              <div className="confirm-overlay">
                <button
                  className="close-confirm"
                  aria-label="Fechar confirmação"
                  onClick={() => setConfirm(false)}
                >
                  <X size={16} />
                </button>
                <b>Executar no computador?</b>
                <p>Diretório: {pending?.cwd || "padrão do aplicativo"}</p>
                <pre>{pending?.command}</pre>
                <button className="primary-small" onClick={() => void run()}>
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
            <div className="code-tabs">
              <button
                className={!editing ? "selected" : ""}
                onClick={() => setEditing(false)}
              >
                Preview
              </button>
              <button
                className={editing ? "selected" : ""}
                onClick={() => setEditing(true)}
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
                className="code-input"
                aria-label="Código do componente"
                spellCheck={false}
                value={p.content}
                onChange={(e) => update({ content: e.target.value })}
              />
            ) : preview.error ? (
              <pre className="preview-error">{preview.error}</pre>
            ) : (
              <iframe
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
      {p.kind !== 'fetch' && <div className="element-reference" title="Configure no painel Dados do elemento">%{config(shape).id}%</div>}
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
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark" });
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
    <textarea
      aria-label="Código Mermaid"
      className="mermaid-source"
      value={source}
      spellCheck={false}
      onChange={(e) => { setSource(e.target.value); editor.updateShape<BlockShape>({ id: shape.id, type: "block", props: { content: e.target.value } }); }}
    />
    {error ? <div className="mermaid-error">{error}</div> : <div className="mermaid-preview" dangerouslySetInnerHTML={{ __html: svg }} />}
    <div className="block-actions">
      <span>Preview Mermaid</span>
      <button className="primary-small" disabled={converting || !!error} onClick={() => void convert()}>
        <GitBranch size={12} />
        {converting ? "Convertendo…" : "Transformar no canvas"}
      </button>
    </div>
  </div>;
}
