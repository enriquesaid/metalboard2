import type { Editor, TLShapePartial } from 'tldraw';
import type { OutputConfig } from './dataflow/core';
import type { BlockShape } from './shapes';

export type DemoId = 'checkout' | 'suporte';

export const demoNames: Record<DemoId, string> = {
  checkout: 'Diagnóstico de checkout',
  suporte: 'Triagem de suporte',
};

export const demoTips: Record<DemoId, string> = {
  checkout: 'Compare Celular e Desktop no Funil de checkout. Abra Dados no bloco para ver %checkout% na entrada.',
  suporte: 'Ative Só P1 na Fila de suporte. Abra Dados no bloco para ver %tickets% na entrada.',
};

export function demoFromSearch(search: string): DemoId | undefined {
  const value = new URLSearchParams(search).get('demo');
  return value === 'checkout' || value === 'suporte' ? value : undefined;
}

export const checkoutData = {
  period: 'Semana de demonstração',
  mobile: { cart: 2400, address: 1800, payment: 960, paid: 864 },
  desktop: { cart: 1600, address: 1360, payment: 1120, paid: 1064 },
  findings: {
    step: 'Endereço → pagamento',
    owner: 'Produto e Engenharia',
    action: 'Testar a validação do CEP no celular.',
  },
};

export const supportData = {
  sla: { P1: 60, P2: 240, P3: 480 },
  next: { ticket: 'SUP-241', team: 'Cobrança', action: 'Verificar se a cobrança foi processada duas vezes.' },
  tickets: [
    { id: 'SUP-241', subject: 'Cobrança duplicada', team: 'Cobrança', priority: 'P1', age: 74 },
    { id: 'SUP-242', subject: 'Login via SSO indisponível', team: 'Acesso', priority: 'P1', age: 48 },
    { id: 'SUP-243', subject: 'Exportação CSV incompleta', team: 'Dados', priority: 'P2', age: 135 },
    { id: 'SUP-244', subject: 'Convite não recebido', team: 'Acesso', priority: 'P2', age: 32 },
    { id: 'SUP-245', subject: 'Alterar plano da equipe', team: 'Cobrança', priority: 'P3', age: 18 },
  ],
};

const previewStyles = `
  const css = {
    wrap: { padding: 16, fontSize: 13, lineHeight: 1.4, overflowWrap: 'anywhere' },
    heading: { fontSize: 23, fontWeight: 500, letterSpacing: -1, margin: '0 0 12px', lineHeight: 1.15 },
    label: { color: 'var(--dim)', fontSize: 12 },
    filters: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
    button: {
      minHeight: 36, border: '1px solid var(--dim)', borderRadius: 4,
      padding: '6px 10px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap'
    },
    metrics: {
      display: 'flex', flexWrap: 'wrap', gap: '4px 20px',
      padding: '0 0 10px', borderBottom: '1px solid var(--dim)', marginBottom: 12
    },
    number: { fontSize: 25, fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
  };
  const number = value => value.toLocaleString('pt-BR');
  const choiceStyle = active => ({
    ...css.button,
    color: active ? 'var(--key-ink)' : 'var(--ink)',
    background: active ? 'var(--key)' : 'var(--paper)',
    borderColor: active ? 'var(--key-edge)' : 'var(--dim)',
  });
`;

