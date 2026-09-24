// Setas tracejadas animadas indicando fluxo de dados: saem do elemento que produz
// o dado e caminham até o elemento que o consome (%id%). Renderiza no slot
// InFrontOfTheCanvas (espaço de tela), projetando coordenadas de página pela câmera.
import { useEditor, useValue, type TLShapeId } from 'tldraw';
import { allShapes } from './editor';
import { dependencyEdges, edgeAnchors, type Point } from './edges';

const domId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');

export function DataFlowEdges() {
  const editor = useEditor();
  const edges = useValue('dataflow edges', () => {
    return dependencyEdges(allShapes(editor)).flatMap((edge) => {
      const from = editor.getShapePageBounds(edge.source as TLShapeId);
      const to = editor.getShapePageBounds(edge.consumer as TLShapeId);
      if (!from || !to) return [];
      const anchors = edgeAnchors(
        { x: from.x, y: from.y, w: from.width, h: from.height },
        { x: to.x, y: to.y, w: to.width, h: to.height },
      );
      return [{ id: domId(`${edge.source}__${edge.consumer}`), ...anchors }];
    });
  }, [editor]);
  const camera = useValue('dataflow camera', () => editor.getCamera(), [editor]);
  if (!edges.length) return null;
  const project = (p: Point) => ({
    x: (p.x + camera.x) * camera.z,
    y: (p.y + camera.y) * camera.z,
  });
  return (
    <svg className="dataflow-edges" aria-hidden="true">
      <defs>
        <marker
          id="dataflow-arrowhead"
          viewBox="0 0 8 8"
          refX="6.5"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M 0.5 0.5 L 7 4 L 0.5 7.5 Z" />
        </marker>
      </defs>
      {edges.map((edge, index) => {
        const start = project(edge.start), end = project(edge.end);
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        return (
          <g key={edge.id}>
            <path
              id={`dataflow-${edge.id}`}
              className="dataflow-edge"
              d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
              markerEnd="url(#dataflow-arrowhead)"
            />
            <circle className="dataflow-pulse" r="2.6">
              <animateMotion
                dur={`${(0.9 + length / 160).toFixed(2)}s`}
                begin={`${(index * 0.27).toFixed(2)}s`}
                repeatCount="indefinite"
              >
                <mpath href={`#dataflow-${edge.id}`} xlinkHref={`#dataflow-${edge.id}`} />
              </animateMotion>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}
