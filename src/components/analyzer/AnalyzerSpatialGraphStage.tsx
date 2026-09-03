import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react';
import * as THREE from 'three';
import {
  ANALYZER_DEFAULT_TRANSFORM,
  ANALYZER_MODULE_NODE_HEIGHT,
  ANALYZER_MODULE_NODE_WIDTH,
  ANALYZER_SPATIAL_INITIAL_SCALE,
  ANALYZER_SPATIAL_TILT_DEGREES,
  analyzerEdgeRelatedToSelection,
  fitAnalyzerTransform,
  layoutAnalyzerView,
  nodeMatchesSearch,
  regionMatchesSearch,
  routeSpatialEdge,
  spatialEdgeBudget,
  spatialModuleBudget,
  spatialModuleElevation,
  spatialModuleShouldRender,
  spatialRegionDepthElevation,
  semanticZoomLevelForScale,
  type AnalyzerGraphTransform,
  type AnalyzerSemanticRegion,
  type AnalyzerViewCounts,
  type AnalyzerViewEdge,
  type AnalyzerViewModel,
  type PositionedNode,
  type PositionedSemanticRegion,
  type SpatialRouteEndpoint,
  type SpatialRouteObstacle,
} from '../../analyzer';

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
  focusRequest?: { entityId: string; nonce: number };
  transform: AnalyzerGraphTransform;
  hasStoredCamera: boolean;
  onTransformChange: (update: AnalyzerGraphTransform | ((current: AnalyzerGraphTransform) => AnalyzerGraphTransform)) => void;
  cameraResetKey: string | number;
  onCountsChange: (counts: AnalyzerViewCounts) => void;
}

type SpatialEndpoint = PositionedNode | {
  region: AnalyzerSemanticRegion;
  x: number;
  y: number;
  width: number;
  height: number;
};

interface SpatialEdge {
  id: string;
  edge: AnalyzerViewEdge;
  sourceId: string;
  targetId: string;
  count: number;
  selected: boolean;
  connected: boolean;
  dimmed: boolean;
}

interface SpatialSceneProps {
  layout: ReturnType<typeof layoutAnalyzerView>;
  regions: readonly AnalyzerSemanticRegion[];
  nodes: readonly PositionedNode[];
  edgeRoutes: readonly { edge: SpatialEdge; points: readonly THREE.Vector3[] }[];
  transform: AnalyzerGraphTransform;
  width: number;
  height: number;
}

function endpointSize(endpoint: SpatialEndpoint): { width: number; height: number } {
  return 'region' in endpoint
    ? { width: endpoint.width, height: endpoint.height }
    : { width: ANALYZER_MODULE_NODE_WIDTH, height: endpoint.height };
}

function endpointRegionKey(endpoint: SpatialEndpoint): string {
  if ('region' in endpoint) return endpoint.region.id;
  const path = endpoint.node.metadata.regionPath;
  return Array.isArray(path) ? String(path.at(-1) ?? '') : '';
}

function endpointPackageKey(endpoint: SpatialEndpoint): string | undefined {
  if ('region' in endpoint) {
    const packageId = endpoint.region.metadata.packageId;
    return typeof packageId === 'string' ? packageId : undefined;
  }
  const packageId = endpoint.node.metadata.packageId;
  return typeof packageId === 'string' ? packageId : undefined;
}

function endpointElevation(endpoint: SpatialEndpoint): number {
  if ('region' in endpoint) {
    return spatialRegionDepthElevation(endpoint.region.regionKind, endpoint.region.depth);
  }
  const path = endpoint.node.metadata.regionPath;
  return spatialModuleElevation(Array.isArray(path) ? Math.max(0, path.length - 1) : 0);
}

function spatialRouteEndpoint(endpoint: SpatialEndpoint): SpatialRouteEndpoint {
  return {
    ...endpointSize(endpoint),
    x: endpoint.x,
    y: endpoint.y,
    regionId: endpointRegionKey(endpoint),
    packageId: endpointPackageKey(endpoint),
    elevation: endpointElevation(endpoint),
    ...('node' in endpoint ? { id: endpoint.node.id } : {}),
  };
}

function spatialEdgePoints(
  source: SpatialEndpoint,
  target: SpatialEndpoint,
  obstacles: readonly SpatialRouteObstacle[] = [],
): THREE.Vector3[] {
  return routeSpatialEdge(spatialRouteEndpoint(source), spatialRouteEndpoint(target), obstacles)
    .points.map((point) => new THREE.Vector3(point.x, point.y, point.z));
}

