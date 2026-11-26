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
type Axis = keyof Point;
type Side = { axis: Axis; direction: 1 | -1 };
type End = { node: string; box: Box; other: Box; side: Side; point: Point };
type Segment = { axis: Axis; coordinate: number; low: number; high: number };
type RoutedEdge = DependencyEdge & { points: Point[] };
type SegmentIndex = Record<Axis, Map<number, Segment[]>>;

const clearance = 10;
const laneSpacing = 14;
const indexCellSize = 128;
const otherAxis = (axis: Axis): Axis => axis === 'x' ? 'y' : 'x';
const size = (box: Box, axis: Axis) => axis === 'x' ? box.w : box.h;
const middle = (box: Box, axis: Axis) => box[axis] + size(box, axis) / 2;
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

function endpointSides(from: Box, to: Box): [Side, Side] {
  const dx = middle(to, 'x') - middle(from, 'x');
  const dy = middle(to, 'y') - middle(from, 'y');
  const width = from.w + to.w;
  const height = from.h + to.h;
  const gapX = Math.abs(dx) - width / 2;
  const gapY = Math.abs(dy) - height / 2;
  const primary = Math.abs(dx) / Math.max(1, width) >= Math.abs(dy) / Math.max(1, height) ? 'x' : 'y';
  if (gapX <= 0 && gapY <= 0) {
    // Overlapping cards can connect on a shared outside face.
    const axis = otherAxis(primary);
    const direction = (axis === 'x' ? dx : dy) > 0 ? 1 : -1;
    return [{ axis, direction }, { axis, direction }];
  }
  const axis = gapX <= 0 ? 'y' : gapY <= 0 ? 'x' : primary;
  const direction = (axis === 'x' ? dx : dy) > 0 ? 1 : -1;
  return [{ axis, direction }, { axis, direction: direction === 1 ? -1 : 1 }];
}

function makeEnd(node: string, box: Box, other: Box, side: Side): End {
  const { axis, direction } = side;
  const point = { x: middle(box, 'x'), y: middle(box, 'y') };
  point[axis] = direction > 0 ? box[axis] + size(box, axis) : box[axis];
  return { node, box, other, side, point };
}

function offsetEnd(end: End, distance: number): Point {
  return { ...end.point, [end.side.axis]: end.point[end.side.axis] + distance * end.side.direction };
}

function spreadPorts(ends: End[]) {
  const sides = new Map<string, End[]>();
  for (const end of ends) {
    const key = `${end.node}:${end.side.axis}:${end.side.direction}`;
    const group = sides.get(key);
    if (group) group.push(end);
    else sides.set(key, [end]);
  }
  for (const group of sides.values()) {
    const axis = otherAxis(group[0].side.axis);
    const spacing = Math.min(laneSpacing, size(group[0].box, axis) / (group.length + 1));
    group.sort((a, b) => middle(a.other, axis) - middle(b.other, axis));
    group.forEach((end, index) => {
      end.point[axis] += (index - (group.length - 1) / 2) * spacing;
    });
  }
}

function segments(points: Point[]): Segment[] {
  return points.slice(1).map((end, index) => {
    const start = points[index];
    const axis = start.x === end.x ? 'y' : 'x';
    return {
      axis,
      coordinate: start[otherAxis(axis)],
      low: Math.min(start[axis], end[axis]),
      high: Math.max(start[axis], end[axis]),
    };
  });
}

