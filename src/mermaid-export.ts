/**
 * Converte um conjunto de shapes do canvas em código Mermaid (flowchart) — o
 * caminho inverso do `createMermaidDiagram` do @tldraw/mermaid, que vai de
 * Mermaid para shapes. Módulo puro, sem dependência do tldraw, para ser
 * testável direto no Node.
 */

export interface MermaidPoint {
  x: number;
  y: number;
}

export interface MermaidTerminal {
  /** Id do shape ligado (binding). Ausente = terminal livre. */
  toId?: string;
  /** Posição do terminal livre no espaço da página, usada para achar o nó mais próximo. */
  point?: MermaidPoint;
}

export interface MermaidShapeInput {
  id: string;
  type: string;
  parentId?: string;
  /** Texto visível do shape (título do bloco, richText resolvido, nome do frame). */
  label?: string;
  /** Estilo geo do shape (rectangle, diamond, ellipse…). */
  geo?: string;
  /** Bounds no espaço da página; usado para direção, subgrafos e snap de terminais livres. */
  bounds?: { x: number; y: number; w: number; h: number };
  arrowheadStart?: string;
  arrowheadEnd?: string;
  dash?: string;
  size?: string;
  /** Pontas da seta: só para type === "arrow". */
  links?: { start?: MermaidTerminal; end?: MermaidTerminal };
}

const NODE_TYPES = new Set(["block", "geo", "note", "text"]);
const RESERVED_IDS = new Set([
  "graph",
  "flowchart",
  "subgraph",
  "end",
  "direction",
  "style",
  "linkstyle",
  "classdef",
  "class",
  "click",
  "default",
  "o",
  "x",
  "true",
  "false",
]);

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface NodeRecord {
  shapeId: string;
  mermaidId: string;
  type: string;
  geo?: string;
  label: string;
  bounds?: Bounds;
  frame?: FrameRecord;
}

interface FrameRecord {
  shapeId: string;
  mermaidId: string;
  label: string;
  bounds?: Bounds;
  parent?: FrameRecord;
  members: (NodeRecord | FrameRecord)[];
}

/** Extrai texto simples de um richText do tldraw ({type:"doc", content:[…]}). */
export function plainTextFromRichText(richText: unknown): string {
  const walk = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as { text?: unknown; content?: unknown };
    if (typeof n.text === "string") return n.text;
    if (Array.isArray(n.content)) return n.content.map(walk).join("");
    return "";
  };
  const doc = richText as { content?: unknown } | undefined;
  if (!doc || !Array.isArray(doc.content)) return "";
  return doc.content
    .map(walk)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(text: string): string {
  const base = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!base || /^[0-9]/.test(base) || RESERVED_IDS.has(base)) return "";
  return base;
}

/** Escapa um rótulo para dentro de aspas duplas do Mermaid. */
function quotedLabel(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/"/g, "#quot;")
    .replace(/\n/g, "<br/>")
    .trim();
}

/** Rótulo cru (formas sem suporte a aspas, como a assimétrica). */
function rawLabel(text: string): string {
  return quotedLabel(text).replace(/[<>[\]{}|]/g, "");
}

/**
 * Declaração de nó Mermaid a partir do tipo/geo do shape. Espelha o mapeamento
 * do @tldraw/mermaid (rectangle→[], diamond→{}, hexagon→{{}}, ellipse→([]),
 * trapezoid→[/…\], rhombus→>…]) para o round-trip fechar.
 */
function nodeDeclaration(node: NodeRecord): string {
  const q = quotedLabel(node.label);
  if (node.type === "geo") {
    switch (node.geo) {
      case "diamond":
        return `${node.mermaidId}{"${q}"}`;
      case "hexagon":
        return `${node.mermaidId}{{"${q}"}}`;
      case "ellipse":
      case "oval":
        return `${node.mermaidId}(["${q}"])`;
      case "trapezoid":
        return `${node.mermaidId}[/${rawLabel(node.label)}\\]`;
      case "rhombus":
        return `${node.mermaidId}>${rawLabel(node.label)}]`;
    }
  }
  return `${node.mermaidId}["${q}"]`;
}

