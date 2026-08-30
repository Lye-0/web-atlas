import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react';
import { layoutAnalyzerView, ANALYZER_NODE_HEIGHT, ANALYZER_NODE_WIDTH, type AnalyzerLayout, type PositionedNode } from '../../analyzer';
import { nodeTypeLabels, type AnalyzerViewModel } from '../../analyzer';

interface AnalyzerGraphStageProps {
  view: AnalyzerViewModel;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  filter: string;
  search: string;
  showExternal: boolean;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
}

interface GraphTransform {
  x: number;
  y: number;
  scale: number;
}

function nodeMatchesSearch(node: AnalyzerViewModel['nodes'][number], search: string): boolean {
  if (!search.trim()) return true;
  const haystack = [node.label, node.subtitle, ...Object.values(node.metadata).flatMap((value) => Array.isArray(value) ? value : value === undefined ? [] : [String(value)])]
    .join(' ')
    .toLowerCase();
  return haystack.includes(search.trim().toLowerCase());
}

function edgePath(source: PositionedNode, target: PositionedNode): string {
  const sourceCenter = source.x + ANALYZER_NODE_WIDTH / 2;
  const targetCenter = target.x + ANALYZER_NODE_WIDTH / 2;
  const goesRight = targetCenter >= sourceCenter;
  const sourceX = goesRight ? source.x + ANALYZER_NODE_WIDTH : source.x;
  const targetX = goesRight ? target.x : target.x + ANALYZER_NODE_WIDTH;
  const sourceY = source.y + ANALYZER_NODE_HEIGHT / 2;
  const targetY = target.y + ANALYZER_NODE_HEIGHT / 2;
  const bend = Math.max(54, Math.abs(targetX - sourceX) * 0.38);
  const sourceControlX = sourceX + (goesRight ? bend : -bend);
  const targetControlX = targetX + (goesRight ? -bend : bend);
  return `M ${sourceX} ${sourceY} C ${sourceControlX} ${sourceY}, ${targetControlX} ${targetY}, ${targetX} ${targetY}`;
}

function nodeStyle(positionedNode: PositionedNode): CSSProperties {
  return { left: positionedNode.x, top: positionedNode.y, width: ANALYZER_NODE_WIDTH, minHeight: ANALYZER_NODE_HEIGHT };
}

function fitTransform(layout: AnalyzerLayout, width: number, height: number): GraphTransform {
  const availableWidth = Math.max(240, width - 60);
  const availableHeight = Math.max(220, height - 100);
  const scale = Math.max(0.38, Math.min(1, availableWidth / layout.width, availableHeight / layout.height));
  return {
    scale,
    x: (width - layout.width * scale) / 2,
    y: (height - layout.height * scale) / 2 + 28,
  };
}

