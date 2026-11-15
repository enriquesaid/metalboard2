import { createContext, useContext, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ContainerProvider,
  DefaultMainMenu,
  DefaultMainMenuContent,
  DefaultPageMenu,
  TldrawUiMenuActionItem,
  TldrawUiMenuContextProvider,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiToolbar,
  useCanRedo,
  useCanUndo,
  useEditor,
} from "tldraw";

export const EditorFileActionsContext = createContext<{
  importBoard: () => void;
  exportBoard: () => void;
} | null>(null);

type Hosts = { menu: HTMLElement; pages: HTMLElement; history: HTMLElement; popups: HTMLElement };

/** Reuse the SDK menus and history, mounted in the app header with unclipped popups. */
export function EditorChrome() {
  const editor = useEditor();
  const files = useContext(EditorFileActionsContext);
  const [hosts, setHosts] = useState<Hosts>();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  useLayoutEffect(() => {
    const app = editor.getContainer().closest<HTMLElement>(".app");
    if (!app) return;
    const menu = app.querySelector<HTMLElement>("#editor-menu-host");
    const pages = app.querySelector<HTMLElement>("#editor-pages-host");
    const history = app.querySelector<HTMLElement>("#editor-history-host");
    const popups = app.querySelector<HTMLElement>("#editor-popups-host");
    if (!menu || !pages || !history || !popups) return;

    // The SDK defines its UI variables on the canvas root. Let the external
    // controls inherit the same values without copying canvas layout styles.
    const computed = getComputedStyle(editor.getContainer());
    const previous = new Map<string, string>();
    for (const property of Array.from(computed)) {
      if (!property.startsWith("--tl-") || property.startsWith("--tl-cursor")) continue;
      previous.set(property, app.style.getPropertyValue(property));
      app.style.setProperty(property, computed.getPropertyValue(property));
    }
    setHosts({ menu, pages, history, popups });
    return () => {
      for (const [property, value] of previous) {
        if (value) app.style.setProperty(property, value);
        else app.style.removeProperty(property);
      }
    };
  }, [editor]);

  if (!hosts || !files) return null;
  return <>
    {createPortal(
      <ContainerProvider container={hosts.popups}>
        <DefaultMainMenu>
          <TldrawUiMenuGroup id="workspace-files">
            <TldrawUiMenuItem id="workspace-import" label="Importar board…" readonlyOk onSelect={files.importBoard} />
            <TldrawUiMenuItem id="workspace-export" label="Exportar board" readonlyOk onSelect={files.exportBoard} />
          </TldrawUiMenuGroup>
          <DefaultMainMenuContent />
        </DefaultMainMenu>
      </ContainerProvider>, hosts.menu, "workspace-menu")}
    {createPortal(
      <ContainerProvider container={hosts.popups}><DefaultPageMenu /></ContainerProvider>,
      hosts.pages, "workspace-pages")}
    {createPortal(
      <ContainerProvider container={hosts.popups}>
      <TldrawUiToolbar label="Histórico" className="header-history-controls" orientation="horizontal">
        <TldrawUiMenuContextProvider type="small-icons" sourceId="quick-actions">
          <TldrawUiMenuActionItem actionId="undo" disabled={!canUndo} />
          <TldrawUiMenuActionItem actionId="redo" disabled={!canRedo} />
        </TldrawUiMenuContextProvider>
      </TldrawUiToolbar>
      </ContainerProvider>, hosts.history, "workspace-history")}
  </>;
}
