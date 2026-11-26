import { useEffect, useRef, useState } from 'react';
import { useEditor } from 'tldraw';
import { invoke } from '@tauri-apps/api/core';
import { Play, Plus, Trash2, Square } from 'lucide-react';
import { type BlockShape } from './shapes';
import { BlockTabs } from './BlockTabs';
import { display } from './dataflow/core';
import { useDataResolver, updateMeta } from './dataflow/editor';
import { defaultFetch, prepareRequest, type Pair, type FetchConfig, type HttpResponse } from './dataflow/fetch';
import { desktopAvailable } from './runtime';

const fetchTabs = [
  { id: 'query', label: 'Query' }, { id: 'params', label: 'Parâmetros' },
  { id: 'headers', label: 'Cabeçalhos' }, { id: 'auth', label: 'Autenticação' },
  { id: 'body', label: 'Corpo' }, { id: 'options', label: 'Opções' },
  { id: 'response', label: 'Resposta' }, { id: 'output', label: 'Saída' },
] as const;

export function FetchBlock({ shape, readonly }: { shape: BlockShape; readonly: boolean }) {
  const editor = useEditor(), data = useDataResolver();
  const settings = { ...defaultFetch, ...(shape.meta.fetch as Partial<FetchConfig>) };
  const [tab, setTab] = useState<(typeof fetchTabs)[number]['id']>('query');
  const [error, setError] = useState(''), [running, setRunning] = useState(false);
  const [secrets, setSecrets] = useState({ token: '', username: '', password: '' });
  const active = useRef<{ controller: AbortController; id: string } | null>(null);
  const saved = shape.meta.httpResponse as HttpResponse | undefined;
  const execution = shape.meta.execution as { status: string; error?: string } | undefined;
  const patch = (change: Partial<FetchConfig>) => {
    setError('');
    updateMeta(editor, shape.id, {
      fetch: { ...settings, ...change },
      ...(execution && { execution: { status: 'stale', error: 'Configuração alterada. Envie a requisição novamente.' } }),
    });
  };
  function cancel() { if (!active.current) return; active.current.controller.abort('Requisição cancelada.'); if (desktopAvailable) void invoke('cancel_fetch', { id: active.current.id }).catch(() => {}); }
  useEffect(() => () => { cancel(); }, []);
  async function send() {
    if (readonly || active.current) return;
    setError('');
    // A política SSRF depende de resolução de DNS, que só o transporte nativo faz.
    if (!desktopAvailable) { setError('Abra o Metalboard desktop para enviar requisições.'); return; }
    let request;
    try { const input = data.input(shape); request = prepareRequest(settings, s => data.interpolate(s, [], { input }), secrets); } catch (e) { setError(String(e)); return; }
    const current = { controller: new AbortController(), id: crypto.randomUUID() }; active.current = current;
    setRunning(true); updateMeta(editor, shape.id, { execution: { status: 'running' } });
    try {
      const response = await invoke<HttpResponse>('http_fetch', { id: current.id, request });
      if (current.controller.signal.aborted) throw new Error('Requisição cancelada.');
      updateMeta(editor, shape.id, { httpResponse: response, execution: { status: response.status >= 200 && response.status < 300 ? 'success' : 'error', value: response.body, error: `HTTP ${response.status}`, completedAt: new Date().toISOString() } });
      if (response.status < 200 || response.status >= 300) setError(`HTTP ${response.status}. Consulte a resposta recebida.`);
      setTab('response');
    } catch (e) { const message = String(e); setError(message); updateMeta(editor, shape.id, { execution: { status: 'error', error: message } }); }
    finally { active.current = null; setRunning(false); }
  }
  const result = data.result(shape);
  const tabsId = `fetch-${shape.id}`;
  const canSend = desktopAvailable && !readonly && !!settings.url.trim();
  const requestActionLabel = running ? 'Cancelar requisição' : 'Enviar requisição';
  const previousResponse = saved && execution?.status !== 'success';
  const status = running ? 'Enviando…' : !desktopAvailable ? 'Envio disponível no desktop' : execution?.status === 'stale' ? 'Configuração alterada' : saved ? `HTTP ${saved.status}` : 'Aguardando envio';
  return <div className="fetch-content">
    <form className="fetch-url" onSubmit={event => {
      event.preventDefault();
      if (canSend) void send();
    }}>
      <select aria-label="Método HTTP" value={settings.method} disabled={readonly || running} onChange={e => patch({ method: e.target.value })}>
        {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(method => <option key={method}>{method}</option>)}
      </select>
      <input aria-label="URL da requisição" placeholder="https://api.exemplo.com/{id}" spellCheck={false} value={settings.url} disabled={readonly || running} onChange={e => patch({ url: e.target.value })} />
      <button type={running ? 'button' : 'submit'} className="ui-action ui-action--primary block-request-submit" aria-label={requestActionLabel} title={desktopAvailable ? requestActionLabel : 'Abra o Metalboard desktop para enviar'} disabled={!running && !canSend} onClick={running ? cancel : undefined}>
        {running ? <Square size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}<span>{running ? 'Cancelar' : 'Enviar'}</span>
      </button>
    </form>
    <BlockTabs className="fetch-tabs" id={tabsId} label="Configuração e resultados da requisição" value={tab} onChange={setTab} tabs={fetchTabs.map(item => {
      const count = item.id === 'query' || item.id === 'params' || item.id === 'headers' ? settings[item.id].length : 0;
      return { id: item.id, label: <>{item.label}{count > 0 && <small>{count}</small>}</> };
    })} />
    <div className="fetch-editor" id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} tabIndex={0}>
      <fieldset disabled={readonly || running} hidden={tab === 'response' || tab === 'output'}>
        {(tab === 'query' || tab === 'params' || tab === 'headers') && <>
          <p>{tab === 'params' ? 'Use {id} ou :id na URL e informe o valor aqui.' : tab === 'query' ? 'Adicione parâmetros à consulta. Os valores aceitam referências do quadro.' : 'Adicione cabeçalhos à requisição. Os valores aceitam referências do quadro.'}</p>
          <Pairs key={tab} pairs={settings[tab]} onChange={pairs => patch({ [tab]: pairs })} />
        </>}
        {tab === 'auth' && <>
          <label>Autenticação<select value={settings.auth} onChange={e => patch({ auth: e.target.value as FetchConfig['auth'] })}><option value="none">Nenhuma</option><option value="bearer">Bearer / OAuth2 access token</option><option value="basic">Basic</option><option value="apiKey">API Key</option></select></label>
          {settings.auth === 'apiKey' && <>
            <label>Nome da chave<input value={settings.apiKeyName} onChange={e => patch({ apiKeyName: e.target.value })} /></label>
            <label>Enviar em<select value={settings.apiKeyIn} onChange={e => patch({ apiKeyIn: e.target.value as 'header' | 'query' })}><option value="header">Cabeçalho</option><option value="query">Query</option></select></label>
          </>}
          {settings.auth === 'basic' ? <>
            <label>Usuário<input autoComplete="off" value={secrets.username} onChange={e => setSecrets({ ...secrets, username: e.target.value })} /></label>
            <label>Senha<input type="password" autoComplete="off" value={secrets.password} onChange={e => setSecrets({ ...secrets, password: e.target.value })} /></label>
          </> : settings.auth !== 'none' && <label>Token ou chave<input type="password" autoComplete="off" value={secrets.token} onChange={e => setSecrets({ ...secrets, token: e.target.value })} /></label>}
          <p>As credenciais de autenticação duram apenas esta sessão. O quadro guarda cabeçalhos, URL e corpo da requisição.</p>
        </>}
        {tab === 'body' && <>
          <label>Formato<select value={settings.bodyType} onChange={e => patch({ bodyType: e.target.value as FetchConfig['bodyType'] })}><option value="none">Nenhum</option><option value="json">JSON</option><option value="raw">Texto</option><option value="form">Form URL encoded</option></select></label>
          {settings.bodyType !== 'none' && <>
            <textarea aria-label="Corpo da requisição" spellCheck={false} value={settings.body} onChange={e => patch({ body: e.target.value })} placeholder={'{"user": "%element_1%"}'} />
            <p>Em JSON, as referências entre aspas preservam o tipo do valor. Para formulário, informe um objeto JSON de campos.</p>
          </>}
        </>}
        {tab === 'options' && <>
          <label>Tempo limite (ms)<input type="number" min="100" max="120000" value={settings.timeoutMs} onChange={e => patch({ timeoutMs: Number(e.target.value) })} /></label>
          <p>Transporte HTTP nativo. Até 2 MB por resposta.</p>
        </>}
      </fieldset>
      {tab === 'response' && (saved ? <>
        <div className="http-status">HTTP {saved.status} · {saved.durationMs} ms {previousResponse && '· resposta anterior ou com erro'}</div>
        <details><summary>Cabeçalhos da resposta</summary><pre className="block-readable">{display(saved.headers)}</pre></details>
        <pre className="block-readable">{display(saved.body)}</pre>
      </> : <div className="block-empty">A resposta aparece aqui após o envio.</div>)}
      {tab === 'output' && <>
        <p>Configure os campos da saída em Dados do elemento.</p>
        <pre className="block-readable">{result.ok ? display(result.value) : result.error}</pre>
      </>}
    </div>
    {error && <div className="data-error" role="alert">{error}</div>}
    <div className="fetch-footer" role="status">{status}</div>
  </div>;
}
function Pairs({ pairs, onChange }: { pairs: Pair[]; onChange: (p: Pair[]) => void }) {
  const patch = (i: number, change: Partial<Pair>) => onChange(pairs.map((p,index) => i === index ? { ...p, ...change } : p));
  return <div className="pair-list">{pairs.map((pair,i) => <div className="pair-row" key={i}><input aria-label={`Ativar campo ${i+1}`} type="checkbox" checked={pair.enabled} onChange={e => patch(i,{ enabled:e.target.checked })} /><input aria-label={`Chave ${i+1}`} placeholder="Chave" value={pair.key} onChange={e => patch(i,{key:e.target.value})} /><input aria-label={`Valor ${i+1}`} placeholder="Valor ou %element_1%" value={pair.value} onChange={e => patch(i,{value:e.target.value})} /><button className="ui-icon-button" aria-label={`Remover campo ${i+1}`} onClick={() => onChange(pairs.filter((_,index) => index !== i))}><Trash2 size={12} /></button></div>)}<button className="ui-action ui-action--quiet" onClick={() => onChange([...pairs,{key:'',value:'',enabled:true}])}><Plus size={12} />Adicionar campo</button></div>;
}
