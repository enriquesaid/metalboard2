import { TextShapeUtil, GeoShapeUtil, NoteShapeUtil, ArrowShapeUtil, useEditor, useValue, type TLShape, type TLTextShape, type TLGeoShape, type TLNoteShape, type TLArrowShape } from 'tldraw';
import { display } from './core';
import { useDataResolver } from './editor';
function useResolved<S extends TLShape>(shape: S): S {
  const editor = useEditor(), data = useDataResolver();
  const editing = useValue('editing expression', () => editor.getEditingShapeId() === shape.id, [editor,shape.id]);
  if (editing) return shape;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(Object.entries(node).map(([key,value]) => {
      if (key === 'text' && typeof value === 'string') { const result = data.attempt(() => data.text(shape, value)); return [key, result.ok ? display(result.value) : `⚠ ${result.error}`]; }
      return [key, walk(value)];
    }));
  };
  const props = shape.props as Record<string, unknown>;
  return { ...shape, props: { ...props, richText: walk(props.richText) } } as S;
}
export class DataTextUtil extends TextShapeUtil { override component(shape: TLTextShape) { return super.component(useResolved(shape)); } }
export class DataGeoUtil extends GeoShapeUtil { override component(shape: TLGeoShape) { return super.component(useResolved(shape)); } }
export class DataNoteUtil extends NoteShapeUtil { override component(shape: TLNoteShape) { return super.component(useResolved(shape)); } }
export class DataArrowUtil extends ArrowShapeUtil { override component(shape: TLArrowShape) { return super.component(useResolved(shape)); } }
