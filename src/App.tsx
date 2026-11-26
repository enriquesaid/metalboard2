import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  type Editor,
  getSnapshot,
} from "tldraw";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Grid2X2,
  Scan,
  Minus,
  Plus,
  PanelRight,
  BookOpen,
  ArrowLeft,
  X,
} from "lucide-react";
import { BlockUtil } from "./shapes";
import { BoardCanvas, type CanvasIssue } from "./BoardCanvas";
import { boardHref, BoardStart, BoardStylePanel, DemoGuide } from "./BoardStart";
import { BOARD_PERSISTENCE_KEY, downloadBoardFile, parseBoardFile, readOpenBoard, readSavedBoard, replaceBoardSnapshot } from "./board-file";
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
import { demoNames, seedDemo, type DemoId } from "./demos";
import "tldraw/tldraw.css";
import "./style.css";
import "./dataflow.css";
import "./hardware.css";
const shapeUtils = [BlockUtil, DataTextUtil, DataGeoUtil, DataNoteUtil, DataArrowUtil];
const editorOptions = { actionShortcutsLocation: "menu" as const };
function CanvasOverlays() {
  return <>
    <DataFlowEdges />
    <DataPanel />
    <SelectionActions />
    <EditorChrome />
  </>;
}
const components = {
  MenuPanel: null,
  NavigationPanel: null,
  QuickActions: null,
  ActionsMenu: null,
  Toolbar: MetalboardToolbar,
  StylePanel: BoardStylePanel,
  InFrontOfTheCanvas: () => (
    <>
      <BoardStart />
      <CanvasOverlays />
    </>
  ),
};
const demoComponents = { ...components, InFrontOfTheCanvas: CanvasOverlays };

