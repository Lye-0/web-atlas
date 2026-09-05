import { ANALYZER_MODULE_NODE_HEIGHT, ANALYZER_MODULE_NODE_WIDTH } from './layout';
import {
  projectSpatialPoint,
  spatialScreenPointToWorldAtElevation,
  type SpatialCameraModel,
  type SpatialScreenPoint,
  type SpatialWorldPoint,
  type SpatialWorldRect,
} from './spatialCoordinates';
import { routeSpatialEdge, type SpatialRouteEndpoint, type SpatialRouteObstacle } from './spatialRouting';
import {
  spatialEdgeAltitude,
  spatialEdgeClass,
  type AnalyzerSpatialEdgeClass,
} from './spatialPresentation';

export const ANALYZER_SPATIAL_LABEL_VIEWPORT_MARGIN = 8;
export const EDGE_VISIBILITY_INSET = 8;
export const FAR_PACKAGE_EDGE_VISIBILITY_INSET = 2;

export const PROJECTED_EDGE_ALIGNMENT_EPSILON = 1.5;
export const PROJECTED_ARROW_SIZE = 6;
export const PROJECTED_STROKE_WIDTH_MAX = 2.6;

export interface ProjectedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProjectedModuleNode {
  id: string;
  anchorX: number;
  anchorY: number;
  cardBounds: ProjectedRect;
}

export interface ProjectedRegionNode {
  id: string;
  bounds: ProjectedRect;
  headingAnchor: SpatialScreenPoint;
}

export interface ProjectedGraphEdge {
  id: string;
  edgeIds: string[];
  sourceId: string;
  targetId: string;
  aggregated: boolean;
  edgeClass: AnalyzerSpatialEdgeClass;
  worldPoints: SpatialWorldPoint[];
  points: SpatialScreenPoint[];
  path: string;
  arrow: { x: number; y: number; angle: number };
  labelAnchor: SpatialScreenPoint;
  selected: boolean;
  connected: boolean;
  dimmed: boolean;
  count: number;
  caption?: string;
  description?: string;
  direction?: 'imports' | 'imported-by' | 'internal';
  readable: boolean;
  visible: boolean;
}

export function projectedRectFromAnchor(
  anchor: SpatialScreenPoint,
  width = ANALYZER_MODULE_NODE_WIDTH,
  height = ANALYZER_MODULE_NODE_HEIGHT,
): ProjectedRect {
  return {
    x: anchor.x - width / 2,
    y: anchor.y - height / 2,
    width,
    height,
  };
}

export function projectedRectCenter(rect: ProjectedRect): SpatialScreenPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function projectedAabb(points: readonly SpatialScreenPoint[]): ProjectedRect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, Math.max(...xs) - minX),
    height: Math.max(1, Math.max(...ys) - minY),
  };
}

export function projectWorldRect(rect: SpatialWorldRect, camera: SpatialCameraModel): ProjectedRect {
  return projectedAabb([
    projectSpatialPoint({ x: rect.x, y: rect.y, z: rect.z }, camera),
    projectSpatialPoint({ x: rect.x + rect.width, y: rect.y, z: rect.z }, camera),
    projectSpatialPoint({ x: rect.x, y: rect.y + rect.height, z: rect.z }, camera),
    projectSpatialPoint({ x: rect.x + rect.width, y: rect.y + rect.height, z: rect.z }, camera),
  ]);
}