function markerFor(arrowhead: string | undefined, closing: boolean): string {
  switch (arrowhead) {
    case "dot":
      return "o";
    case "bar":
    case "pipe":
      return "x";
    case "arrow":
    case "triangle":
    case "square":
    case "diamond":
    case "inverted":
      return closing ? ">" : "<";
    default:
      return "";
  }
}

function edgeToken(shape: MermaidShapeInput): string {
  // Defaults do tldraw: ponta final "arrow", ponta inicial "none".
  const dotted = shape.dash === "dotted" || shape.dash === "dashed";
  // O tracejado pede um "-" extra antes da ponta (`-.->`, `o-.->`, `-.-`).
  const line = dotted ? "-." : shape.size === "l" ? "==" : "--";
  const closingDash = dotted ? "-" : "";
  const start = markerFor(shape.arrowheadStart ?? "none", false);
  const end = markerFor(shape.arrowheadEnd ?? "arrow", true);
  return `${start}${line}${closingDash}${end}`;
}

function distanceToBounds(point: MermaidPoint, b: Bounds): number {
  const cx = Math.max(b.x, Math.min(point.x, b.x + b.w));
  const cy = Math.max(b.y, Math.min(point.y, b.y + b.h));
  return Math.hypot(point.x - cx, point.y - cy);
}

function containsPoint(b: Bounds, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/**
 * Frame dono do shape: ancestral frame explícito ou, por geometria, o menor
 * frame que contém o shape. Nós testam pelo centro; frames precisam de
 * contenção completa dos bounds — por centro, um frame interno que cobre o
 * centro do externo criaria ciclo de "parents".
 */
function resolveFrame(
  shape: MermaidShapeInput,
  byId: Map<string, MermaidShapeInput>,
  frames: FrameRecord[],
): FrameRecord | undefined {
  let parentId = shape.parentId;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent) break;
    if (parent.type === "frame") {
      const frame = frames.find((f) => f.shapeId === parent.id);
      if (frame) return frame;
    }
    parentId = parent.parentId;
  }
  if (!shape.bounds || !frames.length) return undefined;
  const b = shape.bounds;
  const isFrame = shape.type === "frame";
  let best: FrameRecord | undefined;
  let bestArea = Infinity;
  for (const frame of frames) {
    if (!frame.bounds || frame.shapeId === shape.id) continue;
    const a = frame.bounds;
    const hit = isFrame
      ? a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h && a.w * a.h > b.w * b.h
      : containsPoint(a, b.x + b.w / 2, b.y + b.h / 2);
    if (hit && a.w * a.h < bestArea) {
      best = frame;
      bestArea = a.w * a.h;
    }
  }
  return best;
}

