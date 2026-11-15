import { transform } from "@babel/standalone";
import runtime from "./generated/preview-runtime.js?raw";
export const exampleSource = `function App() {
 const [count, setCount] = React.useState(0)
 return <div style={{padding: 28, color: 'var(--ink)'}}>
 <div style={{fontSize: 10, letterSpacing: 2, color: 'var(--dim)'}}>MB–02 / EXPERIMENTO 001</div>
 <h1 style={{fontSize: 29, fontWeight: 400, letterSpacing: -1.5, lineHeight: 1.2}}>Pequenas ideias.<br/>Novas possibilidades.</h1>
 <p style={{color: 'var(--dim)', fontSize: 12, lineHeight: 1.7}}>Um componente vivo, dentro do seu canvas.</p>
 <button onClick={() => setCount(count + 1)} style={{color: 'var(--key-ink)', background: 'var(--key)', border: '1px solid var(--key-edge)', borderRadius: 4, boxShadow: '0 3px 0 var(--key-edge)', padding: '11px 16px', marginTop: 12, cursor: 'pointer'}}>Experimentar ↗ {count > 0 ? count : ''}</button>
 </div>
}`;
export function buildPreview(source: string, language: string, input: unknown = null) {
  if (source.length > 100_000) throw new Error("Limite de 100 KB por bloco.");
  const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src data:; form-action 'none'; base-uri 'none'`;
  const head = `<meta http-equiv="Content-Security-Policy" content="${policy}"><style>:root{color-scheme:light;--paper:#f3f3f1;--ink:#1d1d1c;--dim:#62625c;--key:#ed5a28;--key-ink:#21130b;--key-edge:#b34118;--font:ui-monospace,monospace}html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink);font-family:var(--font)}*{box-sizing:border-box}button{font:inherit}button:focus-visible{outline:2px solid var(--ink);outline-offset:4px}</style>`;
  const inputJson = JSON.stringify(input ?? null).replace(/</g, '\\u003c');
  if (language === "html")
    return `<!doctype html><html><head>${head}<script>window.input=${inputJson}</script></head><body>${source}</body></html>`;
  const compiled = transform(source, {
    presets: [["react", { runtime: "classic" }], "typescript"],
    filename: "preview.tsx",
  }).code!;
  const script =
    `${runtime}\nconst input=${inputJson};\ntry {${compiled}\nwindow.renderPreview(App, input)} catch(e) {document.body.textContent = 'Erro no preview: ' + e.message}`.replace(
      /<\/script/gi,
      "<\\/script",
    );
  return `<!doctype html><html><head>${head}</head><body><div id="preview-root"></div><script>${script}</script></body></html>`;
}