function spatialEdgeSvgPath(points: readonly THREE.Vector3[]): string {
  const [first, ...rest] = points;
  if (!first) return '';
  return `M ${first.x} ${spatialProjectedY(first)} ${rest.map((point) => `L ${point.x} ${spatialProjectedY(point)}`).join(' ')}`;
}

function spatialProjectedY(point: THREE.Vector3): number {
  return point.y - point.z * Math.tan(THREE.MathUtils.degToRad(ANALYZER_SPATIAL_TILT_DEGREES));
}

function edgeColor(edge: SpatialEdge): string {
  if (edge.selected) return '#67e8f9';
  if (edge.connected) return '#22d3ee';
  if (edge.dimmed) return '#29413e';
  return '#6e9188';
}

function SpatialEdgeLine({ points, color, opacity }: { points: readonly THREE.Vector3[]; color: string; opacity: number }) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints([...points]);
    const material = new THREE.LineBasicMaterial({
      color,
      depthWrite: false,
      opacity,
      transparent: true,
      toneMapped: false,
    });
    return new THREE.Line(geometry, material);
  }, [color, opacity, points]);

  useEffect(() => () => {
    line.geometry.dispose();
    line.material.dispose();
  }, [line]);

  return <primitive object={line} />;
}

function SpatialGroundGrid({ width, height }: { width: number; height: number }) {
  const line = useMemo(() => {
    const spacing = 96;
    const margin = spacing;
    const points: THREE.Vector3[] = [];
    for (let x = -margin; x <= width + margin; x += spacing) {
      points.push(new THREE.Vector3(x, -margin, -1), new THREE.Vector3(x, height + margin, -1));
    }
    for (let y = -margin; y <= height + margin; y += spacing) {
      points.push(new THREE.Vector3(-margin, y, -1), new THREE.Vector3(width + margin, y, -1));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: '#18312d',
      depthWrite: false,
      opacity: 0.42,
      transparent: true,
      toneMapped: false,
    });
    return new THREE.LineSegments(geometry, material);
  }, [height, width]);

  useEffect(() => () => {
    line.geometry.dispose();
    line.material.dispose();
  }, [line]);

  return <primitive object={line} />;
}

function SpatialScene({ layout, regions, nodes, edgeRoutes, transform, width, height }: SpatialSceneProps) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const orthographic = camera as THREE.OrthographicCamera;
    const tilt = THREE.MathUtils.degToRad(ANALYZER_SPATIAL_TILT_DEGREES);
    const distance = Math.max(width, height, 720);
    const centerX = Math.max(1, width) / 2;
    const centerY = Math.max(1, height) / 2;
    orthographic.left = -Math.max(1, width) / 2;
    orthographic.right = Math.max(1, width) / 2;
    orthographic.top = Math.max(1, height) / 2;
    orthographic.bottom = -Math.max(1, height) / 2;
    orthographic.near = -1000;
    orthographic.far = distance * 2;
    orthographic.position.set(centerX, centerY - Math.sin(tilt) * distance, Math.cos(tilt) * distance);
    orthographic.up.set(0, 1, 0);
    orthographic.lookAt(centerX, centerY, 0);
    orthographic.updateProjectionMatrix();
  }, [camera, height, width]);

  return (
    <group position={[transform.x, transform.y, 0]} scale={[transform.scale, transform.scale, transform.scale]}>
      <SpatialGroundGrid width={layout.width} height={layout.height} />
      {regions.map((region) => {
        const positioned = layout.regions?.find((candidate) => candidate.region.id === region.id);
        if (!positioned) return null;
        const isPackage = region.regionKind === 'workspace-package';
        const elevation = spatialRegionDepthElevation(region.regionKind, region.depth);
        const thickness = isPackage ? 3.2 : 2;
        return (
          <mesh key={region.id} position={[positioned.x + positioned.width / 2, positioned.y + positioned.height / 2, elevation]}>
            <boxGeometry args={[positioned.width, positioned.height, thickness]} />
            <meshBasicMaterial
              color={isPackage ? '#1d302d' : '#162724'}
              depthWrite={false}
              opacity={isPackage ? 0.95 : 0.88}
              transparent
            />
          </mesh>
        );
      })}
      {edgeRoutes.map(({ edge: spatialEdge, points }) => {
        const opacity = spatialEdge.selected || spatialEdge.connected ? 0.95 : spatialEdge.dimmed ? 0.22 : 0.54;
        const last = points.at(-1);
        const previous = points.at(-2) ?? last;
        const angle = last && previous ? Math.atan2(-(last.x - previous.x), last.y - previous.y) : 0;
        return (
          <group key={spatialEdge.id}>
            <SpatialEdgeLine points={points} color={edgeColor(spatialEdge)} opacity={opacity} />
            {last && (
              <mesh position={[last.x, last.y, last.z + 1]} rotation={[0, 0, angle]}>
                <coneGeometry args={[4, 9, 4]} />
                <meshBasicMaterial color={edgeColor(spatialEdge)} depthWrite={false} opacity={opacity} transparent />
              </mesh>
            )}
          </group>
        );
      })}
      {nodes.map((positionedNode) => {
        const node = positionedNode.node;
        const selected = node.metadata.selected === true;
        const connected = node.metadata.connected === true;
        const dimmed = node.metadata.dimmed === true;
        const regionPath = node.metadata.regionPath;
        const elevation = spatialModuleElevation(Array.isArray(regionPath) ? Math.max(0, regionPath.length - 1) : 0);
        return (
          <mesh key={node.id} position={[positionedNode.x + ANALYZER_MODULE_NODE_WIDTH / 2, positionedNode.y + positionedNode.height / 2, elevation]}>
            <boxGeometry args={[ANALYZER_MODULE_NODE_WIDTH, positionedNode.height, 5]} />
            <meshBasicMaterial
              color={selected ? '#1e5960' : connected ? '#163d40' : '#1b2b29'}
              depthWrite={false}
              opacity={dimmed ? 0.42 : 0.98}
              transparent
            />
          </mesh>
        );
      })}
    </group>
  );
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
  search: string,
  selectedNodeId?: string,
  forcedNodeIds: ReadonlySet<string> = new Set(),
): boolean {
  const path = regionPathForNode(node);
  const directoryIds = path.filter((id) => isDirectoryRegion(regionById.get(id) ?? { regionKind: 'directory' } as AnalyzerSemanticRegion));
  const expandedPath = directoryIds.every((id) => expanded.has(id));
  const matched = Boolean(search.trim()) && nodeMatchesSearch(node, search);
  return expandedPath || matched || node.id === selectedNodeId || forcedNodeIds.has(node.id);
}

