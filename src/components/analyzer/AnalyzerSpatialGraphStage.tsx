import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react';
import * as THREE from 'three';
import {
  ANALYZER_MODULE_NODE_WIDTH,
  ANALYZER_SPATIAL_TILT_DEGREES,
  ANALYZER_SPATIAL_YAW_DEGREES,
  ANALYZER_SPATIAL_FIT_PADDING,
  assignProjectedPerimeterPorts,
  buildProjectedGraphEdge,
  collectSpatialEdges,
  computeSpatialWorldBounds,
  estimateStubPillSize,
  fitSpatialProjectedBounds,
  focusSpatialCamera,
  isRootPackageRegion,
  keepProjectedRectInViewport,
  layoutAnalyzerView,
  layoutToThreePoint,
  moduleWorldAnchor,
  nodeMatchesSearch,
  projectSpatialPoint,
  projectWorldRect,
  projectedArrowPolygon,
  projectedModuleNode,
  regionDisplayLabel,
  regionHeadingWorldAnchor,
  regionMatchesSearch,
  regionRectCorners,
  resolveSpatialOverlayCollision,
  shortestUniqueRegionLabels,
  spatialCameraModel,
  spatialEdgeEmptyReason,
  spatialHeadingFitPoints,
  spatialLabelScreenScale,
  spatialPackageHeadingCount,
  spatialPointInViewport,
  spatialProjectionDiagnostics,
  spatialModuleElevation,
  spatialRegionBorderStyle,
  spatialRegionDepthElevation,
  spatialRegionVisible,
  spatialStubCaption,
  truncateDistinctFilename,
  spatialVisibleProjectedEdgeCount,
  semanticZoomLevelForScale,
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
  type SpatialOverlayItem,
  type SpatialOverlayKind,
  type SpatialWorldBounds,
  type SpatialWorldRect,
  type SpatialWorldPoint,
} from '../../analyzer';
import { configureSpatialCamera } from '../../analyzer/spatialThreeCamera';

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

type SpatialEndpoint = PositionedNode | PositionedSemanticRegion;

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
  const path = endpoint.node.metadata.regionPath;
  return spatialModuleElevation(Array.isArray(path) ? Math.max(0, path.length - 1) : 0);
}

function endpointWorldAnchor(endpoint: SpatialEndpoint): SpatialWorldPoint {
  if (isRegionEndpoint(endpoint)) {
    return {
      x: endpoint.x + endpoint.width / 2,
      y: endpoint.y + endpoint.height / 2,
      z: endpointElevation(endpoint),
    };
  }
  return moduleWorldAnchor(endpoint, endpointElevation(endpoint));
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

function screenRectsOverlap(
  first: ProjectedRect,
  second: ProjectedRect,
  padding = 4,
): boolean {
  return first.x < second.x + second.width + padding
    && first.x + first.width + padding > second.x
    && first.y < second.y + second.height + padding
    && first.y + first.height + padding > second.y;
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

function threeVector(point: SpatialWorldPoint): THREE.Vector3 {
  const three = layoutToThreePoint(point);
  return new THREE.Vector3(three.x, three.y, three.z);
}

function SpatialStarField({ bounds }: { bounds: SpatialWorldBounds }) {
  const stars = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const width = Math.max(1, bounds.width);
    const depth = Math.max(1, bounds.depth);
    // A deterministic field keeps the background quiet and stable while the
    // camera moves.  It is deliberately sparse; the graph remains primary.
    for (let index = 0; index < 72; index += 1) {
      const a = (index * 0.61803398875) % 1;
      const b = (index * 0.41421356237) % 1;
      const c = (index * 0.73205080757) % 1;
      points.push(threeVector({
        x: bounds.min.x + width * a,
        y: bounds.min.y + depth * b,
        z: bounds.min.z - 8 - c * 12,
      }));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.PointsMaterial({
      color: '#9ab7b0',
      depthWrite: false,
      opacity: 0.28,
      size: 1.25,
      sizeAttenuation: false,
      transparent: true,
      toneMapped: false,
    });
    return new THREE.Points(geometry, material);
  }, [bounds.depth, bounds.min.x, bounds.min.y, bounds.min.z, bounds.width]);

  useEffect(() => () => {
    stars.geometry.dispose();
    stars.material.dispose();
  }, [stars]);

  return <primitive object={stars} />;
}

function SpatialRegionBorder({
  x,
  y,
  width,
  height,
  z,
  color,
  opacity,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  color: string;
  opacity: number;
}) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      threeVector({ x, y, z }),
      threeVector({ x: x + width, y, z }),
      threeVector({ x: x + width, y: y + height, z }),
      threeVector({ x, y: y + height, z }),
      threeVector({ x, y, z }),
    ]);
    const material = new THREE.LineBasicMaterial({
      color,
      depthWrite: false,
      opacity,
      transparent: true,
      toneMapped: false,
    });
    return new THREE.Line(geometry, material);
  }, [color, height, opacity, width, x, y, z]);

  useEffect(() => () => {
    line.geometry.dispose();
    line.material.dispose();
  }, [line]);

  return <primitive object={line} />;
}

