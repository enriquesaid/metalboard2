# AgentGrid → Metalboard

Levantamento feito em 20/09/2026 a partir da página pública do AgentGrid. A referência apresenta um canvas para agentes de código, coordenação por um agente mestre, workers especializados, sessões persistentes, contexto compartilhado, worktrees/source control, troca de harness/modelo, uso de limites por provider e chamadas de voz.

## Matriz de implementação

| Feature observada | Metalboard hoje | Próxima implementação |
| --- | --- | --- |
| Canvas infinito | Implementado com tldraw | Manter como superfície principal |
| Terminais e outputs no canvas | Implementado | Sessão persistente agora adicionada |
| CLI interativa, servidor e watch | Execução pontual antes | PTY via shell persistente, input e encerramento |
| Workspace salvo e retomável | IndexedDB + export/import | Reabrir sessões com estado “encerrada” |
| Contexto compartilhado entre panes | Inputs/outputs por referência | Adicionar seleção de contexto por agente |
| Coordenador/master agent | Não implementado | Bloco Agent + runtime de provider |
| Workers especializados | Não implementado | Spawn de subprocessos por tarefa e vínculo ao board |
| Follow-up e stop por agente | Não implementado | Mensagens por sessão e cancelamento gracioso |
| Worktrees e source control | Não implementado | Integração Git local e painel de diff |
| Busca de panes/projetos | Não implementado | Índice local de elementos e atalhos |
| Troca de modelo/harness | Não implementado | Adapter de providers, sem acoplar a um fornecedor |
| Usage/reset por provider | Não implementado | Telemetria local e conectores explícitos |
| Chamada de voz | Não implementado | Fase posterior, dependente de integração de áudio |

## Escopo entregue nesta etapa

O terminal local deixou de ser somente um comando com stdout final. No desktop ele agora inicia uma sessão de shell com pseudo-terminal, mantém stdin aberto e permite:

- iniciar CLIs interativas;
- rodar `npm run dev`, `node --watch`, Vite e servidores;
- enviar comandos subsequentes com Enter ou pelo botão Enviar;
- acompanhar saída contínua no canvas;
- interromper a sessão e matar o grupo de processos;
- fixar o output acumulado como snapshot.

O browser continua protegido: execução local exige o app desktop. A confirmação antes de iniciar uma sessão foi preservada.

## Arquitetura recomendada para as próximas fases

1. **Agent block:** título, provider, modelo/harness, diretório, prompt/contexto e estado.
2. **Coordinator:** painel que lê elementos selecionados e cria/acompanha workers.
3. **Worker runtime:** cada worker com sessão persistente, output, follow-up e cancelamento.
4. **Git/worktree:** criar branch/worktree por tarefa, mostrar diff e checks.
5. **Persistência:** salvar mensagens, estados e referências; nunca salvar secrets no snapshot.

Não foram inventados integrações, limites de providers ou capacidades de agentes que ainda não existem no runtime do Metalboard.