export function AnalyzerGraphStage({
  view,
  selectedNodeId,
  selectedEdgeId,
  filter,
  search,
  showExternal,
  onSelectNode,
  onSelectEdge,
}: AnalyzerGraphStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | undefined>(undefined);
  const [transform, setTransform] = useState<GraphTransform>({ x: 24, y: 24, scale: 0.7 });
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | undefined>();

  const filteredView = useMemo<AnalyzerViewModel>(() => {
    const visibleNodes = view.nodes.filter((node) => (filter === 'all' || node.type === filter) && (showExternal || node.type !== 'external-package'));
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    return {
      ...view,
      nodes: visibleNodes,
      edges: view.edges.filter((edge) => visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId)),
      clusters: view.clusters.map((cluster) => ({ ...cluster, nodeIds: cluster.nodeIds.filter((nodeId) => visibleIds.has(nodeId)) })).filter((cluster) => cluster.nodeIds.length > 0),
    };
  }, [filter, showExternal, view]);
  const layout = useMemo(() => layoutAnalyzerView(filteredView), [filteredView]);
  const positionedById = useMemo(() => new Map(layout.nodes.map((positionedNode) => [positionedNode.node.id, positionedNode])), [layout.nodes]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    setTransform(fitTransform(layout, element.clientWidth, element.clientHeight));
  }, [layout, view.view]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const selected = positionedById.get(selectedNodeId);
    const element = stageRef.current;
    if (!selected || !element) return;
    setTransform((current) => ({
      ...current,
      x: element.clientWidth / 2 - (selected.x + ANALYZER_NODE_WIDTH / 2) * current.scale,
      y: element.clientHeight / 2 - (selected.y + ANALYZER_NODE_HEIGHT / 2) * current.scale,
    }));
  }, [positionedById, selectedNodeId]);

  const changeZoom = (factor: number) => setTransform((current) => ({ ...current, scale: Math.max(0.35, Math.min(1.4, current.scale * factor)) }));
  const resetTransform = () => setTransform({ x: 24, y: 24, scale: 0.7 });
  const fit = () => {
    const element = stageRef.current;
    if (element) setTransform(fitTransform(layout, element.clientWidth, element.clientHeight));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, select, path')) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setTransform((current) => ({ ...current, x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY }));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined;
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const element = stageRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const pointX = event.clientX - rect.left;
    const pointY = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    setTransform((current) => {
      const nextScale = Math.max(0.35, Math.min(1.4, current.scale * factor));
      const worldX = (pointX - current.x) / current.scale;
      const worldY = (pointY - current.y) / current.scale;
      return { scale: nextScale, x: pointX - worldX * nextScale, y: pointY - worldY * nextScale };
    });
  };

  return (
    <div
      ref={stageRef}
      className="analyzer-graph-stage"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      role="application"
      aria-label={`${view.view} graph stage. Drag to pan and use the wheel to zoom.`}
    >
      <div className="analyzer-stage-controls" aria-label="Graph controls">
        <button type="button" onClick={fit}>Fit</button>
        <button type="button" onClick={resetTransform}>Reset</button>
        <button type="button" onClick={() => changeZoom(1.14)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => changeZoom(0.88)} aria-label="Zoom out">−</button>
        <span>{Math.round(transform.scale * 100)}%</span>
      </div>
      {filteredView.nodes.length === 0 ? (
        <div className="analyzer-graph-empty">現在のFilterに一致するNodeはありません。</div>
      ) : (
        <div className="analyzer-graph-viewport">
          <div className="analyzer-graph-world" style={{ width: layout.width, height: layout.height, transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
            {layout.clusters.map((cluster) => (
              <section key={cluster.id} className={`analyzer-cluster-plane tone-${cluster.tone}`} style={{ left: cluster.x, top: cluster.y, width: cluster.width, height: cluster.height }} aria-label={cluster.label}>
                <span>{cluster.label}</span>
              </section>
            ))}
            <svg className="analyzer-edge-layer" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-label="Graph relations">
              <defs>
                <marker id="analyzer-edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                </marker>
              </defs>
              {filteredView.edges.map((edge) => {
                const source = positionedById.get(edge.sourceId);
                const target = positionedById.get(edge.targetId);
                if (!source || !target) return null;
                const selected = edge.id === selectedEdgeId;
                const connected = selectedNodeId ? edge.sourceId === selectedNodeId || edge.targetId === selectedNodeId : false;
                const dimmed = Boolean((selectedNodeId || selectedEdgeId) && !selected && !connected);
                return (
                  <g key={edge.id} className={`analyzer-edge-group${selected ? ' is-selected' : ''}${connected ? ' is-connected' : ''}${dimmed ? ' is-dimmed' : ''}`}>
                    <path
                      className="analyzer-edge-hit"
                      d={edgePath(source, target)}
                      markerEnd="url(#analyzer-edge-arrow)"
                      role="button"
                      tabIndex={0}
                      aria-label={`${edge.label}: ${source.node.label} to ${target.node.label}`}
                      onClick={() => onSelectEdge(edge.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectEdge(edge.id);
                        }
                      }}
                      onMouseEnter={() => setHoveredEdgeId(edge.id)}
                      onMouseLeave={() => setHoveredEdgeId(undefined)}
                    />
                    {(selected || hoveredEdgeId === edge.id) && (
                      <text className="analyzer-edge-label" x={(source.x + target.x) / 2 + ANALYZER_NODE_WIDTH / 2} y={(source.y + target.y) / 2 + ANALYZER_NODE_HEIGHT / 2 - 8}>
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {layout.nodes.map((positionedNode) => {
              const node = positionedNode.node;
              const matches = nodeMatchesSearch(node, search);
              const selected = node.id === selectedNodeId;
              const dimmed = Boolean(search.trim() && !matches) || Boolean((selectedNodeId || selectedEdgeId) && !selected && !view.edges.some((edge) => (edge.id === selectedEdgeId || (selectedNodeId && (edge.sourceId === selectedNodeId || edge.targetId === selectedNodeId))) && (edge.sourceId === node.id || edge.targetId === node.id)));
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`analyzer-node node-type-${node.type}${selected ? ' is-selected' : ''}${matches && search.trim() ? ' is-match' : ''}${dimmed ? ' is-dimmed' : ''}`}
                  style={nodeStyle(positionedNode)}
                  onClick={() => onSelectNode(node.id)}
                  aria-pressed={selected}
                  aria-label={`${node.label}, ${nodeTypeLabels[node.type] ?? node.type}`}
                >
                  <span className="analyzer-node-type">{nodeTypeLabels[node.type] ?? node.type}</span>
                  <strong>{node.label}</strong>
                  {node.subtitle && <span className="analyzer-node-subtitle">{node.subtitle}</span>}
                  <span className="analyzer-node-evidence">{node.evidenceIds.length > 0 ? `Evidence ${node.evidenceIds.length}` : 'No direct evidence'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="analyzer-stage-hint">Drag to pan · Wheel to zoom · Select a Node or Edge for Evidence</p>
    </div>
  );
}
