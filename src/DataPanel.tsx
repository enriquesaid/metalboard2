import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, useValue, type TLShape } from 'tldraw';
import { ArrowRight, Braces, Copy, Database, SlidersHorizontal, X } from 'lucide-react';
import { config, display, plainText, type OutputConfig } from './dataflow/core';
import { allShapes, updateConfig, useDataResolver } from './dataflow/editor';
import { useInspector } from './InspectorContext';

function elementTitle(shape: TLShape) {
  const props = shape.props as { title?: string; richText?: unknown };
  return props.title?.trim() || plainText(props.richText).trim().split('\n')[0] || 'Elemento sem título';
}

export function DataPanel() {
  const editor = useEditor(), data = useDataResolver();
  const { open, setOpen } = useInspector();
  const [message, setMessage] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLButtonElement && active.getAttribute('aria-controls') === 'element-inspector' ? active : null;
    closeButton.current?.focus({ preventScroll: true });
  }, [open]);
  function close() {
    setOpen(false);
    const triggers = Array.from(document.querySelectorAll<HTMLButtonElement>('[aria-controls="element-inspector"]'));
    const selectedTrigger = triggers.find(button => button.hasAttribute('data-block-inspector') && button.getAttribute('aria-expanded') === 'true');
    const trigger = [opener.current, selectedTrigger, ...triggers].find(button => button?.isConnected && !button.disabled && button.getClientRects().length > 0);
    if (trigger) trigger.focus({ preventScroll: true });
    else editor.focus();
  }
  const shape = useValue('selected element', () => editor.getOnlySelectedShape(), [editor]);
  const readonly = useValue('read only', () => editor.getIsReadonly(), [editor]);
  const elements = useValue('element list', () => allShapes(editor), [editor]);
  const settings = shape ? config(shape) : undefined;
  const result = shape ? data.result(shape) : undefined;
  const input = shape ? data.attempt(() => data.input(shape)) : undefined;
  const shapeTitle = shape ? elementTitle(shape) : 'Nenhum elemento';
  const sources = shape ? elements.filter(element => element.id !== shape.id).map(element => ({
    id: element.id, title: elementTitle(element), reference: `%${config(element).id}%`,
  })) : [];
  const linkedSource = sources.find(source => source.reference === settings?.input.trim());
  const output = (change: Partial<OutputConfig>) => { if (shape && settings) updateConfig(editor, shape, { output: { ...settings.output, ...change } }); };
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => setMessage('Referência copiada')).catch(() => setMessage('Não foi possível copiar.'));
  function locate(element: TLShape) {
    const page = editor.getAncestorPageId(element);
    if (!page) return;
    if (page !== editor.getCurrentPageId()) editor.setCurrentPage(page);
    editor.setCurrentTool('select').select(element.id);
    const bounds = editor.getShapePageBounds(element);
    if (bounds && !editor.getViewportPageBounds().contains(bounds)) {
      editor.zoomToBounds(bounds, { targetZoom: editor.getZoomLevel() });
    }
  }
  if (!open) return null;
  return createPortal(<div
    className="data-overlay"
    onPointerDown={event => event.stopPropagation()}
    onKeyDownCapture={event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      close();
    }}
    onKeyDown={event => event.stopPropagation()}
    onWheel={event => event.stopPropagation()}
  >
    {open && <aside id="element-inspector" className="data-panel" aria-label="Propriedades do elemento">
      <header className="data-panel-header">
        <div><span className="data-eyebrow">Propriedades</span><strong>{shapeTitle}</strong></div>
        <button ref={closeButton} className="ui-icon-button" aria-label="Fechar propriedades" onClick={close}><X size={15} /></button>
      </header>
      {!shape || !settings ? <div className="data-empty"><SlidersHorizontal size={24} /><strong>Selecione um elemento</strong><p>Escolha no canvas ou abra a lista de referências abaixo.</p></div> : <div key={shape.id} className="data-panel-content">
        <fieldset disabled={readonly}>
          <section className="data-section">
            <div className="data-section-heading"><span>Identidade</span><code>REF</code></div>
            <label>ID de referência<input aria-label="ID de referência" defaultValue={settings.id} onBlur={e => { const id = e.target.value.trim(); if (!/^[A-Za-z_][\w-]*$/.test(id) || ['input','value'].includes(id)) { setMessage('Use letras, números e underscore. input/value são reservados.'); e.target.value = settings.id; return; } if (elements.some(s => s.id !== shape.id && config(s).id === id)) { setMessage('Esse ID já está em uso.'); e.target.value = settings.id; return; } updateConfig(editor,shape,{id}); setMessage(id === settings.id ? '' : 'ID alterado. Atualize referências que usavam o nome anterior.'); }} /></label>
            <button className="data-reference ui-action ui-action--quiet" onClick={() => copy(`%${settings.id}%`)}><code>%{settings.id}%</code><span>Copiar <Copy size={12} /></span></button>
          </section>
          <section className="data-section">
            <div className="data-section-heading"><span>Entrada</span><ArrowRight size={13} /></div>
            {sources.length > 0 && <label>Usar saída de outro elemento
              <select value={linkedSource?.reference ?? ''} onChange={event => updateConfig(editor, shape, { input: event.target.value })}>
                <option value="" disabled={!linkedSource}>{linkedSource ? 'Desvincular origem' : 'Escolha um elemento do board'}</option>
                {sources.map(source => <option key={source.id} value={source.reference}>{source.title} · {source.reference}</option>)}
              </select>
            </label>}
            <label>Referência ou valor<textarea aria-label="Input do elemento" value={settings.input} onChange={e => updateConfig(editor,shape,{input:e.target.value})} placeholder="%element_1.users[0]%" /></label>
            {settings.input && <pre className={input?.ok ? 'data-preview' : 'data-error'}>{input?.ok ? display(input.value) : input?.error}</pre>}
            <p>Disponível como <code>%input%</code> no Fetch e <code>input</code> no React/HTML.</p>
          </section>
          <section className="data-section">
            <div className="data-section-heading"><span>Transformação</span><Braces size={13} /></div>
            <label>Fonte do output<select aria-label="Fonte do output" value={settings.output.source} onChange={e => output({source:e.target.value as OutputConfig['source']})}><option value="default">Padrão do elemento</option><option value="input">Input configurado</option><option value="value">Valor personalizado</option></select></label>
            {settings.output.source === 'value' && <label>Valor ou expressão<textarea aria-label="Output personalizado" value={settings.output.value} onChange={e => output({value:e.target.value})} placeholder="Texto ou %element_2%" /></label>}
            <label className="data-check"><input type="checkbox" checked={settings.output.parseJson} onChange={e => output({parseJson:e.target.checked})} /><span>Interpretar texto como JSON</span></label>
            <details className="data-advanced"><summary>Ajustes avançados</summary>
              <label>Selecionar caminho<input aria-label="Caminho do output" value={settings.output.path} onChange={e => output({path:e.target.value})} placeholder="users[0].name" /></label>
              <label>Mapear cada item<input aria-label="Mapear campo" value={settings.output.mapPath} onChange={e => output({mapPath:e.target.value})} placeholder="name" /></label>
              <label>Template final<textarea aria-label="Template do output" value={settings.output.template} onChange={e => output({template:e.target.value})} placeholder="Resultado: %value%" /></label>
            </details>
          </section>
        </fieldset>
        <section className="data-section data-section--output">
          <div className="data-section-heading"><span>Output entregue</span><em>{result?.ok ? (Array.isArray(result.value) ? 'array' : result.value === null ? 'null' : typeof result.value) : 'erro'}</em></div>
          <pre className={result?.ok ? 'data-output' : 'data-error'}>{result?.ok ? display(result.value) : result?.error}</pre>
        </section>
      </div>}
      {message && <div role="status" className="data-message">{message}</div>}
      <details className="data-library">
        <summary><Database size={13} aria-hidden="true" />Referências do board <span>{elements.length}</span></summary>
        {elements.length === 0 && <p>Adicione um elemento para gerar a primeira referência.</p>}
        {elements.map(element => <button type="button" className="data-element" key={element.id} aria-current={shape?.id === element.id ? 'true' : undefined} onClick={() => locate(element)}>
          <span>{elementTitle(element)}</span><code>%{config(element).id}%</code>
        </button>)}
      </details>
    </aside>}
  </div>, editor.getContainer());
}
