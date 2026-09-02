import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { ANALYZER_DEFAULT_TRANSFORM, ANALYZER_EXTERNAL_SUMMARY_ID, ANALYZER_NODE_WIDTH, analyzerEdgeArrowMarkerId, analyzerEdgeObstacles, analyzerEdgePaths, analyzerFocusDepths, analyzerForegroundEdges, analyzerPresentationCount, analyzerPresentationCountLabel, displayedZoomLevelForNode, evidenceRangeLabel, fitAnalyzerTransform, focusAnalyzerTransform, layoutAnalyzerView, nodeMatchesSearch, preserveAnalyzerTransformOnViewportResize, presentAnalyzerView, regionMatchesSearch, semanticZoomLevelForScale, shouldRunAnalyzerInitialFit, shouldShowAnalyzerEvidencePreview, type AnalyzerEdgeRoutingDiagnostic, type AnalyzerFanoutRoutingDiagnostic, type AnalyzerGraphTransform, type AnalyzerViewCounts, type AnalyzerViewEdge, type AnalyzerViewModel, type PositionedGraphEndpoint, type PositionedNode } from '../../analyzer';
import { analyzerRegionContextEntityIds, analyzerStackCountLabel, displayDictionaryStack, factDictionaryStackId, nodeTypeLabels } from '../../analyzer';
import { stackPath } from '../../utils/routes';
import { EvidencePreview } from './EvidenceCodeBlock';

interface AnalyzerGraphStageProps {
  view: AnalyzerViewModel;
  selectedNodeId?: string;
  selectedRegionId?: string;
  selectedEdgeId?: string;
  filter: string;
  search: string;
  expandedPresentationIds: ReadonlySet<string>;
  onTogglePresentation: (presentationId: string) => void;
  onClearSelection: () => void;
  onResetPresentation: () => void;
  sources: Record<string, string>;
  onSelectNode: (nodeId: string, focus?: boolean) => void;
  onSelectRegion: (regionId: string, focus?: boolean) => void;
  onSelectEdge: (edgeId: string) => void;
  focusRequest?: { entityId: string; nonce: number };
  transform: AnalyzerGraphTransform;
  hasStoredCamera: boolean;
  onTransformChange: (update: AnalyzerGraphTransform | ((current: AnalyzerGraphTransform) => AnalyzerGraphTransform)) => void;
  cameraResetKey: string | number;
  onCountsChange: (counts: AnalyzerViewCounts) => void;
}

type GraphTransform = AnalyzerGraphTransform;
type GraphLayout = ReturnType<typeof layoutAnalyzerView>;

interface PresentationCameraSnapshot {
  cameraKey: string;
  expandedKey: string;
  layout: GraphLayout;
  transform: GraphTransform;
  selectedEntityId?: string;
}

function displayNodeType(node: AnalyzerViewModel['nodes'][number]): string {
  const displayRole = node.metadata.displayRole;
  return typeof displayRole === 'string' ? displayRole : nodeTypeLabels[node.type] ?? node.type;
}

function dictionaryStackForNode(node: AnalyzerViewModel['nodes'][number]): { name: string; id: string } | undefined {
  return node.metadata.stackUsage === true
    ? displayDictionaryStack(factDictionaryStackId(node))
    : undefined;
}

function nodeStyle(positionedNode: PositionedNode): CSSProperties {
  return { left: positionedNode.x, top: positionedNode.y, width: ANALYZER_NODE_WIDTH, height: positionedNode.height };
}

function endpointWidth(endpoint: PositionedGraphEndpoint): number {
  return 'region' in endpoint ? endpoint.width : ANALYZER_NODE_WIDTH;
}

function endpointCenter(endpoint: PositionedGraphEndpoint): { x: number; y: number } {
  return {
    x: endpoint.x + endpointWidth(endpoint) / 2,
    y: endpoint.y + endpoint.height / 2,
  };
}

function semanticAnchorPosition(layout: GraphLayout, view: AnalyzerViewModel, nodeId: string, visited = new Set<string>()): PositionedGraphEndpoint | undefined {
  const direct = layout.nodes.find((positionedNode) => positionedNode.node.id === nodeId);
  if (direct) return direct;
  const directRegion = layout.regions?.find((positionedRegion) => positionedRegion.region.id === nodeId);
  if (directRegion) return directRegion;
  const groupBounds = layout.summaryGroups.find((group) => group.id === nodeId)
    ?? layout.bands.find((band) => band.presentationId === nodeId);
  const summaryNode = view.nodes.find((node) => node.id === nodeId);
  if (groupBounds && summaryNode) {
    return {
      node: summaryNode,
      x: groupBounds.x + (groupBounds.width - ANALYZER_NODE_WIDTH) / 2,
      y: groupBounds.y + 4,
      height: 28,
    };
  }
  if (visited.has(nodeId)) return undefined;
  visited.add(nodeId);
  const node = view.nodes.find((candidate) => candidate.id === nodeId);
  const child = node?.presentation?.childNodeIds
    ?.map((childId) => layout.nodes.find((positionedNode) => positionedNode.node.id === childId))
    .find((positionedNode): positionedNode is PositionedNode => Boolean(positionedNode));
  if (child) return child;
  const parentId = node?.presentation?.parentId;
  return parentId ? semanticAnchorPosition(layout, view, parentId, visited) : undefined;
}

