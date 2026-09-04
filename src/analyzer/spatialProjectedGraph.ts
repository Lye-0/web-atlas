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
    sourceSlots.set(sourceKey, [...(sourceSlots.get(sourceKey) ?? []), edge.id]);
    targetSlots.set(targetKey, [...(targetSlots.get(targetKey) ?? []), edge.id]);
  });
  const assigned = new Map<string, { start: SpatialScreenPoint; end: SpatialScreenPoint }>();
  ordered.forEach((edge) => {
    const pair = sides.get(edge.id);
    if (!pair) return;
    const sourceKey = `${edge.source.x}:${edge.source.y}:${pair.sourceSide}`;
    const targetKey = `${edge.target.x}:${edge.target.y}:${pair.targetSide}`;
    const sourceGroup = sourceSlots.get(sourceKey) ?? [edge.id];
    const targetGroup = targetSlots.get(targetKey) ?? [edge.id];
    assigned.set(edge.id, {
      start: pointOnProjectedSide(edge.source, pair.sourceSide, sourceGroup.indexOf(edge.id), sourceGroup.length),
      end: pointOnProjectedSide(edge.target, pair.targetSide, targetGroup.indexOf(edge.id), targetGroup.length),
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

function sampleProjectedQuadratic(
  start: SpatialScreenPoint,
  end: SpatialScreenPoint,
  control?: SpatialScreenPoint,
): SpatialScreenPoint[] {
  if (!control) return [start, end];
  return [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const inverse = 1 - t;
    return {
      x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
      y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    };
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
  let worldPoints: SpatialWorldPoint[] = [];
  if (options.worldSourceRect && options.worldTargetRect) {
    const sourceTerminal = options.worldSourcePort
      ?? spatialScreenPointToWorldAtElevation(start, options.sourceZ, options.camera);
    const targetTerminal = options.worldTargetPort
      ?? spatialScreenPointToWorldAtElevation(end, options.targetZ, options.camera);
    const sourceEndpoint: SpatialRouteEndpoint = {
      id: options.sourceId,
      x: sourceTerminal.x,
      y: sourceTerminal.y,
      width: 0,
      height: 0,
      regionId: options.sourceRegionId,
      packageId: options.sourcePackageId,
      elevation: options.sourceZ,
    };
    const targetEndpoint: SpatialRouteEndpoint = {
      id: options.targetId,
      x: targetTerminal.x,
      y: targetTerminal.y,
      width: 0,
      height: 0,
      regionId: options.targetRegionId,
      packageId: options.targetPackageId,
      elevation: options.targetZ,
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
  }
  const points = worldPoints.length > 1
    ? worldPoints.map((point) => projectSpatialPoint(point, options.camera))
    : [start, end];
  const control = worldPoints.length > 1
    ? undefined
    : projectedQuadraticControl(start, end, extraZ, options.camera, options.worldStart, options.worldEnd);
  const caption = options.caption;
  const readable = !options.aggregated || Boolean(caption);
  const sourceVisible = projectedRectFullyInViewport(options.sourceBounds, options.camera);
  const targetVisible = projectedRectFullyInViewport(options.targetBounds, options.camera);
  const pathSamples = control
    ? sampleProjectedQuadratic(points[0]!, points.at(-1)!, control)
    : points;
  // An Edge is a complete visual relation only when both semantic endpoints
  // and every projected path sample are inside the viewport.  This prevents
  // continuation fragments and screen-edge shortcuts from being mistaken for
  // visible relations.
  const visible = readable
    && sourceVisible
    && targetVisible
    && projectedPathWithinViewport(pathSamples, options.camera);
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

export function sameProjectedGeometry(first: Pick<ProjectedGraphEdge, 'path' | 'points'>, second: Pick<ProjectedGraphEdge, 'path' | 'points'>): boolean {
  return first.path === second.path
    && first.points.length === second.points.length
    && first.points.every((point, index) => point.x === second.points[index]?.x && point.y === second.points[index]?.y);
}