export const checkoutPreview = `function App({ input }) {
  ${previewStyles}
  const [device, setDevice] = React.useState('mobile');
  const data = input?.[device];
  if (!data?.cart) return <p style={css.wrap}>Conecte os dados de checkout na entrada do componente.</p>;

  const steps = [['Carrinho', data.cart], ['Endereço', data.address], ['Pagamento', data.payment], ['Concluído', data.paid]];
  const formatRate = n => (n / data.cart).toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
  const drop = data.address - data.payment;

  return <div style={css.wrap}>
    <h1 style={css.heading}>Conversão por etapa</h1>
    <div role="group" aria-label="Dispositivo" style={css.filters}>
      <button type="button" aria-pressed={device === 'mobile'} style={choiceStyle(device === 'mobile')} onClick={() => setDevice('mobile')}>Celular</button>
      <button type="button" aria-pressed={device === 'desktop'} style={choiceStyle(device === 'desktop')} onClick={() => setDevice('desktop')}>Desktop</button>
    </div>
    <div aria-live="polite">
      <div style={css.metrics}>
        <div><div style={css.number}>{formatRate(data.paid)}</div><div style={css.label}>conversão final</div></div>
        <div><div style={css.number}>{number(drop)}</div><div style={css.label}>saíram após o endereço</div></div>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map(([label, value]) => <li key={label} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
            <span>{label}</span><span>{number(value)} · {formatRate(value)}</span>
          </div>
          <div aria-hidden="true" style={{ height: 7, background: 'color-mix(in srgb, var(--ink) 12%, var(--paper))' }}>
            <div style={{ width: 100 * value / data.cart + '%', height: '100%', background: label === 'Pagamento' ? 'var(--key)' : 'var(--ink)' }} />
          </div>
        </li>)}
      </ul>
    </div>
    <div style={{ ...css.label, marginTop: 11 }}>{input.period} · dados fictícios</div>
  </div>;
}`;

export const supportPreview = `function App({ input }) {
  ${previewStyles}
  const [onlyUrgent, setOnlyUrgent] = React.useState(false);
  if (!Array.isArray(input?.tickets) || !input?.sla) return <p style={css.wrap}>Conecte os dados da fila na entrada do componente.</p>;

  const ordered = [...input.tickets].sort((a, b) => a.priority.localeCompare(b.priority) || b.age - a.age);
  const isUrgent = ticket => ticket.priority === 'P1';
  const isLate = ticket => ticket.age > input.sla[ticket.priority];
  const visible = onlyUrgent ? ordered.filter(isUrgent) : ordered;

  return <div style={css.wrap}>
    <h1 style={css.heading}>Chamados por prioridade</h1>
    <div role="group" aria-label="Filtrar chamados" style={css.filters}>
      <button type="button" aria-pressed={!onlyUrgent} style={choiceStyle(!onlyUrgent)} onClick={() => setOnlyUrgent(false)}>Todos</button>
      <button type="button" aria-pressed={onlyUrgent} style={choiceStyle(onlyUrgent)} onClick={() => setOnlyUrgent(true)}>Só P1</button>
    </div>
    <div style={{ ...css.label, marginBottom: 7 }} aria-live="polite">
      {visible.length} de {ordered.length} chamados · {visible.filter(isLate).length} fora do prazo
    </div>
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {visible.map(ticket => <li key={ticket.id} style={{
        display: 'grid', gridTemplateColumns: '2em minmax(0, 1fr) auto', gap: 8, alignItems: 'baseline',
        padding: '6px 0', borderTop: '1px solid color-mix(in srgb, var(--ink) 25%, var(--paper))'
      }}>
        <strong>{ticket.priority}</strong>
        <div>{ticket.subject}<div style={css.label}>{ticket.id} · {ticket.team}</div></div>
        <div style={{ textAlign: 'right' }}>
          <span>{number(ticket.age)} min</span>
          {isLate(ticket) && <div style={{ ...css.label, color: 'var(--key-edge)' }}>Prazo vencido</div>}
        </div>
      </li>)}
    </ul>
  </div>;
}`;

type DemoShape = Omit<TLShapePartial<BlockShape>, 'id'> & {
  x: number;
  y: number;
  props: Partial<BlockShape['props']> & Pick<BlockShape['props'], 'kind' | 'w' | 'h'>;
};

type DemoSettings = { input?: string; output?: Partial<OutputConfig>; origin?: string };

