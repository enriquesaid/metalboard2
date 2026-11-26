import { useId, useMemo } from 'react';
import { useEditor, useValue } from 'tldraw';
import { dependencyEdges, roundedEdgePath, routeEdges, type Box, type Point } from './edges';

const nonObstacles = new Set(['arrow', 'draw', 'frame', 'group', 'highlight', 'line']);

export function DataFlowEdges() {
  const editor = useEditor();
  const markerId = `dataflow-arrowhead-${useId()}`;
  const shapeRecords = useMemo(() => editor.store.query.records('shape'), [editor]);
  const edges = useValue('dataflow routes', () => {
    const pageShapes = editor.getCurrentPageShapes();
    if (pageShapes.length < 2) return [];
    const dependencies = dependencyEdges(shapeRecords.get());
    if (!dependencies.length) return [];

    const boxes = new Map<string, Box>();
    const obstacles: Box[] = [];
    for (const shape of pageShapes) {
      if (editor.isShapeHidden(shape)) continue;
      const bounds = editor.getShapePageBounds(shape);
      if (!bounds) continue;
      const box = { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height };
      boxes.set(shape.id, box);
      if (!nonObstacles.has(shape.type)) obstacles.push(box);
    }
    return routeEdges(dependencies, boxes, obstacles);
  }, [editor, shapeRecords]);
  const camera = useValue('dataflow camera', () => editor.getCamera(), [editor]);
  const selection = useValue('dataflow selection', () => editor.getSelectedShapeIds(), [editor]);
  if (!edges.length) return null;

  const selected = new Set<string>(selection);
  const hasFocus = (edge: typeof edges[number]) => selected.has(edge.source) || selected.has(edge.consumer);
  const focusActive = selected.size > 0 && edges.some(hasFocus);
  const visibleOrder = focusActive ? [...edges].sort((a, b) => Number(hasFocus(a)) - Number(hasFocus(b))) : edges;
  const project = ({ x, y }: Point) => ({ x: (x + camera.x) * camera.z, y: (y + camera.y) * camera.z });

  return (
    <svg className="dataflow-edges" aria-hidden="true">
      <defs>
        <marker id={markerId} viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
          <path className="dataflow-arrowhead" d="M 0.5 0.5 L 7.5 4 L 0.5 7.5 Z" />
        </marker>
      </defs>
      {visibleOrder.map(edge => {
        const points = edge.points.map(project);
        const d = roundedEdgePath(points, Math.min(12, 16 * camera.z));
        return (
          <g
            key={JSON.stringify([edge.source, edge.consumer])}
            className="dataflow-connection"
            data-emphasis={focusActive ? (hasFocus(edge) ? 'focused' : 'muted') : undefined}
          >
            <path className="dataflow-edge-underlay" d={d} />
            <path className="dataflow-edge" d={d} markerEnd={`url(#${markerId})`} />
            <circle className="dataflow-port" cx={points[0].x} cy={points[0].y} r="2.4" />
          </g>
        );
      })}
    </svg>
  );
}