function dominantSide(dx: number, dy: number): 'left' | 'right' | 'top' | 'bottom' {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function oppositeSide(side: 'left' | 'right' | 'top' | 'bottom'): 'left' | 'right' | 'top' | 'bottom' {
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  if (side === 'top') return 'bottom';
  return 'top';
}

function pointOnProjectedSide(
  rect: ProjectedRect,
  side: 'left' | 'right' | 'top' | 'bottom',
  slotIndex: number,
  slotCount: number,
): SpatialScreenPoint {
  const count = Math.max(1, slotCount);
  const t = (slotIndex + 1) / (count + 1);
  const inset = Math.min(10, Math.max(3, Math.min(rect.width, rect.height) * 0.12));
  if (side === 'right') return { x: rect.x + rect.width, y: rect.y + inset + (rect.height - inset * 2) * t };
  if (side === 'left') return { x: rect.x, y: rect.y + inset + (rect.height - inset * 2) * t };
  if (side === 'bottom') return { x: rect.x + inset + (rect.width - inset * 2) * t, y: rect.y + rect.height };
  return { x: rect.x + inset + (rect.width - inset * 2) * t, y: rect.y };
}

export function projectedRectSides(
  source: ProjectedRect,
  target: ProjectedRect,
): { sourceSide: 'left' | 'right' | 'top' | 'bottom'; targetSide: 'left' | 'right' | 'top' | 'bottom' } {
  const from = projectedRectCenter(source);
  const to = projectedRectCenter(target);
  const sourceSide = dominantSide(to.x - from.x, to.y - from.y);
  return { sourceSide, targetSide: oppositeSide(sourceSide) };
}

export function projectedPerimeterPort(
  source: ProjectedRect,
  target: ProjectedRect,
  slotIndex = 0,
  slotCount = 1,
  role: 'source' | 'target' = 'source',
): SpatialScreenPoint {
  const { sourceSide, targetSide } = projectedRectSides(source, target);
  const side = role === 'source' ? sourceSide : targetSide;
  const rect = role === 'source' ? source : target;
  const port = pointOnProjectedSide(rect, side, slotIndex, slotCount);
  return {
    x: Math.min(rect.x + rect.width, Math.max(rect.x, port.x)),
    y: Math.min(rect.y + rect.height, Math.max(rect.y, port.y)),
  };
}

export function offsetProjectedPortOutward(
  rect: ProjectedRect,
  port: SpatialScreenPoint,
  amount = 4,
): SpatialScreenPoint {
  if (Math.abs(port.x - rect.x) <= PROJECTED_EDGE_ALIGNMENT_EPSILON) return { x: port.x - amount, y: port.y };
  if (Math.abs(port.x - (rect.x + rect.width)) <= PROJECTED_EDGE_ALIGNMENT_EPSILON) return { x: port.x + amount, y: port.y };
  if (Math.abs(port.y - rect.y) <= PROJECTED_EDGE_ALIGNMENT_EPSILON) return { x: port.x, y: port.y - amount };
  if (Math.abs(port.y - (rect.y + rect.height)) <= PROJECTED_EDGE_ALIGNMENT_EPSILON) return { x: port.x, y: port.y + amount };
  return port;
}

export function projectedPortOnRect(port: SpatialScreenPoint, rect: ProjectedRect, epsilon = PROJECTED_EDGE_ALIGNMENT_EPSILON): boolean {
  const onVertical = (Math.abs(port.x - rect.x) <= epsilon || Math.abs(port.x - (rect.x + rect.width)) <= epsilon)
    && port.y >= rect.y - epsilon
    && port.y <= rect.y + rect.height + epsilon;
  const onHorizontal = (Math.abs(port.y - rect.y) <= epsilon || Math.abs(port.y - (rect.y + rect.height)) <= epsilon)
    && port.x >= rect.x - epsilon
    && port.x <= rect.x + rect.width + epsilon;
  return onVertical || onHorizontal;
}

export function assignProjectedPerimeterPorts(
  edges: readonly { id: string; source: ProjectedRect; target: ProjectedRect }[],
): Map<string, { start: SpatialScreenPoint; end: SpatialScreenPoint }> {
  const sourceSlots = new Map<string, string[]>();
  const targetSlots = new Map<string, string[]>();
  const sides = new Map<string, ReturnType<typeof projectedRectSides>>();
  const ordered = [...edges].sort((first, second) => first.id.localeCompare(second.id));
  ordered.forEach((edge) => {
    const pair = projectedRectSides(edge.source, edge.target);
    sides.set(edge.id, pair);
    const sourceKey = `${edge.source.x}:${edge.source.y}:${pair.sourceSide}`;
    const targetKey = `${edge.target.x}:${edge.target.y}:${pair.targetSide}`;
    if (!sourceSlots.has(sourceKey)) sourceSlots.set(sourceKey, []);
    if (!targetSlots.has(targetKey)) targetSlots.set(targetKey, []);
    sourceSlots.get(sourceKey)!.push(edge.id);
    targetSlots.get(targetKey)!.push(edge.id);
  });
  const byId = new Map(edges.map(edge => [edge.id, edge]));
  const sourceIndices = new Map<string, number>(), targetIndices = new Map<string, number>();
  const sortSlots = (groups: Map<string, string[]>, source: boolean, indices: Map<string, number>) => {
    groups.forEach(ids => {
      const side = source ? sides.get(ids[0]!)!.sourceSide : sides.get(ids[0]!)!.targetSide;
      const position = (id: string) => {
        const edge = byId.get(id)!;
        const rect = source ? edge.target : edge.source;
        return side === 'left' || side === 'right' ? rect.y + rect.height / 2 : rect.x + rect.width / 2;
      };
      // Match port order to destination order instead of alphabetical IDs.
      ids.sort((a, b) => position(a) - position(b) || a.localeCompare(b));
      ids.forEach((id, index) => indices.set(id, index));
    });
  };
  sortSlots(sourceSlots, true, sourceIndices);
  sortSlots(targetSlots, false, targetIndices);
  const assigned = new Map<string, { start: SpatialScreenPoint; end: SpatialScreenPoint }>();
  ordered.forEach((edge) => {
    const pair = sides.get(edge.id);
    if (!pair) return;
    const sourceKey = `${edge.source.x}:${edge.source.y}:${pair.sourceSide}`;
    const targetKey = `${edge.target.x}:${edge.target.y}:${pair.targetSide}`;
    const sourceGroup = sourceSlots.get(sourceKey) ?? [edge.id];
    const targetGroup = targetSlots.get(targetKey) ?? [edge.id];
    assigned.set(edge.id, {
      start: pointOnProjectedSide(edge.source, pair.sourceSide, sourceIndices.get(edge.id)!, sourceGroup.length),
      end: pointOnProjectedSide(edge.target, pair.targetSide, targetIndices.get(edge.id)!, targetGroup.length),
    });
  });
  return assigned;
}

export function projectedArcPoints(
  start: SpatialScreenPoint,
  end: SpatialScreenPoint,
  extraWorldZ: number,
  camera: SpatialCameraModel,
  sourceWorld?: SpatialWorldPoint,
  targetWorld?: SpatialWorldPoint,
): SpatialScreenPoint[] {
  if (!sourceWorld || !targetWorld || extraWorldZ < 1.2) return [start, end];
  const samples = 13;
  return Array.from({ length: samples }, (_, index) => {
    const t = index / (samples - 1);
    const screen = projectSpatialPoint({
      x: sourceWorld.x + (targetWorld.x - sourceWorld.x) * t,
      y: sourceWorld.y + (targetWorld.y - sourceWorld.y) * t,
      z: sourceWorld.z + (targetWorld.z - sourceWorld.z) * t + Math.sin(Math.PI * t) * extraWorldZ,
    }, camera);
    if (index === 0) return start;
    if (index === samples - 1) return end;
    return screen;
  });
}

export function projectedRectFullyInViewport(
  rect: ProjectedRect,
  camera: Pick<SpatialCameraModel, 'viewportWidth' | 'viewportHeight'>,
  margin = 0,
): boolean {
  return rect.x >= margin
    && rect.y >= margin
    && rect.x + rect.width <= camera.viewportWidth - margin
    && rect.y + rect.height <= camera.viewportHeight - margin;
}

export function projectedPathWithinViewport(
  points: readonly SpatialScreenPoint[],
  camera: Pick<SpatialCameraModel, 'viewportWidth' | 'viewportHeight'>,
  margin = 0,
): boolean {
  return points.length >= 2 && points.every((point) => (
    point.x >= margin
    && point.y >= margin
    && point.x <= camera.viewportWidth - margin
    && point.y <= camera.viewportHeight - margin
  ));
}

export function projectedTerminalInViewport(
  point: SpatialScreenPoint,
  camera: Pick<SpatialCameraModel, 'viewportWidth' | 'viewportHeight'>,
  inset = EDGE_VISIBILITY_INSET,
): boolean {
  return point.x >= inset
    && point.y >= inset
    && point.x <= camera.viewportWidth - inset
    && point.y <= camera.viewportHeight - inset;
}

export function projectedEdgeTerminalsVisible(
  points: readonly SpatialScreenPoint[],
  camera: Pick<SpatialCameraModel, 'viewportWidth' | 'viewportHeight'>,
  inset = EDGE_VISIBILITY_INSET,
): boolean {
  const start = points[0];
  const end = points.at(-1);
  return Boolean(start && end && points.length >= 2
    && projectedTerminalInViewport(start, camera, inset)
    && projectedTerminalInViewport(end, camera, inset));
}

export function estimateRelationLabelSize(caption: string, scale = 1): { width: number; height: number } {
  return {
    width: Math.min(280, Math.max(92, 30 + caption.length * 6.8)) * scale,
    height: 18,
  };
}

export function projectedPolylineLength(points: readonly SpatialScreenPoint[]): number {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    return total + (previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0);
  }, 0);
}

