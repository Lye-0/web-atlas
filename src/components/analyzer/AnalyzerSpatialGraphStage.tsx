import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import * as THREE from 'three';
import {
  ANALYZER_MODULE_NODE_WIDTH,
  ANALYZER_SPATIAL_TILT_DEGREES,
  ANALYZER_SPATIAL_YAW_DEGREES,
  ANALYZER_SPATIAL_FIT_PADDING,
  assignSpatialBoundaryPorts,
  assignProjectedPerimeterPorts,
  spatialEdgeClass,
  collectSpatialEdgeSet,
  computeSpatialWorldBounds,
  fitSpatialProjectedBounds,
  focusSpatialCamera,
  isRootPackageRegion,
  layoutAnalyzerView,
  moduleWorldAnchor,
  nodeMatchesSearch,
  projectSpatialPoint,
  projectWorldRect,
  projectedModuleNode,
  projectedArrow,
  projectedPathD,
  regionDisplayLabel,
  regionHeadingWorldAnchor,
  regionMatchesSearch,
  regionRectCorners,
  shortestUniqueRegionLabels,
  spatialCameraModel,
  spatialLabelScreenScale,
  spatialModuleElevation,
  spatialRegionDepthElevation,
  spatialRegionVisible,
  spatialRegionHeadingWidth,
  spatialCameraFrameTransform,
  zoomSpatialCamera,
  spatialWheelZoomFactor,
  createSpatialCameraLoop,
  createSpatialInteractionCounters,
  panSpatialTransform,
  spatialLodLevelWithHysteresis,
  withSpatialCameraSchema,
  type AnalyzerGraphTransform,
  type AnalyzerSemanticRegion,
  type AnalyzerViewCounts,
  type AnalyzerViewModel,
  type PositionedNode,
  type PositionedSemanticRegion,
  type ProjectedGraphEdge,
  type ProjectedModuleNode,
  type ProjectedRect,
  type SpatialCameraModel,
  type SpatialWorldRect,
  type SpatialWorldPoint,
  type SpatialRouteObstacle,
} from '../../analyzer';
import { SpatialAtlasScene } from './SpatialAtlasScene';
import { spatialBridgeRoute, spatialPortNormal, assignSpatialBridgeLanes, spatialPathIntersectsViewport } from '../../analyzer/spatialBridge';
import { spatialScreenPointToWorldAtElevation } from '../../analyzer/spatialCoordinates';
import { configureSpatialCamera } from '../../analyzer/spatialThreeCamera';
import { projectSpatialHeadings } from '../../analyzer/spatialHeadings';
import { SPATIAL_FLOW_SPEED, type SpatialFlowState } from '../../analyzer/spatialFlow';
import { useSpatialFlowMotion } from './useSpatialFlowMotion';
import { SpatialParticleControl } from './SpatialParticleControl';
import { SemanticFlowLegend } from './SemanticFlowLegend';
import { semanticFlowDirectionLanguage } from './semanticFlowLanguage';
import { prepareAutoAggregation, projectAutoAggregation, projectAggregationRelations, shortAggregationLabels, stableAggregationRepresentation, type AutoAggregationResult } from '../../analyzer/autoAggregation';
import { moduleAggregationInput, moduleAggregationProjection, moduleManualGroups, moduleRelationEvidenceCounts } from '../../analyzer/moduleAutoAggregation';
import type { AnalyzerViewSession } from '../../analyzer/session';
import { AutoAggregationPanel, AutoAggregationToggle, type AggregationInspection, type AggregationGroupMode } from './AutoAggregationPanel';

interface AnalyzerSpatialGraphStageProps {
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
  onSelectNode: (nodeId: string, focus?: boolean) => void;
  onSelectRegion: (regionId: string, focus?: boolean) => void;
  onSelectEdge: (edgeId: string) => void;
  focusRequest?: { entityId: string; nonce: number; entityIds?: string[] };
  transform: AnalyzerGraphTransform;
  hasStoredCamera: boolean;
  onTransformChange: (update: AnalyzerGraphTransform | ((current: AnalyzerGraphTransform) => AnalyzerGraphTransform)) => void;
  cameraResetKey: string | number;
  onCountsChange: (counts: AnalyzerViewCounts) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  autoAggregation?: boolean; onAutoAggregation?: (enabled: boolean) => void;
  aggregationState?: AnalyzerViewSession['aggregation']; onAggregationState?: (state: NonNullable<AnalyzerViewSession['aggregation']>) => void;
  showGroupBounds?: boolean; onGroupBounds?: (visible: boolean) => void;
}

type SpatialEndpoint = PositionedNode | PositionedSemanticRegion;
const fullModuleLayout = new Set<string>();

function isRegionEndpoint(endpoint: SpatialEndpoint): endpoint is PositionedSemanticRegion {
  return 'region' in endpoint;
}

function endpointRegionKey(endpoint: SpatialEndpoint): string {
  if (isRegionEndpoint(endpoint)) return endpoint.region.id;
  const path = endpoint.node.metadata.regionPath;
  return Array.isArray(path) ? String(path.at(-1) ?? '') : '';
}

function endpointPackageKey(endpoint: SpatialEndpoint): string | undefined {
  if (isRegionEndpoint(endpoint)) {
    const packageId = endpoint.region.metadata.packageId;
    return typeof packageId === 'string' ? packageId : undefined;
  }
  const packageId = endpoint.node.metadata.packageId;
  return typeof packageId === 'string' ? packageId : undefined;
}

function endpointElevation(endpoint: SpatialEndpoint): number {
  if (isRegionEndpoint(endpoint)) {
    return spatialRegionDepthElevation(endpoint.region.regionKind, endpoint.region.depth);
  }
  if (typeof endpoint.node.metadata.displayElevation === 'number') return endpoint.node.metadata.displayElevation;
  const path = endpoint.node.metadata.regionPath;
  return spatialModuleElevation(Array.isArray(path) ? Math.max(0, path.length - 1) : 0);
}

function endpointWorldRect(endpoint: SpatialEndpoint): SpatialWorldRect {
  if (isRegionEndpoint(endpoint)) {
    return {
      x: endpoint.x,
      y: endpoint.y,
      width: endpoint.width,
      height: endpoint.height,
      z: endpointElevation(endpoint),
    };
  }
  return {
    x: endpoint.x,
    y: endpoint.y,
    width: ANALYZER_MODULE_NODE_WIDTH,
    height: endpoint.height,
    z: endpointElevation(endpoint),
  };
}

function projectedRectIntersectsViewport(
  rect: ProjectedRect,
  camera: Pick<SpatialCameraModel, 'viewportWidth' | 'viewportHeight'>,
  margin = 0,
): boolean {
  return rect.x + rect.width >= -margin
    && rect.y + rect.height >= -margin
    && rect.x <= camera.viewportWidth + margin
    && rect.y <= camera.viewportHeight + margin;
}

function endpointDisplayName(
  endpoint: SpatialEndpoint | undefined,
  uniqueLabels: ReadonlyMap<string, string>,
  zoomLevel: 'far' | 'medium' | 'near',
): string {
  if (!endpoint) return '';
  if (isRegionEndpoint(endpoint)) return regionDisplayLabel(endpoint.region, uniqueLabels, zoomLevel);
  return endpoint.node.label;
}

