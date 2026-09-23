import { useState } from 'react';
import { useEditor, useValue } from 'tldraw';
import { Braces, Copy, X } from 'lucide-react';
import { config, display, type OutputConfig } from './dataflow/core';
import { allShapes, updateConfig, useDataResolver } from './dataflow/editor';

export function DataPanel() {
  const editor = useEditor(), data = useDataResolver();
  const [open, setOpen] = useState(false), [message, setMessage] = useState('');
  const shape = useValue('selected element', () => editor.getOnlySelectedShape(), [editor]);
  const readonly = useValue('read only', () => editor.getIsReadonly(), [editor]);
  const elements = useValue('element list', () => allShapes(editor), [editor]);
  const settings = shape ? config(shape) : undefined;
  const result = shape ? data.result(shape) : undefined;
  const input = shape ? data.attempt(() => data.input(shape)) : undefined;
  const output = (change: Partial<OutputConfig>) => { if (shape && settings) updateConfig(editor, shape, { output: { ...settings.output, ...change } }); };
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => setMessage('Referência copiada')).catch(() => setMessage('Não foi possível copiar.'));
  return <div className="data-overlay" onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <button className="data-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><Braces size={15} />Dados do elemento</button>
    {open && <aside className="data-panel" aria-label="Inputs e outputs"><header><strong>Inputs & outputs</strong><button aria-label="Fechar dados" onClick={() => setOpen(false)}><X size={15} /></button></header>
      {!shape || !settings ? <p>Selecione um elemento para configurar seu input e output.</p> : <div key={shape.id}>
        <fieldset disabled={readonly}>
          <label>ID de referência<input aria-label="ID de referência" defaultValue={settings.id} onBlur={e => { const id = e.target.value.trim(); if (!/^[A-Za-z_][\w-]*$/.test(id) || ['input','value'].includes(id)) { setMessage('Use letras, números e underscore. input/value são reservados.'); e.target.value = settings.id; return; } if (elements.some(s => s.id !== shape.id && config(s).id === id)) { setMessage('Esse ID já está em uso.'); e.target.value = settings.id; return; } updateConfig(editor,shape,{id}); setMessage(id === settings.id ? '' : 'ID alterado. Atualize referências que usavam o nome anterior.'); }} /></label>
          <button className="data-reference" onClick={() => copy(`%${settings.id}%`)}><code>%{settings.id}%</code><Copy size={12} /></button>
          <label>Input <textarea aria-label="Input do elemento" value={settings.input} onChange={e => updateConfig(editor,shape,{input:e.target.value})} placeholder="%element_1.users[0]%" /></label>
          {settings.input && <pre className={input?.ok ? '' : 'data-error'}>{input?.ok ? display(input.value) : input?.error}</pre>}
          <p>Disponível como <code>%input%</code> no Fetch e como <code>input</code> no React/HTML. Também pode ser a fonte do output.</p>
          <label>Fonte do output<select aria-label="Fonte do output" value={settings.output.source} onChange={e => output({source:e.target.value as OutputConfig['source']})}><option value="default">Padrão do elemento</option><option value="input">Input configurado</option><option value="value">Valor / expressão personalizado</option></select></label>
          {settings.output.source === 'value' && <textarea aria-label="Output personalizado" value={settings.output.value} onChange={e => output({value:e.target.value})} placeholder="Texto ou %element_2%" />}
          <label className="data-check"><input type="checkbox" checked={settings.output.parseJson} onChange={e => output({parseJson:e.target.checked})} />Converter texto JSON em dados</label>
          <label>Selecionar caminho<input aria-label="Caminho do output" value={settings.output.path} onChange={e => output({path:e.target.value})} placeholder="users[0].name (vazio = tudo)" /></label>
          <label>Mapear campo de cada item<input aria-label="Mapear campo" value={settings.output.mapPath} onChange={e => output({mapPath:e.target.value})} placeholder="name (para arrays)" /></label>
          <label>Template final<textarea aria-label="Template do output" value={settings.output.template} onChange={e => output({template:e.target.value})} placeholder="Resultado: %value%" /></label>
        </fieldset>
        <div className="data-section-title">Output entregue <span>{result?.ok ? (Array.isArray(result.value) ? 'array' : result.value === null ? 'null' : typeof result.value) : 'erro'}</span></div>
        <pre className={result?.ok ? 'data-output' : 'data-error'}>{result?.ok ? display(result.value) : result?.error}</pre>
        <p>Textos e formas: conteúdo interno. Terminal: última saída concluída. Fetch: body JSON/texto. Embed: página extraída (Markdown/JSON). Código: fonte. Imagem/vídeo: recurso. Grupo: outputs dos filhos. Demais: propriedades.</p>
      </div>}
      {message && <div role="status" className="data-message">{message}</div>}
      <details><summary>Referências do board ({elements.length})</summary>{elements.map(s => <button className="data-element" key={s.id} onClick={() => { editor.setCurrentTool('select'); editor.select(s.id); }}><code>%{config(s).id}%</code><span>{String((s.props as Record<string,unknown>).title || s.type)}</span></button>)}</details>
    </aside>}
  </div>;
}