function changedPresentationIds(previousKey: string, currentKey: string): string[] {
  const previous = new Set(previousKey ? previousKey.split('\u0000') : []);
  const current = new Set(currentKey ? currentKey.split('\u0000') : []);
  return [...new Set([...previous, ...current])].filter((id) => previous.has(id) !== current.has(id));
}

function evidenceHint(node: AnalyzerViewModel['nodes'][number], view: AnalyzerViewModel): string | undefined {
  const evidence = node.evidenceIds
    .map((evidenceId) => view.evidence.find((candidate) => candidate.id === evidenceId))
    .find((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  return evidence ? evidenceRangeLabel(evidence) : undefined;
}

export function AnalyzerGraphStage({
  view,
  selectedNodeId,
  selectedRegionId,
  selectedEdgeId,
  filter,
  search,
  expandedPresentationIds,
  onTogglePresentation,
  onClearSelection,
  onResetPresentation,
  onSelectNode,
  onSelectRegion,
  onSelectEdge,
  sources,
  focusRequest,
  transform,
  hasStoredCamera,
  onTransformChange,
  cameraResetKey,
  onCountsChange,
}: AnalyzerGraphStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean; background: boolean } | undefined>(undefined);
  const cameraRef = useRef<{ key: string; initialized: boolean }>({ key: '', initialized: false });
  const presentationCameraSnapshotRef = useRef<PresentationCameraSnapshot | undefined>(undefined);
  const focusNonceRef = useRef<number>(-1);
  const previousViewportRef = useRef({ width: 0, height: 0 });
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | undefined>();
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const cameraKey = `${cameraResetKey}:${view.view}`;
  const expandedPresentationKey = useMemo(() => [...expandedPresentationIds].sort().join('\u0000'), [expandedPresentationIds]);

  useLayoutEffect(() => {
    cameraRef.current = { key: cameraKey, initialized: hasStoredCamera };
    focusNonceRef.current = -1;
  }, [cameraKey, hasStoredCamera]);

  const togglePresentation = useCallback((nodeId: string) => {
    onTogglePresentation(nodeId);
  }, [onTogglePresentation]);

  const filteredView = useMemo<AnalyzerViewModel>(() => {
    return presentAnalyzerView(view, { expandedPresentationIds, filter, search, selectedEdgeId, selectedNodeId, selectedRegionId });
  }, [expandedPresentationIds, filter, search, selectedEdgeId, selectedNodeId, selectedRegionId, view]);
  useEffect(() => {
    if (filteredView.counts) onCountsChange(filteredView.counts);
  }, [filteredView.counts, onCountsChange]);
  const baseLayout = useMemo(() => layoutAnalyzerView(filteredView), [filteredView]);
  const zoomLevel = semanticZoomLevelForScale(transform.scale);
  const expandedNodeKey = useMemo(() => {
    const selected = baseLayout.nodes.find((positionedNode) => positionedNode.node.id === selectedNodeId);
    return selected?.node.evidenceIds.length ? selected.node.id : '';
  }, [baseLayout, selectedNodeId]);
  const expandedNodeIds = useMemo(() => new Set(expandedNodeKey ? expandedNodeKey.split('\u0000') : []), [expandedNodeKey]);
  const layout = useMemo(() => layoutAnalyzerView(filteredView, expandedNodeIds), [expandedNodeIds, filteredView]);
  const positionedById = useMemo(() => {
    const positions = new Map<string, PositionedGraphEndpoint>();
    layout.nodes.forEach((positionedNode) => positions.set(positionedNode.node.id, positionedNode));
    layout.regions?.forEach((positionedRegion) => positions.set(positionedRegion.region.id, positionedRegion));
    return positions;
  }, [layout.nodes, layout.regions]);
  const edgePositions = useMemo(() => {
    const positions = new Map(positionedById);
    filteredView.edges.forEach((edge) => {
      [edge.sourceId, edge.targetId].forEach((nodeId) => {
        if (positions.has(nodeId)) return;
        const anchor = semanticAnchorPosition(layout, filteredView, nodeId);
        if (anchor) positions.set(nodeId, anchor);
      });
    });
    return positions;
  }, [filteredView, layout, positionedById]);
  const selectedPosition = useMemo(() => {
    if (selectedNodeId) return positionedById.get(selectedNodeId) ?? semanticAnchorPosition(layout, filteredView, selectedNodeId);
    if (selectedRegionId) return positionedById.get(selectedRegionId) ?? semanticAnchorPosition(layout, filteredView, selectedRegionId);
    const selectedEdge = selectedEdgeId ? filteredView.edges.find((edge) => edge.id === selectedEdgeId) : undefined;
    return selectedEdge
      ? positionedById.get(selectedEdge.sourceId)
        ?? semanticAnchorPosition(layout, filteredView, selectedEdge.sourceId)
        ?? positionedById.get(selectedEdge.targetId)
        ?? semanticAnchorPosition(layout, filteredView, selectedEdge.targetId)
      : undefined;
  }, [filteredView, layout, positionedById, selectedEdgeId, selectedNodeId, selectedRegionId]);
  useLayoutEffect(() => {
    const previous = presentationCameraSnapshotRef.current;
    if (previous && previous.cameraKey === cameraKey && previous.expandedKey !== expandedPresentationKey) {
      const candidates = [
        selectedNodeId,
        selectedRegionId,
        ...changedPresentationIds(previous.expandedKey, expandedPresentationKey),
        previous.selectedEntityId,
      ].filter((nodeId): nodeId is string => Boolean(nodeId));
      const anchor = candidates
        .map((nodeId) => ({
          previous: semanticAnchorPosition(previous.layout, view, nodeId),
          current: semanticAnchorPosition(layout, view, nodeId),
        }))
        .find((candidate): candidate is { previous: PositionedGraphEndpoint; current: PositionedGraphEndpoint } => Boolean(candidate.previous && candidate.current));
      if (anchor) {
        const previousCenter = endpointCenter(anchor.previous);
        const currentCenter = endpointCenter(anchor.current);
        const targetX = previous.transform.x + previousCenter.x * previous.transform.scale;
        const targetY = previous.transform.y + previousCenter.y * previous.transform.scale;
        onTransformChange((currentTransform) => {
          const next = {
            ...currentTransform,
            x: targetX - currentCenter.x * currentTransform.scale,
            y: targetY - currentCenter.y * currentTransform.scale,
          };
          return Math.abs(next.x - currentTransform.x) < 0.5 && Math.abs(next.y - currentTransform.y) < 0.5
            ? currentTransform
            : next;
        });
      }
    }
    presentationCameraSnapshotRef.current = {
      cameraKey,
      expandedKey: expandedPresentationKey,
      layout,
      transform: { x: transform.x, y: transform.y, scale: transform.scale },
      selectedEntityId: selectedNodeId ?? selectedRegionId,
    };
  }, [cameraKey, expandedPresentationKey, layout, onTransformChange, selectedNodeId, selectedRegionId, transform.scale, transform.x, transform.y, view]);
  const foregroundEdges = useMemo(() => analyzerForegroundEdges(filteredView.edges, selectedEdgeId, selectedNodeId, selectedRegionId), [filteredView.edges, selectedEdgeId, selectedNodeId, selectedRegionId]);
  const backgroundEdges = useMemo(() => filteredView.edges.filter((edge) => !foregroundEdges.includes(edge)), [filteredView.edges, foregroundEdges]);
  const hasSelectedEdge = Boolean(selectedEdgeId && filteredView.edges.some((edge) => edge.id === selectedEdgeId));
  const edgeObstacles = useMemo(() => analyzerEdgeObstacles(layout), [layout]);
  const edgeFlowDirection = view.view === 'command' || view.view === 'dependencies' ? 'horizontal' as const : 'auto' as const;
  const edgeRoutingResult = useMemo(() => {
    const fanoutDiagnostics = new Map<string, AnalyzerFanoutRoutingDiagnostic>();
    const edgeDiagnostics = new Map<string, AnalyzerEdgeRoutingDiagnostic>();
    const diagnosticsEnabled = import.meta.env.DEV;
    const edgePaths = analyzerEdgePaths(filteredView.edges, edgePositions, edgeObstacles, {
      flowDirection: edgeFlowDirection,
      bounds: { x: 0, y: 0, width: layout.width, height: layout.height },
      ...(diagnosticsEnabled ? {
        onFanoutDiagnostic: (diagnostic: AnalyzerFanoutRoutingDiagnostic) => {
          fanoutDiagnostics.set(diagnostic.fanoutGroupId, diagnostic);
        },
        onEdgeDiagnostic: (diagnostic: AnalyzerEdgeRoutingDiagnostic) => {
          edgeDiagnostics.set(diagnostic.edgeId, diagnostic);
        },
      } : {}),
    });
    return { edgePaths, fanoutDiagnostics, edgeDiagnostics };
  }, [edgeFlowDirection, edgeObstacles, edgePositions, filteredView.edges, layout.height, layout.width]);
  const edgePaths = edgeRoutingResult.edgePaths;
  const selectionContext = useMemo(() => {
    const connectedEntityIds = new Set<string>();
    const contextClusterIds = new Set<string>();
    if (selectedNodeId) {
      connectedEntityIds.add(selectedNodeId);
      const selectedNode = filteredView.nodes.find((node) => node.id === selectedNodeId);
      if (selectedNode?.clusterId) contextClusterIds.add(selectedNode.clusterId);
      filteredView.edges.forEach((edge) => {
        if (edge.sourceId !== selectedNodeId && edge.targetId !== selectedNodeId) return;
        const otherId = edge.sourceId === selectedNodeId ? edge.targetId : edge.sourceId;
        connectedEntityIds.add(otherId);
        const other = filteredView.nodes.find((node) => node.id === otherId);
        if (other?.clusterId) contextClusterIds.add(other.clusterId);
      });
    }
    if (selectedRegionId) {
      connectedEntityIds.add(selectedRegionId);
      analyzerRegionContextEntityIds(filteredView, selectedRegionId, true).forEach((entityId) => connectedEntityIds.add(entityId));
      const contextRegionIds = new Set(analyzerRegionContextEntityIds(filteredView, selectedRegionId, true));
      filteredView.edges.forEach((edge) => {
        if (!contextRegionIds.has(edge.sourceId) && !contextRegionIds.has(edge.targetId)) return;
        const otherId = edge.sourceId === selectedRegionId ? edge.targetId : edge.sourceId;
        if (edge.sourceId !== selectedRegionId && edge.targetId !== selectedRegionId) {
          connectedEntityIds.add(edge.sourceId);
          connectedEntityIds.add(edge.targetId);
          return;
        }
        connectedEntityIds.add(otherId);
        const other = filteredView.nodes.find((node) => node.id === otherId);
        if (other?.clusterId) contextClusterIds.add(other.clusterId);
      });
    }
    if (selectedEdgeId) {
      const selectedEdge = filteredView.edges.find((edge) => edge.id === selectedEdgeId);
      if (selectedEdge) {
        [selectedEdge.sourceId, selectedEdge.targetId].forEach((entityId) => {
          connectedEntityIds.add(entityId);
          const node = filteredView.nodes.find((candidate) => candidate.id === entityId);
          if (node?.clusterId) contextClusterIds.add(node.clusterId);
        });
      }
    }
    const contextNodeIds = new Set(connectedEntityIds);
    filteredView.nodes.forEach((node) => {
      if (node.clusterId && contextClusterIds.has(node.clusterId)) contextNodeIds.add(node.id);
    });
    return { connectedEntityIds, contextClusterIds, contextNodeIds };
  }, [filteredView, selectedEdgeId, selectedNodeId, selectedRegionId]);
  useEffect(() => {
    if (!import.meta.env.DEV || (!selectedNodeId && !selectedRegionId && !selectedEdgeId)) return;
    const loggedFanoutGroups = new Set<string>();
    filteredView.edges.forEach((edge) => {
      const explicitlySelected = edge.id === selectedEdgeId;
      const relatedToSelectedEntity = Boolean(
        (selectedNodeId && (edge.sourceId === selectedNodeId || edge.targetId === selectedNodeId))
        || (selectedRegionId && (edge.sourceId === selectedRegionId || edge.targetId === selectedRegionId)),
      );
      if (!explicitlySelected && !relatedToSelectedEntity) return;
      const routing = edgeRoutingResult.edgeDiagnostics.get(edge.id);
      const source = edgePositions.get(edge.sourceId);
      const target = edgePositions.get(edge.targetId);
      if (!routing || !source || !target) return;

      const isBundleEdge = edge.presentation?.displayKind === 'bundle';
      const sourceNode = 'node' in source ? source.node : undefined;
      const targetNode = 'node' in target ? target.node : undefined;
      const isSummaryEdge = sourceNode?.presentation?.role === 'summary' || targetNode?.presentation?.role === 'summary';
      const isPresentationEdge = Boolean(edge.presentation?.displayKind || edge.presentation?.parentId || edge.presentation?.initiallyHidden);
      const isFactEdge = !isBundleEdge && !isSummaryEdge;
      const edgeCollection = isBundleEdge
        ? 'bundleEdges'
        : isSummaryEdge
          ? 'summaryEdges'
          : isPresentationEdge
            ? 'presentationEdges'
            : 'factEdges';
      const pathId = `analyzer-edge-path-${edge.id}`;
      const fanoutGroupDiagnostic = routing.fanoutGroupId
        ? edgeRoutingResult.fanoutDiagnostics.get(routing.fanoutGroupId)
        : undefined;

      if (fanoutGroupDiagnostic && !loggedFanoutGroups.has(fanoutGroupDiagnostic.fanoutGroupId)) {
        loggedFanoutGroups.add(fanoutGroupDiagnostic.fanoutGroupId);
        console.info('[Analyzer Fanout Candidate Diagnostic]', {
          fanoutGroupId: fanoutGroupDiagnostic.fanoutGroupId,
          sourceId: fanoutGroupDiagnostic.sourceId,
          edgeIds: fanoutGroupDiagnostic.edgeIds,
          targetIds: fanoutGroupDiagnostic.targetIds,
          fanoutDetected: fanoutGroupDiagnostic.fanoutDetected,
          busCandidateCount: fanoutGroupDiagnostic.busCandidateCount,
          preferredDirection: fanoutGroupDiagnostic.preferredDirection,
          selectedDirection: fanoutGroupDiagnostic.selectedDirection,
          evaluatedDirections: fanoutGroupDiagnostic.evaluatedDirections,
          directionDiagnostics: fanoutGroupDiagnostic.directionDiagnostics,
          targetGroupBounds: fanoutGroupDiagnostic.targetGroupBounds,
          fallbackUsed: fanoutGroupDiagnostic.fallbackUsed,
          fallbackReason: fanoutGroupDiagnostic.fallbackReason,
          candidateDiagnostics: fanoutGroupDiagnostic.candidateDiagnostics,
        });
      }

      console.info('[Analyzer Edge Diagnostic]', {
        edgeId: routing.edgeId,
        fromNodeId: routing.sourceId,
        toNodeId: routing.targetId,
        fromNodeLabel: sourceNode?.label,
        toNodeLabel: targetNode?.label,
        fromEndpointKind: 'region' in source ? 'region' : 'node',
        toEndpointKind: 'region' in target ? 'region' : 'node',
        fromRegionId: 'region' in source ? source.region.id : undefined,
        toRegionId: 'region' in target ? target.region.id : undefined,
        relation: edge.label,
        relationType: routing.edgeKind,
        presentationKind: edge.presentation?.displayKind ?? (edge.presentation ? 'presentation-metadata' : 'none'),
        presentation: edge.presentation,
        isFactEdge,
        isBundleEdge,
        isSummaryEdge,
        isPresentationEdge,
        renderer: 'AnalyzerGraphStage.renderEdge',
        sourceCollection: foregroundEdges.some((candidate) => candidate.id === edge.id) ? 'foregroundEdges' : 'backgroundEdges',
        edgeCollection,
        routingStrategy: routing.routingStrategy,
        routeCollection: routing.routingStrategy === 'structural-fanout'
          ? 'fanoutRoutes'
          : routing.routingStrategy === 'generic-fallback'
            ? 'genericRoutes (fanout fallback)'
            : 'genericRoutes',
        fanoutGroupId: routing.fanoutGroupId,
        fanoutDetected: routing.fanoutDetected,
        busUsed: routing.busUsed,
        busX: routing.selectedBusX,
        busY: routing.selectedBusY,
        busCandidateCount: routing.busCandidateCount,
        preferredDirection: routing.preferredDirection,
        selectedDirection: routing.selectedDirection,
        evaluatedDirections: routing.evaluatedDirections,
        directionDiagnostics: routing.directionDiagnostics,
        targetGroupBounds: routing.targetGroupBounds,
        candidateDiagnostics: routing.candidateDiagnostics,
        fallbackUsed: routing.fallbackUsed,
        fallbackReason: routing.fallbackReason,
        pathPoints: routing.pathPoints,
        pathData: edgeRoutingResult.edgePaths.get(edge.id),
        basePathId: pathId,
        highlightPathId: pathId,
        sameGeometry: true,
        highlight: explicitlySelected ? 'explicit-selected-edge' : 'node-related-edge',
        fanoutGroupDiagnostic,
      });
    });
  }, [edgePositions, edgeRoutingResult, filteredView.edges, foregroundEdges, selectedEdgeId, selectedNodeId, selectedRegionId]);
  const architectureFocusDepths = useMemo(() => {
    if (filteredView.view !== 'architecture' || !selectedNodeId) return new Map<string, number>();
    const degree = new Set(filteredView.edges.flatMap((edge) => {
      if (edge.sourceId === selectedNodeId) return [edge.targetId];
      if (edge.targetId === selectedNodeId) return [edge.sourceId];
      return [];
    })).size;
    return degree >= 4 ? analyzerFocusDepths(filteredView, selectedNodeId) : new Map<string, number>();
  }, [filteredView, selectedNodeId]);

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
    onTransformChange((current) => preserveAnalyzerTransformOnViewportResize(current, previous, viewportSize, selectedPosition));
  }, [onTransformChange, selectedPosition, viewportSize]);

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element || layout.nodes.length === 0 && (layout.regions?.length ?? 0) === 0 || viewportSize.width <= 0 || viewportSize.height <= 0) return;
    if (cameraRef.current.key !== cameraKey) cameraRef.current = { key: cameraKey, initialized: hasStoredCamera };
    if (cameraRef.current.initialized || !shouldRunAnalyzerInitialFit(hasStoredCamera)) return;
    const applyFit = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (width <= 0 || height <= 0) return;
      cameraRef.current = { key: cameraKey, initialized: true };
      onTransformChange(fitAnalyzerTransform(layout, width, height));
    };
    applyFit();
  }, [cameraKey, hasStoredCamera, layout, onTransformChange, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (!focusRequest || focusRequest.nonce === focusNonceRef.current) return;
    const element = stageRef.current;
    const selectedPosition = positionedById.get(focusRequest.entityId) ?? semanticAnchorPosition(layout, filteredView, focusRequest.entityId);
    if (!element || !selectedPosition || element.clientWidth <= 0 || element.clientHeight <= 0) return;
    focusNonceRef.current = focusRequest.nonce;
    onTransformChange((current) => focusAnalyzerTransform(selectedPosition, element.clientWidth, element.clientHeight, current.scale));
  }, [filteredView, focusRequest, layout, onTransformChange, positionedById]);

  const changeZoom = (factor: number) => onTransformChange((current) => ({ ...current, scale: Math.max(0.35, Math.min(1.4, current.scale * factor)) }));
  const resetTransform = () => {
    cameraRef.current = { key: cameraKey, initialized: true };
    onResetPresentation();
    onTransformChange(ANALYZER_DEFAULT_TRANSFORM);
  };
  const fit = () => {
    const element = stageRef.current;
    if (!element) return;
    cameraRef.current = { key: cameraKey, initialized: true };
    onTransformChange(fitAnalyzerTransform(layout, element.clientWidth, element.clientHeight));
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
    onTransformChange((current) => ({ ...current, x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY }));
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
    onTransformChange((current) => {
      const nextScale = Math.max(0.35, Math.min(1.4, current.scale * factor));
      const worldX = (pointX - current.x) / current.scale;
      const worldY = (pointY - current.y) / current.scale;
      return { scale: nextScale, x: pointX - worldX * nextScale, y: pointY - worldY * nextScale };
    });
  }, [onTransformChange]);

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
    const source = edgePositions.get(edge.sourceId);
    const target = edgePositions.get(edge.targetId);
    const path = edgePaths.get(edge.id);
    if (!source || !target || !path) return null;
    const routing = edgeRoutingResult.edgeDiagnostics.get(edge.id);
    const selected = edge.id === selectedEdgeId;
    const connected = !selected && (
      selectionContext.connectedEntityIds.has(edge.sourceId)
      || selectionContext.connectedEntityIds.has(edge.targetId)
    );
    const sourceNode = 'node' in source ? source.node : undefined;
    const targetNode = 'node' in target ? target.node : undefined;
    const inContext = Boolean(
      (sourceNode?.clusterId && selectionContext.contextClusterIds.has(sourceNode.clusterId))
      || (targetNode?.clusterId && selectionContext.contextClusterIds.has(targetNode.clusterId)),
    );
    const hasSelection = Boolean(selectedNodeId || selectedRegionId || selectedEdgeId);
    const contextual = Boolean(hasSelection && !selected && !connected && inContext);
    const sourceDepth = architectureFocusDepths.get(edge.sourceId);
    const targetDepth = architectureFocusDepths.get(edge.targetId);
    const focusDepth = sourceDepth === undefined || targetDepth === undefined ? undefined : Math.max(sourceDepth, targetDepth);
    const dimmed = Boolean(hasSelection && !selected && !connected && !inContext && focusDepth === undefined);
    const emphasis = focusDepth === undefined
      ? edge.presentation?.emphasis
      : focusDepth <= 1
        ? 'primary'
        : focusDepth === 2
          ? 'secondary'
          : 'deep';
    const arrowMarkerId = analyzerEdgeArrowMarkerId({
      selected,
      connected,
      bundle: edge.presentation?.displayKind === 'bundle',
      focusDepth,
    });
    return (
      <g key={edge.id} className={`analyzer-edge-group${selected ? ' is-selected' : ''}${connected ? ' is-connected' : ''}${focusDepth !== undefined ? ' is-focus-depth' : ''}${emphasis === 'secondary' ? ' is-secondary' : ''}${emphasis === 'deep' ? ' is-deep' : ''}${edge.presentation?.displayKind === 'bundle' ? ' is-bundle' : ''}${contextual ? ' is-context' : ''}${dimmed ? ' is-dimmed' : ''}`}>
        <path
          id={import.meta.env.DEV ? `analyzer-edge-path-${edge.id}` : undefined}
          className="analyzer-edge-hit"
          data-analyzer-edge-id={import.meta.env.DEV ? edge.id : undefined}
          data-analyzer-routing-strategy={import.meta.env.DEV ? routing?.routingStrategy : undefined}
          data-analyzer-fanout-detected={import.meta.env.DEV ? (routing?.fanoutDetected ? 'true' : 'false') : undefined}
          data-analyzer-bus-used={import.meta.env.DEV ? (routing?.busUsed ? 'true' : 'false') : undefined}
          d={path}
          markerEnd={`url(#${arrowMarkerId})`}
          role="button"
          tabIndex={0}
          aria-label={`${edge.label}: ${'region' in source ? source.region.label : source.node.label} to ${'region' in target ? target.region.label : target.node.label}`}
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
          <text className="analyzer-edge-label" x={(endpointCenter(source).x + endpointCenter(target).x) / 2} y={(endpointCenter(source).y + endpointCenter(target).y) / 2 - 8}>
            {edge.label}
          </text>
        )}
      </g>
    );
  };
  const hasExpandedExternalSummaryRegion = layout.summaryGroups.some((group) => group.id === ANALYZER_EXTERNAL_SUMMARY_ID);

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
          <p>背景をドラッグして移動、Wheelで拡大縮小。Node / Region / Edgeを選ぶと詳細が開き、背景クリックまたはEscで選択を解除します。</p>
        </div>
      )}
      {filteredView.nodes.length === 0 && (filteredView.regions?.length ?? 0) === 0 ? (
        <div className="analyzer-graph-empty">現在のFilterに一致するNodeまたはRegionはありません。</div>
      ) : (
        <div className="analyzer-graph-viewport">
          <div className={`analyzer-graph-world${hasSelectedEdge ? ' has-selected-edge' : ''}`} style={{ width: layout.width, height: layout.height, transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
            {layout.clusters.map((cluster) => {
              const hideDuplicateExternalHeading = cluster.id === 'dependencies:external' && hasExpandedExternalSummaryRegion;
              return (
                <section key={cluster.id} className={`analyzer-cluster-plane tone-${cluster.tone}`} style={{ left: cluster.x, top: cluster.y, width: cluster.width, height: cluster.height }} aria-label={cluster.label}>
                  {!hideDuplicateExternalHeading && (
                    <div className="analyzer-cluster-heading">
                      <span>{cluster.label}</span>
                    </div>
                  )}
                </section>
              );
            })}
            {layout.lanes.map((lane) => (
              <div key={lane.id} className="analyzer-command-lane" style={{ left: lane.x, top: lane.y, width: lane.width, height: lane.height }} aria-label={`${lane.label} execution lane`}>
                <span className="analyzer-lane-label">{lane.label}</span>
              </div>
            ))}
            {layout.summaryGroups.map((group) => (
              <section
                key={group.id}
                className={`analyzer-summary-group depth-${Math.min(3, group.depth)}${selectedNodeId === group.id ? ' is-selected' : ''}`}
                style={{ left: group.x, top: group.y, width: group.width, height: group.height }}
                aria-label={`${group.label} summary region`}
              >
                <div className="analyzer-summary-group-heading">
                  <span className="analyzer-summary-group-kicker" aria-hidden="true">◇</span>
                  <strong>{group.label}</strong>
                  <span className="analyzer-summary-group-count">· {group.count} {group.countLabel}</span>
                  <button type="button" className="analyzer-summary-group-toggle" onClick={() => onTogglePresentation(group.id)} aria-expanded={true}>
                    Collapse
                  </button>
                </div>
              </section>
            ))}
            {layout.bands.map((band) => {
              const bandExpanded = Boolean(band.presentationId && filteredView.presentationGroups?.find((group) => group.id === band.presentationId)?.expanded);
              return (
                <div key={band.id} className={`analyzer-layout-band analyzer-layout-band-${band.kind} depth-${Math.min(3, band.depth)}${bandExpanded ? ' is-expanded' : ''}${selectedNodeId === band.presentationId ? ' is-selected' : ''}`} style={{ left: band.x, top: band.y, width: band.width, height: band.height }} aria-label={`${band.label} summary region`}>
                  <div className="analyzer-summary-group-heading">
                    <span className="analyzer-summary-group-kicker" aria-hidden="true">◇</span>
                    <strong>{band.label}</strong>
                    <span className="analyzer-summary-group-count">· {band.count} {band.countLabel}</span>
                    {band.presentationId && (
                      <button type="button" className="analyzer-summary-group-toggle" onClick={() => onTogglePresentation(band.presentationId!)} aria-expanded={bandExpanded}>
                        {bandExpanded ? 'Collapse' : 'Expand'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {(layout.regions ?? []).map((positionedRegion) => {
              const region = positionedRegion.region;
              const selected = region.id === selectedRegionId;
              const searchValue = search.trim().toLowerCase();
              const matches = !searchValue || regionMatchesSearch(region, searchValue);
              return (
                <section
                  key={region.id}
                  className={`analyzer-semantic-region depth-${Math.min(3, region.depth ?? 0)}${region.parentRegionId ? ' is-nested' : ''}${selected ? ' is-selected' : ''}${matches && searchValue ? ' is-match' : ''}`}
                  style={{ left: positionedRegion.x, top: positionedRegion.y, width: positionedRegion.width, height: positionedRegion.height }}
                  data-analyzer-region-id={import.meta.env.DEV ? region.id : undefined}
                  aria-label={`${region.label} semantic region`}
                >
                  <button
                    type="button"
                    className="analyzer-semantic-region-heading"
                    onClick={() => onSelectRegion(region.id)}
                    aria-pressed={selected}
                  >
                    <span className="analyzer-semantic-region-kicker" aria-hidden="true">◇</span>
                    <strong>{region.label}</strong>
                    {region.subtitle && <span className="analyzer-semantic-region-subtitle">{region.subtitle}</span>}
                    <span className="analyzer-semantic-region-count">{analyzerStackCountLabel(region.childIds.length)}</span>
                  </button>
                </section>
              );
            })}
            <svg className="analyzer-edge-layer analyzer-edge-layer-base" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-label="Graph relations">
              <defs>
                <marker id="analyzer-edge-arrow-normal" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto" markerUnits="userSpaceOnUse" viewBox="0 0 9 9">
                  <path d="M 0 0 L 9 4.5 L 0 9 z" fill="var(--connector)" />
                </marker>
                <marker id="analyzer-edge-arrow-related" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto" markerUnits="userSpaceOnUse" viewBox="0 0 9 9">
                  <path d="M 0 0 L 9 4.5 L 0 9 z" fill="var(--analyzer-edge-related)" />
                </marker>
                <marker id="analyzer-edge-arrow-selected" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto" markerUnits="userSpaceOnUse" viewBox="0 0 9 9">
                  <path d="M 0 0 L 9 4.5 L 0 9 z" fill="var(--analyzer-edge-selected)" />
                </marker>
                <marker id="analyzer-edge-arrow-bundle" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto" markerUnits="userSpaceOnUse" viewBox="0 0 9 9">
                  <path d="M 0 0 L 9 4.5 L 0 9 z" fill="var(--warm)" />
                </marker>
                <marker id="analyzer-edge-arrow-deep" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto" markerUnits="userSpaceOnUse" viewBox="0 0 9 9">
                  <path d="M 0 0 L 9 4.5 L 0 9 z" fill="var(--subtle)" />
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
              const summaryExpanded = summary && Boolean(filteredView.presentationGroups?.some((group) => group.id === node.id && group.expanded));
              if (summaryExpanded) return null;
              const nestedSummary = summary && Boolean(node.presentation?.parentId && filteredView.presentationGroups?.some((group) => group.id === node.presentation?.parentId && group.expanded));
              const nodeZoom = displayedZoomLevelForNode(zoomLevel, selected, expandedNodeIds.has(node.id));
              const connected = selectionContext.connectedEntityIds.has(node.id) && !selected;
              const inSelectionContext = selectionContext.contextNodeIds.has(node.id);
              const focusDepth = architectureFocusDepths.get(node.id);
              const focusClass = focusDepth === undefined
                ? ''
                : focusDepth <= 1
                  ? ' is-focus-primary'
                  : focusDepth === 2
                    ? ' is-focus-secondary'
                    : ' is-focus-deep';
              const hasEvidencePreview = shouldShowAnalyzerEvidencePreview(nodeZoom, selected, node.evidenceIds.length > 0);
              const compactEvidenceHint = !summary && zoomLevel === 'near' && node.evidenceIds.length > 0 && !hasEvidencePreview ? evidenceHint(node, view) : undefined;
              const summaryCount = summary ? analyzerPresentationCount(node) : 0;
              const summaryCountLabel = summary ? analyzerPresentationCountLabel(node) : '';
              const dictionaryStack = dictionaryStackForNode(node);
              const dimmed = Boolean(search.trim() && !matches && !selected) || Boolean((selectedNodeId || selectedRegionId || selectedEdgeId) && !selected && !inSelectionContext && focusDepth === undefined);
              return (
                <div
                  key={node.id}
                  className={`analyzer-node analyzer-node-view-${view.view} node-type-${node.type} zoom-${nodeZoom}${summary ? ' is-summary' : ''}${nestedSummary ? ' is-nested-summary' : ''}${selected ? ' is-selected' : ''}${connected ? ' is-connected' : ''}${focusClass}${hasEvidencePreview ? ' has-evidence-preview' : ''}${matches && search.trim() ? ' is-match' : ''}${dimmed ? ' is-dimmed' : ''}`}
                  style={nodeStyle(positionedNode)}
                  onClick={() => summary ? togglePresentation(node.id) : onSelectNode(node.id)}
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
                  aria-expanded={summary ? false : undefined}
                  aria-label={`${node.label}, ${summary ? 'Summary card collapsed' : displayNodeType(node)}`}
                >
                  {summary ? (
                    nestedSummary ? (
                      <>
                        <span className="analyzer-summary-card-kicker" aria-hidden="true">◇</span>
                        <strong>{node.label}</strong>
                        <span className="analyzer-summary-card-count">· {summaryCount} {summaryCountLabel}</span>
                        <span className="analyzer-summary-card-action">Expand <span aria-hidden="true">→</span></span>
                      </>
                    ) : (
                      <>
                        <span className="analyzer-summary-card-kicker">◇ SUMMARY</span>
                        <strong>{node.label}</strong>
                        <span className="analyzer-summary-card-count">{summaryCount} {summaryCountLabel}</span>
                        <span className="analyzer-summary-card-action">Expand <span aria-hidden="true">→</span></span>
                      </>
                    )
                  ) : (
                    <>
                      <span className="analyzer-node-type">{displayNodeType(node)}</span>
                      <strong>
                        {dictionaryStack ? (
                          <Link
                            className="analyzer-node-title-link"
                            to={stackPath(dictionaryStack.id)}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            {node.label}
                          </Link>
                        ) : node.label}
                      </strong>
                      {nodeZoom !== 'far' && node.subtitle && <span className="analyzer-node-subtitle">{node.subtitle}</span>}
                    </>
                  )}
                  {compactEvidenceHint && <span className="analyzer-node-evidence-hint">Evidence · {compactEvidenceHint}</span>}
                  {hasEvidencePreview && (
                    <div className="analyzer-node-evidence-preview">
                      <EvidencePreview evidenceIds={node.evidenceIds} evidence={view.evidence} sources={sources} compact />
                    </div>
                  )}
                  {nodeZoom !== 'far' && node.evidenceIds.length > 1 && !compactEvidenceHint && (
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