function SpatialCameraBinder({
  modelRef,
  invalidateOut,
}: {
  modelRef: { current: SpatialCameraModel };
  invalidateOut: { current: (() => void) | undefined };
}) {
  const { camera, gl, scene } = useThree();
  // The input loop already owns requestAnimationFrame. Render in that same
  // frame so the HTML layer cannot run one frame ahead of Three's demand loop.
  invalidateOut.current = () => {
    configureSpatialCamera(camera as THREE.OrthographicCamera, modelRef.current);
    gl.render(scene, camera);
  };
  useFrame(() => {
    configureSpatialCamera(camera as THREE.OrthographicCamera, modelRef.current);
  });
  return null;
}

function isDirectoryRegion(region: AnalyzerSemanticRegion): boolean {
  return region.regionKind === 'directory';
}

function regionPathForNode(node: PositionedNode['node']): string[] {
  const value = node.metadata.regionPath;
  return Array.isArray(value) ? value : [];
}

function moduleNodeVisible(
  node: PositionedNode['node'],
  regionById: ReadonlyMap<string, AnalyzerSemanticRegion>,
  expanded: ReadonlySet<string>,
  _search: string,
  selectedNodeId?: string,
  forcedNodeIds: ReadonlySet<string> = new Set(),
): boolean {
  const path = regionPathForNode(node);
  const directoryIds = path.filter((id) => isDirectoryRegion(regionById.get(id) ?? { regionKind: 'directory' } as AnalyzerSemanticRegion));
  const expandedPath = expanded.size === 0 || directoryIds.every((id) => expanded.has(id));
  return expandedPath || node.id === selectedNodeId || forcedNodeIds.has(node.id);
}

function headingPriority(region: AnalyzerSemanticRegion, selected: boolean): number {
  if (selected) return 96;
  if (region.regionKind === 'workspace-package') {
    return isRootPackageRegion(region) ? 88 : 80;
  }
  return (region.depth ?? 0) <= 1 ? 58 : 34;
}

function projectedEndpointBounds(
  endpoint: SpatialEndpoint,
  modules: ReadonlyMap<string, ProjectedModuleNode>,
  regions: ReadonlyMap<string, ProjectedRect>,
): ProjectedRect | undefined {
  if (isRegionEndpoint(endpoint)) return regions.get(endpoint.region.id);
  return modules.get(endpoint.node.id)?.cardBounds;
}

