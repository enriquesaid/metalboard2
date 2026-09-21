export type DataShape = { id: string; type: string; parentId?: string; props: object; meta: Record<string, unknown> };
export type OutputConfig = { source: 'default' | 'input' | 'value'; value: string; parseJson: boolean; path: string; mapPath: string; template: string };
export type ElementConfig = { id: string; input: string; output: OutputConfig };
export const defaultOutput: OutputConfig = { source: 'default', value: '', parseJson: false, path: '', mapPath: '', template: '' };
export function config(shape: DataShape): ElementConfig {
  const meta = shape.meta.metalboard as Partial<ElementConfig> | undefined;
  return { id: meta?.id || shape.id.replace(/^shape:/, ''), input: meta?.input || '', output: { ...defaultOutput, ...meta?.output } };
}
export function display(value: unknown): string { return typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? 'null'; }
export function plainText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { text?: string; type?: string; content?: unknown[] };
  if (n.text !== undefined) return n.text;
  if (n.type === 'hardBreak') return '\n';
  return (n.content || []).map(plainText).join(n.type === 'doc' ? '\n' : '');
}
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function selectPath(value: unknown, path: string): unknown {
  if (!path.trim() || path === '$') return value;
  const normalized = path.replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');
  if (!/^[\w-]+(?:\.[\w-]+)*$/.test(normalized)) throw new Error(`Caminho inválido: ${path}. Use users[0].name.`);
  for (const key of normalized.split('.')) {
    if (forbidden.has(key)) throw new Error('Propriedade não permitida.');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error(`Campo não encontrado: ${path}`);
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
const pattern = /%([A-Za-z0-9_-]+)((?:\.[\w-]+|\[\d+\])*)%/g;
export type Result = { ok: true; value: unknown } | { ok: false; error: string };
export function resolver(shapes: DataShape[], asset?: (id: string) => unknown) {
  const byAlias = new Map<string, DataShape>();
  const duplicates = new Set<string>();
  for (const shape of shapes) { const id = config(shape).id; if (byAlias.has(id)) duplicates.add(id); byAlias.set(id, shape); }
  const cache = new Map<string, unknown>();
  function interpolate(source: string, stack: string[] = [], locals: Record<string, unknown> = {}): unknown {
    const read = (id: string, path: string) => {
      if (Object.hasOwn(locals, id)) return selectPath(locals[id], path);
      if (duplicates.has(id)) throw new Error(`ID duplicado: ${id}`);
      const target = byAlias.get(id);
      if (!target) throw new Error(`Elemento não encontrado: ${id}`);
      return selectPath(output(target, stack), path);
    };
    const matches = [...source.matchAll(pattern)];
    if (matches.length === 1 && matches[0][0] === source) return read(matches[0][1], matches[0][2]);
    return source.replace(pattern, (_, id, path) => display(read(id, path)));
  }
  function resolveTree(value: unknown, stack: string[], locals: Record<string, unknown> = {}): unknown {
    if (typeof value === 'string') return interpolate(value, stack, locals);
    if (Array.isArray(value)) return value.map(v => resolveTree(v, stack, locals));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTree(v, stack, locals)]));
    return value;
  }
  function raw(shape: DataShape, stack: string[]): unknown {
    const p = shape.props as Record<string, unknown>;
    const text = (source: string) => interpolate(source, stack, source.includes('%input') ? { input: input(shape, stack) } : {});
    if (shape.type === 'block') {
      if (p.kind === 'fetch' || p.kind === 'terminal') {
        const run = shape.meta.execution as { status: string; value?: unknown; error?: string } | undefined;
        if (!run || run.status !== 'success') throw new Error(run?.error || (run?.status === 'running' ? 'Execução em andamento.' : 'Execute o elemento para produzir um output.'));
        return run.value;
      }
      return text(String(p.content || ''));
    }
    if (p.richText) return text(plainText(p.richText));
    if (typeof p.text === 'string') return text(p.text);
    if (p.assetId) {
      const props = asset?.(String(p.assetId)) as { src?: string } | undefined;
      return props?.src || p.assetId;
    }
    if (typeof p.url === 'string') return text(p.url);
    if (shape.type === 'group') return shapes.filter(s => s.parentId === shape.id).map(s => output(s, stack));
    if (p.name !== undefined) return text(String(p.name));
    return resolveTree(p, stack);
  }
  function input(shape: DataShape, stack: string[] = []): unknown {
    return interpolate(config(shape).input, [...stack, shape.id]);
  }
  function output(shape: DataShape, stack: string[] = []): unknown {
    if (stack.includes(shape.id)) throw new Error(`Referência circular: ${[...stack, shape.id].map(id => config(shapes.find(s => s.id === id)!).id).join(' → ')}`);
    if (stack.length > 40) throw new Error('Limite de 40 dependências encadeadas.');
    if (cache.has(shape.id)) return cache.get(shape.id);
    const next = [...stack, shape.id], options = config(shape).output;
    let value = options.source === 'input' ? input(shape, stack) : options.source === 'value' ? interpolate(options.value, next, options.value.includes('%input') ? { input: input(shape, stack) } : {}) : raw(shape, next);
    if (options.parseJson) { if (typeof value !== 'string') throw new Error('Converter JSON exige texto.'); value = JSON.parse(value); }
    value = selectPath(value, options.path);
    if (options.mapPath) { if (!Array.isArray(value)) throw new Error('Mapear campo exige um array.'); value = value.map(item => selectPath(item, options.mapPath)); }
    if (options.template) value = interpolate(options.template, next, { value });
    cache.set(shape.id, value);
    return value;
  }
  function attempt(action: () => unknown): Result { try { return { ok: true, value: action() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } }
  return { output, input, interpolate, text: (shape: DataShape, source: string) => interpolate(source, [shape.id], source.includes('%input') ? { input: input(shape) } : {}), resolveTree: (value: unknown, locals = {}) => resolveTree(value, [], locals), result: (shape: DataShape) => attempt(() => output(shape)), attempt };
}