export function projectedRouteExcursion(points: readonly SpatialScreenPoint[]): number {
  const start = points[0];
  const end = points.at(-1);
  if (!start || !end) return 0;
  return Math.max(0, projectedPolylineLength(points) - Math.hypot(end.x - start.x, end.y - start.y));
}

export function projectedQuadraticControl(
  start: SpatialScreenPoint,
  end: SpatialScreenPoint,
  extraWorldZ: number,
  camera: SpatialCameraModel,
  sourceWorld?: SpatialWorldPoint,
  targetWorld?: SpatialWorldPoint,
): SpatialScreenPoint | undefined {
  if (!sourceWorld || !targetWorld || extraWorldZ < 1.2) return undefined;
  const apex = projectSpatialPoint({
    x: (sourceWorld.x + targetWorld.x) / 2,
    y: (sourceWorld.y + targetWorld.y) / 2,
    z: (sourceWorld.z + targetWorld.z) / 2 + extraWorldZ,
  }, camera);
  return {
    x: 2 * apex.x - start.x * 0.5 - end.x * 0.5,
    y: 2 * apex.y - start.y * 0.5 - end.y * 0.5,
  };
}

export function projectedPathD(points: readonly SpatialScreenPoint[], control?: SpatialScreenPoint): string {
  const start = points[0];
  const end = points.at(-1);
  if (!start) return '';
  if (!end || points.length === 1) return `M ${start.x} ${start.y}`;
  if (control) return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
  if (points.length === 2) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  return `M ${start.x} ${start.y}${points.slice(1).map((point) => ` L ${point.x} ${point.y}`).join('')}`;
}

