# Metalboard

Protótipo desktop de canvas infinito com tldraw, React e Tauri. Requer Node 22+, Rust e ferramentas de desenvolvimento macOS.

```sh
npm install
npm run dev       # canvas no navegador em http://localhost:1420
npm run desktop   # app desktop com execução real de comandos
npm run build     # verificação TypeScript e build web
```

Para iniciar `npm run desktop`, encerre primeiro qualquer `npm run dev` já usando a porta 1420; o Tauri inicia seu próprio servidor. `npm test` executa os quatro testes do preview; `cargo test --manifest-path src-tauri/Cargo.toml` executa os três testes do shell nativo.

Use a barra lateral para criar notas, terminais e componentes. A barra nativa do tldraw, na parte inferior, oferece seleção, desenho livre, borracha, setas, texto, notas e formas (incluindo ferramentas adicionais no menu de expansão). O painel de estilos permite ajustar cores, traços, preenchimento e tamanho. Menus nativos, atalhos, zoom, páginas e ações de seleção também estão disponíveis. Arraste os blocos pelo cabeçalho. Comandos exigem confirmação e só executam no desktop. Diretório vazio usa o diretório de trabalho do aplicativo. A execução é um processo zsh independente, sem stdin; saída é transmitida e pode ser fixada no canvas. Interromper encerra o grupo de processos.

No bloco React, declare `function App()` e use `React.useState`, etc. Clique em Renderizar após editar. React é empacotado localmente; imports npm arbitrários não são suportados. HTML e TSX são renderizados em iframe sem same-origin, com CSP que bloqueia rede e sem permissões de APIs Tauri. Código com loops infinitos ainda pode travar a WebView: este protótipo é para código próprio, não hospedagem de código hostil.

Dados do board ficam no IndexedDB da origem/dispositivo. Exportar gera JSON versionado; importar substitui o board atual. Exporte antes de importar se quiser guardar uma cópia. Outputs podem conter informações confidenciais. A saída em streaming é limitada aos últimos 100 mil caracteres no cliente; apenas outputs fixados persistem. Sessões não são restauradas ao reabrir.

## Limites deste protótipo

- macOS, sem instalador assinado.
- Execução por comando com pipes, não terminal PTY interativo; stdout/stderr aparecem mesclados.
- Conexão remota/WebSocket, colaboração, props de preview, timeouts de execução e migrações de futuras versões ficam para a próxima etapa.
- Sem conta, sincronização cloud ou telemetria própria.
- Licença tldraw necessária para distribuição de produção conforme os termos do SDK. Configure `VITE_TLDRAW_LICENSE_KEY` quando aplicável.

Os cards iniciais contêm uma nota, um comando não executado, um componente interativo e um guia explicitamente ilustrativo.