function SpatialRegionVolume({
  positioned,
  selected,
}: {
  positioned: PositionedSemanticRegion;
  selected: boolean;
}) {
  const isPackage = positioned.region.regionKind === 'workspace-package';
  const elevation = spatialRegionDepthElevation(positioned.region.regionKind, positioned.region.depth);
  const thickness = isPackage ? 5 : 3;
  const center = layoutToThreePoint({
    x: positioned.x + positioned.width / 2,
    y: positioned.y + positioned.height / 2,
    z: elevation - thickness / 2,
  });
  return (
    <mesh position={[center.x, center.y, center.z]}>
      <boxGeometry args={[positioned.width, thickness, positioned.height]} />
      <meshStandardMaterial
        color={selected ? '#24535b' : isPackage ? '#18352f' : '#122521'}
        depthWrite
        opacity={selected ? 0.48 : isPackage ? 0.34 : 0.24}
        roughness={0.86}
        transparent
      />
    </mesh>
  );
}

function SpatialModuleBlock({ positioned, far }: { positioned: PositionedNode; far: boolean }) {
  const regionPath = Array.isArray(positioned.node.metadata.regionPath)
    ? positioned.node.metadata.regionPath
    : [];
  const elevation = spatialModuleElevation(Math.max(0, regionPath.length - 1));
  const width = far ? 12 : ANALYZER_MODULE_NODE_WIDTH;
  const height = far ? 8 : positioned.height;
  const center = layoutToThreePoint({
    x: positioned.x + (far ? ANALYZER_MODULE_NODE_WIDTH / 2 : width / 2),
    y: positioned.y + (far ? positioned.height / 2 : height / 2),
    z: elevation - 2,
  });
  return (
    <mesh position={[center.x, center.y, center.z]}>
      <boxGeometry args={[width, far ? 2.5 : 5, height]} />
      <meshStandardMaterial
        color={far ? '#3a6e67' : '#214943'}
        depthWrite
        opacity={far ? 0.58 : 0.86}
        roughness={0.72}
        transparent
      />
    </mesh>
  );
}

function SpatialEdgeVolume({ edge }: { edge: ProjectedGraphEdge }) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(edge.worldPoints.map(threeVector));
    const material = new THREE.LineBasicMaterial({
      color: edge.selected ? '#8af3ff' : edge.connected ? '#36d8e8' : '#5faaa0',
      depthTest: true,
      depthWrite: false,
      opacity: edge.selected ? 0.98 : edge.connected ? 0.78 : 0.52,
      transparent: true,
      toneMapped: false,
    });
    return new THREE.Line(geometry, material);
  }, [edge.connected, edge.selected, edge.worldPoints]);
  const arrow = useMemo(() => {
    const last = edge.worldPoints.at(-1);
    const previous = edge.worldPoints.at(-2);
    if (!last || !previous) return undefined;
    const tip = threeVector(last);
    const direction = threeVector(last).sub(threeVector(previous)).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    // ConeGeometry's apex is +Y.  Move its center back so the apex lands on
    // the routed target boundary instead of overshooting into the card.
    return { tip: tip.sub(direction.clone().multiplyScalar(5)), quaternion };
  }, [edge.worldPoints]);

  useEffect(() => () => {
    line.geometry.dispose();
    line.material.dispose();
  }, [line]);

  if (edge.worldPoints.length < 2) return null;
  return (
    <group>
      <primitive object={line} />
      {arrow && (
        <mesh position={arrow.tip} quaternion={arrow.quaternion}>
          <coneGeometry args={[3.6, 10, 6]} />
          <meshBasicMaterial
            color={edge.selected ? '#8af3ff' : edge.connected ? '#36d8e8' : '#5faaa0'}
            depthTest
            depthWrite={false}
            transparent
          />
        </mesh>
      )}
    </group>
  );
}

function SpatialScene({
  layout,
  regions,
  modules,
  edges,
  cameraModel,
  worldBounds,
  selectedRegionId,
  zoomLevel,
}: {
  layout: ReturnType<typeof layoutAnalyzerView>;
  regions: readonly AnalyzerSemanticRegion[];
  modules: readonly PositionedNode[];
  edges: readonly ProjectedGraphEdge[];
  cameraModel: SpatialCameraModel;
  worldBounds: SpatialWorldBounds;
  selectedRegionId?: string;
  zoomLevel: 'far' | 'medium' | 'near';
}) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    configureSpatialCamera(camera as THREE.OrthographicCamera, cameraModel);
  }, [camera, cameraModel]);

  const orderedRegions = [...regions].sort((first, second) => (first.depth ?? 0) - (second.depth ?? 0));

  return (
    <group>
      <color attach="background" args={['#020407']} />
      <ambientLight intensity={0.68} />
      <directionalLight intensity={0.9} position={[180, 260, 120]} />
      <SpatialStarField bounds={worldBounds} />
      {edges.map((edge) => <SpatialEdgeVolume key={`volume:${edge.id}`} edge={edge} />)}
      {orderedRegions.map((region) => {
          const positioned = layout.regions?.find((candidate) => candidate.region.id === region.id);
          if (!positioned) return null;
          const elevation = spatialRegionDepthElevation(region.regionKind, region.depth);
          const selected = region.id === selectedRegionId;
          const border = spatialRegionBorderStyle(selected, region.regionKind, region.depth);
          return (
            <group key={region.id}>
              <SpatialRegionVolume positioned={positioned} selected={selected} />
              <SpatialRegionBorder
                x={positioned.x}
                y={positioned.y}
                width={positioned.width}
                height={positioned.height}
                z={elevation}
                color={border.color}
                opacity={border.opacity}
              />
            </group>
          );
        })}
      {modules.map((positioned) => (
        <SpatialModuleBlock
          key={`module-volume:${positioned.node.id}`}
          positioned={positioned}
          far={zoomLevel === 'far'}
        />
      ))}
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
  const expandedPath = expanded.size === 0 || directoryIds.every((id) => expanded.has(id));
  const matched = Boolean(search.trim()) && nodeMatchesSearch(node, search);
  return expandedPath || matched || node.id === selectedNodeId || forcedNodeIds.has(node.id);
}