export function projectedPathIsOpen(path: string): boolean {
  return Boolean(path) && !/\sZ\s*$/i.test(path.trim());
}

export function projectedArrow(points: readonly SpatialScreenPoint[], control?: SpatialScreenPoint): { x: number; y: number; angle: number } {
  const tip = points.at(-1) ?? { x: 0, y: 0 };
  const previous = control ?? points.at(-2) ?? tip;
  return {
    x: tip.x,
    y: tip.y,
    angle: Math.atan2(tip.y - previous.y, tip.x - previous.x),
  };
}

export function projectedPathMidpoint(points: readonly SpatialScreenPoint[]): SpatialScreenPoint {
  return points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
}

export function extraAltitudeForEdgeClass(
  edgeClass: AnalyzerSpatialEdgeClass,
  sourceZ: number,
  targetZ: number,
  zoomLevel: 'far' | 'medium' | 'near' = 'near',
): number {
  if (edgeClass === 'local') return 0;
  return Math.max(0, spatialEdgeAltitude(edgeClass, zoomLevel) - (sourceZ + targetZ) / 2);
}

export function projectedArrowPolygon(arrow: { x: number; y: number; angle: number }, size = PROJECTED_ARROW_SIZE): string {
  const left = arrow.angle + Math.PI * 0.82;
  const right = arrow.angle - Math.PI * 0.82;
  return [
    `${arrow.x},${arrow.y}`,
    `${arrow.x + Math.cos(left) * size},${arrow.y + Math.sin(left) * size}`,
    `${arrow.x + Math.cos(right) * size},${arrow.y + Math.sin(right) * size}`,
  ].join(' ');
}