type ImportBackup = { name: string; snapshot: ReturnType<typeof getSnapshot> };
type OpenBoardResult = { status: "selected"; name: string; json: string } | { status: "cancelled" | "unsupported" };
export default function App({ demo }: { demo?: DemoId }) {
  return <InspectorProvider><Workspace demo={demo} /></InspectorProvider>;
}
function Workspace({ demo }: { demo?: DemoId }) {
  const { open: inspectorOpen, setOpen: setInspectorOpen } = useInspector();
  const [editor, setEditor] = useState<Editor>(),
    [canvasIssue, setCanvasIssue] = useState<CanvasIssue>(),
    [message, setMessage] = useState(""),
    [storageWarning, setStorageWarning] = useState(""),
    [name, setName] = useState(() => {
      if (demo) return demoNames[demo];
      try {
        const originalName = localStorage.getItem("metalboard-initialized") ? "Meu próximo fluxo" : "Meu board";
        return localStorage.getItem("metalboard-name") ?? originalName;
      } catch {
        return "Meu board";
      }
    });
  const onCanvasUnavailable = useCallback((issue: CanvasIssue) => {
    setCanvasIssue(issue);
    setEditor(undefined);
    setPendingImport(undefined);
    setImportBackup(undefined);
    setStorageWarning("");
    setInspectorOpen(false);
  }, [setInspectorOpen]);
  const input = useRef<HTMLInputElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const importTrigger = useRef<HTMLElement>(null);
  const cancelImport = useRef<HTMLButtonElement>(null);
  const fileDialog = useRef<HTMLDialogElement>(null);
  const busyMessage = useRef<HTMLParagraphElement>(null);
  const [pendingImport, setPendingImport] = useState<File>();
  const [replacingBoard, setReplacingBoard] = useState(false);
  const fileActionInFlight = useRef(false);
  const [importBackup, setImportBackup] = useState<ImportBackup>();
  const toastMessage = message || storageWarning || (importBackup ? "Board importado." : "");
  const [status, setStatus] = useState({ zoom: 100, selected: 0, grid: true, count: 0 });
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  useEffect(() => installScrollThrough(), []);
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const zoom = Math.round(editor.getZoomLevel() * 100);
      const selected = editor.getSelectedShapeIds().length;
      const grid = editor.getInstanceState().isGridMode;
      const count = editor.getCurrentPageShapeIds().size;
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
    clearTimeout(noticeTimer.current);
    setMessage(text);
    noticeTimer.current = setTimeout(() => setMessage(""), 4500);
  }
  function updateBoardName(nextName: string) {
    setName(nextName);
    if (demo) return true;
    try {
      localStorage.setItem("metalboard-name", nextName);
      return true;
    } catch {
      return false;
    }
  }
  function notifyReplacement(title: string, saved: boolean, nameSaved: boolean) {
    const warning = saved ? "" : "Gravação local pendente. Exporte uma cópia antes de sair.";
    const nameWarning = nameSaved ? "" : "Falha ao salvar o nome neste dispositivo.";
    setStorageWarning(warning);
    notify([title, nameWarning, warning].filter(Boolean).join(" "));
  }
  function mount(e: Editor) {
    const cleanup = installElementIds(e);
    setEditor(e);
    e.user.updateUserPreferences({ colorScheme: "light" });
    if (demo) {
      e.updateInstanceState({ isGridMode: true });
      seedDemo(e, demo);
    }
    return () => {
      cleanup();
      setEditor(current => current === e ? undefined : current);
    };
  }
  function generateMermaid() {
    if (!editor) return;
    if (!createMermaidFromSelection(editor)) {
      notify("Selecione caixas, notas ou blocos — as setas ligadas entram junto");
      return;
    }
    notify("Mermaid gerado a partir da seleção");
  }
  async function requestImport(trigger = document.activeElement) {
    if (!editor || pendingImport || fileActionInFlight.current) return;
    importTrigger.current = trigger instanceof HTMLElement ? trigger : null;
    if (!desktopAvailable) {
      input.current?.click();
      return;
    }

    fileActionInFlight.current = true;
    try {
      const result = await invoke<OpenBoardResult>("open_board_json");
      if (editor.isDisposed) return;
      if (result.status === "selected") {
        setPendingImport(new File([result.json], result.name, { type: "application/json" }));
      } else if (result.status === "unsupported") {
        input.current?.click();
      }
    } catch (error) {
      notify(`Não foi possível abrir o arquivo. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      fileActionInFlight.current = false;
    }
  }
  async function exportBoard() {
    if (pendingImport || fileActionInFlight.current) return;
    fileActionInFlight.current = true;
    try {
      const board = editor
        ? await readOpenBoard(editor, name)
        : !demo && canvasIssue ? await readSavedBoard(name) : null;
      if (!board) {
        notify("Nenhum board salvo foi encontrado neste dispositivo.");
        return;
      }
      if (await downloadBoardFile(board)) notify("Cópia do board exportada.");
    } catch (error) {
      notify(`Não foi possível exportar. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      fileActionInFlight.current = false;
    }
  }
  async function importBoard(file?: File) {
    if (!file || !editor || fileActionInFlight.current) return;
    fileActionInFlight.current = true;
    setReplacingBoard(true);
    try {
      const json = await file.text();
      if (editor.isDisposed) return;
      const data = parseBoardFile(json, editor);
      const previous = getSnapshot(editor.store);
      const saved = await replaceBoardSnapshot(editor, data.snapshot, !demo);
      if (editor.isDisposed) return;
      const nameSaved = data.name === undefined || updateBoardName(data.name);
      setImportBackup({ name, snapshot: previous });
      editor.zoomToFit();
      notifyReplacement("Board importado.", saved, nameSaved);
    } catch (error) {
      notify(`Não foi possível importar. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPendingImport(undefined);
      fileActionInFlight.current = false;
      setReplacingBoard(false);
    }
  }
  async function undoImport() {
    if (!editor || !importBackup || pendingImport || fileActionInFlight.current) return;
    importTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    fileActionInFlight.current = true;
    setReplacingBoard(true);
    try {
      const saved = await replaceBoardSnapshot(editor, importBackup.snapshot, !demo);
      if (editor.isDisposed) return;
      const nameSaved = updateBoardName(importBackup.name);
      setImportBackup(undefined);
      notifyReplacement("Board anterior restaurado.", saved, nameSaved);
    } catch (error) {
      notify(`Não foi possível restaurar o board. ${String(error)}`);
    } finally {
      fileActionInFlight.current = false;
      setReplacingBoard(false);
    }
  }
  useEffect(() => {
    if (!editor || !importBackup) return;
    return editor.store.listen(() => setImportBackup(undefined), { scope: "document" });
  }, [editor, importBackup]);
  useLayoutEffect(() => {
    const dialog = fileDialog.current;
    if (!dialog) return;
    if (replacingBoard || pendingImport) {
      if (!dialog.open) dialog.showModal();
      (replacingBoard ? busyMessage.current : cancelImport.current)?.focus();
    } else if (dialog.open) {
      dialog.close();
      const trigger = importTrigger.current;
      importTrigger.current = null;
      if (trigger?.isConnected) trigger.focus();
      if (document.activeElement === document.body) importButton.current?.focus();
      if (document.activeElement === document.body) editor?.focus();
    }
  }, [editor, pendingImport, replacingBoard]);
  const handleNativeMenu = useEffectEvent((payload: string) => {
    if (pendingImport || fileActionInFlight.current) return;
    if (payload === "import") void requestImport();
    if (payload === "export" && (editor || (canvasIssue && !demo))) void exportBoard();
    if (payload === "mermaid") generateMermaid();
  });
  useEffect(() => {
    if (!desktopAvailable) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void listen<string>("metalboard-menu", ({ payload }) => {
      if (!cancelled) handleNativeMenu(payload);
    }).then((unlisten) => { if (cancelled) unlisten(); else dispose = unlisten; });
    return () => { cancelled = true; dispose?.(); };
  }, []);
  return (
    <EditorFileActionsContext.Provider value={{ importBoard: () => void requestImport(), exportBoard, demo }}>
    <div className="app" data-skin="hardware" data-demo={demo || undefined}>
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
            aria-label="Nome do board"
            value={name}
            readOnly={!editor}
            onChange={(e) => {
              setImportBackup(undefined);
              if (!updateBoardName(e.target.value)) notify("Não foi possível salvar o nome do board neste dispositivo.");
            }}
          />
          <span className="local-label">
            <i />
            {demo ? 'DEMO' : 'LOCAL'}
          </span>
        </div>
        <div id="editor-pages-host" className="editor-chrome editor-pages-host" />
        <div id="editor-history-host" className="editor-chrome editor-history-host" />
        <div className="header-actions">
          {demo && <a className="demo-return" href={boardHref()}><ArrowLeft size={14} aria-hidden="true" /> Meu board</a>}
          {editor && <>
            {!demo && <a className="workspace-example" href={boardHref("checkout")} aria-label="Explorar exemplos" title="Explorar exemplos"><BookOpen size={16} aria-hidden="true" /><span>Exemplos</span></a>}
            <button className="mobile-inspector-toggle" type="button" aria-label="Propriedades" aria-expanded={inspectorOpen} aria-controls="element-inspector" aria-keyshortcuts="Alt+P" title="Propriedades" onClick={() => setInspectorOpen(previous => !previous)}><PanelRight size={14} /></button>
            <button
              ref={importButton}
              className="workspace-import"
              aria-label="Importar board"
              title="Importar substitui o board atual; exporte para manter uma cópia"
              onClick={(event) => void requestImport(event.currentTarget)}
            >
              <ArrowUpFromLine size={14} />
              <span className="btn-label">Importar</span>
            </button>
            <button className="workspace-export" aria-label="Exportar board" onClick={exportBoard}>
              <ArrowDownToLine size={14} />
              <span className="btn-label">Exportar board</span>
            </button>
          </>}
        </div>
      </header>
      {demo && !canvasIssue && <DemoGuide demo={demo} />}
      <div id="editor-popups-host" className="editor-chrome workspace-popups" />
      <main aria-label="Canvas do Metalboard">
        <div className="canvas-shell">
          <BoardCanvas
            issue={canvasIssue}
            onUnavailable={onCanvasUnavailable}
            onExportBackup={demo ? undefined : exportBoard}
            components={demo ? demoComponents : components}
            options={editorOptions}
            shapeUtils={shapeUtils}
            persistenceKey={demo ? undefined : BOARD_PERSISTENCE_KEY}
            onMount={mount}
            licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
          />
        </div>
      </main>
      <footer>
        <span>
          <span className={editor ? "status-dot active" : "status-dot"} />
          {replacingBoard ? "Salvando alterações…" : editor ? <>
            <span className="save-label-full">{demo ? "Exemplo temporário · exporte para guardar" : "Armazenamento local"}</span>
            <span className="save-label-compact">{demo ? "Exemplo temporário" : "Board local"}</span>
          </> : canvasIssue ? "Editor indisponível" : "Abrindo board…"}
        </span>
        {editor && !replacingBoard && <>
          <span className="footer-instrument">{status.count} {status.count === 1 ? "elemento" : "elementos"}</span>
          <div>
            <span className="footer-selection">
              {status.selected === 0
                ? "Nenhuma seleção"
                : `${status.selected} selecionado${status.selected === 1 ? "" : "s"}`}
            </span>
            <div className="board-controls" role="group" aria-label="Visualização do canvas">
              <button aria-label="Alternar grade" title="Alternar grade" aria-pressed={status.grid} onClick={() => editor.updateInstanceState({ isGridMode: !status.grid })}><Grid2X2 size={14} /><span>Grade</span></button>
              <button aria-label="Enquadrar board" title="Enquadrar board" onClick={() => editor.zoomToFit({ animation: { duration: 200 } })}><Scan size={14} /><span>Enquadrar</span></button>
            </div>
            <div className="zoom-controls" role="group" aria-label="Zoom do canvas">
              <button aria-label="Diminuir zoom" onClick={() => editor.zoomOut()}><Minus size={13} /></button>
              <button className="zoom-readout" title="Restaurar zoom para 100%" aria-label={`Zoom ${status.zoom}%, restaurar para 100%`} onClick={() => editor.resetZoom()}>{status.zoom}%</button>
              <button aria-label="Aumentar zoom" onClick={() => editor.zoomIn()}><Plus size={13} /></button>
            </div>
          </div>
        </>}
      </footer>
      {toastMessage && (
        <div className="toast">
          <span role="status">{toastMessage}</span>
          {importBackup && <>
            <button type="button" onClick={undoImport}>Desfazer importação</button>
            <button type="button" aria-label="Dispensar aviso de importação" onClick={() => setImportBackup(undefined)}><X size={14} aria-hidden="true" /></button>
          </>}
        </div>
      )}
      <dialog
        className="app-dialog"
        ref={fileDialog}
        role={replacingBoard ? undefined : "alertdialog"}
        aria-labelledby="board-file-title"
        aria-describedby={replacingBoard ? undefined : "import-description"}
        onCancel={(event) => {
          event.preventDefault();
          if (!replacingBoard) setPendingImport(undefined);
        }}
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
      >
        {replacingBoard ? (
          <p id="board-file-title" ref={busyMessage} tabIndex={-1} role="status">Salvando alterações no board…</p>
        ) : pendingImport && <>
          <h2 id="board-file-title">Substituir o board atual?</h2>
          <p id="import-description">O arquivo <strong>{pendingImport.name}</strong> substituirá o conteúdo atual. Você pode desfazer a importação antes de editar o board.</p>
          <div className="app-dialog-actions">
            <button type="button" ref={cancelImport} onClick={() => setPendingImport(undefined)}>Cancelar</button>
            <button type="button" className="primary-small" onClick={() => void importBoard(pendingImport)}>Importar e substituir</button>
          </div>
        </>}
      </dialog>
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
