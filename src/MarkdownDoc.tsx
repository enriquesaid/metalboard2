import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { ReactNode } from "react";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootAttrsCtx,
  rootCtx,
  type CmdKey,
} from "@milkdown/kit/core";
import {
  commonmark,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
// Base do ProseMirror (pre-wrap, gapcursor, seleção) exigida pelo editor.
import "@milkdown/kit/prose/view/style/prosemirror.css";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { callCommand, getMarkdown, insert, replaceAll } from "@milkdown/kit/utils";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
} from "lucide-react";

export type MarkdownDocProps = {
  value: string;
  onChange: (markdown: string) => void;
  onFocusChange?: (focused: boolean) => void;
  /** Incrementar para mover o foco para o editor depois do mount (rAF). */
  focusSignal?: number;
  placeholder?: string;
  ariaLabel: string;
};

// O editor é a própria renderização do documento (WYSIWYG). Uma instância
// ProseMirror por bloco, criada uma única vez: `value` externo só é
// reimportado via replaceAll quando difere do último markdown emitido, o que
// quebra o loop de feedback entre shape props e listener.
export function MarkdownDoc({
  value,
  onChange,
  onFocusChange,
  focusSignal = 0,
  placeholder,
  ariaLabel,
}: MarkdownDocProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const emitted = useRef(value);
  const [focused, setFocused] = useState(false);
  const focusSignalRef = useRef(focusSignal);
  const onChangeRef = useRef(onChange);
  focusSignalRef.current = focusSignal;
  onChangeRef.current = onChange;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);
        // rootAttrs aplica setAttribute na div .milkdown e substituiria a
        // classe padrão — "milkdown" precisa voltar junto com as classes
        // de estilo reaproveitadas da nota estática.
        ctx.set(rootAttrsCtx, { class: "milkdown note-markdown" });
        ctx.get(listenerCtx).markdownUpdated((_, markdown, prev) => {
          if (markdown === prev) return;
          emitted.current = markdown;
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(clipboard)
      .use(cursor);
    void editor.create().then(() => {
      editorRef.current = editor;
      if (focusSignalRef.current > 0) focusView(editor);
    });
    return () => {
      // o listener serializa com debounce de 200ms e o destroy cancela o
      // handler pendente — despejar o markdown atual antes de destruir para
      // não perder a última edição
      try {
        const markdown = editorRef.current?.action(getMarkdown());
        if (markdown && markdown !== emitted.current) {
          emitted.current = markdown;
          onChangeRef.current(markdown);
        }
      } catch {
        // editor em criação/estado inválido: nada pendente para despejar
      }
      editorRef.current = null;
      // destroy lida com criação em andamento (retry interno) e remove o DOM.
      void editor.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    editorRef.current?.action(replaceAll(value));
  }, [value]);

  useEffect(() => {
    if (!focusSignal) return;
    // mesmo rAF do título: focar durante o pointerdown que abriu a edição
    // deixa a ação padrão do clique roubar o foco de volta
    const frame = requestAnimationFrame(() => {
      editorRef.current && focusView(editorRef.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusSignal]);

  return (
    // O escopo de foco inclui a toolbar: trocar o foco entre editor e input de
    // link dispara blur/focusin na mesma leva e a toolbar não desmonta. A
    // toolbar fica sempre montada (só revelada no foco) para não empurrar o
    // layout na abertura — o segundo clique de um duplo clique acertaria a
    // toolbar em vez do texto.
    <div
      className={`doc-scope${focused ? " is-focused" : ""}`}
      onFocusCapture={() => {
        setFocused(true);
        onFocusChange?.(true);
      }}
      onBlurCapture={() => {
        setFocused(false);
        onFocusChange?.(false);
      }}
    >
      <DocToolbar editorRef={editorRef} />
      <div
        ref={rootRef}
        className="doc-editor"
        aria-label={ariaLabel}
        style={
          placeholder
            ? ({ "--doc-placeholder": `"${placeholder}"` } as CSSProperties)
            : undefined
        }
      />
    </div>
  );
}

function focusView(editor: Editor) {
  editor.action((ctx) => {
    ctx.get(editorViewCtx).focus();
  });
}

type ToolButton = { label: string; icon: ReactNode; command: () => void };

function DocToolbar({ editorRef }: { editorRef: RefObject<Editor | null> }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const run = <T,>(key: CmdKey<T>, payload?: T) => () =>
    editorRef.current?.action(callCommand(key, payload));  useEffect(() => {
    if (!linkOpen) return;
    const frame = requestAnimationFrame(() => linkInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [linkOpen]);
  function submitLink() {
    const href = linkHref.trim();
    if (href && editorRef.current) {
      const editor = editorRef.current;
      editor.action((ctx) => {
        // sem seleção, insere o próprio URL como texto linkado (comportamento
        // padrão de editores de documento); com seleção, marca o trecho
        if (ctx.get(editorViewCtx).state.selection.empty) {
          insert(`[${href}](${href})`, true)(ctx);
        } else {
          callCommand(toggleLinkCommand.key, { href })(ctx);
        }
      });
    }
    setLinkOpen(false);
    setLinkHref("");
    // o input some montado e o navegador manda o foco para o body sem
    // disparar blur: devolver o cursor ao documento na hora e de novo após
    // o commit do React
    if (editorRef.current) focusView(editorRef.current);
    requestAnimationFrame(() => editorRef.current && focusView(editorRef.current));
  }
  const buttons: ToolButton[] = [
    { label: "Título 1", icon: <Heading1 size={13} />, command: run(wrapInHeadingCommand.key, 1) },
    { label: "Título 2", icon: <Heading2 size={13} />, command: run(wrapInHeadingCommand.key, 2) },
    { label: "Negrito", icon: <Bold size={13} />, command: run(toggleStrongCommand.key) },
    { label: "Itálico", icon: <Italic size={13} />, command: run(toggleEmphasisCommand.key) },
    { label: "Código", icon: <Code size={13} />, command: run(toggleInlineCodeCommand.key) },
    { label: "Lista com marcadores", icon: <List size={13} />, command: run(wrapInBulletListCommand.key) },
    { label: "Lista numerada", icon: <ListOrdered size={13} />, command: run(wrapInOrderedListCommand.key) },
    { label: "Citação", icon: <Quote size={13} />, command: run(wrapInBlockquoteCommand.key) },
    { label: "Separador", icon: <Minus size={13} />, command: run(insertHrCommand.key) },
  ];
  return (
    // preventDefault no mousedown dos botões evita o blur do ProseMirror,
    // que desmontaria a toolbar antes do onClick disparar o comando.
    <div
      className="doc-toolbar"
      role="toolbar"
      aria-label="Formatação do documento"
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) event.preventDefault();
      }}
    >
      {buttons.map((button) => (
        <button key={button.label} type="button" title={button.label} aria-label={button.label} onClick={button.command}>
          {button.icon}
        </button>
      ))}
      {linkOpen ? (
        <input
          ref={linkInput}
          aria-label="URL do link"
          placeholder="https://…"
          value={linkHref}
          spellCheck={false}
          onBlur={() => setLinkOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitLink();
            }
            if (event.key === "Escape") setLinkOpen(false);
          }}
          onChange={(event) => setLinkHref(event.target.value)}
        />
      ) : (
        <button type="button" title="Link" aria-label="Inserir link" onClick={() => setLinkOpen(true)}>
          <Link2 size={13} />
        </button>
      )}
    </div>
  );
}