export function keepProjectedRectInViewport(
  rect: ProjectedRect,
  camera: Pick<SpatialCameraModel, 'viewportWidth' | 'viewportHeight'>,
  margin = ANALYZER_SPATIAL_LABEL_VIEWPORT_MARGIN,
): ProjectedRect {
  const maxX = Math.max(margin, camera.viewportWidth - rect.width - margin);
  const maxY = Math.max(margin, camera.viewportHeight - rect.height - margin);
  return {
    ...rect,
    x: Math.min(maxX, Math.max(margin, rect.x)),
    y: Math.min(maxY, Math.max(margin, rect.y)),
  };
}

export function buildProjectedGraphEdge(options: {
  id: string;
  edgeIds?: readonly string[];
  sourceId: string;
  targetId: string;
  sourceRegionId: string;
  targetRegionId: string;
  sourceBounds: ProjectedRect;
  targetBounds: ProjectedRect;
  sourceZ: number;
  targetZ: number;
  sourcePackageId?: string;
  targetPackageId?: string;
  aggregated: boolean;
  selected: boolean;
  connected: boolean;
  dimmed: boolean;
  count: number;
  camera: SpatialCameraModel;
  ports: { start: SpatialScreenPoint; end: SpatialScreenPoint };
  worldStart?: SpatialWorldPoint;
  worldEnd?: SpatialWorldPoint;
  worldSourcePort?: SpatialWorldPoint;
  worldTargetPort?: SpatialWorldPoint;
  obstacles?: readonly SpatialRouteObstacle[];
  zoomLevel?: 'far' | 'medium' | 'near';
  caption?: string;
  worldSourceRect?: SpatialWorldRect;
  worldTargetRect?: SpatialWorldRect;
}): ProjectedGraphEdge {
  const edgeClass = spatialEdgeClass(
    options.sourcePackageId,
    options.targetPackageId,
    options.sourceRegionId,
    options.targetRegionId,
  );
  const extraZ = extraAltitudeForEdgeClass(edgeClass, options.sourceZ, options.targetZ, options.zoomLevel);
  const start = options.ports.start;
  const end = options.ports.end;
  const localAltitude = spatialEdgeAltitude(edgeClass, options.zoomLevel ?? 'near');
  const sourceAttachZ = edgeClass === 'local' ? Math.max(options.sourceZ, localAltitude) : options.sourceZ;
  const targetAttachZ = edgeClass === 'local' ? Math.max(options.targetZ, localAltitude) : options.targetZ;
  let worldPoints: SpatialWorldPoint[] = [];
  if (options.worldSourceRect && options.worldTargetRect) {
    const sourceTerminal = options.worldSourcePort
      ?? spatialScreenPointToWorldAtElevation(start, sourceAttachZ, options.camera);
    const targetTerminal = options.worldTargetPort
      ?? spatialScreenPointToWorldAtElevation(end, targetAttachZ, options.camera);
    const sourceEndpoint: SpatialRouteEndpoint = {
      id: options.sourceId,
      x: sourceTerminal.x,
      y: sourceTerminal.y,
      width: 0,
      height: 0,
      regionId: options.sourceRegionId,
      packageId: options.sourcePackageId,
      elevation: sourceAttachZ,
    };
    const targetEndpoint: SpatialRouteEndpoint = {
      id: options.targetId,
      x: targetTerminal.x,
      y: targetTerminal.y,
      width: 0,
      height: 0,
      regionId: options.targetRegionId,
      packageId: options.targetPackageId,
      elevation: targetAttachZ,
    };
    const obstacles = options.obstacles?.filter((obstacle) => (
      obstacle.id !== options.sourceId && obstacle.id !== options.targetId
    )) ?? [];
    worldPoints = routeSpatialEdge(
      sourceEndpoint,
      targetEndpoint,
      obstacles,
      options.zoomLevel ?? 'near',
    ).points;
    if (worldPoints.length > 1) {
      worldPoints = [
        { x: sourceTerminal.x, y: sourceTerminal.y, z: sourceAttachZ },
        ...worldPoints.slice(1, -1),
        { x: targetTerminal.x, y: targetTerminal.y, z: targetAttachZ },
      ];
    }
  }
  const points = worldPoints.length > 1
    ? [start, ...worldPoints.slice(1, -1).map((point) => projectSpatialPoint(point, options.camera)), end]
    : [start, end];
  const control = worldPoints.length > 1
    ? undefined
    : projectedQuadraticControl(start, end, extraZ, options.camera, options.worldStart, options.worldEnd);
  const caption = options.caption;
  const readable = !options.aggregated || Boolean(caption);
  const terminalsOnCards = options.aggregated
    || (projectedPortOnRect(start, options.sourceBounds) && projectedPortOnRect(end, options.targetBounds));
  const visibilityInset = options.zoomLevel === 'far' && options.aggregated && edgeClass === 'cross-package'
    ? FAR_PACKAGE_EDGE_VISIBILITY_INSET
    : EDGE_VISIBILITY_INSET;
  const visible = readable
    && terminalsOnCards
    && projectedEdgeTerminalsVisible(points, options.camera, visibilityInset);
  return {
    id: options.id,
    edgeIds: [...(options.edgeIds ?? [options.id])],
    sourceId: options.sourceId,
    targetId: options.targetId,
    aggregated: options.aggregated,
    edgeClass,
    worldPoints,
    points,
    path: projectedPathD(points, control),
    arrow: projectedArrow(points, control),
    labelAnchor: projectedPathMidpoint(points),
    selected: options.selected,
    connected: options.connected,
    dimmed: options.dimmed,
    count: options.count,
    caption,
    readable,
    visible,
  };
}