function headingKind(region: AnalyzerSemanticRegion, selected: boolean): SpatialOverlayKind {
  if (selected) return 'selected-region-heading';
  if (region.regionKind === 'workspace-package') {
    return isRootPackageRegion(region) ? 'root-package-heading' : 'package-heading';
  }
  if ((region.depth ?? 0) <= 1) return 'major-directory-heading';
  return 'minor-heading';
}

function projectedEndpointBounds(
  endpoint: SpatialEndpoint,
  modules: ReadonlyMap<string, ProjectedModuleNode>,
  regions: ReadonlyMap<string, ProjectedRect>,
): ProjectedRect | undefined {
  if (isRegionEndpoint(endpoint)) return regions.get(endpoint.region.id);
  return modules.get(endpoint.node.id)?.cardBounds;
}

function projectedEndpointAnchor(
  endpoint: SpatialEndpoint,
  modules: ReadonlyMap<string, ProjectedModuleNode>,
  regions: ReadonlyMap<string, ProjectedRect>,
): { x: number; y: number } | undefined {
  if (isRegionEndpoint(endpoint)) {
    const bounds = regions.get(endpoint.region.id);
    if (!bounds) return undefined;
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }
  const node = modules.get(endpoint.node.id);
  if (!node) return undefined;
  return { x: node.anchorX, y: node.anchorY };
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
  const layoutFitSignatureRef = useRef('');
  const viewportFitSignatureRef = useRef('');
  const focusNonceRef = useRef(-1);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined);
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
  const labelScale = spatialLabelScreenScale(transform.scale);
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
      const nodeById = new Map(view.nodes.map((node) => [node.id, node]));
      const addDirection = (incoming: boolean) => {
        const incidents = view.edges
          .filter((edge) => incoming ? edge.targetId === selectedNodeId : edge.sourceId === selectedNodeId)
          .sort((first, second) => first.id.localeCompare(second.id));
        const groups = new Map<string, string[]>();
        incidents.forEach((edge) => {
          const counterpartId = incoming ? edge.sourceId : edge.targetId;
          const counterpart = nodeById.get(counterpartId);
          const path = counterpart?.metadata.regionPath;
          const key = Array.isArray(path) ? String(path.at(-1) ?? counterpartId) : counterpartId;
          groups.set(key, [...(groups.get(key) ?? []), counterpartId]);
        });
        const showAll = incidents.length <= 8;
        groups.forEach((counterparts) => {
          if (showAll || counterparts.length <= 2) counterparts.forEach((id) => ids.add(id));
        });
      };
      addDirection(true);
      addDirection(false);
    }
    return ids;
  }, [selectedEdgeEndpointIds, selectedNodeId, view.edges, view.nodes]);
  const visiblePositionedRegions = useMemo(
    () => (layout.regions ?? []).filter((positioned) => {
      if (!spatialRegionVisible(positioned.region, regionById, expandedPresentationIds)) return false;
      if (zoomLevel !== 'far') return true;
      if (positioned.region.regionKind === 'workspace-package') return true;
      const matched = Boolean(search.trim()) && regionMatchesSearch(positioned.region, search);
      return matched || positioned.region.id === selectedRegionId;
    }),
    [expandedPresentationIds, layout.regions, regionById, search, selectedRegionId, zoomLevel],
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
  const renderedPositionedModules = useMemo(
    () => zoomLevel === 'far' ? [] : visiblePositionedModules,
    [visiblePositionedModules, zoomLevel],
  );
  const spatialEdges = useMemo(
    () => collectSpatialEdges(view, renderedPositionedModules, visiblePositionedRegions, regionById, expandedPresentationIds, zoomLevel, selectedNodeId, selectedRegionId, selectedEdgeId),
    [expandedPresentationIds, regionById, renderedPositionedModules, selectedEdgeId, selectedNodeId, selectedRegionId, view, visiblePositionedRegions, zoomLevel],
  );

  const fitPoints = useMemo(() => {
    const points: SpatialWorldPoint[] = [];
    const packages = visiblePositionedRegions.filter((positioned) => positioned.region.regionKind === 'workspace-package');
    const fitRegions = zoomLevel === 'far' ? packages : visiblePositionedRegions;
    fitRegions.forEach((positioned) => {
      const z = spatialRegionDepthElevation(positioned.region.regionKind, positioned.region.depth);
      points.push(...regionRectCorners({ x: positioned.x, y: positioned.y, width: positioned.width, height: positioned.height, z }));
    });
    if (zoomLevel === 'far') {
      points.push(...spatialHeadingFitPoints(packages, (region) => spatialRegionDepthElevation((region.regionKind as 'workspace-package' | 'directory') ?? 'workspace-package', 0)));
    }
    if (zoomLevel !== 'far') {
      visiblePositionedModules.forEach((positioned) => {
        points.push(...regionRectCorners({
          x: positioned.x,
          y: positioned.y,
          width: ANALYZER_MODULE_NODE_WIDTH,
          height: positioned.height,
          z: endpointElevation(positioned),
        }));
      });
    }
    return points;
  }, [visiblePositionedModules, visiblePositionedRegions, zoomLevel]);
  const layoutFitSignature = useMemo(
    () => [
      ...((layout.regions ?? []).map((region) => `${region.region.id}:${region.x}:${region.y}:${region.width}:${region.height}`)),
      ...layout.nodes.map((positioned) => `${positioned.node.id}:${positioned.x}:${positioned.y}:${positioned.height}`),
    ].join('|'),
    [layout.nodes, layout.regions],
  );
  const worldBounds = useMemo(() => computeSpatialWorldBounds(fitPoints), [fitPoints]);
  const camera = useMemo(
    () => spatialCameraModel(
      transform,
      viewport.width,
      viewport.height,
      ANALYZER_SPATIAL_TILT_DEGREES,
      ANALYZER_SPATIAL_YAW_DEGREES,
      worldBounds,
    ),
    [transform, viewport.height, viewport.width, worldBounds],
  );

  const fitCamera = useCallback(() => {
    if (viewport.width <= 0 || viewport.height <= 0 || fitPoints.length === 0) return;
    onTransformChange(fitSpatialProjectedBounds(fitPoints, viewport.width, viewport.height, zoomLevel === 'far' ? ANALYZER_SPATIAL_FIT_PADDING : undefined));
  }, [fitPoints, onTransformChange, viewport.height, viewport.width, zoomLevel]);

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
    if (viewport.width <= 0 || viewport.height <= 0 || cameraRef.current.initialized || fitPoints.length === 0) return;
    cameraRef.current.initialized = true;
    onTransformChange(fitSpatialProjectedBounds(fitPoints, viewport.width, viewport.height, zoomLevel === 'far' ? ANALYZER_SPATIAL_FIT_PADDING : undefined));
  }, [fitPoints, onTransformChange, viewport.height, viewport.width, zoomLevel]);

  useLayoutEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0 || fitPoints.length === 0) return;
    const signature = `${viewport.width}:${viewport.height}`;
    if (!viewportFitSignatureRef.current) {
      viewportFitSignatureRef.current = signature;
      return;
    }
    if (viewportFitSignatureRef.current === signature || focusRequest) return;
    viewportFitSignatureRef.current = signature;
    onTransformChange(fitSpatialProjectedBounds(
      fitPoints,
      viewport.width,
      viewport.height,
      zoomLevel === 'far' ? ANALYZER_SPATIAL_FIT_PADDING : undefined,
    ));
  }, [fitPoints, focusRequest, onTransformChange, viewport.height, viewport.width, zoomLevel]);

  useLayoutEffect(() => {
    if (!layoutFitSignatureRef.current) {
      layoutFitSignatureRef.current = layoutFitSignature;
      return;
    }
    if (layoutFitSignatureRef.current === layoutFitSignature) return;
    layoutFitSignatureRef.current = layoutFitSignature;
    if (focusRequest || viewport.width <= 0 || viewport.height <= 0 || fitPoints.length === 0) return;
    onTransformChange(fitSpatialProjectedBounds(
      fitPoints,
      viewport.width,
      viewport.height,
      zoomLevel === 'far' ? ANALYZER_SPATIAL_FIT_PADDING : undefined,
    ));
  }, [fitPoints, focusRequest, layoutFitSignature, onTransformChange, viewport.height, viewport.width, zoomLevel]);

  const projectionLogKey = useRef('');
  useLayoutEffect(() => {
    if (!import.meta.env.DEV || fitPoints.length === 0 || viewport.width <= 0) return;
    const key = `${cameraKey}:${fitPoints.length}:${transform.schema ?? 'none'}`;
    if (projectionLogKey.current === key) return;
    projectionLogKey.current = key;
    const sample = spatialProjectionDiagnostics(fitPoints[0]!, camera);
    console.debug('[spatial-projection]', {
      layout: sample.layout,
      three: sample.three,
      camera: {
        eye: sample.camera.eye,
        target: sample.camera.target,
        near: sample.camera.near,
        far: sample.camera.far,
        left: sample.camera.left,
        right: sample.camera.right,
        top: sample.camera.top,
        bottom: sample.camera.bottom,
      },
      ndc: sample.ndc,
      screen: sample.screen,
    });
  }, [camera, cameraKey, fitPoints, transform.schema, viewport.width]);

  useLayoutEffect(() => {
    if (!focusRequest || focusRequest.nonce === focusNonceRef.current || viewport.width <= 0 || viewport.height <= 0) return;
    const endpoint = positionedById.get(focusRequest.entityId);
    if (!endpoint) return;
    focusNonceRef.current = focusRequest.nonce;
    const anchor = isRegionEndpoint(endpoint)
      ? regionHeadingWorldAnchor(endpoint, endpointElevation(endpoint))
      : moduleWorldAnchor(endpoint, endpointElevation(endpoint));
    onTransformChange(focusSpatialCamera(anchor, transform, viewport.width, viewport.height, worldBounds));
  }, [focusRequest, onTransformChange, positionedById, transform, viewport.height, viewport.width, worldBounds]);

  const resetTransform = useCallback(() => {
    onResetPresentation();
    cameraRef.current.initialized = false;
    if (viewport.width > 0 && viewport.height > 0 && fitPoints.length > 0) {
      cameraRef.current.initialized = true;
      onTransformChange(fitSpatialProjectedBounds(fitPoints, viewport.width, viewport.height, zoomLevel === 'far' ? ANALYZER_SPATIAL_FIT_PADDING : undefined));
    }
  }, [fitPoints, onResetPresentation, onTransformChange, viewport.height, viewport.width, zoomLevel]);

  const changeZoom = useCallback((factor: number, anchorX = viewport.width / 2, anchorY = viewport.height / 2) => {
    const nextScale = Math.max(0.25, Math.min(1.8, transform.scale * factor));
    const worldX = (anchorX - transform.x) / transform.scale;
    const worldY = (anchorY - transform.y) / transform.scale;
    onTransformChange(withSpatialCameraSchema({
      scale: nextScale,
      x: anchorX - worldX * nextScale,
      y: anchorY - worldY * nextScale,
    }));
  }, [onTransformChange, transform.scale, transform.x, transform.y, viewport.height, viewport.width]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, path, span')) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [transform.x, transform.y]);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) drag.moved = true;
    onTransformChange(withSpatialCameraSchema({ ...transform, x: drag.originX + deltaX, y: drag.originY + deltaY }));
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

  const uniqueRegionLabels = useMemo(
    () => shortestUniqueRegionLabels(visiblePositionedRegions.map((positioned) => positioned.region)),
    [visiblePositionedRegions],
  );
  const relationHomeId = selectedRegionId ?? selectedNodeId;
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

  const projectedRegionBounds = useMemo(() => {
    const map = new Map<string, ProjectedRect>();
    visiblePositionedRegions.forEach((positioned) => {
      map.set(positioned.region.id, projectWorldRect({
        x: positioned.x,
        y: positioned.y,
        width: positioned.width,
        height: positioned.height,
        z: endpointElevation(positioned),
      }, camera));
    });
    return map;
  }, [camera, visiblePositionedRegions]);

  const projectedEdges = useMemo(() => {
    const resolved = spatialEdges.flatMap((edge) => {
      const source = positionedById.get(edge.sourceId);
      const target = positionedById.get(edge.targetId);
      if (!source || !target) return [];
      const sourceBounds = edge.aggregated && isRegionEndpoint(source)
        ? projectedRegionBounds.get(source.region.id)
        : projectedEndpointBounds(source, projectedModules, projectedRegionBounds);
      const targetBounds = edge.aggregated && isRegionEndpoint(target)
        ? projectedRegionBounds.get(target.region.id)
        : projectedEndpointBounds(target, projectedModules, projectedRegionBounds);
      if (!sourceBounds || !targetBounds) return [];
      return [{ edge, source, target, sourceBounds, targetBounds }];
    });
    const ports = assignProjectedPerimeterPorts(resolved.map(({ edge, sourceBounds, targetBounds }) => ({
      id: edge.id,
      source: sourceBounds,
      target: targetBounds,
    })));
    const built = resolved.map(({ edge, source, target, sourceBounds, targetBounds }): ProjectedGraphEdge | undefined => {
      const assigned = ports.get(edge.id);
      if (!assigned) return undefined;
      return buildProjectedGraphEdge({
        id: edge.id,
        edgeIds: edge.edgeIds,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        sourceRegionId: endpointRegionKey(source),
        targetRegionId: endpointRegionKey(target),
        sourceBounds,
        targetBounds,
        sourceZ: endpointElevation(source),
        targetZ: endpointElevation(target),
        sourcePackageId: endpointPackageKey(source),
        targetPackageId: endpointPackageKey(target),
        aggregated: edge.aggregated,
        selected: edge.selected,
        connected: edge.connected,
        dimmed: edge.dimmed,
        count: edge.count,
        camera,
        ports: assigned,
        worldStart: endpointWorldAnchor(source),
        worldEnd: endpointWorldAnchor(target),
        worldSourceRect: endpointWorldRect(source),
        worldTargetRect: endpointWorldRect(target),
        hovered: hoveredId === edge.id,
        homeId: relationHomeId,
        sourceAnchor: projectedEndpointAnchor(source, projectedModules, projectedRegionBounds),
        targetAnchor: projectedEndpointAnchor(target, projectedModules, projectedRegionBounds),
        zoomLevel,
      });
    }).filter((candidate): candidate is ProjectedGraphEdge => Boolean(candidate));
    return built.map((edge) => {
      const sourceName = endpointDisplayName(positionedById.get(edge.sourceId), uniqueRegionLabels, zoomLevel);
      const targetName = endpointDisplayName(positionedById.get(edge.targetId), uniqueRegionLabels, zoomLevel);
      const caption = spatialStubCaption({
        hostId: edge.stubHostId ?? relationHomeId,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        sourceLabel: sourceName,
        targetLabel: targetName,
        count: edge.count,
        continuationKind: edge.continuationKind,
      });
      const needsCaption = edge.continuation || edge.aggregated;
      const readable = !needsCaption || Boolean(caption);
      return { ...edge, caption, readable, visible: edge.visible && readable };
    });
  }, [camera, hoveredId, positionedById, projectedModules, projectedRegionBounds, relationHomeId, spatialEdges, uniqueRegionLabels, zoomLevel]);
  const visibleProjectedEdges = useMemo(
    () => projectedEdges.filter((edge) => edge.visible),
    [projectedEdges],
  );

  const overlayItems = useMemo(() => {
    const items: SpatialOverlayItem[] = [];
    visiblePositionedRegions.forEach((positioned) => {
      const selected = positioned.region.id === selectedRegionId;
      const kind = headingKind(positioned.region, selected);
      const screen = projectSpatialPoint(regionHeadingWorldAnchor(positioned, endpointElevation(positioned)), camera);
      const displayLabel = regionDisplayLabel(positioned.region, uniqueRegionLabels, zoomLevel);
      const moduleCount = typeof positioned.region.metadata.moduleCount === 'number'
        ? positioned.region.metadata.moduleCount
        : positioned.region.childIds.length;
      const countText = positioned.region.regionKind === 'workspace-package'
        ? spatialPackageHeadingCount(zoomLevel, moduleCount)
        : zoomLevel === 'far' ? '' : `· ${moduleCount} modules`;
      const width = Math.min(240, Math.max(64, 28 + (displayLabel.length + countText.length) * 6.6 * labelScale));
      items.push({
        id: positioned.region.id,
        kind,
        screen: { x: screen.x, y: screen.y - 11, width, height: 22 },
        locked: zoomLevel !== 'far',
      });
    });
    projectedModules.forEach((node) => {
      const selected = node.id === selectedNodeId;
      const neighbour = !selected && selectedContextNodeIds.has(node.id);
      const hovered = hoveredId === node.id;
      if (!projectedRectIntersectsViewport(node.cardBounds, camera, 8)) return;
      items.push({
        id: node.id,
        kind: selected ? 'selected-module' : neighbour ? 'neighbour-module' : hovered ? 'hovered-module' : 'module-card',
        screen: node.cardBounds,
        locked: zoomLevel !== 'far',
      });
    });
    projectedEdges.forEach((edge) => {
      if (!edge.visible) return;
      if (!edge.aggregated && !edge.continuation) return;
      const sourceName = endpointDisplayName(positionedById.get(edge.sourceId), uniqueRegionLabels, zoomLevel);
      const targetName = endpointDisplayName(positionedById.get(edge.targetId), uniqueRegionLabels, zoomLevel);
      const caption = spatialStubCaption({
        hostId: edge.stubHostId ?? relationHomeId,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        sourceLabel: sourceName,
        targetLabel: targetName,
        count: edge.count,
        continuationKind: edge.continuationKind,
      });
      const text = caption ?? `${sourceName} ${edge.count} ${targetName}`;
      const size = estimateStubPillSize(text);
      const visiblePathPoint = edge.points
        .filter((point) => spatialPointInViewport(point, camera, 0))
        .sort((first, second) => {
          const firstDistance = Math.hypot(first.x - camera.viewportWidth / 2, first.y - camera.viewportHeight / 2);
          const secondDistance = Math.hypot(second.x - camera.viewportWidth / 2, second.y - camera.viewportHeight / 2);
          return firstDistance - secondDistance;
        })[0] ?? edge.pill;
      let screen = keepProjectedRectInViewport({
        x: visiblePathPoint.x - size.width / 2,
        y: visiblePathPoint.y - size.height / 2,
        width: size.width,
        height: size.height,
      }, camera);
      const baseX = screen.x;
      const baseY = screen.y;
      for (let attempt = 1; attempt <= 12; attempt += 1) {
        if (!items.some((item) => screenRectsOverlap(item.screen, screen))) break;
        const direction = attempt % 2 === 0 ? 1 : -1;
        const distance = Math.ceil(attempt / 2) * (size.height + 5);
        screen = keepProjectedRectInViewport({
          ...screen,
          x: baseX,
          y: baseY + direction * distance,
        }, camera);
      }
      items.push({
        id: `pill:${edge.id}`,
        kind: edge.compact || edge.continuation || edge.aggregated ? 'relation-label' : 'aggregate-pill',
        screen,
      });
    });
    return items;
  }, [camera, hoveredId, labelScale, positionedById, projectedEdges, projectedModules, relationHomeId, selectedContextNodeIds, selectedNodeId, selectedRegionId, uniqueRegionLabels, visiblePositionedRegions, zoomLevel]);

  const overlayVisibility = useMemo(() => resolveSpatialOverlayCollision(overlayItems), [overlayItems]);

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
        <button type="button" onClick={fitCamera} title="現在表示しているMap全体を表示">Fit</button>
        <button type="button" onClick={resetTransform} title="カメラと表示状態を初期化">Reset</button>
        <button type="button" onClick={() => changeZoom(1.14)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => changeZoom(0.88)} aria-label="Zoom out">−</button>
        <span>{Math.round(transform.scale * 100)}%</span>
        <button type="button" className="analyzer-help-button" onClick={() => setShowHelp((current) => !current)} aria-expanded={showHelp} aria-controls="analyzer-spatial-help" aria-label="Spatial graph操作ヘルプ">?</button>
      </div>
      <div className="analyzer-spatial-lod" aria-live="polite" aria-label="Spatial detail level">
        <strong>{zoomLevel.toUpperCase()}</strong>
        <span>{zoomLevel === 'far' ? `package map · ${totalModuleCount} modules` : `${renderedPositionedModules.length} / ${totalModuleCount} modules`}</span>
        <span>{spatialVisibleProjectedEdgeCount(projectedEdges)} / {view.edges.length} edges</span>
        {import.meta.env.DEV && spatialVisibleProjectedEdgeCount(projectedEdges) === 0 && (
          <span>{spatialEdgeEmptyReason({ factCount: view.edges.length, renderedCount: 0, candidateCount: spatialEdges.length })}</span>
        )}
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
            camera={{ position: [0, 0, 800], zoom: 1, near: -2000, far: 2000 }}
            dpr={[1, 1.5]}
            frameloop="demand"
            gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
            fallback={<div className="analyzer-graph-empty">Three.js spatial rendering is unavailable.</div>}
            style={{ pointerEvents: 'none' }}
          >
            <SpatialScene
              layout={layout}
              regions={visiblePositionedRegions.map((positioned) => positioned.region)}
              modules={visiblePositionedModules}
              edges={visibleProjectedEdges}
              cameraModel={camera}
              worldBounds={worldBounds}
              selectedRegionId={selectedRegionId}
              zoomLevel={zoomLevel}
            />
          </Canvas>
          <div className="analyzer-spatial-overlay" aria-label="Module Dependency map controls" style={{ '--spatial-label-scale': labelScale } as CSSProperties}>
            {zoomLevel === 'far' && view.projectLabel && (
              <div className="analyzer-spatial-project-heading">{view.projectLabel}</div>
            )}
            <svg className="analyzer-spatial-graph-layer" width={Math.max(1, viewport.width)} height={Math.max(1, viewport.height)} viewBox={`0 0 ${Math.max(1, viewport.width)} ${Math.max(1, viewport.height)}`} aria-label="Module dependency relations">
              {visibleProjectedEdges.map((edge) => (
                <g key={edge.id} className={`analyzer-spatial-edge${edge.selected ? ' is-selected' : ''}${edge.connected ? ' is-connected' : ''}${edge.dimmed ? ' is-dimmed' : ''}${edge.compact ? ' is-compact' : ''}`}>
                  <path className="analyzer-spatial-edge-stroke" d={edge.path} fill="none" />
                  <polygon className="analyzer-spatial-edge-arrow" points={projectedArrowPolygon(edge.arrow)} />
                  <path
                    className="analyzer-spatial-edge-hit"
                    d={edge.path}
                    onClick={(event) => {
                      event.stopPropagation();
                      const factId = edge.edgeIds[0];
                      if (factId) onSelectEdge(factId);
                    }}
                    onPointerEnter={() => setHoveredId(edge.id)}
                    onPointerLeave={() => setHoveredId((current) => current === edge.id ? undefined : current)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${edge.sourceId} to ${edge.targetId}`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        const factId = edge.edgeIds[0];
                        if (factId) onSelectEdge(factId);
                      }
                    }}
                  />
                </g>
              ))}
            </svg>
            {visibleProjectedEdges.map((edge) => {
              const overlayId = `pill:${edge.id}`;
              const visibility = overlayVisibility.get(overlayId);
              if (!visibility || visibility === 'hide') return null;
              if (!edge.aggregated && !edge.continuation) return null;
              const sourceName = endpointDisplayName(positionedById.get(edge.sourceId), uniqueRegionLabels, zoomLevel);
              const targetName = endpointDisplayName(positionedById.get(edge.targetId), uniqueRegionLabels, zoomLevel);
              const item = overlayItems.find((candidate) => candidate.id === overlayId);
              if (!item) return null;
              const caption = spatialStubCaption({
                hostId: edge.stubHostId ?? relationHomeId,
                sourceId: edge.sourceId,
                targetId: edge.targetId,
                sourceLabel: sourceName,
                targetLabel: targetName,
                count: edge.count,
                continuationKind: edge.continuationKind,
              });
              return (
                <span
                  key={overlayId}
                  className={`analyzer-spatial-edge-count${edge.connected || edge.selected ? ' is-emphasis' : ''}${caption ? ' is-counterpart' : ''}${visibility === 'compact' || edge.compact ? ' is-compact' : ''}`}
                  style={{ left: item.screen.x, top: item.screen.y }}
                  aria-label={caption ?? `${sourceName} ${edge.count} to ${targetName}`}
                >
                  {caption
                    ? <em>{caption}</em>
                    : (
                      <>
                        {visibility === 'show' && <em>{sourceName}</em>}
                        <strong>{edge.count}</strong>
                        {visibility === 'show' && <em>{targetName}</em>}
                      </>
                    )}
                </span>
              );
            })}
            {visiblePositionedRegions.map((positioned) => {
              const region = positioned.region;
              const visibility = overlayVisibility.get(region.id);
              if (!visibility || visibility === 'hide') return null;
              const selected = region.id === selectedRegionId;
              const matches = !search.trim() || regionMatchesSearch(region, search);
              const expanded = expandedPresentationIds.size === 0 || expandedPresentationIds.has(region.id);
              const packageRegion = region.regionKind === 'workspace-package';
              const majorRegion = packageRegion || (region.depth ?? 0) <= 1;
              const moduleCount = typeof region.metadata.moduleCount === 'number'
                ? region.metadata.moduleCount
                : region.childIds.length;
              const item = overlayItems.find((candidate) => candidate.id === region.id);
              if (!item) return null;
              return (
                <button
                  key={region.id}
                  type="button"
                  className={`analyzer-spatial-region-heading${packageRegion ? ' is-package' : ''}${selected ? ' is-selected' : ''}${matches && search.trim() ? ' is-match' : ''}${!expanded && !packageRegion ? ' is-collapsed' : ''}${majorRegion ? ' is-major' : ''}${zoomLevel === 'far' && packageRegion ? ' is-far' : ''}`}
                  style={{
                    left: item.screen.x,
                    top: item.screen.y,
                    fontSize: `calc(${majorRegion ? 0.7 : 0.62}rem * ${labelScale})`,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerEnter={() => setHoveredId(region.id)}
                  onPointerLeave={() => setHoveredId((current) => current === region.id ? undefined : current)}
                  onClick={() => onSelectRegion(region.id)}
                  onDoubleClick={() => {
                    if (!packageRegion) onTogglePresentation(region.id);
                  }}
                  aria-pressed={selected}
                  aria-expanded={packageRegion ? undefined : expanded}
                  title={`${region.subtitle ?? region.label}${packageRegion ? '' : ' · double click to expand or collapse'}`}
                >
                  <span className="analyzer-spatial-region-glyph" aria-hidden="true">{packageRegion ? '▣' : '◇'}</span>
                  <strong>{regionDisplayLabel(region, uniqueRegionLabels, zoomLevel)}</strong>
                  {visibility === 'show' && (packageRegion || zoomLevel !== 'far') && (
                    <span className="analyzer-spatial-region-count">{spatialPackageHeadingCount(zoomLevel, moduleCount)}</span>
                  )}
                  {visibility === 'show' && !packageRegion && <span className="analyzer-spatial-region-toggle" aria-hidden="true">{expanded ? '−' : '+'}</span>}
                </button>
              );
            })}
            {renderedPositionedModules.map((positioned) => {
              const node = positioned.node;
              const projected = projectedModules.get(node.id);
              const visibility = overlayVisibility.get(node.id);
              if (!projected || !visibility || visibility === 'hide') return null;
              const selected = node.id === selectedNodeId;
              if (!projectedRectIntersectsViewport(projected.cardBounds, camera, 8)) return null;
              const connected = Boolean(selectedNodeId || selectedEdgeId) && spatialEdges.some((edge) => !edge.aggregated && (edge.connected || edge.selected) && (edge.sourceId === node.id || edge.targetId === node.id));
              const matches = Boolean(search.trim()) && nodeMatchesSearch(node, search);
              const dimmed = Boolean(selectedNodeId || selectedEdgeId) && !selected && !connected;
              const showLabel = zoomLevel !== 'far' || selected || matches || selectedContextNodeIds.has(node.id);
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`analyzer-spatial-module${selected ? ' is-selected' : ''}${connected ? ' is-connected' : ''}${matches && search.trim() ? ' is-match' : ''}${dimmed ? ' is-dimmed' : ''}`}
                  style={{
                    left: projected.cardBounds.x,
                    top: projected.cardBounds.y,
                    width: projected.cardBounds.width,
                    height: projected.cardBounds.height,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerEnter={() => setHoveredId(node.id)}
                  onPointerLeave={() => setHoveredId((current) => current === node.id ? undefined : current)}
                  onClick={() => onSelectNode(node.id)}
                  onDoubleClick={() => onSelectNode(node.id, true)}
                  aria-pressed={selected}
                  aria-label={`${node.label}, ${String(node.metadata.modulePath ?? node.label)}`}
                  title={String(node.metadata.modulePath ?? node.label)}
                >
                  <span className="analyzer-spatial-module-icon" aria-hidden="true">{String(node.metadata.fileIcon ?? 'FILE')}</span>
                  {showLabel && (
                    <span className="analyzer-spatial-module-label">
                      {truncateDistinctFilename(
                        node.label,
                        renderedPositionedModules.map((item) => item.node.label),
                        visibility === 'compact' ? 12 : zoomLevel === 'near' ? 22 : 16,
                      )}
                    </span>
                  )}
                  {zoomLevel === 'near' && visibility === 'show' && <small>{String(node.metadata.incomingCount ?? 0)} in · {String(node.metadata.outgoingCount ?? 0)} out</small>}
                </button>
              );
            })}
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