export function AnalyzerSpatialGraphStage({
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
  focusRequest,
  transform,
  hasStoredCamera,
  onTransformChange,
  cameraResetKey,
  onCountsChange,
  isFullscreen = false,
  onToggleFullscreen,
  autoAggregation = true, onAutoAggregation, aggregationState, onAggregationState, showGroupBounds = true, onGroupBounds,
}: AnalyzerSpatialGraphStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | undefined>(undefined);
  const cameraRef = useRef<{ key: string; initialized: boolean }>({ key: '', initialized: false });
  const layoutFitSignatureRef = useRef('');
  const focusNonceRef = useRef(-1);
  const liveTransformRef = useRef(transform);
  const overlayRef = useRef<HTMLDivElement>(null);
  const headingElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const updateHeadingsRef = useRef<((camera: SpatialCameraModel) => void) | undefined>(undefined);
  const baseCameraRef = useRef<SpatialCameraModel | undefined>(undefined);
  const invalidateOutRef = useRef<(() => void) | undefined>(undefined);
  const flowStateRef = useRef<SpatialFlowState>({ distance: 0, active: false, reduced: false });
  const flowFramesRef = useRef(0);
  const routesRef = useRef<readonly ProjectedGraphEdge[]>([]);
  const lodRef = useRef(spatialLodLevelWithHysteresis(transform.scale));
  const countersRef = useRef(createSpatialInteractionCounters());
  const interactingRef = useRef(false);
  const scaleLabelRef = useRef<HTMLSpanElement>(null);
  const perfLabelRef = useRef<HTMLSpanElement>(null);
  const viewportRef = useRef({ width: 0, height: 0 });
  const worldBoundsRef = useRef(computeSpatialWorldBounds([]));
  const onTransformChangeRef = useRef(onTransformChange);
  const loopRef = useRef<ReturnType<typeof createSpatialCameraLoop> | undefined>(undefined);
  const liveCameraRef = useRef(spatialCameraModel(
    transform,
    1,
    1,
    ANALYZER_SPATIAL_TILT_DEGREES,
    ANALYZER_SPATIAL_YAW_DEGREES,
  ));
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  const flow = useSpatialFlowMotion(stageElement);
  const attachStage = useCallback((element: HTMLDivElement | null) => {
    stageRef.current = element;
    setStageElement(element);
  }, []);
  const [showHelp, setShowHelp] = useState(false);
  const [localAggregation, setLocalAggregation] = useState<NonNullable<AnalyzerViewSession['aggregation']>>({ expandedGroupIds: [], collapsedGroupIds: [] });
  const aggregationPreference = aggregationState ?? localAggregation, changeAggregation = onAggregationState ?? setLocalAggregation;
  const [inspection, setInspection] = useState<AggregationInspection>();
  const [hoveredNodeId, setHoveredNodeId] = useState<string>(), [focusedNodeId, setFocusedNodeId] = useState<string>();
  const previousAggregation = useRef<ReadonlySet<string>>(new Set(aggregationPreference.activeGroupIds));
  const previousRepresentation = useRef<AutoAggregationResult | undefined>(undefined);
  const [settledTransform, setSettledTransform] = useState(transform);
  const cameraKey = `${cameraResetKey}:${view.view}`;
  onTransformChangeRef.current = onTransformChange;
  viewportRef.current = viewport;

  const layout = useMemo(() => {
    if (import.meta.env.DEV) countersRef.current.layoutRecomputes += 1;
    return layoutAnalyzerView(view, fullModuleLayout);
  }, [view]);
  const regionById = useMemo(() => new Map((view.regions ?? []).map((region) => [region.id, region])), [view.regions]);
  const positionedById = useMemo(() => {
    const map = new Map<string, SpatialEndpoint>();
    layout.nodes.forEach((positioned) => map.set(positioned.node.id, positioned));
    layout.regions?.forEach((positioned) => map.set(positioned.region.id, positioned));
    return map;
  }, [layout.nodes, layout.regions]);
  const zoomLevel = useMemo(() => {
    const next = spatialLodLevelWithHysteresis(settledTransform.scale, lodRef.current);
    lodRef.current = next;
    return next;
  }, [settledTransform.scale]);
  const labelScale = spatialLabelScreenScale(settledTransform.scale);
  const totalModuleCount = useMemo(() => view.nodes.filter((node) => node.type === 'module').length, [view.nodes]);
  const allPositionedModules = useMemo(() => layout.nodes.filter((positioned) => positioned.node.type === 'module'), [layout.nodes]);
  const selectedEdgeEndpointIds = useMemo(() => {
    const selectedEdge = selectedEdgeId ? view.edges.find((edge) => edge.id === selectedEdgeId) : undefined;
    return new Set([selectedEdge?.sourceId, selectedEdge?.targetId].filter((id): id is string => Boolean(id)));
  }, [selectedEdgeId, view.edges]);
  const selectedContextNodeIds = useMemo(() => {
    const ids = new Set(selectedEdgeEndpointIds);
    if (selectedNodeId) ids.add(selectedNodeId);
    return ids;
  }, [selectedEdgeEndpointIds, selectedNodeId]);
  const visiblePositionedRegions = useMemo(
    () => (layout.regions ?? []).filter((positioned) => spatialRegionVisible(positioned.region, regionById, expandedPresentationIds)),
    [expandedPresentationIds, layout.regions, regionById],
  );
  const visiblePositionedModules = useMemo(() => {
    return allPositionedModules
      .filter((positioned) => filter === 'all' || positioned.node.type === filter)
      .filter((positioned) => moduleNodeVisible(
        positioned.node,
        regionById,
        expandedPresentationIds,
        search,
        selectedNodeId,
        selectedContextNodeIds,
      ));
  }, [allPositionedModules, expandedPresentationIds, filter, regionById, search, selectedContextNodeIds, selectedNodeId]);
  const fitPoints = useMemo(() => {
    const points: SpatialWorldPoint[] = [];
    (layout.regions ?? []).forEach((positioned) => points.push(...regionRectCorners(endpointWorldRect(positioned))));
    layout.nodes.forEach((positioned) => points.push(...regionRectCorners(endpointWorldRect(positioned))));
    return points;
  }, [layout]);
  const layoutFitSignature = useMemo(
    () => [
      ...((layout.regions ?? []).map((region) => `${region.region.id}:${region.x}:${region.y}:${region.width}:${region.height}`)),
      ...layout.nodes.map((positioned) => `${positioned.node.id}:${positioned.x}:${positioned.y}:${positioned.height}`),
      ...fitPoints.map((point) => `${point.x}:${point.y}:${point.z}`),
    ].join('|'),
    [fitPoints, layout.nodes, layout.regions],
  );
  const worldBounds = useMemo(() => computeSpatialWorldBounds(fitPoints), [fitPoints]);
  const camera = useMemo(
    () => spatialCameraModel(
      settledTransform,
      viewport.width,
      viewport.height,
      ANALYZER_SPATIAL_TILT_DEGREES,
      ANALYZER_SPATIAL_YAW_DEGREES,
      worldBounds,
    ),
    [settledTransform, viewport.height, viewport.width, worldBounds],
  );
  const filteredModules = useMemo(() => allPositionedModules.filter(point => filter === 'all' || point.node.type === filter), [allPositionedModules, filter]);
  const aggregationInput = useMemo(() => moduleAggregationInput(filteredModules), [filteredModules]);
  const explicitExpandedIds = useMemo(() => new Set(aggregationPreference.expandedGroupIds), [aggregationPreference.expandedGroupIds]);
  const explicitCollapsedIds = useMemo(() => new Set(aggregationPreference.collapsedGroupIds), [aggregationPreference.collapsedGroupIds]);
  const manualGroups = useMemo(() => moduleManualGroups(filteredModules, new Set(visiblePositionedModules.map(point => point.node.id)), expandedPresentationIds,
    new Map([...regionById].filter(([, region]) => region.regionKind === 'directory').map(([id, region]) => [id, region.subtitle ?? region.label]))), [filteredModules, visiblePositionedModules, expandedPresentationIds, regionById]);
  const directNeighbours = useMemo(() => {
    const ids = new Set<string>();
    for (const edge of view.edges) { if (edge.sourceId === selectedNodeId) ids.add(edge.targetId); if (edge.targetId === selectedNodeId) ids.add(edge.sourceId); }
    return ids.size <= 3 ? [...ids] : [];
  }, [view.edges, selectedNodeId]);
  const protectedIds = useMemo(() => new Set([selectedNodeId, hoveredNodeId, focusedNodeId, ...directNeighbours, ...selectedEdgeEndpointIds, ...focusRequest?.entityIds ?? [], focusRequest?.entityId,
    ...filteredModules.filter(point => moduleNodeVisible(point.node, regionById, expandedPresentationIds, '') && regionPathForNode(point.node).some(id => aggregationPreference.expandedRegionIds?.includes(id))).map(point => point.node.id)].filter((id): id is string => Boolean(id))),
  [selectedNodeId, hoveredNodeId, focusedNodeId, directNeighbours, selectedEdgeEndpointIds, focusRequest, filteredModules, aggregationPreference.expandedRegionIds, regionById, expandedPresentationIds]);
  const preparedAggregation = useMemo(() => prepareAutoAggregation(aggregationInput.points, aggregationInput.groups), [aggregationInput]);
  const aggregation = useMemo(() => stableAggregationRepresentation(projectAutoAggregation({ ...aggregationInput, prepared: preparedAggregation, enabled: autoAggregation, protectedIds, expandedGroupIds: explicitExpandedIds,
    manualGroups: [...manualGroups, ...aggregationInput.groups.filter(group => explicitCollapsedIds.has(group.id))], projection: moduleAggregationProjection(camera), previousActiveGroupIds: previousAggregation.current,
    matchIds: new Set(filteredModules.filter(point => Boolean(search.trim()) && nodeMatchesSearch(point.node, search)).map(point => point.node.id)) }), previousRepresentation.current), [aggregationInput, preparedAggregation, autoAggregation, protectedIds, explicitExpandedIds, explicitCollapsedIds, manualGroups, camera, filteredModules, search]);
  useEffect(() => { previousRepresentation.current = aggregation; }, [aggregation]);
  useEffect(() => {
    if (!autoAggregation || camera.viewportWidth <= 0 || camera.viewportHeight <= 0) return;
    previousAggregation.current = aggregation.activeGroupIds;
    const saved = aggregationPreference.activeGroupIds ?? [];
    if (saved.length !== aggregation.activeGroupIds.size || saved.some(id => !aggregation.activeGroupIds.has(id))) changeAggregation({ ...aggregationPreference, activeGroupIds: [...aggregation.activeGroupIds] });
  }, [aggregation.activeGroupIds, autoAggregation, camera.viewportWidth, camera.viewportHeight, aggregationPreference, changeAggregation]);
  const individualModules = useMemo(() => filteredModules.filter(point => aggregation.individualIds.has(point.node.id)), [filteredModules, aggregation.individualIds]);
  const aggregateModules = useMemo<PositionedNode[]>(() => aggregation.aggregates.map(group => ({ x: group.x - ANALYZER_MODULE_NODE_WIDTH / 2, y: group.y - 18, height: 36,
    node: { id: group.id, type: 'module', label: `${group.memberIds.length}対象 · ${group.label}`, evidenceIds: [], metadata: { displayAggregate: true, displayElevation: group.z, groupId: group.groupId } } })), [aggregation.aggregates]);
  const aggregateLabels = useMemo(() => {
    const shortNames = shortAggregationLabels(aggregation.aggregates), occupied: { x: number; y: number }[] = [];
    return aggregation.aggregates.map(group => ({ group, point: projectSpatialPoint(group, camera) }))
      .filter(({ point }) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 65 && point.x <= viewport.width && point.y <= viewport.height - 45)
      .sort((a, b) => Number(b.group.groupId === inspection?.id) - Number(a.group.groupId === inspection?.id) || b.group.matchingCount - a.group.matchingCount)
      .map(item => {
        const priority = item.group.groupId === inspection?.id;
        const visible = priority || occupied.length < 8 && !occupied.some(old => Math.abs(old.x - item.point.x) < 190 && Math.abs(old.y - item.point.y) < 50);
        if (visible) occupied.push(item.point);
        return { ...item, visible, label: shortNames.get(item.group.id) };
      });
  }, [aggregation.aggregates, camera, viewport.width, viewport.height, inspection]);
  const renderedPositionedModules = useMemo(() => [...individualModules, ...aggregateModules], [individualModules, aggregateModules]);
  const renderedById = useMemo(() => new Map([...positionedById, ...aggregateModules.map(point => [point.node.id, point] as const)]), [positionedById, aggregateModules]);
  const canonicalRelations = useMemo(() => view.edges.map(edge => ({ ...edge, source: edge.sourceId, target: edge.targetId, confidence: String(edge.metadata.confidence ?? 'source') })), [view.edges]);
  const displayRelations = useMemo(() => projectAggregationRelations(canonicalRelations, aggregation.ownerById), [canonicalRelations, aggregation.ownerById]);
  const originalRelationItems = useMemo(() => {
    const evidenceById = new Map(view.evidence.map(item => [item.id, item]));
    return canonicalRelations.map(edge => ({ ...edge, confidence: edge.confidence === 'source' ? 'ソースで確認' : edge.confidence, ...moduleRelationEvidenceCounts(edge, evidenceById) }));
  }, [canonicalRelations, view.evidence]);
  const toggleRegion = (id: string, protectOnOpen = true) => {
    const currentlyOpen = expandedPresentationIds.size === 0 || expandedPresentationIds.has(id);
    changeAggregation({ ...aggregationPreference, expandedRegionIds: [...aggregationPreference.expandedRegionIds?.filter(value => value !== id) ?? [], ...(!currentlyOpen && protectOnOpen ? [id] : [])] });
    onTogglePresentation(id);
  };
  const groupMode = (id: string, mode: AggregationGroupMode) => {
    if (![...aggregationInput.groups, ...manualGroups].some(group => group.id === id)) return;
    if (id.startsWith('module-manual:')) { const regionId = id.slice('module-manual:'.length); if (mode === 'expanded' || mode === 'auto') toggleRegion(regionId, mode === 'expanded'); return; }
    changeAggregation({ ...aggregationPreference, expandedGroupIds: [...aggregationPreference.expandedGroupIds.filter(value => value !== id), ...(mode === 'expanded' ? [id] : [])], collapsedGroupIds: [...aggregationPreference.collapsedGroupIds.filter(value => value !== id), ...(mode === 'collapsed' ? [id] : [])] });
  };
  worldBoundsRef.current = worldBounds;

  const commitCamera = useCallback((next: AnalyzerGraphTransform) => {
    loopRef.current?.cancel();
    interactingRef.current = false;
    liveTransformRef.current = next;
    setSettledTransform(next);
    onTransformChangeRef.current(next);
  }, []);

  const fitCamera = useCallback(() => {
    if (viewport.width <= 0 || viewport.height <= 0 || fitPoints.length === 0) return;
    commitCamera(fitSpatialProjectedBounds(fitPoints, viewport.width, viewport.height, ANALYZER_SPATIAL_FIT_PADDING));
  }, [fitPoints, commitCamera, viewport.height, viewport.width]);

  useLayoutEffect(() => {
    cameraRef.current = { key: cameraKey, initialized: hasStoredCamera };
    focusNonceRef.current = -1;
  }, [cameraKey, hasStoredCamera]);

  useEffect(() => {
    if (!stageElement) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewport({ width: rect.width, height: rect.height });
    });
    observer.observe(stageElement);
    return () => observer.disconnect();
  }, [stageElement]);

  useLayoutEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0 || cameraRef.current.initialized || fitPoints.length === 0) return;
    cameraRef.current.initialized = true;
    commitCamera(fitSpatialProjectedBounds(fitPoints, viewport.width, viewport.height, ANALYZER_SPATIAL_FIT_PADDING));
  }, [fitPoints, commitCamera, viewport.height, viewport.width]);

  useLayoutEffect(() => {
    if (!layoutFitSignatureRef.current) {
      layoutFitSignatureRef.current = layoutFitSignature;
      return;
    }
    if (layoutFitSignatureRef.current === layoutFitSignature) return;
    layoutFitSignatureRef.current = layoutFitSignature;
    if (focusRequest || viewport.width <= 0 || viewport.height <= 0 || fitPoints.length === 0) return;
    commitCamera(fitSpatialProjectedBounds(
      fitPoints,
      viewport.width,
      viewport.height,
      ANALYZER_SPATIAL_FIT_PADDING,
    ));
  }, [camera, fitPoints, focusRequest, layoutFitSignature, commitCamera, settledTransform, viewport.height, viewport.width, zoomLevel]);

  useLayoutEffect(() => {
    if (!focusRequest || focusRequest.nonce === focusNonceRef.current || viewport.width <= 0 || viewport.height <= 0) return;
    const endpoint = positionedById.get(focusRequest.entityId);
    if (!endpoint) return;
    focusNonceRef.current = focusRequest.nonce;
    if (focusRequest.entityIds) {
      const points = focusRequest.entityIds.flatMap(id => {
        const item = positionedById.get(id);
        return item ? regionRectCorners(endpointWorldRect(item)) : [];
      });
      // Include the elevated corridor so both terminals and the connecting bridge fit.
      const ids = new Set(focusRequest.entityIds);
      const elevated = routesRef.current.filter(edge => ids.has(edge.sourceId) && ids.has(edge.targetId)).flatMap(edge => edge.worldPoints);
      commitCamera(fitSpatialProjectedBounds([...points, ...elevated], viewport.width, viewport.height,
        ANALYZER_SPATIAL_FIT_PADDING, ANALYZER_SPATIAL_TILT_DEGREES, worldBounds));
      return;
    }
    const anchor = isRegionEndpoint(endpoint)
      ? regionHeadingWorldAnchor(endpoint, endpointElevation(endpoint))
      : moduleWorldAnchor(endpoint, endpointElevation(endpoint));
    commitCamera(focusSpatialCamera(anchor, settledTransform, viewport.width, viewport.height, worldBounds));
  }, [focusRequest, commitCamera, positionedById, settledTransform, viewport.height, viewport.width, worldBounds]);

  useLayoutEffect(() => {
    if (!interactingRef.current) {
      liveCameraRef.current = camera;
      baseCameraRef.current = camera;
      if (overlayRef.current) overlayRef.current.style.transform = '';
      if (scaleLabelRef.current) scaleLabelRef.current.textContent = `${Math.round(camera.scale * 100)}%`;
      updateHeadingsRef.current?.(camera);
      invalidateOutRef.current?.();
    }
  }, [camera]);

  useEffect(() => {
    if (interactingRef.current) return;
    loopRef.current?.cancel();
    liveTransformRef.current = transform;
    setSettledTransform((current) => (
      current.x === transform.x && current.y === transform.y && current.scale === transform.scale
        ? current
        : transform
    ));
  }, [transform]);

  useEffect(() => {
    const counters = countersRef.current;
    const loop = createSpatialCameraLoop({
      counters,
      onVisualFrame: (next) => {
        liveTransformRef.current = next;
        const vp = viewportRef.current;
        liveCameraRef.current = spatialCameraModel(
          next,
          Math.max(1, vp.width),
          Math.max(1, vp.height),
          ANALYZER_SPATIAL_TILT_DEGREES,
          ANALYZER_SPATIAL_YAW_DEGREES,
          worldBoundsRef.current,
        );
        if (overlayRef.current && baseCameraRef.current) {
          overlayRef.current.style.transform = spatialCameraFrameTransform(baseCameraRef.current, liveCameraRef.current);
        }
        if (scaleLabelRef.current) scaleLabelRef.current.textContent = `${Math.round(next.scale * 100)}%`;
        updateHeadingsRef.current?.(liveCameraRef.current);
        if (import.meta.env.DEV && stageRef.current) {
          stageRef.current.dataset.cameraFrames = String(counters.cameraVisualUpdates);
          stageRef.current.dataset.edgeCollections = String(counters.edgeCollections);
          stageRef.current.dataset.layoutRecomputes = String(counters.layoutRecomputes);
        }
        if (import.meta.env.DEV && perfLabelRef.current) {
          const stats = counters;
          perfLabelRef.current.textContent = `${stats.cameraVisualUpdates} cam · ${stats.edgeCollections} edges · ${stats.sessionWrites} save`;
        }
      },
      onRenderFrame: (elapsed) => {
        const motion = flowStateRef.current;
        if (motion.active) {
          motion.distance += elapsed * SPATIAL_FLOW_SPEED * (motion.reduced ? 0.45 : 1)
            / Math.max(0.65, Math.sqrt(liveCameraRef.current.scale));
          if (import.meta.env.DEV && stageRef.current) {
            stageRef.current.dataset.flowFrames = String(++flowFramesRef.current);
            stageRef.current.dataset.flowDistance = motion.distance.toFixed(2);
          }
        }
        invalidateOutRef.current?.();
      },
      onSettle: (next) => {
        interactingRef.current = false;
        setSettledTransform(withSpatialCameraSchema(next));
        counters.hudUpdates += 1;
      },
      onSessionWrite: (next) => {
        onTransformChangeRef.current(withSpatialCameraSchema(next));
      },
    });
    loopRef.current = loop;
    loop.setAnimating(flowStateRef.current.active);
    return () => loop.dispose();
  }, []);

  const resetTransform = useCallback(() => {
    onResetPresentation();
    cameraRef.current.initialized = false;
    if (viewport.width > 0 && viewport.height > 0 && fitPoints.length > 0) {
      cameraRef.current.initialized = true;
      commitCamera(fitSpatialProjectedBounds(fitPoints, viewport.width, viewport.height, ANALYZER_SPATIAL_FIT_PADDING));
    }
  }, [fitPoints, onResetPresentation, commitCamera, viewport.height, viewport.width]);

  const changeZoom = useCallback((factor: number, anchorX = viewport.width / 2, anchorY = viewport.height / 2) => {
    interactingRef.current = true;
    const next = withSpatialCameraSchema(zoomSpatialCamera(liveTransformRef.current, factor, anchorX, anchorY, viewport));
    liveTransformRef.current = next;
    loopRef.current?.setTarget(next, 'zoom');
  }, [viewport]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if ((event.target as HTMLElement).closest('.analyzer-stage-controls, .analyzer-spatial-lod, .analyzer-spatial-breadcrumb, .analyzer-spatial-aggregation-panel')) return;
    // Cancel native focus/selection/drag on the SVG hit path. The stage owns pan.
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    suppressClickRef.current = false;
    const live = liveTransformRef.current;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: live.x, originY: live.y, moved: false };

  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(deltaX) + Math.abs(deltaY) <= 4) return;
    drag.moved = true;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    interactingRef.current = true;
    const next = withSpatialCameraSchema(panSpatialTransform(
      { x: drag.originX, y: drag.originY, scale: liveTransformRef.current.scale, schema: liveTransformRef.current.schema },
      drag.startX,
      drag.startY,
      event.clientX,
      event.clientY,
    ));
    liveTransformRef.current = next;
    loopRef.current?.setTarget(next, 'pan');
  }, []);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) {
      suppressClickRef.current = true;
      loopRef.current?.pointerUp();
      return;
    }
    interactingRef.current = false;
    if (!(event.target as HTMLElement).closest('button, path')) onClearSelection();
  }, [onClearSelection]);

  const handleWheel = useCallback((event: WheelEvent) => {
    if (event.target instanceof Element && event.target.closest('.analyzer-spatial-aggregation-panel')) return;
    event.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    const factor = spatialWheelZoomFactor(event.deltaY, event.deltaMode);
    changeZoom(factor, event.clientX - rect.left, event.clientY - rect.top);
  }, [changeZoom]);

  useEffect(() => {
    const stage = stageRef.current;
    stage?.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage?.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const uniqueRegionLabels = useMemo(
    () => shortestUniqueRegionLabels(visiblePositionedRegions.map((positioned) => positioned.region)),
    [visiblePositionedRegions],
  );
  const projectedModules = useMemo(() => {
    const map = new Map<string, ProjectedModuleNode>();
    renderedPositionedModules.forEach((positioned) => {
      const node = projectedModuleNode(
        positioned.node.id,
        moduleWorldAnchor(positioned, endpointElevation(positioned)),
        camera,
        ANALYZER_MODULE_NODE_WIDTH,
        positioned.height,
      );
      map.set(positioned.node.id, node);
    });
    return map;
  }, [camera, renderedPositionedModules]);

  const spatialRouteObstacles = useMemo<SpatialRouteObstacle[]>(
    () => renderedPositionedModules.map((positioned) => ({
      id: positioned.node.id, x: positioned.x, y: positioned.y,
      width: ANALYZER_MODULE_NODE_WIDTH, height: positioned.height,
    })), [renderedPositionedModules],
  );
  const spatialEdgeSet = useMemo(() => {
    if (import.meta.env.DEV) {
      countersRef.current.edgeCollections += 1;
    }
    const source = collectSpatialEdgeSet(view, filteredModules, visiblePositionedRegions, regionById, expandedPresentationIds, 'near', selectedNodeId, selectedRegionId, selectedEdgeId);
    const active = new Map(source.edges.map(edge => [edge.id, edge]));
    const inspected = inspection?.kind === 'group' ? aggregation.aggregates.find(group => group.groupId === inspection.id)?.id : undefined;
    return { edges: displayRelations.flatMap(relation => {
      const incident = relation.originals.flatMap(edge => { const item = active.get(edge.id); return item ? [item] : []; });
      if (!incident.length && relation.source !== inspected && relation.target !== inspected) return [];
      const first = relation.originals[0]!;
      return [{ id: relation.id, edge: first, sourceId: relation.source, targetId: relation.target, edgeIds: relation.originals.map(edge => edge.id), count: relation.originals.length,
        selected: relation.originals.some(edge => edge.id === selectedEdgeId), connected: true, dimmed: false, aggregated: relation.aggregated, importance: incident[0]?.importance ?? 1 }];
    }), groupedCount: displayRelations.filter(relation => relation.aggregated).length };
  }, [filteredModules, visiblePositionedRegions, expandedPresentationIds, regionById, selectedEdgeId, selectedNodeId, selectedRegionId, view, displayRelations, inspection, aggregation.aggregates]);
  const selectionMembers = useMemo(() => {
    if (selectedNodeId) return new Set([selectedNodeId]);
    if (!selectedRegionId) return new Set<string>();
    const members = new Set([selectedRegionId, ...view.nodes.filter(node => regionPathForNode(node).includes(selectedRegionId)).map(node => node.id)]);
    for (const region of view.regions ?? []) {
      let parent: AnalyzerSemanticRegion | undefined = region;
      while (parent) {
        if (parent.id === selectedRegionId) { members.add(region.id); break; }
        parent = parent.parentRegionId ? regionById.get(parent.parentRegionId) : undefined;
      }
    }
    return members;
  }, [selectedNodeId, selectedRegionId, view.nodes, view.regions, regionById]);
  const edgeDirection = useCallback((edge: { sourceId: string; targetId: string }) => {
    const outgoing = selectionMembers.has(edge.sourceId), incoming = selectionMembers.has(edge.targetId);
    return outgoing && incoming ? 'internal' : incoming ? 'imported-by' : 'imports';
  }, [selectionMembers]);
  const spatialEdges = spatialEdgeSet.edges;

  const routeCamera = useMemo(() => spatialCameraModel(
    { x: 0, y: 0, scale: 1 }, 1000, 1000,
    ANALYZER_SPATIAL_TILT_DEGREES, ANALYZER_SPATIAL_YAW_DEGREES, worldBounds,
  ), [worldBounds]);
  const routeModules = useMemo(() => new Map(renderedPositionedModules.map((positioned) => [
    positioned.node.id, projectedModuleNode(positioned.node.id, moduleWorldAnchor(positioned, endpointElevation(positioned)), routeCamera, ANALYZER_MODULE_NODE_WIDTH, positioned.height),
  ])), [renderedPositionedModules, routeCamera]);
  const routeRegions = useMemo(() => new Map(visiblePositionedRegions.map((positioned) => [
    positioned.region.id, projectWorldRect(endpointWorldRect(positioned), routeCamera),
  ])), [visiblePositionedRegions, routeCamera]);
  const routedEdges = useMemo(() => {
    const resolved = spatialEdges.flatMap((edge) => {
      const source = renderedById.get(edge.sourceId);
      const target = renderedById.get(edge.targetId);
      if (!source || !target) return [];
      const sourceBounds = edge.aggregated && isRegionEndpoint(source)
        ? routeRegions.get(source.region.id)
        : projectedEndpointBounds(source, routeModules, routeRegions);
      const targetBounds = edge.aggregated && isRegionEndpoint(target)
        ? routeRegions.get(target.region.id)
        : projectedEndpointBounds(target, routeModules, routeRegions);
      if (!sourceBounds || !targetBounds) return [];
      return [{ edge, source, target, sourceBounds, targetBounds }];
    });
    const ports = assignProjectedPerimeterPorts(resolved.map(({ edge, sourceBounds, targetBounds }) => ({
      id: edge.id,
      source: sourceBounds,
      target: targetBounds,
    })));
    const worldPorts = assignSpatialBoundaryPorts(resolved.map(({ edge, source, target }) => ({
      id: edge.id,
      source: endpointWorldRect(source),
      target: endpointWorldRect(target),
    })));
    const lanes = assignSpatialBridgeLanes([...ports].map(([id, pair]) => ({ id, ...pair })));
    const built = resolved.map(({ edge, source, target }): ProjectedGraphEdge | undefined => {
      const assigned = ports.get(edge.id);
      if (!assigned) return undefined;
      const assignedWorld = worldPorts.get(edge.id);
      const sourceWorldPort = isRegionEndpoint(source) ? assignedWorld?.start : source.node.metadata.displayAggregate ? moduleWorldAnchor(source, endpointElevation(source)) : undefined;
      const targetWorldPort = isRegionEndpoint(target) ? assignedWorld?.end : target.node.metadata.displayAggregate ? moduleWorldAnchor(target, endpointElevation(target)) : undefined;
      const routePorts = {
        start: sourceWorldPort ? projectSpatialPoint(sourceWorldPort, routeCamera) : assigned.start,
        end: targetWorldPort ? projectSpatialPoint(targetWorldPort, routeCamera) : assigned.end,
      };
      const sourceName = endpointDisplayName(source, uniqueRegionLabels, 'near');
      const targetName = endpointDisplayName(target, uniqueRegionLabels, 'near');
      const direction = edgeDirection(edge);
      const description = edge.aggregated ? `${sourceName} → ${targetName} · 表示上の集約 ${edge.count}関係 · ${edge.edge.label}` : `${sourceName} が ${targetName} を import`;
      const start = sourceWorldPort ?? spatialScreenPointToWorldAtElevation(routePorts.start, endpointElevation(source), routeCamera);
      const end = targetWorldPort ?? spatialScreenPointToWorldAtElevation(routePorts.end, endpointElevation(target), routeCamera);
      return {
        id: edge.id, edgeIds: edge.edgeIds, sourceId: edge.sourceId, targetId: edge.targetId,
        aggregated: edge.aggregated, selected: edge.selected, connected: edge.connected, dimmed: edge.dimmed,
        count: edge.count, description, direction, readable: true, visible: true,
        edgeClass: spatialEdgeClass(endpointPackageKey(source), endpointPackageKey(target), endpointRegionKey(source), endpointRegionKey(target)),
        worldPoints: spatialBridgeRoute(start, end, spatialRouteObstacles, lanes.get(edge.id) ?? 0, spatialPortNormal(start, endpointWorldRect(source)), spatialPortNormal(end, endpointWorldRect(target))),
        points: [], path: '', arrow: { x: 0, y: 0, angle: 0 }, labelAnchor: { x: 0, y: 0 },
      };
    }).filter((candidate): candidate is ProjectedGraphEdge => Boolean(candidate));
    return built;
  }, [routeCamera, renderedById, routeModules, routeRegions, spatialEdges, spatialRouteObstacles, uniqueRegionLabels, edgeDirection]);
  routesRef.current = routedEdges;
  const projectedEdges = useMemo(() => routedEdges.map((edge) => {
    const points = edge.worldPoints.map((point) => projectSpatialPoint(point, camera));
    return { ...edge, points, path: projectedPathD(points), arrow: projectedArrow(points),
      labelAnchor: points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 },
      visible: edge.readable && spatialPathIntersectsViewport(points, camera.viewportWidth, camera.viewportHeight),
    };
  }), [routedEdges, camera]);
  const headingModels = useMemo(() => {
    const modules = new Map(allPositionedModules.map(node => [node.node.id, node]));
    return visiblePositionedRegions.map(positioned => {
      const region = positioned.region;
      const label = regionDisplayLabel(region, uniqueRegionLabels, 'near');
      const count = typeof region.metadata.moduleCount === 'number' ? region.metadata.moduleCount : region.childIds.length;
      // Orthographic pan/zoom preserves the topmost corner. Resolve it only when layout changes.
      const firstModuleTop = region.childIds.flatMap(id => {
        const node = modules.get(id);
        return node ? regionRectCorners(endpointWorldRect(node)) : [];
      }).reduce<SpatialWorldPoint | undefined>((top, point) => !top
        || projectSpatialPoint(point, routeCamera).y < projectSpatialPoint(top, routeCamera).y ? point : top, undefined);
      return {
        id: region.id, region, label, count,
        anchor: regionHeadingWorldAnchor(positioned, endpointElevation(positioned)),
        bounds: endpointWorldRect(positioned), firstModuleTop,
        width: spatialRegionHeadingWidth(label, `· ${count}`, 1, region.regionKind !== 'workspace-package') + 16,
        priority: headingPriority(region, region.id === selectedRegionId),
      };
    }).sort((a, b) => b.priority - a.priority || (a.region.depth ?? 0) - (b.region.depth ?? 0) || a.id.localeCompare(b.id));
  }, [allPositionedModules, routeCamera, selectedRegionId, uniqueRegionLabels, visiblePositionedRegions]);

  useLayoutEffect(() => {
    const paintHeadings = (liveCamera: SpatialCameraModel) => {
      for (const frame of projectSpatialHeadings(headingModels, liveCamera)) {
        const element = headingElementsRef.current.get(frame.id);
        if (!element) continue;
        element.style.visibility = frame.visible ? 'visible' : 'hidden';
        element.style.transform = `translate3d(${frame.x}px, ${frame.y}px, 0) scale(${frame.scale})`;
        element.style.width = `${frame.width / frame.scale}px`;
      }
    };
    updateHeadingsRef.current = paintHeadings;
    paintHeadings(liveCameraRef.current);
    return () => { updateHeadingsRef.current = undefined; };
  }, [headingModels]);

  const visibleProjectedEdges = useMemo(
    () => projectedEdges.filter((edge) => edge.visible && edge.points.length >= 2 && Boolean(edge.path))
      .sort((a, b) => Number(a.selected) - Number(b.selected) || Number(a.connected) - Number(b.connected)),
    [projectedEdges],
  );
  const flowActive = flow.enabled && flow.visible && visibleProjectedEdges.length > 0;
  useLayoutEffect(() => {
    flowStateRef.current.active = flowActive;
    flowStateRef.current.reduced = flow.reduced;
    loopRef.current?.setAnimating(flowActive);
    invalidateOutRef.current?.();
    return () => { loopRef.current?.setAnimating(false); };
  }, [flowActive, flow.reduced]);
  const visibleCanvasModuleCount = useMemo(() => [...projectedModules.values()].filter(node => projectedRectIntersectsViewport(node.cardBounds, camera)).length, [projectedModules, camera]);
  const connectedIds = useMemo(() => new Set(spatialEdges.flatMap(edge => [edge.sourceId, edge.targetId])), [spatialEdges]);
  useEffect(() => {
    if (interactingRef.current) return;
    onCountsChange({
      visibleNodes: visibleCanvasModuleCount,
      totalNodes: totalModuleCount,
      hiddenNodes: Math.max(0, totalModuleCount - visibleCanvasModuleCount),
    });
  }, [onCountsChange, totalModuleCount, visibleCanvasModuleCount]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration > 50) countersRef.current.longTasks += 1;
        });
      });
      observer.observe({ entryTypes: ['longtask'] });
      return () => observer.disconnect();
    } catch {
      return undefined;
    }
  }, []);

  return (
    <div className="analyzer-spatial-workspace">
    <div
      ref={attachStage}
      className="analyzer-graph-stage analyzer-spatial-graph-stage"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDragStart={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        if (suppressClickRef.current) {
          event.stopPropagation();
          suppressClickRef.current = false;
        }
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) {
          if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(1.2); }
          if (event.key === '-') { event.preventDefault(); changeZoom(1 / 1.2); }
          if (event.key === 'Home') { event.preventDefault(); fitCamera(); }
          const delta = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[event.key];
          if (delta) {
            event.preventDefault();
            const current = liveTransformRef.current;
            const step = event.shiftKey ? 0.25 : 1;
            const next = { ...current, x: current.x + delta[0]! * step, y: current.y + delta[1]! * step };
            liveTransformRef.current = next;
            loopRef.current?.setTarget(next, 'pan');
            loopRef.current?.pointerUp();
          }
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onClearSelection();
        }
      }}
      role="application"
      tabIndex={0}
      aria-label="Module Dependency spatial graph. Drag to pan and use the wheel to zoom."
      data-display-point-count={aggregation.counts.representations} data-node-count={totalModuleCount}
    >
      <div className="analyzer-stage-controls" aria-label="Spatial graph controls">
        <button type="button" onClick={fitCamera} title="現在表示しているMap全体を表示">Fit</button>
        <button type="button" onClick={resetTransform} title="カメラと表示状態を初期化">Reset</button>
        <button type="button" onClick={() => changeZoom(1.14)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => changeZoom(0.88)} aria-label="Zoom out">−</button>
        <span ref={scaleLabelRef}>{Math.round(settledTransform.scale * 100)}%</span>
        <SpatialParticleControl mode={flow.mode} onChange={flow.setMode} onOpen={() => setShowHelp(false)} />
        <AutoAggregationToggle enabled={autoAggregation} onChange={enabled => onAutoAggregation?.(enabled)} />
        <button type="button" aria-label="分類の囲い" aria-pressed={showGroupBounds} onClick={() => onGroupBounds?.(!showGroupBounds)}>分類の囲い：{showGroupBounds ? 'ON' : 'OFF'}</button>
        {onToggleFullscreen && <button type="button" onClick={onToggleFullscreen} aria-pressed={isFullscreen} aria-label={isFullscreen ? '全画面を終了' : '全画面表示'} title={isFullscreen ? '全画面を終了（Esc）' : '全画面表示'}>{isFullscreen ? '↙' : '⛶'}</button>}
        <button type="button" className="analyzer-help-button" onClick={() => setShowHelp((current) => !current)} aria-expanded={showHelp} aria-controls="analyzer-spatial-help" aria-label="Spatial graph操作ヘルプ">?</button>
      </div>
      {showHelp && (
        <div id="analyzer-spatial-help" className="analyzer-stage-help" role="dialog" aria-label="Spatial graph操作ヘルプ">
          <strong>Spatial Atlas</strong>
          <p>ドラッグで移動、Wheelでカーソル位置を拡大縮小。矢印キーで移動、＋ / −でズーム、Homeで全体表示。「パーティクル」のメニューから通常・控えめ・オフを選べます。Directoryはダブルクリック、またはEnterで展開 / 折りたたみできます。Escで選択解除、全画面表示中はEscで通常表示へ戻ります。</p>
          <SemanticFlowLegend view="module-dependency" inline />
          <p>{semanticFlowDirectionLanguage('module-dependency').help}</p>
        </div>
      )}
      {view.nodes.length > 0 && view.edges.length === 0 && (
        <div className="analyzer-spatial-status" role="status">Modules found, but no local module dependencies were resolved.</div>
      )}
      {view.nodes.length === 0 ? (
        <div className="analyzer-graph-empty">No supported source modules found.</div>
      ) : (
        <>
          <Canvas
            className="analyzer-spatial-canvas"
            orthographic
            camera={{ position: [0, 0, 800], zoom: 1, near: -2000, far: 2000 }}
            dpr={[1, 1.5]}
            frameloop="demand"
            gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
            fallback={<div className="analyzer-graph-empty">Three.js spatial rendering is unavailable.</div>}
            style={{ pointerEvents: 'none' }}
          >
            <SpatialCameraBinder modelRef={liveCameraRef} invalidateOut={invalidateOutRef} />
              <SpatialAtlasScene regions={showGroupBounds ? visiblePositionedRegions : []} modules={individualModules} aggregates={aggregation.aggregates} edges={routedEdges}
              cameraRef={liveCameraRef} cameraModel={camera} selectedNodeId={selectedNodeId} selectedRegionId={selectedRegionId} connectedIds={connectedIds} search={search}
              flowEnabled={flow.enabled} flowActive={flowActive} flowStateRef={flowStateRef} />
          </Canvas>
          <div className="analyzer-spatial-headings" aria-label="Directory and package headings">
            {headingModels.map(({ id, region, label, count }) => {
              const selected = id === selectedRegionId;
              const matches = Boolean(search.trim()) && regionMatchesSearch(region, search);
              const expanded = expandedPresentationIds.size === 0 || expandedPresentationIds.has(id);
              const packageRegion = region.regionKind === 'workspace-package';
              const majorRegion = packageRegion || (region.depth ?? 0) <= 1;
              return (
                <button
                  key={id}
                  ref={element => {
                    if (element) headingElementsRef.current.set(id, element);
                    else headingElementsRef.current.delete(id);
                  }}
                  type="button"
                  className={`analyzer-spatial-region-heading${packageRegion ? ' is-package' : ''}${selected ? ' is-selected' : ''}${matches ? ' is-match' : ''}${!expanded && !packageRegion ? ' is-collapsed' : ''}${majorRegion ? ' is-major' : ''}`}
                  onClick={() => onSelectRegion(id)}
                  onDoubleClick={() => { if (!packageRegion) toggleRegion(id); }}
                  onKeyDown={event => {
                    if (!packageRegion && event.key === 'Enter') {
                      event.preventDefault();
                      toggleRegion(id);
                    }
                  }}
                  aria-label={`${label}, ${count} modules`}
                  aria-pressed={selected}
                  aria-expanded={packageRegion ? undefined : expanded}
                  title={`${region.subtitle ?? region.label} · ${count} modules${packageRegion ? '' : ' · double click to expand or collapse'}`}
                >
                  <span className="analyzer-spatial-region-glyph" aria-hidden="true">{packageRegion ? 'PKG' : 'DIR'}</span>
                  <strong>{label}</strong>
                  <span className="analyzer-spatial-region-count">· {count}</span>
                  {!packageRegion && <span className="analyzer-spatial-region-toggle" aria-hidden="true">{expanded ? '−' : '+'}</span>}
                </button>
              );
            })}
          </div>
          <div ref={overlayRef} className="analyzer-spatial-overlay" aria-label="Module Dependency map controls" style={{ '--spatial-label-scale': labelScale } as CSSProperties}>
            {selectedNodeId && (() => {
              const node = projectedModules.get(selectedNodeId);
              if (!node || node.cardBounds.height >= 18 || !projectedRectIntersectsViewport(node.cardBounds, camera)) return null;
              return <span className="analyzer-spatial-selected-indicator" style={{left:node.anchorX,top:node.cardBounds.y-12}}>{view.nodes.find(item=>item.id===selectedNodeId)?.label}</span>;
            })()}
            {individualModules.map((positioned) => {
              const node = positioned.node;
              const projected = projectedModules.get(node.id);
              if (!projected || projected.cardBounds.width < 8 || projected.cardBounds.height < 3) return null;
              const selected = node.id === selectedNodeId;
              if (!projectedRectIntersectsViewport(projected.cardBounds, camera, 8)) return null;
              const connected = connectedIds.has(node.id);
              const matches = Boolean(search.trim()) && nodeMatchesSearch(node, search);
              const dimmed = Boolean(selectedNodeId || selectedEdgeId) && !selected && !connected;
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`analyzer-spatial-module is-gpu-surface${selected ? ' is-selected' : ''}${connected ? ' is-connected' : ''}${matches && search.trim() ? ' is-match' : ''}${dimmed ? ' is-dimmed' : ''}`}
                  style={{
                    left: projected.cardBounds.x,
                    top: projected.cardBounds.y,
                    width: projected.cardBounds.width,
                    height: projected.cardBounds.height,
                  }}
                  onClick={() => onSelectNode(node.id)}
                  onPointerMove={event => { if (!event.buttons) setHoveredNodeId(node.id); }} onPointerLeave={() => setHoveredNodeId(undefined)}
                  onFocus={() => setFocusedNodeId(node.id)} onBlur={() => setFocusedNodeId(undefined)}
                  onDoubleClick={() => onSelectNode(node.id, true)}
                  aria-pressed={selected}
                  aria-label={`${node.label}, ${String(node.metadata.modulePath ?? node.label)}`}
                  title={String(node.metadata.modulePath ?? node.label)}
                >
                  <span className="analyzer-spatial-accessible-label">{node.label}</span>
                </button>
              );
            })}
            {aggregateLabels.map(({ group, point, visible, label }) =>
                <button key={group.id} type="button" className="analyzer-spatial-aggregate-label" data-label-visible={visible || undefined} style={{ left: point.x, top: point.y }} onClick={() => setInspection({ kind: 'group', id: group.groupId })}
                  aria-label={`${group.label} · ${group.memberIds.length}対象の表示集合を確認`} title={group.label}><span>{label}<br />{group.memberIds.length.toLocaleString()}対象{group.matchingCount ? ` · ${group.matchingCount}件一致` : ''}</span></button>)}
            <svg className="analyzer-spatial-graph-layer" width={Math.max(1, viewport.width)} height={Math.max(1, viewport.height)} viewBox={`0 0 ${Math.max(1, viewport.width)} ${Math.max(1, viewport.height)}`} aria-label="Module dependency relations">
              {visibleProjectedEdges.map((edge) => (
                <g key={edge.id} className={`analyzer-spatial-edge${edge.selected ? ' is-selected' : ''}${edge.connected ? ' is-connected' : ''}${edge.dimmed ? ' is-dimmed' : ''}`}>
                  <path
                    className="analyzer-spatial-edge-hit"
                    d={edge.path}
                    onClick={(event) => {
                      event.stopPropagation();
                      const factId = edge.edgeIds[0];
                      if (edge.aggregated) setInspection({ kind: 'relation', id: edge.id }); else if (factId) onSelectEdge(factId);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={edge.description ?? `${edge.sourceId} → ${edge.targetId}`}
                    data-direction={edge.direction}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        const factId = edge.edgeIds[0];
                        if (edge.aggregated) setInspection({ kind: 'relation', id: edge.id }); else if (factId) onSelectEdge(factId);
                      }
                    }}
                  ><title>{edge.description}</title></path>
                </g>
              ))}
            </svg>
          </div>
          <div className="analyzer-spatial-aggregation-panel"><AutoAggregationPanel enabled={autoAggregation} counts={aggregation.counts} totalCount={totalModuleCount} groups={[...aggregationInput.groups, ...manualGroups]} aggregates={aggregation.aggregates}
            ownerById={aggregation.ownerById}
            expandedIds={explicitExpandedIds} collapsedIds={explicitCollapsedIds} inspection={inspection} onInspection={setInspection} onGroupMode={groupMode} relations={displayRelations} originalRelations={originalRelationItems}
            nodeLabel={id => { const point = positionedById.get(id); const node = point && !isRegionEndpoint(point) ? point.node : undefined; return { title: node?.label ?? id, subtitle: String(node?.metadata.modulePath ?? '') }; }}
            onSelectNode={id => { setInspection(undefined); onSelectNode(id, true); }} onSelectRelation={id => { setInspection(undefined); onSelectEdge(id); }} /></div>
          {selectedNodeId && (
            <nav className="analyzer-spatial-breadcrumb" aria-label="Module Dependency breadcrumb">
              {(() => {
                const node = view.nodes.find((candidate) => candidate.id === selectedNodeId);
                if (!node) return null;
                const path = regionPathForNode(node);
                const labels = path.map((id) => regionById.get(id)).filter((region): region is AnalyzerSemanticRegion => Boolean(region));
                return (
                  <>
                    <button type="button" onClick={() => labels[0] && onSelectRegion(labels[0].id, true)}>Project</button>
                    {labels.map((region) => (
                      <span key={region.id}>
                        <span aria-hidden="true">›</span>
                        <button type="button" onClick={() => onSelectRegion(region.id, true)}>{region.label}</button>
                      </span>
                    ))}
                    <span aria-hidden="true">›</span>
                    <strong>{node.label}</strong>
                  </>
                );
              })()}
            </nav>
          )}
        </>
      )}
    </div>
    </div>
  );
}
