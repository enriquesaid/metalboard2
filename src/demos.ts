import type { Editor, TLShapePartial } from 'tldraw';
import type { BlockShape } from './shapes';

export type DemoId = 'checkout' | 'suporte';
export const demoNames: Record<DemoId, string> = {
  checkout: 'Checkout · da hipótese à decisão',
  suporte: 'Suporte · da fila ao plano de ação',
};
export function demoFromSearch(search: string): DemoId | undefined {
  const value = new URLSearchParams(search).get('demo');
  return value === 'checkout' || value === 'suporte' ? value : undefined;
}

// Synthetic, self-contained fixtures. No customer data or simulated executions.
// The snapshots feed the real data resolver and React preview through %refs%.
export const checkoutData = {
  period: 'Semana de demonstração',
  mobile: { cart: 2400, address: 1800, payment: 960, paid: 864 },
  desktop: { cart: 1600, address: 1360, payment: 1120, paid: 1064 },
  findings: { step: 'Endereço → pagamento', mobileDrop: 840, owner: 'Produto + Engenharia' },
};
export const supportData = {
  window: 'Turno de demonstração',
  tickets: [
    { id: 'SUP-241', subject: 'Cobrança duplicada', team: 'Billing', priority: 'P1', age: 74 },
    { id: 'SUP-242', subject: 'Login via SSO indisponível', team: 'Identity', priority: 'P1', age: 48 },
    { id: 'SUP-243', subject: 'Exportação CSV incompleta', team: 'Dados', priority: 'P2', age: 135 },
    { id: 'SUP-244', subject: 'Convite não recebido', team: 'Identity', priority: 'P2', age: 32 },
    { id: 'SUP-245', subject: 'Alterar plano da equipe', team: 'Billing', priority: 'P3', age: 18 },
  ],
  sla: { P1: 60, P2: 240, P3: 480 },
  next: { ticket: 'SUP-241', team: 'Billing', action: 'Verificar idempotência da cobrança' },
};

const previewStyles = `
  const css = {
    wrap: {padding: '18px', fontSize: 12, lineHeight: 1.4},
    label: {fontSize: 10, color: 'var(--dim)', letterSpacing: 1.2, textTransform: 'uppercase'},
    title: {fontSize: 24, fontWeight: 500, letterSpacing: -1, margin: '8px 0 18px'},
    line: {borderTop: '1px solid var(--dim)', opacity: .25, margin: '18px 0'},
    button: {background: 'var(--key)', color:'var(--key-ink)', border:'1px solid var(--key-edge)', borderRadius:4, padding:'6px 10px', fontSize:11, cursor:'pointer'},
  };
`;
export const checkoutPreview = `function App() {
  ${previewStyles}
  const [device, setDevice] = React.useState('mobile');
  const data = input[device];
  const percent = n => (100 * n / data.cart).toFixed(1).replace('.', ',');
  const steps = [['Carrinho',data.cart],['Endereço',data.address],['Pagamento',data.payment],['Concluído',data.paid]];
  return <div style={css.wrap}>
    <div style={css.label}>ANÁLISE DE FUNIL / DADOS DE DEMONSTRAÇÃO</div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}><h1 style={css.title}>Onde o fluxo quebra?</h1><button style={css.button} onClick={()=>setDevice(device==='mobile'?'desktop':'mobile')}>{device==='mobile'?'Mobile':'Desktop'} ↔</button></div>
    <div style={{display:'flex',gap:34,marginBottom:24}}><div><div style={{fontSize:36,letterSpacing:-2}}>{percent(data.paid)}%</div><div style={css.label}>conversão final</div></div><div><div style={{fontSize:36,letterSpacing:-2}}>{data.cart.toLocaleString('pt-BR')}</div><div style={css.label}>carrinhos iniciados</div></div></div>
    {steps.map(([label,value],i)=><div key={label} style={{margin:'12px 0'}}><div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:5}}><span>0{i+1} / {label}</span><span>{value.toLocaleString('pt-BR')} · {percent(value)}%</span></div><div style={{height:12,background:'color-mix(in srgb, var(--ink) 8%, transparent)'}}><div style={{width:percent(value).replace(',','.')+'%',height:'100%',background:i===2?'var(--key)':'var(--ink)'}}/></div></div>)}
    <div style={{...css.label,marginTop:22}}>Fonte conectada: %checkout.period%</div>
  </div>;
}`;
export const supportPreview = `function App() {
  ${previewStyles}
  const [onlyUrgent,setOnlyUrgent] = React.useState(false);
  const tickets = input.tickets.filter(t=>!onlyUrgent || t.priority==='P1');
  const late = input.tickets.filter(t=>t.age > input.sla[t.priority]);
  return <div style={css.wrap}>
    <div style={css.label}>OPERAÇÃO DE SUPORTE / DEMONSTRAÇÃO</div>
    <h1 style={css.title}>Prioridade antes de volume.</h1>
    <div style={{display:'flex',gap:32,marginBottom:20}}>{[[input.tickets.length,'na fila'],[input.tickets.filter(t=>t.priority==='P1').length,'prioridade P1'],[late.length,'fora do SLA']].map(([n,l])=><div key={l}><div style={{fontSize:34,color:l==='fora do SLA'?'var(--key)':'var(--ink)'}}>{String(n).padStart(2,'0')}</div><div style={css.label}>{l}</div></div>)}</div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><span style={css.label}>Fila por ordem de prioridade</span><button style={css.button} onClick={()=>setOnlyUrgent(!onlyUrgent)}>{onlyUrgent?'Ver todos':'Só P1'}</button></div>
    {tickets.map(t=><div key={t.id} style={{display:'grid',gridTemplateColumns:'34px 1fr auto',gap:10,borderTop:'1px solid color-mix(in srgb,var(--ink) 15%,transparent)',padding:'12px 0',alignItems:'center'}}><span style={{color:t.priority==='P1'?'var(--key)':'var(--dim)'}}>{t.priority}</span><div><div style={{fontSize:12}}>{t.subject}</div><div style={{fontSize:10,color:'var(--dim)',marginTop:3}}>{t.id} / {t.team}</div></div><span style={{fontSize:11,color:t.age>input.sla[t.priority]?'var(--key)':'var(--dim)'}}>{t.age} min</span></div>)}
  </div>;
}`;

