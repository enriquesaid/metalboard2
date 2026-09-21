import { transform } from "@babel/standalone";
import runtime from "./generated/preview-runtime.js?raw";
export const exampleSource = `function App() {
 const [count, setCount] = React.useState(0)
 return <div style={{padding: 36, fontFamily: 'system-ui', color: '#eff2e9'}}>
 <div style={{fontSize: 11, letterSpacing: 3, color: '#b7da81'}}>EXPERIMENTO 001</div>
 <h1 style={{fontSize: 34, fontWeight: 500, lineHeight: 1.1}}>Pequenas ideias.<br/>Novas possibilidades.</h1>
 <p style={{color: '#999f99', fontSize: 13}}>Um componente vivo, dentro do seu canvas.</p>
 <button onClick={() => setCount(count + 1)} style={{background: '#c3e599', border: 0, borderRadius: 8, padding: '12px 18px', marginTop: 16, cursor: 'pointer'}}>Experimentar ↗ {count > 0 ? count : ''}</button>
 </div>
}`;
export function buildPreview(source: string, language: string, input: unknown = null) {
  if (source.length > 100_000) throw new Error("Limite de 100 KB por bloco.");
  const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src data:; form-action 'none'; base-uri 'none'`;
  const head = `<meta http-equiv="Content-Security-Policy" content="${policy}"><style>html,body{margin:0;min-height:100%;background:#1c2220;color:#e9ede5;font-family:system-ui}*{box-sizing:border-box}button{font:inherit}</style>`;
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
