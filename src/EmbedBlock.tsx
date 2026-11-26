import { useState } from 'react';
import { useEditor } from 'tldraw';
import { invoke } from '@tauri-apps/api/core';
import { ArrowRight, ExternalLink, Globe, Play } from 'lucide-react';
import { type BlockShape } from './shapes';
import { BlockTabs } from './BlockTabs';
import { display } from './dataflow/core';
import { useDataResolver, updateMeta } from './dataflow/editor';
import { defaultEmbed, parseEmbedUrl, runScrape, type EmbedConfig, type ScrapeFormat, type ScrapePayload } from './dataflow/scrape';
import { desktopAvailable } from './runtime';

type ScrapeMeta = { url: string; status: number; contentType: string; durationMs: number; completedAt: string; warnings: string[] };
const embedTabs = [{ id: 'page', label: 'Página' }, { id: 'output', label: 'Extração de dados' }] as const;

export function EmbedBlock({ shape, readonly }: { shape: BlockShape; readonly: boolean }) {
  const editor = useEditor(), data = useDataResolver();
  const settings = { ...defaultEmbed, ...(shape.meta.embed as Partial<EmbedConfig>) };
  const [tab, setTab] = useState<(typeof embedTabs)[number]['id']>('page');
  const [error, setError] = useState(''), [running, setRunning] = useState(false);
  const saved = shape.meta.scrape as ScrapeMeta | undefined;
  const execution = shape.meta.execution as { status: string; error?: string } | undefined;
  const patch = (change: Partial<EmbedConfig>) => updateMeta(editor, shape.id, {
    embed: { ...settings, ...change },
    ...(execution && { execution: { status: 'stale', error: 'Formato alterado. Extraia novamente.' } }),
  });
  function load() {
    if (readonly || running) return;
    try {
      const url = parseEmbedUrl(display(data.text(shape, shape.props.content)));
      updateMeta(editor, shape.id, {
        embed: { ...settings, loadedUrl: url.toString() },
        ...(execution && url.toString() !== settings.loadedUrl && { execution: { status: 'stale', error: 'Página alterada. Extraia novamente.' } }),
      });
      setError('');
      setTab('page');
    } catch (e) { setError(String(e)); }
  }
  async function extract() {
    if (readonly || running) return;
    setError('');
    // A política SSRF depende de resolução de DNS, que só o transporte nativo faz.
    if (!desktopAvailable) { setError('Abra o Metalboard desktop para extrair dados da página.'); return; }
    let target: URL;
    try { target = parseEmbedUrl(display(data.text(shape, shape.props.content))); } catch (e) { setError(String(e)); return; }
    setRunning(true); updateMeta(editor, shape.id, { execution: { status: 'running' } });
    try {
      const payload = await invoke<ScrapePayload>('scrape_page', { url: target.toString(), timeoutMs: 30_000 });
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
    finally { setRunning(false); }
  }
  const result = data.result(shape);
  const tabsId = `embed-${shape.id}`;
  const canLoad = !!shape.props.content.trim() && !running && !readonly;
  const status = running ? 'Extraindo…' : execution?.status === 'stale' ? 'Configuração alterada' : saved ? `HTTP ${saved.status} · ${settings.format === 'json' ? 'JSON' : 'Markdown'}` : !desktopAvailable ? 'Extração disponível no desktop' : 'Aguardando extração';
  return <div className="fetch-content embed-content">
    <form className="fetch-url" onSubmit={e => { e.preventDefault(); if (canLoad) load(); }}>
      <input aria-label="URL da página" placeholder="https://exemplo.com/pagina" spellCheck={false} readOnly={readonly || running} value={shape.props.content} onChange={e => {
        setError('');
        editor.updateShape<BlockShape>({ id: shape.id, type: 'block', props: { content: e.target.value } });
      }} />
      <button type="submit" className="ui-action ui-action--primary block-request-submit" aria-label="Incorporar página" disabled={!canLoad} title="Incorporar a página no bloco"><ArrowRight size={13} aria-hidden="true" /><span>Incorporar</span></button>
      {settings.loadedUrl && <button type="button" className="ui-icon-button" aria-label="Abrir no navegador" title="Abrir no navegador" onClick={() => window.open(settings.loadedUrl, '_blank', 'noopener')}><ExternalLink size={14} aria-hidden="true" /></button>}
    </form>
    <BlockTabs className="fetch-tabs" id={tabsId} label="Página e extração" value={tab} onChange={setTab} tabs={embedTabs} />
    {tab === 'page' ? <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} tabIndex={0} className="embed-page">
      {settings.loadedUrl
        ? <iframe className="embed-frame" title={shape.props.title} src={settings.loadedUrl} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="no-referrer" loading="lazy" />
        : <div className="block-empty"><Globe size={22} aria-hidden="true" /><strong>Abra uma página no quadro</strong><p>Cole a URL e escolha Incorporar.</p></div>}
      {settings.loadedUrl && <p className="embed-note">Se o site bloquear a visualização, use Abrir no navegador ou Extração de dados.</p>}
    </div> : <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} tabIndex={0} className="fetch-editor">
      <fieldset disabled={readonly || running}>
        <label>Formato da saída<select value={settings.format} onChange={e => patch({ format: e.target.value as ScrapeFormat })}><option value="markdown">Markdown da página</option><option value="json">Relatório JSON</option></select></label>
        <button type="button" className="ui-action ui-action--primary embed-extract" disabled={!canLoad || !desktopAvailable} aria-busy={running} onClick={() => void extract()}><Play size={12} aria-hidden="true" />{running ? 'Extraindo…' : 'Extrair dados da página'}</button>
        <p>Use a referência do bloco em outros elementos. Ajuste os campos em Dados do elemento.</p>
      </fieldset>
      {saved && <div className="http-status">HTTP {saved.status} · {saved.durationMs} ms · {new Date(saved.completedAt).toLocaleString('pt-BR')} · {saved.contentType.split(';')[0] || 'tipo desconhecido'}</div>}
      {saved?.warnings.length ? <div className="data-error" role="status">{saved.warnings.join(' ')}</div> : null}
      {result.ok ? <pre className="block-readable">{display(result.value)}</pre> : <p>{execution ? result.error : 'O resultado aparece aqui após a extração.'}</p>}
    </div>}
    {error && <div className="data-error" role="alert">{error}</div>}
    <div className="fetch-footer" role="status">{status}</div>
  </div>;
}
