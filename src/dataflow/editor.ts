import { type Editor, type TLShape, type TLAssetId, useEditor, useValue } from 'tldraw';
import { config, resolver, type ElementConfig } from './core';
export function allShapes(editor: Editor) { return editor.store.allRecords().filter((r): r is TLShape => r.typeName === 'shape'); }
export function dataResolver(editor: Editor) { return resolver(allShapes(editor), id => editor.getAsset(id as TLAssetId)?.props); }
export function useDataResolver() { const editor = useEditor(); return useValue('element outputs', () => dataResolver(editor), [editor]); }
export function updateMeta(editor: Editor, id: TLShape['id'], patch: Record<string, unknown>) {
  const shape = editor.getShape(id); if (!shape) return;
  editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, ...patch } as TLShape['meta'] });
}
export function updateConfig(editor: Editor, shape: TLShape, patch: Partial<ElementConfig>) { updateMeta(editor, shape.id, { metalboard: { ...config(shape), ...patch } }); }
export function installElementIds(editor: Editor) {
  const assigned = new Map<string, string>();
  let next = 1;
  for (const shape of allShapes(editor)) { const saved = shape.meta.metalboard as ElementConfig | undefined; if (saved?.id) assigned.set(saved.id, shape.id); }
  function withId(shape: TLShape): TLShape {
    const previous = shape.meta.metalboard as ElementConfig | undefined;
    let id = previous?.id;
    const existing = id && assigned.get(id);
    if (!id || (existing && existing !== shape.id && editor.getShape(existing as TLShape['id']))) {
      do { id = `element_${next++}`; } while (assigned.has(id));
    }
    assigned.set(id, shape.id);
    return { ...shape, meta: { ...shape.meta, metalboard: { ...config(shape), id } } };
  }
  editor.run(() => { for (const shape of allShapes(editor)) { const normalized = withId(shape); if (JSON.stringify(normalized.meta) !== JSON.stringify(shape.meta)) editor.updateShape({ id: shape.id, type: shape.type, meta: normalized.meta }); } }, { history: 'ignore' });
  const create = editor.sideEffects.registerBeforeCreateHandler('shape', withId);
  const change = editor.sideEffects.registerBeforeChangeHandler('shape', (_prev, next) => withId(next));
  return () => { create(); change(); };
}
