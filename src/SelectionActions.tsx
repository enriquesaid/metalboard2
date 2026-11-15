import { GitBranch } from "lucide-react";
import { DefaultActionsMenu, TldrawUiMenuActionItem, TldrawUiMenuContextProvider, TldrawUiToolbar, useEditor, useUnlockedSelectedShapesCount, useValue } from "tldraw";
import { createMermaidFromSelection, shapeHasMermaidText } from "./mermaid-canvas";

/** Canvas coordinates keep this action attached to the current selection. */
export function SelectionActions() {
  const editor = useEditor();
  const hasUnlockedSelection = useUnlockedSelectedShapesCount(1);
  const selection = useValue("selection actions", () => {
    if (editor.getIsReadonly() || editor.getEditingShapeId() || !editor.isIn("select.idle")) return null;
    const ids = editor.getSelectedShapeIds();
    const onlyShape = editor.getOnlySelectedShape();
    const isMermaid = onlyShape?.type === "block" && (onlyShape.props as { kind?: string }).kind === "mermaid";
    const hasText = [...editor.getShapeAndDescendantIds(ids)].some(id => {
      const shape = editor.getShape(id);
      return shape && shapeHasMermaidText(shape);
    });
    const bounds = editor.getSelectionPageBounds();
    if (!ids.length || !bounds) return null;
    const canGenerate = hasText && !isMermaid;
    const viewport = editor.getViewportScreenBounds();
    const start = editor.pageToViewport({ x: bounds.minX, y: bounds.minY });
    const end = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY });
    if (end.x < 0 || end.y < 0 || start.x > viewport.w || start.y > viewport.h) return null;
    const width = Math.min(canGenerate ? 344 : 220, viewport.w - 24);
    const top = start.y >= 62 ? start.y - 50 : end.y + 12;
    return {
      count: ids.length,
      canGenerate,
      width,
      left: Math.max(12, Math.min(start.x, viewport.w - width - 12)),
      top: Math.max(12, Math.min(top, viewport.h - 240)),
    };
  }, [editor]);

  if (!selection) return null;
  return (
    <div
      className="selection-actions"
      role="group"
      aria-label="Ações da seleção"
      style={{ left: selection.left, top: selection.top, width: selection.width }}
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
    >
      <span className="selection-count">{selection.count} {selection.count === 1 ? "elemento" : "elementos"}</span>
      <TldrawUiToolbar label="Editar seleção" className="selection-native-actions" orientation="horizontal">
        <TldrawUiMenuContextProvider type="small-icons" sourceId="quick-actions">
          <TldrawUiMenuActionItem actionId="duplicate" disabled={!hasUnlockedSelection} />
          <TldrawUiMenuActionItem actionId="delete" disabled={!hasUnlockedSelection} />
        </TldrawUiMenuContextProvider>
        <DefaultActionsMenu />
      </TldrawUiToolbar>
      {selection.canGenerate &&
      <button
        className="ui-action"
        title="Criar um bloco Mermaid a partir da seleção e das setas conectadas"
        onClick={() => {
          createMermaidFromSelection(editor);
          editor.focus();
        }}
      >
        <GitBranch size={14} />
        Gerar Mermaid
      </button>}
    </div>
  );
}
