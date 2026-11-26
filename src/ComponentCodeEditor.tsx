import { useId, useLayoutEffect, useRef } from 'react';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder, tooltips } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import './component-code-editor.css';

type ComponentCodeEditorProps = {
  value: string;
  language: 'tsx' | 'html';
  onChange: (value: string) => void;
  readOnly?: boolean;
  onRun?: () => void;
};

const languageSupport = { html: html(), tsx: javascript({ jsx: true, typescript: true }) };
const externalChange = Annotation.define<boolean>();
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.meta], color: '#8a3158' },
  { tag: [tags.tagName, tags.typeName, tags.className], color: '#244d85' },
  { tag: [tags.propertyName, tags.attributeName], color: '#795016' },
  { tag: [tags.string, tags.regexp, tags.escape], color: '#2c673e' },
  { tag: [tags.bool, tags.number, tags.null, tags.atom], color: '#963e28' },
  { tag: [tags.comment, tags.processingInstruction], color: '#62625c', fontStyle: 'italic' },
]);
const phrases = EditorState.phrases.of({
  Find: 'Buscar',
  Replace: 'Novo texto',
  next: 'Próximo',
  previous: 'Anterior',
  all: 'Selecionar todos',
  'match case': 'Maiúsculas e minúsculas',
  regexp: 'Expressão regular',
  'by word': 'Palavra inteira',
  replace: 'Substituir',
  'replace all': 'Substituir todos',
  close: 'Fechar busca',
  'Go to line': 'Ir para a linha',
  go: 'Ir',
  'current match': 'Resultado atual',
  'on line': 'na linha',
  'replaced match on line $': 'Resultado substituído na linha $',
  'replaced $ matches': 'Resultados substituídos: $',
  Completions: 'Sugestões de código',
});
const editorEvents = ['pointerdown', 'dblclick', 'contextmenu', 'keydown', 'keyup', 'copy', 'cut', 'paste'];

function editingMode(readOnly: boolean) {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

export function ComponentCodeEditor({ value, language, onChange, readOnly = false, onRun }: ComponentCodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const callbacks = useRef({ onChange, onRun });
  const initial = useRef({ value, language, readOnly });
  const languageSlot = useRef(new Compartment()).current;
  const modeSlot = useRef(new Compartment()).current;
  const hintId = useId();

  useLayoutEffect(() => {
    callbacks.current = { onChange, onRun };
  }, [onChange, onRun]);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;

    const code = new EditorView({
      parent: element,
      state: EditorState.create({
        doc: initial.current.value,
        extensions: [
          languageSlot.of(languageSupport[initial.current.language]),
          modeSlot.of(editingMode(initial.current.readOnly)),
          EditorState.tabSize.of(2),
          EditorState.allowMultipleSelections.of(true),
          EditorView.contentAttributes.of({
            'aria-label': 'Código do componente',
            'aria-describedby': hintId,
            autocapitalize: 'off',
            autocorrect: 'off',
            spellcheck: 'false',
            tabindex: '0',
          }),
          EditorView.lineWrapping,
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          placeholder('Escreva o código do componente…'),
          syntaxHighlighting(highlight),
          indentUnit.of('  '),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ activateOnTyping: false }),
          tooltips({ position: 'absolute' }),
          history(),
          search({ top: true }),
          phrases,
          keymap.of([
            { key: 'Mod-Enter', run: () => {
              if (!callbacks.current.onRun) return false;
              callbacks.current.onRun();
              return true;
            } },
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((transaction) => transaction.annotation(externalChange))) {
              callbacks.current.onChange(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    view.current = code;

    // O canvas escuta eventos nativos antes de os handlers do React recebê-los.
    const stop = (event: Event) => event.stopPropagation();
    const stopScroll = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    };
    editorEvents.forEach((event) => element.addEventListener(event, stop));
    element.addEventListener('wheel', stopScroll, { passive: true });

    return () => {
      editorEvents.forEach((event) => element.removeEventListener(event, stop));
      element.removeEventListener('wheel', stopScroll);
      code.destroy();
      view.current = null;
    };
  }, [hintId, languageSlot, modeSlot]);

  useLayoutEffect(() => {
    const code = view.current;
    if (code && languageSlot.get(code.state) !== languageSupport[language]) {
      code.dispatch({ effects: languageSlot.reconfigure(languageSupport[language]) });
    }
  }, [language, languageSlot]);

  useLayoutEffect(() => {
    const code = view.current;
    if (code && code.state.readOnly !== readOnly) {
      code.dispatch({ effects: modeSlot.reconfigure(editingMode(readOnly)) });
    }
  }, [modeSlot, readOnly]);

  useLayoutEffect(() => {
    const code = view.current;
    if (!code) return;
    const next = code.state.toText(value);
    if (next.eq(code.state.doc)) return;
    code.dispatch({
      changes: { from: 0, to: code.state.doc.length, insert: next },
      selection: { anchor: 0 },
      scrollIntoView: true,
      annotations: [externalChange.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  return <div className="component-code-editor">
    <span className="component-code-editor__hint" id={hintId}>
      {readOnly ? 'Somente leitura.' : 'Use Tab para indentar. Para sair do editor, pressione Esc e depois Tab.'}
    </span>
    <div className="component-code-editor__host" ref={host} />
  </div>;
}