type DemoShape = Omit<TLShapePartial<BlockShape>, 'id'>;
function block(alias: string, kind: string, title: string, content: string, x: number, y: number, w: number, h: number, input = '', json = false): DemoShape {
  return { type: 'block', x, y, props: {kind, title, content, w, h, origin: 'Dados sintéticos · exemplo demonstrativo'}, meta: { metalboard: {id: alias, input, output: {parseJson: json}} } };
}
export function demoShapes(id: DemoId): DemoShape[] {
  if (id === 'checkout') return [
    block('brief', 'idea', '01 / A pergunta certa', '## Por que o mobile perde vendas?\n\nO time percebeu uma diferença entre mobile e desktop. Antes de redesenhar o checkout, precisamos localizar a etapa de maior abandono.\n\n**Entrega:** uma hipótese testável, com evidência e critério de aceite.\n\n*Caso de uso com dados sintéticos.*', 0, 0, 300, 300),
    block('checkout', 'output', '02 / Eventos por dispositivo', JSON.stringify(checkoutData, null, 2), 360, 0, 360, 350, '', true),
    block('funnel', 'code', '03 / Funil interativo', checkoutPreview, 780, 0, 520, 510, '%checkout%'),
    block('criteria', 'idea', '05 / Plano de verificação', '## Transformar hipótese em teste\n\n1. Reproduzir o formulário em 375 px.\n2. Verificar teclado, CEP e mensagens de erro.\n3. Preservar os dados ao voltar uma etapa.\n\n**Aceite:** concluir o fluxo com teclado e leitor de tela.\n\n**Depois:** comparar o funil por dispositivo.', 0, 360, 300, 330),
    block('decision', 'idea', '04 / Evidência → decisão', '## Investigar o endereço\n\n**Etapa:** %checkout.findings.step%\n\nNo recorte mobile, **%checkout.findings.mobileDrop% carrinhos** saem nessa passagem.\n\n**Próxima ação:** testar a validação do CEP antes de alterar o pagamento.\n\n**Responsáveis:** %checkout.findings.owner%', 360, 410, 360, 280, '%checkout%'),
    block('handoff', 'output', '06 / Handoff para o próximo ciclo', 'INVESTIGAÇÃO → CORREÇÃO → VERIFICAÇÃO\n\nFoco: %checkout.findings.step%\nDono: %checkout.findings.owner%\n\nRegistrar o resultado neste mesmo board.', 780, 555, 520, 165),
  ];
  return [
    block('brief', 'idea', '01 / Contexto do plantão', '## Uma fila. Um plano claro.\n\nO time começa o turno com chamados de cobrança, acesso e exportação. É preciso separar urgência de ordem de chegada.\n\n**Entrega:** priorizar, atribuir responsáveis e preparar a passagem de turno.\n\n*Chamados fictícios para demonstração.*', 0, 0, 300, 300),
    block('tickets', 'output', '02 / Snapshot da fila', JSON.stringify(supportData, null, 2), 360, 0, 360, 350, '', true),
    block('queue', 'code', '03 / Fila acionável', supportPreview, 780, 0, 520, 530, '%tickets%'),
    block('policy', 'idea', '05 / Regra de atendimento', '## O que atender primeiro?\n\n**P1 · até %tickets.sla.P1% min**\nCobrança indevida ou acesso bloqueado.\n\n**P2 · até %tickets.sla.P2% min**\nFunção prejudicada com alternativa.\n\n**P3 · até %tickets.sla.P3% min**\nDúvidas e alterações de plano.\n\nSLA ilustrativo deste exercício.', 0, 360, 300, 330),
    block('action', 'idea', '04 / Próxima ação', '## %tickets.next.ticket% primeiro\n\n**Equipe:** %tickets.next.team%\n\n%tickets.next.action%.\n\nConfirmar o evento no provedor antes de propor qualquer estorno.\n\nDepois, investigar o SSO com a equipe de Identity.', 360, 410, 360, 280, '%tickets%'),
    block('handoff', 'output', '06 / Passagem de turno', 'PRÓXIMO RESPONSÁVEL / %tickets.next.team%\nChamado: %tickets.next.ticket%\nAção: %tickets.next.action%', 780, 590, 520, 100),
  ];
}
export function seedDemo(editor: Editor, id: DemoId) {
  if (editor.getCurrentPageShapes().length) return;
  editor.createShapes<BlockShape>(demoShapes(id));
  editor.selectNone();
  editor.zoomToBounds({x: -30, y: -30, w: 1360, h: 820}, {inset: 16, targetZoom: 1});
}
