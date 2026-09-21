import { useEffect, useRef, useState } from "react";
import {
  Tldraw,
  type Editor,
  getSnapshot,
  loadSnapshot,
} from "tldraw";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import { BlockUtil, type BlockShape } from "./shapes";
import { exampleSource } from "./preview";
import { MetalboardToolbar } from "./MetalboardToolbar";
import { DataPanel } from "./DataPanel";
import { installElementIds } from "./dataflow/editor";
import { DataTextUtil, DataGeoUtil, DataNoteUtil, DataArrowUtil } from "./dataflow/native-shapes";
const shapeUtils = [BlockUtil, DataTextUtil, DataGeoUtil, DataNoteUtil, DataArrowUtil];
const components = { Toolbar: MetalboardToolbar, InFrontOfTheCanvas: DataPanel };
export default function App() {
  const [editor, setEditor] = useState<Editor>(),
    [message, setMessage] = useState(""),
    [name, setName] = useState(
      () => localStorage.getItem("metalboard-name") || "Meu próximo fluxo",
    );
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState({ zoom: 100, selected: 0 });
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const zoom = Math.round(editor.getZoomLevel() * 100);
      const selected = editor.getSelectedShapeIds().length;
      setStatus((prev) =>
        prev.zoom === zoom && prev.selected === selected
          ? prev
          : { zoom, selected },
      );
    };
    const unsubscribe = editor.store.listen(() => update(), { scope: "all" });
    update();
    return unsubscribe;
  }, [editor]);
  function notify(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(""), 4500);
  }
  function mount(e: Editor) {
    const cleanup = installElementIds(e);
    setEditor(e);
    e.user.updateUserPreferences({ colorScheme: "dark" });
    e.updateInstanceState({ isGridMode: true });
    if (
      !e.getCurrentPageShapes().length &&
      !localStorage.getItem("metalboard-initialized")
    ) {
      e.createShapes<BlockShape>([
        {
          type: "block",
          x: 100,
          y: 100,
          props: {
            kind: "idea",
            title: "Pense em fluxo",
            content:
              "Construa no mesmo lugar.\n\nIdeias, código e resultados.\nTudo conectado, em um só fluxo.",
            w: 340,
            h: 300,
          },
        },
        {
          type: "block",
          x: 500,
          y: 100,
          props: {
            kind: "terminal",
            title: "Do pensamento ao comando",
            content: "pwd && ls -la",
            w: 440,
            h: 300,
          },
        },
        {
          type: "block",
          x: 1000,
          y: 100,
          props: {
            kind: "code",
            title: "Rascunhe. Renderize.",
            content: exampleSource,
            w: 470,
            h: 395,
          },
        },
        {
          type: "block",
          x: 500,
          y: 460,
          props: {
            kind: "output",
            title: "Seu próximo fluxo começa aqui",
            content:
              "01  Coloque a primeira ideia\n02  Teste no terminal ou numa API\n03  Conecte o resultado ao próximo passo\n04  Transforme o fluxo em preview\n\nArraste pelo cabeçalho para organizar.",
            origin: "Metalboard · um board para pensar e fazer",
            w: 440,
            h: 250,
          },
        },
      ]);
      localStorage.setItem("metalboard-initialized", "true");
      e.zoomToFit();
    }
    return cleanup;
  }
  function exportBoard() {
    if (!editor) return;
    const blob = new Blob(
      [
        JSON.stringify({
          format: "metalboard",
          version: 1,
          name,
          snapshot: getSnapshot(editor.store),
        }),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "metalboard.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Workspace exportado");
  }
  async function importBoard(file?: File) {
    if (!file || !editor) return;
    try {
      if (file.size > 10_000_000) throw new Error("Arquivo acima de 10 MB");
      const data = JSON.parse(await file.text());
      if (data.format !== "metalboard" || data.version !== 1 || !data.snapshot)
        throw new Error("Formato não reconhecido");
      const previous = getSnapshot(editor.store);
      try {
        loadSnapshot(editor.store, data.snapshot);
      } catch (error) {
        loadSnapshot(editor.store, previous);
        throw error;
      }
      if (typeof data.name === "string") {
        setName(data.name);
        localStorage.setItem("metalboard-name", data.name);
      }
      editor.zoomToFit();
      notify("Workspace importado");
    } catch (e) {
      notify(`Não foi possível importar: ${String(e)}`);
    }
  }
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">m</span>metalboard
          <span className="prototype">PROTÓTIPO</span>
        </div>
        <div className="workspace-name">
          <span>/</span>
          <input
            aria-label="Nome do workspace"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              localStorage.setItem("metalboard-name", e.target.value);
            }}
          />
          <span className="local-label">
            <i />
            Local
          </span>
        </div>
        <div className="header-actions">
          <button
            title="Importar substitui o board atual; exporte para manter uma cópia"
            onClick={() => input.current?.click()}
          >
            <ArrowUpFromLine size={14} />
            <span className="btn-label">Importar</span>
          </button>
          <button className="export-button" onClick={exportBoard}>
            <ArrowDownToLine size={14} />
            <span className="btn-label">Exportar board</span>
          </button>
        </div>
      </header>
      <main>
        <div className="canvas-shell">
          <Tldraw
            components={components}
            shapeUtils={shapeUtils}
            persistenceKey="metalboard-v1"
            onMount={mount}
            licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
          />
        </div>
      </main>
      <footer>
        <span>
          <span className="status-dot active" />
          Salvo neste dispositivo
        </span>
        <span>
          {status.zoom}%
          <span className="footer-sep">/</span>
          {status.selected === 0
            ? "Nenhuma seleção"
            : `${status.selected} selecionado${status.selected === 1 ? "" : "s"}`}
        </span>
      </footer>
      {message && (
        <div role="status" className="toast">
          {message}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          void importBoard(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
