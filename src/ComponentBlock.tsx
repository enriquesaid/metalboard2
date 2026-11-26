import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutTemplate, Play } from "lucide-react";
import { useEditor, useValue } from "tldraw";
import { BlockTabs } from "./BlockTabs";
import { componentTemplates, type ComponentLanguage, type ComponentTemplate } from "./component-templates";
import { display } from "./dataflow/core";
import type { useDataResolver } from "./dataflow/editor";
import { buildPreview } from "./preview";
import type { BlockShape } from "./shapes";
import "./component-block.css";

const ComponentCodeEditor = lazy(() => import("./ComponentCodeEditor").then(module => ({ default: module.ComponentCodeEditor })));
const tabs = [{ id: "preview", label: "Visualizar" }, { id: "source", label: "Código" }] as const;
const languages = { tsx: "React / TSX", html: "HTML" } as const;

export function ComponentBlock({ shape, title, data }: {
  shape: BlockShape;
  title: string;
  data: ReturnType<typeof useDataResolver>;
}) {
  const { content } = shape.props;
  const language: ComponentLanguage = shape.props.language === "html" ? "html" : "tsx";
  const editor = useEditor();
  const canEdit = useValue("editable component", () => !editor.getIsReadonly() && !editor.isShapeOrAncestorLocked(shape.id), [editor, shape.id]);
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("preview");
  const [hasOpenedEditor, setHasOpenedEditor] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [run, setRun] = useState({ source: content, language, sequence: 0 });
  const renderButton = useRef<HTMLButtonElement>(null);
  const tabsId = `component-${shape.id}`;
  const dirty = content !== run.source || language !== run.language;
  const hasSource = !!run.source.trim();

  const resolved = useMemo(() => {
    if (!hasSource) return { source: "", input: "null", error: "" };
    try {
      return {
        source: display(data.text(shape, run.source)),
        input: JSON.stringify(data.input(shape) ?? null),
        error: "",
      };
    } catch (error) {
      return { source: "", input: "null", error: String(error) };
    }
  }, [data, hasSource, run.source, shape]);

  // Compile only when the rendered source or a linked input changes.
  const { source, input, error } = resolved;
  const preview = useMemo(() => {
    if (!hasSource || error) return { html: "", error };
    try {
      return { html: buildPreview(source, run.language, JSON.parse(input)), error: "" };
    } catch (error) {
      return { html: "", error: String(error) };
    }
  }, [hasSource, source, input, error, run.language]);

  function update(props: Partial<BlockShape["props"]>) {
    editor.updateShape<BlockShape>({ id: shape.id, type: "block", props });
  }

  function openTab(next: typeof tab) {
    if (next === "source") setHasOpenedEditor(true);
    setTab(next);
  }

  function renderSource(source = content, sourceLanguage = language) {
    setRun(previous => ({ source, language: sourceLanguage, sequence: previous.sequence + 1 }));
    openTab("preview");
  }

  function applyTemplate(template: ComponentTemplate, nextLanguage: ComponentLanguage) {
    if (editor.getIsReadonly() || editor.isShapeOrAncestorLocked(shape.id)) return;
    if (template.source !== content || nextLanguage !== language) {
      editor.markHistoryStoppingPoint();
      update({ content: template.source, language: nextLanguage });
      editor.markHistoryStoppingPoint();
    }
    setShowTemplates(false);
    renderSource(template.source, nextLanguage);
  }

  return <>
    <div className="component-controls">
      <BlockTabs className="code-tabs" id={tabsId} label="Visualização do componente" value={tab} onChange={openTab} tabs={tabs} />
      <div className="component-actions">
        <select aria-label="Linguagem" value={language} disabled={!canEdit} onChange={event => {
          update({ language: event.target.value });
          openTab("source");
        }}>
          {Object.entries(languages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {canEdit && <button type="button" className="ui-action" aria-label="Modelos" aria-haspopup="dialog" title="Modelos de componente" onClick={() => setShowTemplates(true)}>
          <LayoutTemplate size={13} aria-hidden="true" /> <span>Modelos</span>
        </button>}
        <button
          ref={renderButton}
          type="button"
          className={`ui-action${dirty ? " ui-action--primary" : ""}`}
          aria-label="Renderizar"
          title="Renderizar código (⌘/Ctrl+Enter)"
          onClick={() => renderSource()}
        >
          <Play size={12} aria-hidden="true" /> <span>Renderizar</span>
        </button>
      </div>
    </div>
    <div className="component-panel" id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`}>
      <div className="component-pane" hidden={tab !== "source"}>
        {hasOpenedEditor && <Suspense fallback={<div className="block-empty" role="status">Abrindo editor…</div>}>
          <ComponentCodeEditor
            value={content}
            language={language}
          readOnly={!canEdit}
            onChange={value => update({ content: value })}
            onRun={() => {
              renderSource();
              renderButton.current?.focus({ preventScroll: true });
            }}
          />
        </Suspense>}
      </div>
      <div className="component-pane" hidden={tab !== "preview"}>
        {!hasSource ? <div className="block-empty">Escreva um componente ou use um modelo.</div>
          : preview.error ? <pre className="preview-error block-readable" role="alert" tabIndex={0}>{preview.error}</pre>
          : <iframe key={run.sequence} title={`Visualização de ${title}`} sandbox="allow-scripts" srcDoc={preview.html} />}
      </div>
    </div>
    <div className="preview-footer" role="status">
      <span className={`status-dot${hasSource && !dirty && !preview.error ? " active" : ""}`} aria-hidden="true" />
      {dirty ? "Alterações prontas para renderizar" : preview.error ? "Revise o código do componente" : hasSource ? "Visualização isolada" : "Aguardando código"}
    </div>
    {showTemplates && canEdit && <ComponentTemplateDialog
      language={language}
      content={content}
      onClose={() => setShowTemplates(false)}
      onApply={applyTemplate}
    />}
  </>;
}

function ComponentTemplateDialog({ language, content, onClose, onApply }: {
  language: ComponentLanguage;
  content: string;
  onClose: () => void;
  onApply: (template: ComponentTemplate, language: ComponentLanguage) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [selectedId, setSelectedId] = useState(componentTemplates[language][0].id);
  const options = componentTemplates[selectedLanguage];
  const selectedTemplate = options.find(template => template.id === selectedId) ?? options[0];
  const replacesCode = !!content.trim() && (content !== selectedTemplate.source || language !== selectedLanguage);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      className="component-template-dialog"
      aria-labelledby="component-template-title"
      aria-modal="true"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      <h2 id="component-template-title">Modelos de componente</h2>
      <form onSubmit={event => {
        event.preventDefault();
        onApply(selectedTemplate, selectedLanguage);
      }}>
        <fieldset className="component-template-languages">
          <legend>Linguagem</legend>
          {(Object.keys(languages) as ComponentLanguage[]).map(value => <label key={value}>
            <input
              type="radio"
              name="component-template-language"
              value={value}
              checked={value === selectedLanguage}
              onChange={() => {
                setSelectedLanguage(value);
                setSelectedId(componentTemplates[value][0].id);
              }}
            />
            <span>{languages[value]}</span>
          </label>)}
        </fieldset>
        <fieldset className="component-template-list">
          <legend>Modelo</legend>
          {options.map(template => <label key={template.id}>
            <input type="radio" name="component-template-option" value={template.id} checked={template.id === selectedTemplate.id} onChange={() => setSelectedId(template.id)} />
            <span><strong>{template.title}</strong><span>{template.description}</span></span>
          </label>)}
        </fieldset>
        {replacesCode && <p id="component-template-replacement">O modelo vai substituir o código atual deste bloco.</p>}
        <div className="component-template-actions">
          <button type="button" className="ui-action" onClick={onClose}>Cancelar</button>
          <button type="submit" className="ui-action ui-action--primary" aria-describedby={replacesCode ? "component-template-replacement" : undefined}>
            {replacesCode ? "Substituir código" : "Aplicar modelo"}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
