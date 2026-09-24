import { useEffect, useRef, useState } from 'react';
import { useEditor } from 'tldraw';
import { invoke } from '@tauri-apps/api/core';
import { ExternalLink, Globe, Play } from 'lucide-react';
import { type BlockShape } from './shapes';
import { config, display } from './dataflow/core';
import { useDataResolver, updateMeta } from './dataflow/editor';
import { defaultEmbed, parseEmbedUrl, runScrape, type EmbedConfig, type ScrapeFormat, type ScrapePayload } from './dataflow/scrape';
import { desktopAvailable } from './runtime';

type ScrapeMeta = { url: string; status: number; contentType: string; durationMs: number; completedAt: string; warnings: string[] };

export function EmbedBlock({ shape }: { shape: BlockShape }) {
  const editor = useEditor(), data = useDataResolver();
  const settings = { ...defaultEmbed, ...(shape.meta.embed as Partial<EmbedConfig>) };
  const [tab, setTab] = useState('page'), [error, setError] = useState(''), [running, setRunning] = useState(false);
  const active = useRef<AbortController | null>(null);
  const saved = shape.meta.scrape as ScrapeMeta | undefined;
  const execution = shape.meta.execution as { status: string; error?: string } | undefined;
  const patch = (change: Partial<EmbedConfig>) => updateMeta(editor, shape.id, { embed: { ...settings, ...change }, execution: { status: 'stale', error: 'Formato alterado. Extraia novamente.' } });
  useEffect(() => () => { active.current?.abort('Extração cancelada.'); }, []);
  function load() {
    try {
      const url = parseEmbedUrl(display(data.text(shape, shape.props.content)));
      updateMeta(editor, shape.id, { embed: { ...settings, loadedUrl: url.toString() }, execution: { status: 'stale', error: 'Página alterada. Extraia novamente.' } });
      setError('');
    } catch (e) { setError(String(e)); }
  }
  async function browserScrape(url: string, controller: AbortController): Promise<ScrapePayload> {
    const timer = setTimeout(() => controller.abort('Tempo limite excedido.'), 30_000);
    const start = performance.now();
    try {
      const response = await fetch(url, { redirect: 'follow', credentials: 'omit', signal: controller.signal });
      const reader = response.body?.getReader();
      let body = '', count = 0;
      const decoder = new TextDecoder();
      if (reader) while (true) { const { value, done } = await reader.read(); if (done) break; count += value.byteLength; if (count > 2_000_000) { await reader.cancel(); throw new Error('Página excede o limite de 2 MB.'); } body += decoder.decode(value, { stream: true }); }
      body += decoder.decode();
      return { url: response.url || url, status: response.status, contentType: response.headers.get('content-type') || '', body, durationMs: Math.round(performance.now() - start), warnings: [] };
    } catch (e) {
      if (controller.signal.aborted) throw new Error(typeof controller.signal.reason === 'string' ? controller.signal.reason : 'Extração cancelada.');
      if (e instanceof TypeError) throw new Error('Falha de rede ou CORS. No desktop, a extração usa o transporte nativo, sem restrição de CORS.');
      throw e;
    } finally { clearTimeout(timer); }
  }
  async function extract() {
    setError('');
    let target: URL;
    try { target = parseEmbedUrl(display(data.text(shape, shape.props.content))); } catch (e) { setError(String(e)); return; }
    const controller = new AbortController();
    active.current = controller;
    setRunning(true); updateMeta(editor, shape.id, { execution: { status: 'running' } });
    try {
      const payload = desktopAvailable
        ? await invoke<ScrapePayload>('scrape_page', { url: target.toString(), timeoutMs: 30_000 })
        : await browserScrape(target.toString(), controller);
      const { value, warnings } = runScrape(payload, settings.format);
      const ok = payload.status >= 200 && payload.status < 300;
      updateMeta(editor, shape.id, {
        scrape: { url: payload.url, status: payload.status, contentType: payload.contentType, durationMs: payload.durationMs, completedAt: new Date().toISOString(), warnings },
        execution: ok
          ? { status: 'success', value, completedAt: new Date().toISOString() }
          : { status: 'error', value, error: `HTTP ${payload.status}`, completedAt: new Date().toISOString() },
      });
      if (!ok) setError(`HTTP ${payload.status}. Consulte o conteúdo recebido.`);
      setTab('output');
    } catch (e) { const message = String(e); setError(message); updateMeta(editor, shape.id, { execution: { status: 'error', error: message } }); }
    finally { active.current = null; setRunning(false); }
  }
  const result = data.result(shape);
  return <div className="fetch-content embed-content">
    <div className="fetch-url">
      <input aria-label="URL da página" placeholder="https://exemplo.com/pagina" spellCheck={false} value={shape.props.content} onChange={e => editor.updateShape<BlockShape>({ id: shape.id, type: 'block', props: { content: e.target.value } })} onKeyDown={e => { if (e.key === 'Enter') load(); }} />
      <button className="ui-icon-button ui-icon-button--primary" aria-label="Incorporar página" title="Incorporar a página no bloco" onClick={load}><Play size={14} /></button>
      {settings.loadedUrl && <button className="ui-icon-button" aria-label="Abrir no navegador" title="Abrir no navegador" onClick={() => window.open(settings.loadedUrl, '_blank', 'noopener')}><ExternalLink size={14} /></button>}
    </div>
    <div className="fetch-tabs">{[['page', 'Página'], ['output', 'Output']].map(([id, label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === 'page' && <div className="embed-page">
      {settings.loadedUrl
        ? <iframe className="embed-frame" title={shape.props.title} src={settings.loadedUrl} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="no-referrer" loading="lazy" />
        : <div className="embed-empty"><Globe size={22} /><p>Cole uma URL http(s) e clique no botão para incorporar a página.</p></div>}
      <p className="embed-note">Sites com X-Frame-Options podem bloquear a incorporação — a extração do output funciona mesmo assim.</p>
    </div>}
    {tab === 'output' && <div className="fetch-editor">
      <fieldset disabled={running}>
        <label>Formato do output<select aria-label="Formato do output" value={settings.format} onChange={e => patch({ format: e.target.value as ScrapeFormat })}><option value="markdown">Markdown da página</option><option value="json">Relatório JSON</option></select></label>
        <button className="ui-action ui-action--primary embed-extract" disabled={!shape.props.content.trim()} aria-busy={running} onClick={() => void extract()}><Play size={12} />{running ? 'Extraindo…' : 'Extrair dados da página'}</button>
        <p>Referência: <code>%{config(shape).id}%</code>. A extração busca o HTML {desktopAvailable ? 'pelo transporte nativo (sem CORS)' : 'pelo navegador (sujeita a CORS)'} e gera o output no formato escolhido. Caminhos, mapeamento e template podem ser ajustados no painel Dados do elemento.</p>
      </fieldset>
      {saved && <div className="http-status">HTTP {saved.status} · {saved.durationMs} ms · {new Date(saved.completedAt).toLocaleString('pt-BR')} · {saved.contentType.split(';')[0] || 'sem content-type'}</div>}
      {saved?.warnings.length ? <div className="data-error">{saved.warnings.join(' ')}</div> : null}
      <pre>{result.ok ? display(result.value) : result.error}</pre>
    </div>}
    {(error || execution?.status === 'stale') && <div className="data-error">{error || execution?.error}</div>}
    <div className="fetch-footer"><code>%{config(shape).id}%</code><span>{running ? 'Extraindo…' : saved ? `HTTP ${saved.status} · ${settings.format === 'json' ? 'JSON' : 'Markdown'}` : 'Não extraído'}</span></div>
  </div>;
}
