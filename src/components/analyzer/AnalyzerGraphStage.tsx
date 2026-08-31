import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ANALYZER_DEFAULT_TRANSFORM, ANALYZER_NODE_WIDTH, displayedZoomLevelForNode, fitAnalyzerTransform, focusAnalyzerTransform, layoutAnalyzerView, nodeMatchesSearch, presentAnalyzerView, semanticZoomLevelForScale, type AnalyzerGraphTransform, type AnalyzerViewCounts, type AnalyzerViewEdge, type AnalyzerViewModel, type PositionedNode } from '../../analyzer';
import { nodeTypeLabels } from '../../analyzer';
import { EvidencePreview } from './EvidenceCodeBlock';

interface AnalyzerGraphStageProps {
  view: AnalyzerViewModel;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  filter: string;
  search: string;
  showExternal: boolean;
  onToggleExternal: () => void;
  onClearSelection: () => void;
  onResetPresentation: () => void;
  sources: Record<string, string>;
  onSelectNode: (nodeId: string, focus?: boolean) => void;
  onSelectEdge: (edgeId: string) => void;
  focusRequest?: { nodeId: string; nonce: number };
  cameraResetKey: string | number;
  onCountsChange: (counts: AnalyzerViewCounts) => void;
}

type GraphTransform = AnalyzerGraphTransform;

function displayNodeType(node: AnalyzerViewModel['nodes'][number]): string {
  const displayRole = node.metadata.displayRole;
  return typeof displayRole === 'string' ? displayRole : nodeTypeLabels[node.type] ?? node.type;
}

function edgePath(source: PositionedNode, target: PositionedNode): string {
  const sourceCenter = source.x + ANALYZER_NODE_WIDTH / 2;
  const targetCenter = target.x + ANALYZER_NODE_WIDTH / 2;
  const goesRight = targetCenter >= sourceCenter;
  const sourceX = goesRight ? source.x + ANALYZER_NODE_WIDTH : source.x;
  const targetX = goesRight ? target.x : target.x + ANALYZER_NODE_WIDTH;
  const sourceY = source.y + source.height / 2;
  const targetY = target.y + target.height / 2;
  const bend = Math.max(54, Math.abs(targetX - sourceX) * 0.38);
  const sourceControlX = sourceX + (goesRight ? bend : -bend);
  const targetControlX = targetX + (goesRight ? -bend : bend);
  return `M ${sourceX} ${sourceY} C ${sourceControlX} ${sourceY}, ${targetControlX} ${targetY}, ${targetX} ${targetY}`;
}

function nodeStyle(positionedNode: PositionedNode): CSSProperties {
  return { left: positionedNode.x, top: positionedNode.y, width: ANALYZER_NODE_WIDTH, height: positionedNode.height };
}