function simplify(points: Point[]): Point[] | undefined {
  const result: Point[] = [];
  for (const point of points) {
    const last = result.at(-1);
    if (!last) {
      result.push(point);
      continue;
    }
    if (samePoint(last, point)) continue;
    const before = result.at(-2);
    if (before) {
      const axis = before.x === last.x && last.x === point.x ? 'y' :
        before.y === last.y && last.y === point.y ? 'x' : undefined;
      if (axis) {
        if ((last[axis] - before[axis]) * (point[axis] - last[axis]) < 0) return undefined;
        result.pop();
      }
    }
    result.push(point);
  }
  return result;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function insideBox(segment: Segment, box: Box, padding: number) {
  const { axis, coordinate, low, high } = segment;
  const across = otherAxis(axis);
  if (coordinate <= box[across] - padding || coordinate >= box[across] + size(box, across) + padding) return 0;
  return overlap(low, high, box[axis] - padding, box[axis] + size(box, axis) + padding);
}

function edgeConflict(a: Segment, b: Segment) {
  if (a.axis === b.axis) {
    const gap = Math.abs(a.coordinate - b.coordinate);
    return gap < 8 ? 4 * overlap(a.low, a.high, b.low, b.high) * (1 - gap / 8) : 0;
  }
  return b.coordinate > a.low && b.coordinate < a.high && a.coordinate > b.low && a.coordinate < b.high ? 24 : 0;
}

function conflictsIn(line: Segment, occupied: SegmentIndex) {
  const sum = (axis: Axis, from: number, to: number) => {
    const buckets = occupied[axis];
    const first = Math.floor(from / indexCellSize);
    const last = Math.floor(to / indexCellSize);
    let cost = 0;
    if (last - first > buckets.size) {
      for (const [cell, segments] of buckets) {
        if (cell < first || cell > last) continue;
        for (const segment of segments) cost += edgeConflict(line, segment);
      }
    } else {
      for (let cell = first; cell <= last; cell += 1) {
        const segments = buckets.get(cell);
        if (segments) for (const segment of segments) cost += edgeConflict(line, segment);
      }
    }
    return cost;
  };
  return sum(line.axis, line.coordinate - 8, line.coordinate + 8) + sum(otherAxis(line.axis), line.low, line.high);
}

function candidateRails(axis: Axis, from: Point, to: Point, obstacles: Box[]) {
  const min = Math.min(from[axis], to[axis]);
  const max = Math.max(from[axis], to[axis]);
  const midpoint = (min + max) / 2;
  const near = new Set([midpoint, min, max, min - laneSpacing, max + laneSpacing]);
  for (const step of [-3, -2, -1, 1, 2, 3]) near.add(midpoint + step * laneSpacing);

  const boundaries = [...new Set(obstacles.flatMap(box => [box[axis] - clearance, box[axis] + size(box, axis) + clearance]))];
  const outerMin = Math.min(min, ...boundaries);
  const outerMax = Math.max(max, ...boundaries);
  boundaries.sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint));
  for (const coordinate of boundaries.slice(0, 14)) near.add(coordinate);
  near.add(outerMin);
  near.add(outerMax);
  return near;
}

function leadRoom(end: End, blocks: Box[]) {
  const { axis, direction } = end.side;
  const across = otherAxis(axis);
  let distance = Infinity;
  for (const block of blocks) {
    if (block === end.box || end.point[across] <= block[across] || end.point[across] >= block[across] + size(block, across)) continue;
    const far = direction > 0 ? block[axis] + size(block, axis) : block[axis];
    if (direction * (far - end.point[axis]) <= 0) continue;
    const near = direction > 0 ? block[axis] : block[axis] + size(block, axis);
    distance = Math.min(distance, Math.max(0, direction * (near - end.point[axis])));
  }
  return distance;
}

function availableEnd(end: End, blocks: Box[]) {
  if (leadRoom(end, blocks) >= 7) return end;
  let best = end;
  let bestAlignment = -Infinity;
  for (const axis of ['x', 'y'] as const) {
    for (const direction of [-1, 1] as const) {
      const alternative = makeEnd(end.node, end.box, end.other, { axis, direction });
      if (leadRoom(alternative, blocks) < 7) continue;
      const alignment = direction * (middle(end.other, axis) - middle(end.box, axis)) / Math.max(1, size(end.box, axis));
      if (alignment > bestAlignment) {
        best = alternative;
        bestAlignment = alignment;
      }
    }
  }
  return best;
}