function regionVisible(region: AnalyzerSemanticRegion, regionById: ReadonlyMap<string, AnalyzerSemanticRegion>, expanded: ReadonlySet<string>): boolean {
  let parentId = region.parentRegionId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    const parent = regionById.get(parentId);
    if (!parent) break;
    if (isDirectoryRegion(parent) && !expanded.has(parent.id)) return false;
    visited.add(parentId);
    parentId = parent.parentRegionId;
  }
  return true;
}

function nearestVisibleRegionId(
  node: PositionedNode['node'],
  visibleNodeIds: ReadonlySet<string>,
  visibleRegionIds: ReadonlySet<string>,
  regionById: ReadonlyMap<string, AnalyzerSemanticRegion>,
  expanded: ReadonlySet<string>,
): string | undefined {
  if (visibleNodeIds.has(node.id)) return node.id;
  const path = regionPathForNode(node);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const regionId = path[index];
    const region = regionId ? regionById.get(regionId) : undefined;
    if (region && visibleRegionIds.has(region.id) && regionVisible(region, regionById, expanded)) {
      if (isDirectoryRegion(region) && expanded.has(region.id)) continue;
      return region.id;
    }
  }
  return path.find((regionId) => visibleRegionIds.has(regionId));
}

function regionEndpointForNode(
  node: PositionedNode['node'],
  visibleRegionIds: ReadonlySet<string>,
  regionById: ReadonlyMap<string, AnalyzerSemanticRegion>,
  expanded: ReadonlySet<string>,
): string | undefined {
  const path = regionPathForNode(node);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const regionId = path[index];
    const region = regionId ? regionById.get(regionId) : undefined;
    if (region && visibleRegionIds.has(region.id) && regionVisible(region, regionById, expanded)) return region.id;
  }
  return path.find((regionId) => visibleRegionIds.has(regionId));
}

