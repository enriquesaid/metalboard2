/**
 * Ponte entre o editor do tldraw e o conversor puro de mermaid-export: resolve
 * labels, bounds de página e bindings de seta para o formato neutro que
 * shapesToMermaid consome. (O inverso do botão "Transformar no canvas" do bloco
 * Mermaid, que usa createMermaidDiagram do @tldraw/mermaid.)
 */
import { Mat, type Editor, type TLShape, type TLShapeId } from "tldraw";
import { plainTextFromRichText, shapesToMermaid, type MermaidShapeInput } from "./mermaid-export";

export const MERMAID_NODE_TYPES = new Set(["block", "geo", "note", "text"]);

function shapeLabel(shape: TLShape): string {
  const props = shape.props as Record<string, unknown>;
  if (shape.type === "block") return String(props.title ?? "");
  if (shape.type === "frame") return String(props.name ?? "");
  return plainTextFromRichText(props.richText) || (typeof props.text === "string" ? props.text : "");
}

/** Nó que entra na exportação: tipo convertível e com algum texto visível. */
export function shapeHasMermaidText(shape: TLShape): boolean {
  return MERMAID_NODE_TYPES.has(shape.type) && shapeLabel(shape).trim().length > 0;
}

function pagePoint(editor: Editor, shapeId: TLShapeId, point: { x: number; y: number }) {
  try {
    return Mat.applyToPoint(editor.getShapePageTransform(shapeId), point);
  } catch {
    return point;
  }
}

export function shapeToMermaidInput(editor: Editor, shape: TLShape): MermaidShapeInput {
  const box = editor.getShapePageBounds(shape);
  const props = shape.props as Record<string, unknown>;
  const label = shapeLabel(shape);
  const input: MermaidShapeInput = {
    id: shape.id,
    type: shape.type,
    parentId: shape.parentId,
    label,
    bounds: box ? { x: box.x, y: box.y, w: box.w, h: box.h } : undefined,
  };
  if (typeof props.geo === "string") input.geo = props.geo;
  if (shape.type === "arrow") {
    for (const key of ["arrowheadStart", "arrowheadEnd", "dash", "size"] as const) {
      if (typeof props[key] === "string") input[key] = props[key] as string;
    }
    const terminals = props as { start?: { x: number; y: number }; end?: { x: number; y: number } };
    const links: NonNullable<MermaidShapeInput["links"]> = {};
    if (terminals.start) links.start = { point: pagePoint(editor, shape.id, terminals.start) };
    if (terminals.end) links.end = { point: pagePoint(editor, shape.id, terminals.end) };
    for (const binding of editor.getBindingsInvolvingShape(shape, "arrow")) {
      if (binding.fromId !== shape.id) continue;
      const terminal = (binding.props as { terminal?: string }).terminal;
      if (terminal === "start") links.start = { toId: binding.toId };
      else if (terminal === "end") links.end = { toId: binding.toId };
    }
    input.links = links;
  }
  return input;
}

/**
 * Converte a seleção atual em código Mermaid. Frames e grupos selecionados
 * entram com seus descendentes; setas não selecionadas cujas duas pontas
 * apontam para o conjunto também entram, para bastar selecionar as caixas.
 */
export function selectionToMermaid(editor: Editor): string {
  const ids = editor.getShapeAndDescendantIds(editor.getSelectedShapeIds());
  const shapes = [...ids]
    .map((id) => editor.getShape(id))
    .filter((shape): shape is TLShape => !!shape);
  const containers = new Set(
    shapes.filter((s) => MERMAID_NODE_TYPES.has(s.type) || s.type === "frame").map((s) => s.id),
  );
  const inputs = shapes.map((shape) => shapeToMermaidInput(editor, shape));
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== "arrow" || ids.has(shape.id)) continue;
    const bound = editor
      .getBindingsInvolvingShape(shape, "arrow")
      .filter((b) => b.fromId === shape.id)
      .map((b) => b.toId);
    if (bound.length >= 2 && bound.every((toId) => containers.has(toId))) {
      inputs.push(shapeToMermaidInput(editor, shape));
    }
  }
  return shapesToMermaid(inputs);
}