function evidenceHint(node: AnalyzerViewModel['nodes'][number], view: AnalyzerViewModel): string | undefined {
  const evidence = node.evidenceIds
    .map((evidenceId) => view.evidence.find((candidate) => candidate.id === evidenceId))
    .find((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  return evidence ? `${evidence.filePath}:${evidence.contextStartLine}` : undefined;
}

function summarySubtitle(node: AnalyzerViewModel['nodes'][number], expanded: boolean): string | undefined {
  if (!node.subtitle) return undefined;
  if (/· expand for details$/.test(node.subtitle)) return expanded ? node.subtitle.replace(/· expand for details$/, '· expanded · Collapse') : node.subtitle;
  if (/· expanded(?: · Collapse)?$/.test(node.subtitle)) return expanded ? node.subtitle : node.subtitle.replace(/· expanded(?: · Collapse)?$/, '· expand for details');
  return `${node.subtitle} · ${expanded ? 'expanded · Collapse' : 'expand for details'}`;
}

export function AnalyzerGraphStage({
  view,
  selectedNodeId,
  selectedEdgeId,
  filter,
  search,
  showExternal,
  onToggleExternal,
  onClearSelection,
  onResetPresentation,
  onSelectNode,
  onSelectEdge,
  sources,
  focusRequest,
  cameraResetKey,
  onCountsChange,
}: AnalyzerGraphStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean; background: boolean } | undefined>(undefined);
  const cameraRef = useRef<{ key: string; initialized: boolean }>({ key: '', initialized: false });
  const focusNonceRef = useRef<number>(-1);
  const previousViewportRef = useRef({ width: 0, height: 0 });
  const [transform, setTransform] = useState<GraphTransform>(ANALYZER_DEFAULT_TRANSFORM);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | undefined>();
  const [hoveredNodeId, setHoveredNodeId] = useState<string | undefined>();
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [expandedPresentationIds, setExpandedPresentationIds] = useState<ReadonlySet<string>>(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const cameraKey = `${cameraResetKey}:${view.view}`;

  useEffect(() => {
    setExpandedPresentationIds(new Set());
    cameraRef.current = { key: cameraKey, initialized: false };
    focusNonceRef.current = -1;
  }, [cameraKey]);

  const togglePresentation = useCallback((nodeId: string) => {
    if (nodeId === 'dependencies:external:summary') {
      onToggleExternal();
      onSelectNode(nodeId);
      return;
    }
    setExpandedPresentationIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
    onSelectNode(nodeId);
  }, [onSelectNode, onToggleExternal]);

  const filteredView = useMemo<AnalyzerViewModel>(() => {
    return presentAnalyzerView(view, { expandedPresentationIds, filter, search, selectedEdgeId, selectedNodeId, showExternal });
  }, [expandedPresentationIds, filter, search, selectedEdgeId, selectedNodeId, showExternal, view]);
  useEffect(() => {
    if (filteredView.counts) onCountsChange(filteredView.counts);
  }, [filteredView.counts, onCountsChange]);
  const baseLayout = useMemo(() => layoutAnalyzerView(filteredView), [filteredView]);
  const zoomLevel = semanticZoomLevelForScale(transform.scale);
  const expandedNodeKey = useMemo(() => {
    const expanded = new Set<string>();
    const selected = baseLayout.nodes.find((positionedNode) => positionedNode.node.id === selectedNodeId);
    if (selected?.node.evidenceIds.length) expanded.add(selected.node.id);
    const hovered = baseLayout.nodes.find((positionedNode) => positionedNode.node.id === hoveredNodeId);
    if (zoomLevel === 'near' && hovered?.node.evidenceIds.length) expanded.add(hovered.node.id);
    return [...expanded].sort().join('\u0000');
  }, [baseLayout, hoveredNodeId, selectedNodeId, zoomLevel]);
  const expandedNodeIds = useMemo(() => new Set(expandedNodeKey ? expandedNodeKey.split('\u0000') : []), [expandedNodeKey]);
  const layout = useMemo(() => layoutAnalyzerView(filteredView, expandedNodeIds), [expandedNodeIds, filteredView]);
  const positionedById = useMemo(() => new Map(layout.nodes.map((positionedNode) => [positionedNode.node.id, positionedNode])), [layout.nodes]);
  const foregroundEdges = useMemo(() => filteredView.edges.filter((edge) => edge.id === selectedEdgeId || Boolean(selectedNodeId && (edge.sourceId === selectedNodeId || edge.targetId === selectedNodeId))), [filteredView.edges, selectedEdgeId, selectedNodeId]);
  const backgroundEdges = useMemo(() => filteredView.edges.filter((edge) => !foregroundEdges.includes(edge)), [filteredView.edges, foregroundEdges]);
  const selectionContext = useMemo(() => {
    const connectedNodeIds = new Set<string>();
    const contextClusterIds = new Set<string>();
    if (selectedNodeId) {
      connectedNodeIds.add(selectedNodeId);
      const selectedNode = filteredView.nodes.find((node) => node.id === selectedNodeId);
      if (selectedNode?.clusterId) contextClusterIds.add(selectedNode.clusterId);
      filteredView.edges.forEach((edge) => {
        if (edge.sourceId !== selectedNodeId && edge.targetId !== selectedNodeId) return;
        const otherId = edge.sourceId === selectedNodeId ? edge.targetId : edge.sourceId;
        connectedNodeIds.add(otherId);
        const other = filteredView.nodes.find((node) => node.id === otherId);
        if (other?.clusterId) contextClusterIds.add(other.clusterId);
      });
    }
    if (selectedEdgeId) {
      const selectedEdge = filteredView.edges.find((edge) => edge.id === selectedEdgeId);
      if (selectedEdge) {
        [selectedEdge.sourceId, selectedEdge.targetId].forEach((nodeId) => {
          connectedNodeIds.add(nodeId);
          const node = filteredView.nodes.find((candidate) => candidate.id === nodeId);
          if (node?.clusterId) contextClusterIds.add(node.clusterId);
        });
      }
    }
    const contextNodeIds = new Set(connectedNodeIds);
    filteredView.nodes.forEach((node) => {
      if (node.clusterId && contextClusterIds.has(node.clusterId)) contextNodeIds.add(node.id);
    });
    return { connectedNodeIds, contextClusterIds, contextNodeIds };
  }, [filteredView.edges, filteredView.nodes, selectedEdgeId, selectedNodeId]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const updateSize = () => setViewportSize((current) => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      return current.width === next.width && current.height === next.height ? current : next;
    });
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;
    const previous = previousViewportRef.current;
    previousViewportRef.current = viewportSize;
    if (!cameraRef.current.initialized || previous.width <= 0 || previous.height <= 0) return;
    const deltaY = (viewportSize.height - previous.height) / 2;
    if (viewportSize.width === previous.width && deltaY === 0) return;
    const selectedPosition = selectedNodeId ? positionedById.get(selectedNodeId) : undefined;
    setTransform((current) => {
      let deltaX = (viewportSize.width - previous.width) / 2;
      if (selectedPosition) {
        const selectedScreenX = current.x + (selectedPosition.x + ANALYZER_NODE_WIDTH / 2) * current.scale;
        const safeInset = 36;
        const minimum = safeInset;
        const maximum = Math.max(minimum, viewportSize.width - safeInset);
        deltaX = selectedScreenX > maximum
          ? maximum - selectedScreenX
          : selectedScreenX < minimum
            ? minimum - selectedScreenX
            : 0;
      }
      if (deltaX === 0 && deltaY === 0) return current;
      return { ...current, x: current.x + deltaX, y: current.y + deltaY };
    });
  }, [positionedById, selectedNodeId, viewportSize]);

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element || layout.nodes.length === 0 || viewportSize.width <= 0 || viewportSize.height <= 0) return;
    if (cameraRef.current.key !== cameraKey) cameraRef.current = { key: cameraKey, initialized: false };
    if (cameraRef.current.initialized) return;
    const applyFit = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (width <= 0 || height <= 0) return;
      cameraRef.current = { key: cameraKey, initialized: true };
      setTransform(fitAnalyzerTransform(layout, width, height));
    };
    applyFit();
  }, [cameraKey, layout, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (!focusRequest || focusRequest.nonce === focusNonceRef.current) return;
    const element = stageRef.current;
    const selectedPosition = positionedById.get(focusRequest.nodeId);
    if (!element || !selectedPosition || element.clientWidth <= 0 || element.clientHeight <= 0) return;
    focusNonceRef.current = focusRequest.nonce;
    setTransform((current) => focusAnalyzerTransform(selectedPosition, element.clientWidth, element.clientHeight, current.scale));
  }, [focusRequest, positionedById]);

  const changeZoom = (factor: number) => setTransform((current) => ({ ...current, scale: Math.max(0.35, Math.min(1.4, current.scale * factor)) }));
  const resetTransform = () => {
    setExpandedPresentationIds(new Set());
    cameraRef.current = { key: cameraKey, initialized: true };
    onResetPresentation();
    setTransform(ANALYZER_DEFAULT_TRANSFORM);
  };
  const fit = () => {
    const element = stageRef.current;
    if (!element) return;
    cameraRef.current = { key: cameraKey, initialized: true };
    setTransform(fitAnalyzerTransform(layout, element.clientWidth, element.clientHeight));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      event.button !== 0 ||
      (target instanceof Element && target.closest('button, a, input, select, textarea, [contenteditable="true"], [role="button"]'))
    ) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
      moved: false,
      background: true,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3) drag.moved = true;
    setTransform((current) => ({ ...current, x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY }));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>, clear = true) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (clear && drag.background && !drag.moved) onClearSelection();
  };

  const zoomAtPoint = useCallback((clientX: number, clientY: number, deltaY: number) => {
    const element = stageRef.current;
    if (!element || !Number.isFinite(deltaY) || deltaY === 0) return;
    const rect = element.getBoundingClientRect();
    const pointX = clientX - rect.left;
    const pointY = clientY - rect.top;
    const factor = deltaY < 0 ? 1.08 : 0.92;
    setTransform((current) => {
      const nextScale = Math.max(0.35, Math.min(1.4, current.scale * factor));
      const worldX = (pointX - current.x) / current.scale;
      const worldY = (pointY - current.y) / current.scale;
      return { scale: nextScale, x: pointX - worldX * nextScale, y: pointY - worldY * nextScale };
    });
  }, []);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const handleNativeWheel = (event: globalThis.WheelEvent) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      zoomAtPoint(event.clientX, event.clientY, event.deltaY);
    };
    element.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleNativeWheel);
  }, [zoomAtPoint]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClearSelection();
      setShowHelp(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClearSelection]);

  const renderEdge = (edge: AnalyzerViewEdge) => {
    const source = positionedById.get(edge.sourceId);
    const target = positionedById.get(edge.targetId);
    if (!source || !target) return null;
    const selected = edge.id === selectedEdgeId;
    const connected = selectedNodeId ? edge.sourceId === selectedNodeId || edge.targetId === selectedNodeId : false;
    const inContext = Boolean(
      (source.node.clusterId && selectionContext.contextClusterIds.has(source.node.clusterId))
      || (target.node.clusterId && selectionContext.contextClusterIds.has(target.node.clusterId)),
    );
    const dimmed = Boolean((selectedNodeId || selectedEdgeId) && !selected && !connected && !inContext);
    const contextual = Boolean((selectedNodeId || selectedEdgeId) && !selected && !connected && inContext);
    const emphasis = edge.presentation?.emphasis;
    return (
      <g key={edge.id} className={`analyzer-edge-group${selected ? ' is-selected' : ''}${connected ? ' is-connected' : ''}${emphasis === 'secondary' ? ' is-secondary' : ''}${emphasis === 'deep' ? ' is-deep' : ''}${edge.presentation?.displayKind === 'bundle' ? ' is-bundle' : ''}${contextual ? ' is-context' : ''}${dimmed ? ' is-dimmed' : ''}`}>
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
          <text className="analyzer-edge-label" x={(source.x + target.x) / 2 + ANALYZER_NODE_WIDTH / 2} y={(source.y + source.height / 2 + target.y + target.height / 2) / 2 - 8}>
            {edge.label}
          </text>
        )}
      </g>
    );
  };

  return (
    <div
      ref={stageRef}
      className="analyzer-graph-stage"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={(event) => handlePointerUp(event, false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClearSelection();
        }
      }}
      role="application"
      tabIndex={0}
      aria-label={`${view.view} graph stage. Drag to pan and use the wheel to zoom. Semantic zoom: ${zoomLevel}.`}
    >
      <div className="analyzer-stage-controls" aria-label="Graph controls">
        <button type="button" onClick={fit} title="現在のGraph全体を表示">Fit</button>
        <button type="button" onClick={resetTransform} title="カメラと表示状態を初期化">Reset</button>
        <button type="button" onClick={() => changeZoom(1.14)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => changeZoom(0.88)} aria-label="Zoom out">−</button>
        <span>{Math.round(transform.scale * 100)}%</span>
        <button type="button" className="analyzer-help-button" onClick={() => setShowHelp((current) => !current)} aria-expanded={showHelp} aria-controls="analyzer-graph-help" aria-label="Graph操作ヘルプ">?</button>
      </div>
      {showHelp && (
        <div id="analyzer-graph-help" className="analyzer-stage-help" role="dialog" aria-label="Graph操作ヘルプ">
          <strong>Graph操作</strong>
          <p>背景をドラッグして移動、Wheelで拡大縮小。Node / Edgeを選ぶと詳細が開き、背景クリックまたはEscで選択を解除します。</p>
        </div>
      )}
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
            {layout.lanes.map((lane) => (
              <div key={lane.id} className="analyzer-command-lane" style={{ left: lane.x, top: lane.y, width: lane.width, height: lane.height }} aria-label={`${lane.label} execution lane`}>
                <span>{lane.label}</span>
              </div>
            ))}
            <svg className="analyzer-edge-layer analyzer-edge-layer-base" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-label="Graph relations">
              <defs>
                <marker id="analyzer-edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                </marker>
              </defs>
              {backgroundEdges.map(renderEdge)}
            </svg>
            <svg className="analyzer-edge-layer analyzer-edge-layer-foreground" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
              {foregroundEdges.map(renderEdge)}
            </svg>
            {layout.nodes.map((positionedNode) => {
              const node = positionedNode.node;
              const matches = nodeMatchesSearch(node, search);
              const selected = node.id === selectedNodeId;
              const summary = node.presentation?.role === 'summary';
              const summaryExpanded = expandedPresentationIds.has(node.id) || (node.id === 'dependencies:external:summary' && showExternal);
              const nodeZoom = displayedZoomLevelForNode(zoomLevel, selected, expandedNodeIds.has(node.id));
              const connected = selectionContext.connectedNodeIds.has(node.id) && !selected;
              const inSelectionContext = selectionContext.contextNodeIds.has(node.id);
              const hasEvidencePreview = nodeZoom === 'near' && node.evidenceIds.length > 0 && (selected || hoveredNodeId === node.id);
              const compactEvidenceHint = zoomLevel === 'near' && node.evidenceIds.length > 0 && !hasEvidencePreview ? evidenceHint(node, view) : undefined;
              const displayedSubtitle = summary ? summarySubtitle(node, summaryExpanded) : node.subtitle;
              const dimmed = Boolean(search.trim() && !matches && !selected) || Boolean((selectedNodeId || selectedEdgeId) && !selected && !inSelectionContext);
              return (
                <div
                  key={node.id}
                  className={`analyzer-node node-type-${node.type} zoom-${nodeZoom}${summary ? ' is-summary' : ''}${selected ? ' is-selected' : ''}${connected ? ' is-connected' : ''}${hasEvidencePreview ? ' has-evidence-preview' : ''}${matches && search.trim() ? ' is-match' : ''}${dimmed ? ' is-dimmed' : ''}`}
                  style={nodeStyle(positionedNode)}
                  onClick={() => summary ? togglePresentation(node.id) : onSelectNode(node.id)}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(undefined)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (summary) togglePresentation(node.id);
                      else onSelectNode(node.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={summary ? undefined : selected}
                  aria-expanded={summary ? summaryExpanded : undefined}
                  aria-label={`${node.label}, ${displayNodeType(node)}${summary ? (summaryExpanded ? ', expanded' : ', collapsed') : ''}`}
                >
                  <span className="analyzer-node-type">{displayNodeType(node)}</span>
                  <strong>{node.label}</strong>
                  {nodeZoom !== 'far' && displayedSubtitle && <span className="analyzer-node-subtitle">{displayedSubtitle}</span>}
                  {compactEvidenceHint && <span className="analyzer-node-evidence-hint">Evidence · {compactEvidenceHint}</span>}
                  {nodeZoom === 'near' && node.evidenceIds.length > 0 && (
                    <div className="analyzer-node-evidence-preview">
                      <EvidencePreview evidenceIds={node.evidenceIds} evidence={view.evidence} sources={sources} compact />
                    </div>
                  )}
                  {nodeZoom !== 'far' && node.evidenceIds.length > 1 && (
                    <span className="analyzer-node-evidence">Evidence {node.evidenceIds.length}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
