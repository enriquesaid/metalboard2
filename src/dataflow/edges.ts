// Grafo de dependências: quais elementos consomem quais via referências %id%.
// Puro (sem React/tldraw) para rodar em testes node — a parte visual fica em edges-overlay.tsx.
import { config, unescapeMarkdown, type DataShape } from './core';

const referencePattern = /%([A-Za-z0-9_-]+)((?:\.[\w-]+|\[\d+\])*)%/g;
const reservedTokens = new Set(['input', 'value']);
// Subobjetos de meta que guardam configuração do usuário; execution/httpResponse/scrape
// são resultados de execução e podem conter "%algo%" arbitrário vindo de APIs.
const configScopes = ['metalboard', 'fetch', 'embed'];
// Props de bloco exibidas mas nunca interpoladas pelo resolver.
const displayOnlyProps = new Set(['title', 'origin']);

export function references(value: unknown, found: Set<string> = new Set(), skip?: Set<string>): Set<string> {
  if (typeof value === 'string') {
    // Desscapear antes de casar: o editor de documentos grava %element\_3% e o
    // resolver interpola o texto sem escapes — o scanner precisa ver o mesmo.
    for (const match of unescapeMarkdown(value).matchAll(referencePattern)) found.add(match[1]);
  } else if (Array.isArray(value)) {
    for (const item of value) references(item, found, skip);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (skip?.has(key)) continue;
      references(child, found, skip);
    }
  }
  return found;
}

export function referencesOf(shape: DataShape): Set<string> {
  const found = new Set<string>();
  for (const scope of configScopes) {
    const value = (shape.meta as Record<string, unknown> | undefined)?.[scope];
    if (value !== undefined) references(value, found);
  }
  references(shape.props, found, displayOnlyProps);
  return found;
}

export type DependencyEdge = { source: string; consumer: string; refs: string[] };

export function dependencyEdges(shapes: DataShape[]): DependencyEdge[] {
  const byAlias = new Map<string, string>();
  const duplicated = new Set<string>();
  for (const shape of shapes) {
    const alias = config(shape).id;
    if (byAlias.has(alias)) duplicated.add(alias);
    else byAlias.set(alias, shape.id);
  }
  const index = new Map<string, DependencyEdge>();
  for (const consumer of shapes) {
    for (const alias of referencesOf(consumer)) {
      if (reservedTokens.has(alias) || duplicated.has(alias)) continue;
      const source = byAlias.get(alias);
      if (!source || source === consumer.id) continue;
      const key = `${source}>${consumer.id}`;
      let edge = index.get(key);
      if (!edge) index.set(key, (edge = { source, consumer: consumer.id, refs: [] }));
      if (!edge.refs.includes(alias)) edge.refs.push(alias);
    }
  }
  return [...index.values()];
}

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

function center(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

// Ponto onde o raio center→target cruza a borda de box.
function exitPoint(box: Box, target: Point): Point {
  const c = center(box);
  const dx = target.x - c.x, dy = target.y - c.y;
  if (dx === 0 && dy === 0) return { x: c.x, y: box.y };
  const tx = dx > 0 ? (box.x + box.w - c.x) / dx : dx < 0 ? (box.x - c.x) / dx : Infinity;
  const ty = dy > 0 ? (box.y + box.h - c.y) / dy : dy < 0 ? (box.y - c.y) / dy : Infinity;
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

// Âncoras de uma seta source→consumer: saem da borda de `from` e param um
// respiro antes da borda de `to`, na direção centro-a-centro.
export function edgeAnchors(from: Box, to: Box, gap = 8): { start: Point; end: Point } {
  const start = exitPoint(from, center(to));
  const end = exitPoint(to, center(from));
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length > 2 * gap + 1) {
    const ux = (end.x - start.x) / length, uy = (end.y - start.y) / length;
    return {
      start: { x: start.x + ux * gap, y: start.y + uy * gap },
      end: { x: end.x - ux * (gap + 1), y: end.y - uy * (gap + 1) },
    };
  }
  return { start, end };
}
