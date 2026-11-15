import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Tldraw,
  type Editor,
  getSnapshot,
  loadSnapshot,
} from "tldraw";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Grid2X2,
  Scan,
  Minus,
  Plus,
  PanelRight,
} from "lucide-react";
import { BlockUtil, type BlockShape } from "./shapes";
import { exampleSource } from "./preview";
import { MetalboardToolbar } from "./MetalboardToolbar";
import { DataPanel } from "./DataPanel";
import { DataFlowEdges } from "./dataflow/edges-overlay";
import { installElementIds } from "./dataflow/editor";
import { DataTextUtil, DataGeoUtil, DataNoteUtil, DataArrowUtil } from "./dataflow/native-shapes";
import { installScrollThrough } from "./scrollable";
import { desktopAvailable } from "./runtime";
import { createMermaidFromSelection } from "./mermaid-canvas";
import { SelectionActions } from "./SelectionActions";
import { InspectorProvider, useInspector } from "./InspectorContext";
import { EditorChrome, EditorFileActionsContext } from "./EditorChrome";
const shapeUtils = [BlockUtil, DataTextUtil, DataGeoUtil, DataNoteUtil, DataArrowUtil];
const editorOptions = { actionShortcutsLocation: "menu" as const };
const components = {
  MenuPanel: null,
  NavigationPanel: null,
  QuickActions: null,
  ActionsMenu: null,
  Toolbar: MetalboardToolbar,
  InFrontOfTheCanvas: () => (
    <>
      <DataFlowEdges />
      <DataPanel />
      <SelectionActions />
      <EditorChrome />
    </>
  ),
};
type ImportBackup = { name: string; snapshot: ReturnType<typeof getSnapshot> };
export default function App() {
  return <InspectorProvider><Workspace /></InspectorProvider>;
}
function Workspace() {
  const { open: inspectorOpen, setOpen: setInspectorOpen } = useInspector();
  const [editor, setEditor] = useState<Editor>(),
    [message, setMessage] = useState(""),
    [name, setName] = useState(
      () => localStorage.getItem("metalboard-name") || "Meu próximo fluxo",
    );
  const input = useRef<HTMLInputElement>(null);
  const importConfirm = useRef<HTMLButtonElement>(null);
  const [pendingImport, setPendingImport] = useState<File>();
  const [importBackup, setImportBackup] = useState<ImportBackup>();
  const [status, setStatus] = useState({ zoom: 100, selected: 0, grid: true, count: 0 });
  useEffect(() => installScrollThrough(), []);
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const zoom = Math.round(editor.getZoomLevel() * 100);
      const selected = editor.getSelectedShapeIds().length;
      const grid = editor.getInstanceState().isGridMode;
      const count = editor.getCurrentPageShapes().length;
      setStatus((prev) =>
        prev.zoom === zoom && prev.selected === selected && prev.grid === grid && prev.count === count
          ? prev
          : { zoom, selected, grid, count },
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
    e.user.updateUserPreferences({ colorScheme: "light" });
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
  function generateMermaid() {
    if (!editor) return;
    if (!createMermaidFromSelection(editor)) {
      notify("Selecione caixas, notas ou blocos — as setas ligadas entram junto");
      return;
    }
    notify("Mermaid gerado a partir da seleção");
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
      setImportBackup({ name, snapshot: previous });
      setPendingImport(undefined);
      editor.zoomToFit();
      notify("Board importado. Você pode desfazer esta substituição.");
    } catch (e) {
      notify(`Não foi possível importar: ${String(e)}`);
    }
  }
  function undoImport() {
    if (!editor || !importBackup) return;
    loadSnapshot(editor.store, importBackup.snapshot);
    setName(importBackup.name);
    localStorage.setItem("metalboard-name", importBackup.name);
    setImportBackup(undefined);
    editor.zoomToFit();
    notify("Board anterior restaurado");
  }
  useEffect(() => {
    if (!pendingImport) return;
    const frame = requestAnimationFrame(() => importConfirm.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [pendingImport]);
  useEffect(() => {
    if (!desktopAvailable) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void listen<string>("metalboard-menu", ({ payload }) => {
      if (payload === "import") input.current?.click();
      if (payload === "export") exportBoard();
      if (payload === "mermaid") generateMermaid();
    }).then((unlisten) => { if (cancelled) unlisten(); else dispose = unlisten; });
    return () => { cancelled = true; dispose?.(); };
  }, [editor, name]);
  return (
    <EditorFileActionsContext.Provider value={{ importBoard: () => input.current?.click(), exportBoard }}>
    <div className="app" data-skin="hardware">
      <header className="topbar">
        <div className="brand">
          <div id="editor-menu-host" className="editor-chrome editor-menu-host" />
          <span className="brand-logo" role="img" aria-label="Metalboard">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-wordmark" aria-hidden="true" />
          </span>
        </div>
        <div className="workspace-name">
          <input
            id="workspace-name"
            aria-label="Nome do workspace"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              localStorage.setItem("metalboard-name", e.target.value);
            }}
          />
          <span className="local-label">
            <i />
            LOCAL
          </span>
        </div>
        <div id="editor-pages-host" className="editor-chrome editor-pages-host" />
        <div id="editor-history-host" className="editor-chrome editor-history-host" />
        <div className="header-actions">
          <button className="mobile-inspector-toggle" type="button" aria-label="Propriedades" aria-expanded={inspectorOpen} aria-controls="element-inspector" aria-keyshortcuts="Alt+P" title="Propriedades" onClick={() => setInspectorOpen(previous => !previous)}><PanelRight size={14} /></button>
          <button
            className="workspace-import"
            aria-label="Importar board"
            title="Importar substitui o board atual; exporte para manter uma cópia"
            onClick={() => input.current?.click()}
          >
            <ArrowUpFromLine size={14} />
            <span className="btn-label">Importar</span>
          </button>
          <button className="export-button export-button--primary workspace-export" aria-label="Exportar board" onClick={exportBoard}>
            <ArrowDownToLine size={14} />
            <span className="btn-label">Exportar board</span>
          </button>
        </div>
      </header>
      <div id="editor-popups-host" className="editor-chrome workspace-popups" />
      <main aria-label="Canvas do Metalboard">
        <div className="canvas-shell">
          <Tldraw
            components={components}
            options={editorOptions}
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
          <span className="save-label-full">Salvo neste dispositivo</span>
          <span className="save-label-compact">Salvo local</span>
        </span>
        <span className="footer-instrument">{String(status.count).padStart(2, "0")} ELEMENTOS <span className="footer-sep">/</span> CANVAS INFINITO</span>
        <div>
          <span className="footer-selection">
            {status.selected === 0
              ? "Nenhuma seleção"
              : `${status.selected} selecionado${status.selected === 1 ? "" : "s"}`}
          </span>
          <div className="board-controls" role="group" aria-label="Visualização do canvas">
            <button aria-label="Alternar grade" title="Alternar grade" aria-pressed={status.grid} disabled={!editor} onClick={() => editor?.updateInstanceState({ isGridMode: !status.grid })}><Grid2X2 size={14} /><span>Grade</span></button>
            <button aria-label="Enquadrar board" title="Enquadrar board" disabled={!editor} onClick={() => editor?.zoomToFit({ animation: { duration: 200 } })}><Scan size={14} /><span>Enquadrar</span></button>
          </div>
          <div className="zoom-controls" role="group" aria-label="Zoom do canvas">
            <button aria-label="Diminuir zoom" disabled={!editor} onClick={() => editor?.zoomOut()}><Minus size={13} /></button>
            <button className="zoom-readout" title="Restaurar zoom para 100%" aria-label={`Zoom ${status.zoom}%, restaurar para 100%`} disabled={!editor} onClick={() => editor?.resetZoom()}>{status.zoom}%</button>
            <button aria-label="Aumentar zoom" disabled={!editor} onClick={() => editor?.zoomIn()}><Plus size={13} /></button>
          </div>
        </div>
      </footer>
      {message && (
        <div role="status" className="toast">
          {message}
          {importBackup && message.startsWith("Board importado") && <button onClick={undoImport}>Desfazer importação</button>}
        </div>
      )}
      {pendingImport && (
        <div className="app-dialog-backdrop" onMouseDown={() => setPendingImport(undefined)}>
          <div
            className="app-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="import-title"
            aria-describedby="import-description"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setPendingImport(undefined);
              if (event.key === "Tab") {
                const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const next = event.shiftKey ? (index <= 0 ? buttons.length - 1 : index - 1) : (index + 1) % buttons.length;
                event.preventDefault();
                buttons[next]?.focus();
              }
            }}
          >
            <h2 id="import-title">Substituir o board atual?</h2>
            <p id="import-description">O arquivo <strong>{pendingImport.name}</strong> substituirá o conteúdo atual. O Metalboard manterá uma cópia temporária para desfazer a importação.</p>
            <div className="app-dialog-actions">
              <button onClick={() => setPendingImport(undefined)}>Cancelar</button>
              <button ref={importConfirm} className="primary-small" onClick={() => void importBoard(pendingImport)}>Importar e substituir</button>
            </div>
          </div>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setPendingImport(file);
          e.target.value = "";
        }}
      />
    </div>
    </EditorFileActionsContext.Provider>
  );
}