function route(from: End, to: End, blocks: Box[], occupied: SegmentIndex): Point[] {
  const { axis, direction } = from.side;
  const across = otherAxis(axis);
  const sameAxis = to.side.axis === axis;
  const separation = direction * (to.point[axis] - from.point[axis]);
  const gap = sameAxis && direction !== to.side.direction && separation > 0 ? separation : Infinity;
  if (sameAxis && direction === to.side.direction && Math.abs(from.point[across] - to.point[across]) < 6) {
    from.point[across] -= Math.min(6, size(from.box, across) / 6);
    to.point[across] += Math.min(6, size(to.box, across) / 6);
  }
  // Limits candidates to the area around the endpoints and the intervening cards.
  const searchMargin = 84;
  const minX = Math.min(from.box.x, to.box.x);
  const minY = Math.min(from.box.y, to.box.y);
  const envelope = {
    x: minX - searchMargin,
    y: minY - searchMargin,
    w: Math.max(from.box.x + from.box.w, to.box.x + to.box.w) - minX + 2 * searchMargin,
    h: Math.max(from.box.y + from.box.h, to.box.y + to.box.h) - minY + 2 * searchMargin,
  };
  const nearby = blocks.filter(box => overlap(box.x, box.x + box.w, envelope.x, envelope.x + envelope.w) > 0 &&
    overlap(box.y, box.y + box.h, envelope.y, envelope.y + envelope.h) > 0);
  const collisions = [...new Set([...nearby, from.box, to.box])];
  const startRoom = leadRoom(from, nearby);
  const endRoom = leadRoom(to, nearby);
  const start = offsetEnd(from, Math.min(5, gap / 6, startRoom / 3));
  const end = offsetEnd(to, Math.min(7, gap / 6, endRoom / 3));
  const startLead = offsetEnd(from, Math.min(22, gap / 3, startRoom * 2 / 3));
  const endLead = offsetEnd(to, Math.min(22, gap / 3, endRoom * 2 / 3));
  const lineScores = new Map<string, number>();
  const lineScore = (line: Segment) => {
    const key = `${line.axis}:${line.coordinate}:${line.low}:${line.high}`;
    const cached = lineScores.get(key);
    if (cached !== undefined) return cached;

    let score = line.high - line.low + conflictsIn(line, occupied);
    for (const block of collisions) {
      score += insideBox(line, block, 0) * 600;
      if (block !== from.box && block !== to.box) score += insideBox(line, block, clearance) * 5;
    }
    lineScores.set(key, score);
    return score;
  };
  let best: Point[] = [];
  let bestScore = Infinity;

  // Compare horizontal and vertical corridors between the two approach segments.
  for (const railAxis of ['x', 'y'] as const) {
    for (const coordinate of candidateRails(railAxis, startLead, endLead, collisions)) {
      const a = { ...startLead, [railAxis]: coordinate };
      const b = { ...endLead, [railAxis]: coordinate };
      const points = simplify([start, startLead, a, b, endLead, end]);
      if (!points || points.length < 2) continue;
      const lines = segments(points);
      let score = 12 * (lines.length - 1);
      for (const line of lines) {
        score += lineScore(line);
        if (score >= bestScore) break;
      }
      if (score < bestScore) {
        best = points;
        bestScore = score;
      }
    }
  }
  return best;
}

export function routeEdges(edges: DependencyEdge[], boxes: ReadonlyMap<string, Box>, obstacles = [...boxes.values()]): RoutedEdge[] {
  const links = edges.flatMap(edge => {
    const from = boxes.get(edge.source);
    const to = boxes.get(edge.consumer);
    if (!from || !to) return [];
    const [fromSide, toSide] = endpointSides(from, to);
    const start = availableEnd(makeEnd(edge.source, from, to, fromSide), obstacles);
    const end = availableEnd(makeEnd(edge.consumer, to, from, toSide), obstacles);
    return [{ edge, from: start, to: end }];
  }).sort((a, b) => a.edge.source.localeCompare(b.edge.source) || a.edge.consumer.localeCompare(b.edge.consumer));
  spreadPorts(links.flatMap(({ from, to }) => [from, to]));

  const occupied: SegmentIndex = { x: new Map(), y: new Map() };
  return links.flatMap(({ edge, from, to }) => {
    const points = route(from, to, obstacles, occupied);
    if (!points.length) return [];
    for (const segment of segments(points)) {
      const axis = occupied[segment.axis];
      const cell = Math.floor(segment.coordinate / indexCellSize);
      const bucket = axis.get(cell);
      if (bucket) bucket.push(segment);
      else axis.set(cell, [segment]);
    }
    return [{ ...edge, points }];
  });
}

export function roundedEdgePath(points: Point[], radius: number): string {
  const coordinate = ({ x, y }: Point) => `${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`;
  let path = `M ${coordinate(points[0])}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = points[index - 1];
    const corner = points[index];
    const after = points[index + 1];
    const beforeLength = Math.hypot(before.x - corner.x, before.y - corner.y);
    const afterLength = Math.hypot(after.x - corner.x, after.y - corner.y);
    const bend = Math.min(radius, beforeLength / 2, afterLength / 2);
    const toward = (point: Point, length: number) => ({
      x: corner.x + (point.x - corner.x) * bend / length,
      y: corner.y + (point.y - corner.y) * bend / length,
    });
    path += ` L ${coordinate(toward(before, beforeLength))} Q ${coordinate(corner)} ${coordinate(toward(after, afterLength))}`;
  }
  return `${path} L ${coordinate(points[points.length - 1])}`;
}