function uniqueId(slug: string, index: number, used: Set<string>): string {
  let candidate = slug || `n${index + 1}`;
  if (used.has(candidate)) {
    let n = 2;
    while (used.has(`${candidate}_${n}`)) n++;
    candidate = `${candidate}_${n}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Gera o código Mermaid (flowchart) para o conjunto de shapes. Retorna ""
 * quando não há nenhum nó convertível.
 */
export function shapesToMermaid(shapes: MermaidShapeInput[]): string {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const usedIds = new Set<string>();

  const frames: FrameRecord[] = [];
  shapes.forEach((s, i) => {
    if (s.type !== "frame") return;
    frames.push({
      shapeId: s.id,
      mermaidId: uniqueId(slugify(s.label || "grupo"), i, usedIds),
      label: (s.label || "Grupo").trim(),
      bounds: s.bounds,
      members: [],
    });
  });

  const nodes: NodeRecord[] = [];
  shapes.forEach((s, i) => {
    if (!NODE_TYPES.has(s.type)) return;
    // Sem texto visível o nó não diz nada no diagrama: ignoramos (e as setas
    // que apontavam para ele caem junto, na regra de resolução de terminais).
    if (!(s.label || "").trim()) return;
    nodes.push({
      shapeId: s.id,
      mermaidId: uniqueId(slugify(s.label || ""), i, usedIds),
      type: s.type,
      geo: s.geo,
      label: (s.label || "").trim(),
      bounds: s.bounds,
    });
  });

  for (const frame of frames) {
    frame.parent = resolveFrame(
      byId.get(frame.shapeId)!,
      byId,
      frames.filter((f) => f !== frame),
    );
  }
  const recordById = new Map<string, NodeRecord | FrameRecord>();
  for (const node of nodes) {
    node.frame = resolveFrame(byId.get(node.shapeId)!, byId, frames);
    recordById.set(node.shapeId, node);
  }
  for (const frame of frames) recordById.set(frame.shapeId, frame);

  for (const node of nodes) node.frame?.members.push(node);
  for (const frame of frames) frame.parent?.members.push(frame);

  // Direção pela proporção da área ocupada pelos nós.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of [...nodes, ...frames]) {
    if (!n.bounds) continue;
    minX = Math.min(minX, n.bounds.x);
    minY = Math.min(minY, n.bounds.y);
    maxX = Math.max(maxX, n.bounds.x + n.bounds.w);
    maxY = Math.max(maxY, n.bounds.y + n.bounds.h);
  }
  const direction = Number.isFinite(minX) && maxY - minY > maxX - minX ? "TD" : "LR";

  const lines: string[] = [`flowchart ${direction}`];

  const emitNode = (node: NodeRecord, depth: number) => {
    lines.push(`${"  ".repeat(depth)}${nodeDeclaration(node)}`);
  };
  const emitFrame = (frame: FrameRecord, depth: number, seen = new Set<string>()) => {
    if (seen.has(frame.shapeId)) return;
    seen.add(frame.shapeId);
    lines.push(`${"  ".repeat(depth)}subgraph ${frame.mermaidId}["${quotedLabel(frame.label)}"]`);
    for (const member of frame.members) {
      if ("members" in member) emitFrame(member, depth + 1, seen);
      else emitNode(member, depth + 1);
    }
    lines.push(`${"  ".repeat(depth)}end`);
  };

  for (const frame of frames) if (!frame.parent) emitFrame(frame, 1);
  for (const node of nodes) if (!node.frame) emitNode(node, 1);

  // Ligações: setas com binding resolvem direto; terminal livre encosta no nó mais próximo.
  for (const shape of shapes) {
    if (shape.type !== "arrow") continue;
    const links = shape.links || {};
    const resolveTerminal = (terminal: MermaidTerminal | undefined): NodeRecord | FrameRecord | undefined => {
      if (!terminal) return undefined;
      if (terminal.toId) return recordById.get(terminal.toId);
      if (!terminal.point) return undefined;
      let best: NodeRecord | FrameRecord | undefined;
      let bestDist = Infinity;
      for (const n of nodes) {
        if (!n.bounds) continue;
        const d = distanceToBounds(terminal.point, n.bounds);
        if (d < bestDist) {
          best = n;
          bestDist = d;
        }
      }
      return best;
    };
    const from = resolveTerminal(links.start);
    const to = resolveTerminal(links.end);
    if (!from || !to) continue;
    const label = (shape.label || "").trim();
    const labelPart = label ? `|"${quotedLabel(label)}"| ` : "";
    const line = `${from.mermaidId} ${edgeToken(shape)} ${labelPart}${to.mermaidId}`.replace(/\s+/g, " ").trim();
    lines.push(`  ${line}`);
  }

  if (lines.length <= 1) return "";
  return lines.join("\n");
}
