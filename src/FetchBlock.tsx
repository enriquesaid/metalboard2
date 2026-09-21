import { useEffect, useRef, useState } from 'react';
import { useEditor } from 'tldraw';
import { invoke } from '@tauri-apps/api/core';
import { Play, Plus, Trash2, Square } from 'lucide-react';
import { type BlockShape } from './shapes';
import { config, display } from './dataflow/core';
import { useDataResolver, updateMeta } from './dataflow/editor';
import { defaultFetch, prepareRequest, browserRequest, type Pair, type FetchConfig, type HttpResponse } from './dataflow/fetch';
import { desktopAvailable } from './runtime';

export function FetchBlock({ shape }: { shape: BlockShape }) {
  const editor = useEditor(), data = useDataResolver();
  const settings = { ...defaultFetch, ...(shape.meta.fetch as Partial<FetchConfig>) };
  const [tab, setTab] = useState('query'), [error, setError] = useState(''), [running, setRunning] = useState(false);
  const [secrets, setSecrets] = useState({ token: '', username: '', password: '' });
  const active = useRef<{ controller: AbortController; id: string } | null>(null);
  const saved = shape.meta.httpResponse as HttpResponse | undefined;
  const execution = shape.meta.execution as { status: string; error?: string } | undefined;
  const patch = (change: Partial<FetchConfig>) => updateMeta(editor, shape.id, { fetch: { ...settings, ...change }, execution: { status: 'stale', error: 'Configuração alterada. Execute novamente.' } });
  function cancel() { if (!active.current) return; active.current.controller.abort('Requisição cancelada.'); if (desktopAvailable) void invoke('cancel_fetch', { id: active.current.id }).catch(() => {}); }
  useEffect(() => () => { cancel(); }, []);
  async function send() {
    setError('');
    let request;
    try { const input = data.input(shape); request = prepareRequest(settings, s => data.interpolate(s, [], { input }), secrets); } catch (e) { setError(String(e)); return; }
    const current = { controller: new AbortController(), id: crypto.randomUUID() }; active.current = current;
    setRunning(true); updateMeta(editor, shape.id, { execution: { status: 'running' } });
    try {
      const response = desktopAvailable ? await invoke<HttpResponse>('http_fetch', { id: current.id, request }) : await browserRequest(request, current.controller);
      if (current.controller.signal.aborted) throw new Error('Requisição cancelada.');
      updateMeta(editor, shape.id, { httpResponse: response, execution: { status: response.status >= 200 && response.status < 300 ? 'success' : 'error', value: response.body, error: `HTTP ${response.status}`, completedAt: new Date().toISOString() } });
      if (response.status < 200 || response.status >= 300) setError(`HTTP ${response.status}. Consulte a resposta recebida.`);
      setTab('response');
    } catch (e) { const message = String(e); setError(message); updateMeta(editor, shape.id, { execution: { status: 'error', error: message } }); }
    finally { active.current = null; setRunning(false); }
  }
  const result = data.result(shape);
  return <div className="fetch-content">
    <div className="fetch-url"><select aria-label="Método HTTP" value={settings.method} disabled={running} onChange={e => patch({ method: e.target.value })}>{['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m => <option key={m}>{m}</option>)}</select><input aria-label="URL da requisição" placeholder="https://api.example.com/users/{id}" value={settings.url} disabled={running} onChange={e => patch({ url: e.target.value })} /><button title={running ? 'Cancelar requisição' : 'Enviar requisição'} onClick={() => running ? cancel() : void send()}>{running ? <Square size={14} /> : <Play size={14} />}</button></div>
    <div className="fetch-tabs">{[['query','Query'],['params','Params'],['headers','Headers'],['auth','Auth'],['body','Body'],['options','Opções'],['response','Resposta'],['output','Output']].map(([id,label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}{['query','params','headers'].includes(id) && (settings[id as 'query'].length || '')}</button>)}</div>
    <div className="fetch-editor">
      {(['query','params','headers'] as const).map(key => tab === key && <fieldset key={key} disabled={running}><p>{key === 'params' ? 'Substitui {id} ou :id na URL, com codificação automática.' : 'Valores aceitam %element_1% e %input%.'}</p><Pairs pairs={settings[key]} onChange={pairs => patch({ [key]: pairs })} /></fieldset>)}
      {tab === 'auth' && <fieldset disabled={running}><label>Autenticação<select value={settings.auth} onChange={e => patch({ auth: e.target.value as FetchConfig['auth'] })}><option value="none">Nenhuma</option><option value="bearer">Bearer / OAuth2 access token</option><option value="basic">Basic</option><option value="apiKey">API Key</option></select></label>{settings.auth === 'apiKey' && <><label>Nome da chave<input value={settings.apiKeyName} onChange={e => patch({ apiKeyName: e.target.value })} /></label><label>Enviar em<select value={settings.apiKeyIn} onChange={e => patch({ apiKeyIn: e.target.value as 'header' | 'query' })}><option value="header">Header</option><option value="query">Query</option></select></label></>}{settings.auth === 'basic' ? <><label>Usuário<input autoComplete="off" value={secrets.username} onChange={e => setSecrets({ ...secrets, username: e.target.value })} /></label><label>Senha<input type="password" autoComplete="off" value={secrets.password} onChange={e => setSecrets({ ...secrets, password: e.target.value })} /></label></> : settings.auth !== 'none' && <label>Token / chave<input type="password" autoComplete="off" value={secrets.token} onChange={e => setSecrets({ ...secrets, token: e.target.value })} /></label>}<p>Credenciais de Auth ficam apenas nesta sessão. Headers, URL e body são salvos e exportados com o board.</p></fieldset>}
      {tab === 'body' && <fieldset disabled={running}><label>Formato<select value={settings.bodyType} onChange={e => patch({ bodyType: e.target.value as FetchConfig['bodyType'] })}><option value="none">Nenhum</option><option value="json">JSON</option><option value="raw">Texto / raw</option><option value="form">Form URL encoded</option></select></label>{settings.bodyType !== 'none' && <><textarea aria-label="Body da requisição" spellCheck={false} value={settings.body} onChange={e => patch({ body: e.target.value })} placeholder={'{"user": "%element_1%"}'} /><p>JSON: use expressões entre aspas; o valor substituído mantém seu tipo. Form: informe um objeto JSON de campos.</p></>}</fieldset>}
      {tab === 'options' && <fieldset disabled={running}><label>Timeout (ms)<input type="number" min="100" max="120000" value={settings.timeoutMs} onChange={e => patch({ timeoutMs: Number(e.target.value) })} /></label>{!desktopAvailable && <label>Cookies<select value={settings.credentials} onChange={e => patch({ credentials: e.target.value as 'omit' | 'include' })}><option value="omit">Não enviar</option><option value="include">Enviar quando permitido por CORS</option></select></label>}<p>{desktopAvailable ? 'HTTP nativo · sem restrição CORS · sem cookies do navegador.' : 'HTTP pelo navegador · a API precisa permitir CORS.'} Limite: 2 MB. Redirecionamentos automáticos desativados.</p></fieldset>}
      {tab === 'response' && <>{saved ? <><div className="http-status">HTTP {saved.status} · {saved.durationMs} ms {execution?.status !== 'success' && '· resposta anterior / erro'}</div><details><summary>Headers da resposta</summary><pre>{display(saved.headers)}</pre></details><pre>{display(saved.body)}</pre></> : <p>Envie a requisição para ver a resposta.</p>}</>}
      {tab === 'output' && <><p>Referência: <code>%{config(shape).id}%</code>. Selecione campos e transforme no painel Dados do elemento.</p><pre>{result.ok ? display(result.value) : result.error}</pre></>}
    </div>
    {(error || execution?.status === 'stale') && <div className="data-error">{error || execution?.error}</div>}
    <div className="fetch-footer"><code>%{config(shape).id}%</code><span>{running ? 'Enviando…' : saved ? `HTTP ${saved.status}` : 'Não executado'}</span></div>
  </div>;
}
function Pairs({ pairs, onChange }: { pairs: Pair[]; onChange: (p: Pair[]) => void }) {
  const patch = (i: number, change: Partial<Pair>) => onChange(pairs.map((p,index) => i === index ? { ...p, ...change } : p));
  return <div className="pair-list">{pairs.map((pair,i) => <div className="pair-row" key={i}><input aria-label={`Ativar campo ${i+1}`} type="checkbox" checked={pair.enabled} onChange={e => patch(i,{ enabled:e.target.checked })} /><input aria-label={`Chave ${i+1}`} placeholder="Chave" value={pair.key} onChange={e => patch(i,{key:e.target.value})} /><input aria-label={`Valor ${i+1}`} placeholder="Valor ou %element_1%" value={pair.value} onChange={e => patch(i,{value:e.target.value})} /><button aria-label={`Remover campo ${i+1}`} onClick={() => onChange(pairs.filter((_,index) => index !== i))}><Trash2 size={12} /></button></div>)}<button onClick={() => onChange([...pairs,{key:'',value:'',enabled:true}])}><Plus size={12} />Adicionar campo</button></div>;
}