export function projectedModuleNode(
  id: string,
  worldAnchor: SpatialWorldPoint,
  camera: SpatialCameraModel,
  width = ANALYZER_MODULE_NODE_WIDTH,
  height = ANALYZER_MODULE_NODE_HEIGHT,
): ProjectedModuleNode {
  const anchor = projectSpatialPoint(worldAnchor, camera);
  return {
    id,
    anchorX: anchor.x,
    anchorY: anchor.y,
    cardBounds: projectWorldRect({
      x: worldAnchor.x - width / 2,
      y: worldAnchor.y - height / 2,
      width,
      height,
      z: worldAnchor.z,
    }, camera),
  };
}

export function spatialVisibleProjectedEdgeCount(edges: readonly Pick<ProjectedGraphEdge, 'visible' | 'readable'>[]): number {
  return edges.filter((edge) => edge.visible && edge.readable !== false).length;
}

export function spatialRepresentedRelationCount(
  edges: readonly Pick<ProjectedGraphEdge, 'visible' | 'readable' | 'count'>[],
): number {
  return edges
    .filter((edge) => edge.visible && edge.readable !== false)
    .reduce((total, edge) => total + edge.count, 0);
}

export function sameProjectedGeometry(first: Pick<ProjectedGraphEdge, 'path' | 'points'>, second: Pick<ProjectedGraphEdge, 'path' | 'points'>): boolean {
  return first.path === second.path
    && first.points.length === second.points.length
    && first.points.every((point, index) => point.x === second.points[index]?.x && point.y === second.points[index]?.y);
}
