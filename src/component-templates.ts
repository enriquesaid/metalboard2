export type ComponentLanguage = 'tsx' | 'html';

export type ComponentTemplate = {
  id: string;
  title: string;
  description: string;
  source: string;
};

export const componentTemplates: Record<ComponentLanguage, readonly ComponentTemplate[]> = {
  tsx: [
    {
      id: 'card',
      title: 'Cartão',
      description: 'Organize um título, uma descrição e os próximos passos.',
      source: `function App() {
  return (
    <article style={{
      padding: 20,
      margin: 16,
      border: '1px solid var(--dim)',
      borderRadius: 8,
    }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Plano do projeto</h1>
      <p style={{ color: 'var(--dim)' }}>
        Organize a primeira entrega antes de criar o protótipo.
      </p>
      <ul style={{ paddingLeft: 20, lineHeight: 1.6 }}>
        <li>Escolher o problema</li>
        <li>Reunir referências</li>
        <li>Definir a próxima ação</li>
      </ul>
    </article>
  );
}`,
    },
    {
      id: 'counter',
      title: 'Contador interativo',
      description: 'Comece com um botão e experimente o estado do React.',
      source: `function App() {
  const [count, setCount] = React.useState(0);

  return (
    <section style={{ padding: 20 }}>
      <h1 style={{ margin: '0 0 16px', fontSize: 22 }}>Contador</h1>
      <output
        aria-live="polite"
        style={{ display: 'block', marginBottom: 16, fontSize: 32 }}
      >
        {count}
      </output>
      <button
        type="button"
        onClick={() => setCount(value => value + 1)}
        style={{
          padding: '8px 14px',
          background: 'var(--key)',
          color: 'var(--key-ink)',
          border: '1px solid var(--key-edge)',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Adicionar 1
      </button>
    </section>
  );
}`,
    },
    {
      id: 'input',
      title: 'Visualizador de entrada',
      description: 'Mostre em JSON a entrada conectada ao componente.',
      source: `function App({ input }: { input: unknown }) {
  const empty = input == null || input === '';
  const value = empty ? { projeto: 'Protótipo', tarefas: 3 } : input;

  return (
    <section style={{ padding: 20 }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 22 }}>Dados de entrada</h1>
      {empty && (
        <p style={{ color: 'var(--dim)' }}>
          Conecte uma entrada em Dados para substituir o exemplo.
        </p>
      )}
      <pre style={{
        padding: 12,
        border: '1px solid var(--dim)',
        borderRadius: 4,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}`,
    },
  ],
  html: [
    {
      id: 'card',
      title: 'Cartão',
      description: 'Organize um título, uma descrição e os próximos passos.',
      source: `<article class="project-card">
  <h1>Plano do projeto</h1>
  <p>Organize a primeira entrega antes de criar o protótipo.</p>
  <ul>
    <li>Escolher o problema</li>
    <li>Reunir referências</li>
    <li>Definir a próxima ação</li>
  </ul>
</article>

<style>
  .project-card {
    margin: 16px;
    padding: 20px;
    border: 1px solid var(--dim);
    border-radius: 8px;
  }
  .project-card h1 { margin: 0 0 8px; font-size: 22px; }
  .project-card p { color: var(--dim); }
  .project-card ul { padding-left: 20px; line-height: 1.6; }
</style>`,
    },
    {
      id: 'checklist',
      title: 'Lista de tarefas',
      description: 'Monte uma lista interativa com caixas de seleção.',
      source: `<section class="checklist">
  <h1>Antes de publicar</h1>
  <ul>
    <li><label><input type="checkbox"> Revisar o conteúdo</label></li>
    <li><label><input type="checkbox"> Testar no celular</label></li>
    <li><label><input type="checkbox"> Compartilhar com a equipe</label></li>
  </ul>
</section>

<style>
  .checklist { padding: 20px; }
  .checklist h1 { margin: 0 0 12px; font-size: 22px; }
  .checklist ul { margin: 0; padding: 0; list-style: none; }
  .checklist label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    cursor: pointer;
  }
  .checklist input { accent-color: var(--key); }
</style>`,
    },
    {
      id: 'input',
      title: 'Visualizador de entrada',
      description: 'Mostre em JSON a entrada conectada ao componente.',
      source: `<section class="input-viewer">
  <h1>Dados de entrada</h1>
  <p id="input-hint" hidden>Conecte uma entrada em Dados para substituir o exemplo.</p>
  <pre id="input-preview"></pre>
</section>

<style>
  .input-viewer { padding: 20px; }
  .input-viewer h1 { margin: 0 0 12px; font-size: 22px; }
  .input-viewer p { color: var(--dim); }
  .input-viewer pre {
    padding: 12px;
    border: 1px solid var(--dim);
    border-radius: 4px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>

<script>
  const empty = window.input == null || window.input === '';
  const value = empty ? { projeto: 'Protótipo', tarefas: 3 } : window.input;
  document.getElementById('input-hint').hidden = !empty;
  document.getElementById('input-preview').textContent = JSON.stringify(value, null, 2);
</script>`,
    },
  ],
};