function block(
  alias: string,
  kind: string,
  title: string,
  content: string,
  bounds: [x: number, y: number, w: number, h: number],
  { input = '', output = {}, origin = '' }: DemoSettings = {},
): DemoShape {
  const [x, y, w, h] = bounds;
  return { type: 'block', x, y, props: { kind, title, content, w, h, origin }, meta: { metalboard: { id: alias, input, output } } };
}

const layout = {
  brief: [0, 0, 286, 190],
  source: [0, 236, 286, 284],
  preview: [360, 0, 414, 520],
  decision: [848, 0, 288, 242],
  handoff: [848, 284, 288, 236],
} satisfies Record<string, [number, number, number, number]>;

export function demoShapes(id: DemoId): DemoShape[] {
  if (id === 'checkout') return [
    block('brief', 'idea', 'Pergunta do time',
      '## Onde o checkout perde vendas?\n\nCompare celular e desktop no funil para escolher o primeiro problema a investigar.',
      layout.brief),
    block('checkout', 'output', 'Eventos de checkout', JSON.stringify(checkoutData, null, 2), layout.source,
      { output: { parseJson: true }, origin: 'JSON · dados fictícios' }),
    block('funnel', 'code', 'Funil de checkout', checkoutPreview, layout.preview,
      { input: '%checkout%', output: { source: 'input' } }),
    block('decision', 'idea', 'Hipótese de abandono',
      '## %funnel.findings.step%\n\nNo celular, **%funnel.mobile.address%** carrinhos chegaram ao endereço. **%funnel.mobile.payment%** avançaram.\n\nVale investigar o formulário de endereço.',
      layout.decision, { output: { source: 'value', value: '%funnel.findings.action%' } }),
    block('handoff', 'idea', 'Próximo teste',
      '## Experimento\n\n**Ação:** %decision%\n\n**Verificação:** teste o formulário com e sem leitor de tela. Compare o avanço até o pagamento.',
      layout.handoff),
  ];
  return [
    block('brief', 'idea', 'Pergunta do plantão',
      '## Qual chamado vem primeiro?\n\nFiltre os chamados P1 para identificar o que já passou do prazo.',
      layout.brief),
    block('tickets', 'output', 'Chamados recebidos', JSON.stringify(supportData, null, 2), layout.source,
      { output: { parseJson: true }, origin: 'JSON · chamados fictícios' }),
    block('queue', 'code', 'Fila de suporte', supportPreview, layout.preview,
      { input: '%tickets%', output: { source: 'input' } }),
    block('action', 'idea', 'Prioridade do plantão',
      '## %queue.next.ticket% primeiro\n\n**%queue.tickets[0].subject%** aguarda há **%queue.tickets[0].age% min**. O prazo de P1 é de **%queue.sla.P1% min**.\n\n**Responsável:** %queue.next.team%.',
      layout.decision, { output: { source: 'value', value: '%queue.next.action%' } }),
    block('handoff', 'idea', 'Passagem de turno',
      '## Primeiro atendimento\n\n%action%\n\nRegistre a conclusão no chamado antes de passar para o próximo P1.',
      layout.handoff),
  ];
}

export function seedDemo(editor: Editor, id: DemoId) {
  if (editor.getCurrentPageShapes().length) return;
  editor.run(() => {
    editor.createShapes<BlockShape>(demoShapes(id));
    editor.selectNone();
  }, { history: 'ignore' });

  const viewportWidth = editor.getViewportScreenBounds().w;
  const compact = viewportWidth < 900;
  const [x, y, w, h] = layout.preview;
  const bounds = compact ? { x, y, w, h } : editor.getCurrentPageBounds();
  if (bounds) {
    editor.zoomToBounds(
      { x: bounds.x, y: bounds.y - 16, w: bounds.w, h: bounds.h + (viewportWidth <= 620 ? 180 : 90) },
      { inset: compact ? 20 : 48, targetZoom: 1 },
    );
  }
}