function collectSpatialEdges(
  view: AnalyzerViewModel,
  visibleNodes: readonly PositionedNode[],
  visibleRegions: readonly PositionedSemanticRegion[],
  regionById: ReadonlyMap<string, AnalyzerSemanticRegion>,
  expanded: ReadonlySet<string>,
  zoomLevel: 'far' | 'medium' | 'near',
  selectedNodeId?: string,
  selectedRegionId?: string,
  selectedEdgeId?: string,
): SpatialEdge[] {
  const visibleNodeIds = new Set(visibleNodes.map((positioned) => positioned.node.id));
  const visibleRegionIds = new Set(visibleRegions.map((positioned) => positioned.region.id));
  const nodeById = new Map(view.nodes.map((node) => [node.id, node]));
  const grouped = new Map<string, SpatialEdge>();
  view.edges.forEach((edge) => {
    const sourceNode = nodeById.get(edge.sourceId);
    const targetNode = nodeById.get(edge.targetId);
    if (!sourceNode || !targetNode) return;
    const selectedIncident = Boolean(selectedNodeId && (edge.sourceId === selectedNodeId || edge.targetId === selectedNodeId));
    const explicitlySelected = edge.id === selectedEdgeId;
    const preserveModuleEndpoints = selectedIncident || explicitlySelected;
    const sourceTouchesSelectedRegion = Boolean(selectedRegionId && regionPathForNode(sourceNode).includes(selectedRegionId));
    const targetTouchesSelectedRegion = Boolean(selectedRegionId && regionPathForNode(targetNode).includes(selectedRegionId));
    const selectedRegionBoundary = sourceTouchesSelectedRegion !== targetTouchesSelectedRegion;
    const sourceId = selectedRegionBoundary && sourceTouchesSelectedRegion
      ? selectedRegionId
      : zoomLevel === 'far' && !preserveModuleEndpoints
      ? regionEndpointForNode(sourceNode, visibleRegionIds, regionById, expanded)
      : nearestVisibleRegionId(sourceNode, visibleNodeIds, visibleRegionIds, regionById, expanded);
    const targetId = selectedRegionBoundary && targetTouchesSelectedRegion
      ? selectedRegionId
      : zoomLevel === 'far' && !preserveModuleEndpoints
      ? regionEndpointForNode(targetNode, visibleRegionIds, regionById, expanded)
      : nearestVisibleRegionId(targetNode, visibleNodeIds, visibleRegionIds, regionById, expanded);
    if (!sourceId || !targetId || sourceId === targetId) return;
    const key = `${sourceId}:${targetId}`;
    const selected = edge.id === selectedEdgeId;
    const selectedRegionTouches = selectedRegionBoundary;
    const connected = analyzerEdgeRelatedToSelection(edge, undefined, selectedNodeId, selectedRegionId) || selectedRegionTouches;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.selected ||= selected;
      existing.connected ||= connected;
      existing.edge = selected ? edge : existing.edge;
      existing.dimmed &&= !selected && !connected;
      return;
    }
    grouped.set(key, {
      id: sourceId.startsWith('module:') && targetId.startsWith('module:')
        ? edge.id
        : `spatial-bundle:${sourceId}:${targetId}`,
      edge,
      sourceId,
      targetId,
      count: 1,
      selected,
      connected,
      dimmed: Boolean((selectedNodeId || selectedRegionId || selectedEdgeId) && !selected && !connected),
    });
  });
  const budget = spatialEdgeBudget(zoomLevel);
  const ordered = [...grouped.values()]
    .sort((first, second) => Number(second.selected || second.connected) - Number(first.selected || first.connected)
      || second.count - first.count
      || first.id.localeCompare(second.id));
  const foreground = ordered.filter((edge) => edge.selected || edge.connected);
  const background = ordered.filter((edge) => !edge.selected && !edge.connected);
  return [...foreground, ...background.slice(0, Math.max(0, budget - foreground.length))];
}

function moduleNodeStyle(positioned: PositionedNode, elevation = 18): CSSProperties {
  return {
    left: positioned.x,
    top: positioned.y,
    width: ANALYZER_MODULE_NODE_WIDTH,
    height: ANALYZER_MODULE_NODE_HEIGHT,
    transform: `translateZ(${elevation}px)`,
  };
}

function regionStyle(region: { x: number; y: number; width: number; height: number }, elevation = 4): CSSProperties {
  return {
    left: region.x,
    top: region.y,
    width: region.width,
    height: region.height,
    transform: `translateZ(${elevation}px)`,
  };
}

function spatialWorldTransform(transform: AnalyzerGraphTransform): string {
  return `translate3d(${transform.x}px, ${transform.y}px, 0) scale3d(${transform.scale}, ${transform.scale}, ${transform.scale}) perspective(1600px) rotateX(${ANALYZER_SPATIAL_TILT_DEGREES}deg)`;
}

function spatialWorldStyle(
  transform: AnalyzerGraphTransform,
  layout: ReturnType<typeof layoutAnalyzerView>,
): CSSProperties {
  return {
    width: layout.width,
    height: layout.height,
    transform: spatialWorldTransform(transform),
    // Keep semantic labels readable while their map geometry scales with the camera.
    '--spatial-label-scale': Math.min(2, Math.max(0.7, 1 / Math.max(0.25, transform.scale))),
  } as CSSProperties;
}

function initialSpatialTransform(layout: ReturnType<typeof layoutAnalyzerView>, width: number, height: number): AnalyzerGraphTransform {
  const fitted = fitAnalyzerTransform(layout, width, height);
  if (fitted.scale < ANALYZER_SPATIAL_INITIAL_SCALE) return fitted;
  return {
    scale: ANALYZER_SPATIAL_INITIAL_SCALE,
    x: width / 2 - layout.width * ANALYZER_SPATIAL_INITIAL_SCALE / 2,
    y: height / 2 - layout.height * ANALYZER_SPATIAL_INITIAL_SCALE / 2,
  };
}

function focusSpatialTransform(endpoint: SpatialEndpoint, width: number, height: number, currentScale: number): AnalyzerGraphTransform {
  const size = endpointSize(endpoint);
  const scale = Math.max(0.72, Math.min(1.55, currentScale));
  const projectedCenterY = endpoint.y + size.height / 2 - endpointElevation(endpoint) * Math.tan(THREE.MathUtils.degToRad(ANALYZER_SPATIAL_TILT_DEGREES));
  return {
    scale,
    x: width / 2 - (endpoint.x + size.width / 2) * scale,
    y: height / 2 - projectedCenterY * scale,
  };
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
}: AnalyzerSpatialGraphStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | undefined>(undefined);
  const cameraRef = useRef<{ key: string; initialized: boolean }>({ key: '', initialized: false });
  const focusNonceRef = useRef(-1);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const cameraKey = `${cameraResetKey}:${view.view}`;

  const layout = useMemo(() => layoutAnalyzerView(view, expandedPresentationIds), [expandedPresentationIds, view]);
  const regionById = useMemo(() => new Map((view.regions ?? []).map((region) => [region.id, region])), [view.regions]);
  const positionedById = useMemo(() => {
    const map = new Map<string, SpatialEndpoint>();
    layout.nodes.forEach((positioned) => map.set(positioned.node.id, positioned));
    layout.regions?.forEach((positioned) => map.set(positioned.region.id, positioned));
    return map;
  }, [layout.nodes, layout.regions]);
  const zoomLevel = semanticZoomLevelForScale(transform.scale);
  const totalModuleCount = useMemo(() => view.nodes.filter((node) => node.type === 'module').length, [view.nodes]);
  const allPositionedModules = useMemo(() => layout.nodes.filter((positioned) => positioned.node.type === 'module'), [layout.nodes]);
  const selectedEdgeEndpointIds = useMemo(() => {
    const selectedEdge = selectedEdgeId ? view.edges.find((edge) => edge.id === selectedEdgeId) : undefined;
    return new Set([selectedEdge?.sourceId, selectedEdge?.targetId].filter((id): id is string => Boolean(id)));
  }, [selectedEdgeId, view.edges]);
  const selectedContextNodeIds = useMemo(() => {
    const ids = new Set(selectedEdgeEndpointIds);
    if (selectedNodeId) {
      ids.add(selectedNodeId);
      view.edges.forEach((edge) => {
        if (edge.sourceId === selectedNodeId) ids.add(edge.targetId);
        if (edge.targetId === selectedNodeId) ids.add(edge.sourceId);
      });
    }
    return ids;
  }, [selectedEdgeEndpointIds, selectedNodeId, view.edges]);
  const contextRegionIds = useMemo(() => {
    const ids = new Set<string>();
    const addAncestors = (regionId: string | undefined) => {
      const visited = new Set<string>();
      let current = regionId;
      while (current && !visited.has(current)) {
        ids.add(current);
        visited.add(current);
        current = regionById.get(current)?.parentRegionId;
      }
    };
    const selectedNode = selectedNodeId ? view.nodes.find((node) => node.id === selectedNodeId) : undefined;
    const selectedNodePath = selectedNode ? regionPathForNode(selectedNode) : [];
    selectedNodePath.forEach(addAncestors);
    if (selectedRegionId) addAncestors(selectedRegionId);
    selectedEdgeEndpointIds.forEach((nodeId) => {
      const node = view.nodes.find((candidate) => candidate.id === nodeId);
      if (node) regionPathForNode(node).forEach(addAncestors);
    });
    return ids;
  }, [regionById, selectedEdgeEndpointIds, selectedNodeId, selectedRegionId, view.nodes]);
  const visiblePositionedRegions = useMemo(
    () => (layout.regions ?? []).filter((positioned) => {
      if (!regionVisible(positioned.region, regionById, expandedPresentationIds)) return false;
      if (zoomLevel !== 'far' || positioned.region.regionKind === 'workspace-package') return true;
      const isMajor = (positioned.region.depth ?? 0) <= 1;
      const matched = Boolean(search.trim()) && regionMatchesSearch(positioned.region, search);
      return isMajor || matched || contextRegionIds.has(positioned.region.id);
    }),
    [contextRegionIds, expandedPresentationIds, layout.regions, regionById, search, zoomLevel],
  );
  const visiblePositionedModules = useMemo(() => {
    const filtered = allPositionedModules.filter((positioned) => filter === 'all' || positioned.node.type === filter)
      .filter((positioned) => moduleNodeVisible(positioned.node, regionById, expandedPresentationIds, search, selectedNodeId, selectedContextNodeIds));
    const selected = filtered.filter((positioned) => positioned.node.id === selectedNodeId
      || selectedContextNodeIds.has(positioned.node.id)
      || (Boolean(search.trim()) && nodeMatchesSearch(positioned.node, search)));
    const rest = filtered.filter((positioned) => !selected.includes(positioned));
    const budget = spatialModuleBudget(zoomLevel);
    return [...selected, ...rest.slice(0, Math.max(0, budget - selected.length))];
  }, [allPositionedModules, expandedPresentationIds, filter, regionById, search, selectedContextNodeIds, selectedNodeId, zoomLevel]);
  const renderedPositionedModules = useMemo(
    () => visiblePositionedModules.filter((positioned) => spatialModuleShouldRender({
      zoomLevel,
      hierarchyVisible: true,
      selected: positioned.node.id === selectedNodeId,
      matched: Boolean(search.trim()) && nodeMatchesSearch(positioned.node, search),
      selectedEdgeEndpoint: selectedContextNodeIds.has(positioned.node.id),
    })),
    [search, selectedContextNodeIds, selectedNodeId, visiblePositionedModules, zoomLevel],
  );
  const spatialObstacles = useMemo(
    () => renderedPositionedModules.map((positioned) => ({
      id: positioned.node.id,
      x: positioned.x,
      y: positioned.y,
      width: ANALYZER_MODULE_NODE_WIDTH,
      height: positioned.height,
    })),
    [renderedPositionedModules],
  );
  const spatialEdges = useMemo(
    () => collectSpatialEdges(view, renderedPositionedModules, visiblePositionedRegions, regionById, expandedPresentationIds, zoomLevel, selectedNodeId, selectedRegionId, selectedEdgeId),
    [expandedPresentationIds, regionById, renderedPositionedModules, selectedEdgeId, selectedNodeId, selectedRegionId, view, visiblePositionedRegions, zoomLevel],
  );

  useEffect(() => {
    onCountsChange({
      visibleNodes: renderedPositionedModules.length,
      totalNodes: totalModuleCount,
      hiddenNodes: Math.max(0, totalModuleCount - renderedPositionedModules.length),
    });
  }, [onCountsChange, renderedPositionedModules.length, totalModuleCount]);

  useLayoutEffect(() => {
    cameraRef.current = { key: cameraKey, initialized: hasStoredCamera };
    focusNonceRef.current = -1;
  }, [cameraKey, hasStoredCamera]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewport({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0 || cameraRef.current.initialized) return;
    cameraRef.current.initialized = true;
    onTransformChange(initialSpatialTransform(layout, viewport.width, viewport.height));
  }, [layout, onTransformChange, viewport.height, viewport.width]);

  useLayoutEffect(() => {
    if (!focusRequest || focusRequest.nonce === focusNonceRef.current || viewport.width <= 0 || viewport.height <= 0) return;
    const endpoint = positionedById.get(focusRequest.entityId);
    if (!endpoint) return;
    focusNonceRef.current = focusRequest.nonce;
    onTransformChange(focusSpatialTransform(endpoint, viewport.width, viewport.height, transform.scale));
  }, [focusRequest, onTransformChange, positionedById, transform.scale, viewport.height, viewport.width]);

  const fit = useCallback(() => {
    if (viewport.width > 0 && viewport.height > 0) onTransformChange(fitAnalyzerTransform(layout, viewport.width, viewport.height));
  }, [layout, onTransformChange, viewport.height, viewport.width]);

  const resetTransform = useCallback(() => {
    onResetPresentation();
    onTransformChange(ANALYZER_DEFAULT_TRANSFORM);
  }, [onResetPresentation, onTransformChange]);

  const changeZoom = useCallback((factor: number, anchorX = viewport.width / 2, anchorY = viewport.height / 2) => {
    const nextScale = Math.max(0.25, Math.min(1.8, transform.scale * factor));
    const worldX = (anchorX - transform.x) / transform.scale;
    const worldY = (anchorY - transform.y) / transform.scale;
    onTransformChange({
      scale: nextScale,
      x: anchorX - worldX * nextScale,
      y: anchorY - worldY * nextScale,
    });
  }, [onTransformChange, transform.scale, transform.x, transform.y, viewport.height, viewport.width]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, path')) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [transform.x, transform.y]);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) drag.moved = true;
    onTransformChange({ ...transform, x: drag.originX + deltaX, y: drag.originY + deltaY });
  }, [onTransformChange, transform]);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.moved && event.target === event.currentTarget) onClearSelection();
  }, [onClearSelection]);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    changeZoom(factor, event.clientX - rect.left, event.clientY - rect.top);
  }, [changeZoom]);

  const edgeRoutes = useMemo(() => spatialEdges.map((edge) => {
    const source = positionedById.get(edge.sourceId);
    const target = positionedById.get(edge.targetId);
    if (!source || !target) return undefined;
    return { edge, points: spatialEdgePoints(source, target, spatialObstacles) };
  }).filter((candidate): candidate is { edge: SpatialEdge; points: THREE.Vector3[] } => Boolean(candidate)), [positionedById, spatialEdges, spatialObstacles]);

  return (
    <div
      ref={stageRef}
      className="analyzer-graph-stage analyzer-spatial-graph-stage"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClearSelection();
        }
      }}
      role="application"
      tabIndex={0}
      aria-label="Module Dependency spatial graph. Drag to pan and use the wheel to zoom."
    >
      <div className="analyzer-stage-controls" aria-label="Spatial graph controls">
        <button type="button" onClick={fit} title="現在表示しているMap全体を表示">Fit</button>
        <button type="button" onClick={resetTransform} title="カメラと表示状態を初期化">Reset</button>
        <button type="button" onClick={() => changeZoom(1.14)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => changeZoom(0.88)} aria-label="Zoom out">−</button>
        <span>{Math.round(transform.scale * 100)}%</span>
        <button type="button" className="analyzer-help-button" onClick={() => setShowHelp((current) => !current)} aria-expanded={showHelp} aria-controls="analyzer-spatial-help" aria-label="Spatial graph操作ヘルプ">?</button>
      </div>
      <div className="analyzer-spatial-lod" aria-live="polite" aria-label="Spatial detail level">
        <strong>{zoomLevel.toUpperCase()}</strong>
        <span>{renderedPositionedModules.length} / {totalModuleCount} modules</span>
        <span>{spatialEdges.length} / {view.edges.length} edges</span>
      </div>
      {showHelp && (
        <div id="analyzer-spatial-help" className="analyzer-stage-help" role="dialog" aria-label="Spatial graph操作ヘルプ">
          <strong>Spatial Atlas</strong>
          <p>背景をドラッグして移動、Wheelで拡大縮小。Directoryの見出しをクリックして選択、Double clickで展開 / 折りたたみできます。</p>
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
            camera={{ position: [0, 0, 500], zoom: 1, near: -100, far: 1000 }}
            dpr={[1, 1.5]}
            frameloop="demand"
            gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
            fallback={<div className="analyzer-graph-empty">Three.js spatial rendering is unavailable.</div>}
            style={{ pointerEvents: 'none' }}
          >
            <SpatialScene
              layout={layout}
              regions={visiblePositionedRegions.map((positioned) => positioned.region)}
              nodes={renderedPositionedModules.map((positioned) => {
                const node = positioned.node;
                const connected = spatialEdges.some((edge) => (edge.connected || edge.selected) && (edge.edge.sourceId === node.id || edge.edge.targetId === node.id));
                const dimmed = Boolean((selectedNodeId || selectedRegionId || selectedEdgeId) && !connected && selectedNodeId !== node.id);
                return {
                  ...positioned,
                  node: {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      selected: node.id === selectedNodeId,
                      connected,
                      dimmed,
                    },
                  },
                };
              })}
              edgeRoutes={edgeRoutes}
              transform={transform}
              width={viewport.width}
              height={viewport.height}
            />
          </Canvas>
          <div className="analyzer-spatial-overlay" aria-label="Module Dependency map controls">
            <div className="analyzer-spatial-world" style={spatialWorldStyle(transform, layout)}>
              <svg className="analyzer-spatial-edge-hit-layer" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-label="Module dependency relations">
                {edgeRoutes.map(({ edge, points }) => (
                  <path
                    key={edge.id}
                    className={`analyzer-spatial-edge-hit${edge.selected ? ' is-selected' : ''}${edge.connected ? ' is-connected' : ''}${edge.dimmed ? ' is-dimmed' : ''}`}
                    d={spatialEdgeSvgPath(points)}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (edge.edge.id.startsWith('view-edge:')) onSelectEdge(edge.edge.id);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${edge.edge.label}: ${edge.edge.sourceId} to ${edge.edge.targetId}`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (edge.edge.id.startsWith('view-edge:')) onSelectEdge(edge.edge.id);
                      }
                    }}
                  />
                ))}
              </svg>
              {zoomLevel === 'far' && edgeRoutes.filter(({ edge }) => edge.count > 1).map(({ edge, points }) => {
                const midpoint = points[Math.floor(points.length / 2)];
                if (!midpoint) return null;
                return (
                  <span
                    key={`count:${edge.id}`}
                    className="analyzer-spatial-edge-count"
                    style={{ left: midpoint.x, top: spatialProjectedY(midpoint) }}
                    aria-label={`${edge.count} module dependencies`}
                  >
                    {edge.count}
                  </span>
                );
              })}
              {visiblePositionedRegions.map((positioned) => {
                const region = positioned.region;
                const selected = region.id === selectedRegionId;
                const matches = !search.trim() || regionMatchesSearch(region, search);
                const expanded = expandedPresentationIds.has(region.id);
                const packageRegion = region.regionKind === 'workspace-package';
                const moduleCount = typeof region.metadata.moduleCount === 'number'
                  ? region.metadata.moduleCount
                  : region.childIds.length;
                return (
                  <div
                    key={region.id}
                    className={`analyzer-spatial-region${packageRegion ? ' is-package' : ''}${selected ? ' is-selected' : ''}${matches && search.trim() ? ' is-match' : ''}${!expanded && !packageRegion ? ' is-collapsed' : ''}`}
                    style={regionStyle(positioned, spatialRegionDepthElevation(region.regionKind, region.depth))}
                    data-analyzer-region-id={import.meta.env.DEV ? region.id : undefined}
                  >
                    <button
                      type="button"
                      className="analyzer-spatial-region-heading"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => onSelectRegion(region.id)}
                      onDoubleClick={() => {
                        if (!packageRegion) onTogglePresentation(region.id);
                      }}
                      aria-pressed={selected}
                      aria-expanded={packageRegion ? undefined : expanded}
                      title={`${region.subtitle ?? region.label}${packageRegion ? '' : ' · double click to expand or collapse'}`}
                    >
                      <span className="analyzer-spatial-region-glyph" aria-hidden="true">{packageRegion ? '▣' : '◇'}</span>
                      <strong>{region.label}</strong>
                      <span className="analyzer-spatial-region-count">· {moduleCount} modules</span>
                      {!packageRegion && <span className="analyzer-spatial-region-toggle" aria-hidden="true">{expanded ? '−' : '+'}</span>}
                    </button>
                    {region.subtitle && <span className="analyzer-spatial-region-path">{region.subtitle}</span>}
                  </div>
                );
              })}
              {renderedPositionedModules.map((positioned) => {
                const node = positioned.node;
                const selected = node.id === selectedNodeId;
                const connected = spatialEdges.some((edge) => (edge.connected || edge.selected) && (edge.edge.sourceId === node.id || edge.edge.targetId === node.id));
                const matches = Boolean(search.trim()) && nodeMatchesSearch(node, search);
                const dimmed = Boolean((selectedNodeId || selectedRegionId || selectedEdgeId) && !selected && !connected);
                const showLabel = zoomLevel !== 'far' || selected || matches || selectedContextNodeIds.has(node.id);
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`analyzer-spatial-module${selected ? ' is-selected' : ''}${connected ? ' is-connected' : ''}${matches && search.trim() ? ' is-match' : ''}${dimmed ? ' is-dimmed' : ''}`}
                    style={moduleNodeStyle(positioned, spatialModuleElevation(Array.isArray(node.metadata.regionPath) ? Math.max(0, node.metadata.regionPath.length - 1) : 0))}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onSelectNode(node.id)}
                    onDoubleClick={() => onSelectNode(node.id, true)}
                    aria-pressed={selected}
                    aria-label={`${node.label}, ${String(node.metadata.modulePath ?? node.label)}`}
                    title={String(node.metadata.modulePath ?? node.label)}
                  >
                    <span className="analyzer-spatial-module-icon" aria-hidden="true">{String(node.metadata.fileIcon ?? 'FILE')}</span>
                    {showLabel && <span className="analyzer-spatial-module-label">{node.label}</span>}
                    {zoomLevel === 'near' && <small>{String(node.metadata.incomingCount ?? 0)} in · {String(node.metadata.outgoingCount ?? 0)} out</small>}
                  </button>
                );
              })}
            </div>
          </div>
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
  );
}
