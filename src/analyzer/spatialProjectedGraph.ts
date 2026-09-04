import { ANALYZER_MODULE_NODE_HEIGHT, ANALYZER_MODULE_NODE_WIDTH } from './layout';
import {
  projectSpatialPoint,
  spatialPointInViewport,
  type SpatialCameraModel,
  type SpatialScreenPoint,
  type SpatialWorldPoint,
  type SpatialWorldRect,
} from './spatialCoordinates';
import type { SpatialContinuationKind } from './spatialLabels';
import { routeSpatialEdge, type SpatialRouteEndpoint } from './spatialRouting';
import {
  ANALYZER_SPATIAL_FULL_AGGREGATE_DISTANCE,
  spatialEdgeAltitude,
  spatialEdgeClass,
  type AnalyzerSpatialEdgeClass,
} from './spatialPresentation';

export const ANALYZER_SPATIAL_FULL_PORT_INSET = 28;
export const ANALYZER_SPATIAL_FULL_PATH_VISIBLE_RATIO = 0.62;
export const ANALYZER_SPATIAL_STUB_VIEWPORT_MARGIN = 8;

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
  compact: boolean;
  continuation: boolean;
  continuationKind?: SpatialContinuationKind;
  stubHostId?: string;
  edgeClass: AnalyzerSpatialEdgeClass;
  worldPoints: SpatialWorldPoint[];
  points: SpatialScreenPoint[];
  path: string;
  arrow: { x: number; y: number; angle: number };
  pill: SpatialScreenPoint;
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

export function compactProjectedStub(start: SpatialScreenPoint, end: SpatialScreenPoint, length = 52): SpatialScreenPoint[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy) || 1;
  const scale = Math.min(length, distance) / distance;
  return [start, { x: start.x + dx * scale, y: start.y + dy * scale }];
}

export function compactDirectedStub(
  sourcePort: SpatialScreenPoint,
  targetPort: SpatialScreenPoint,
  kind: SpatialContinuationKind,
  length = 48,
): SpatialScreenPoint[] {
  const dx = targetPort.x - sourcePort.x;
  const dy = targetPort.y - sourcePort.y;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  const span = Math.min(length, distance);
  if (kind === 'source-offscreen') {
    return [
      { x: targetPort.x - ux * span, y: targetPort.y - uy * span },
      targetPort,
    ];
  }
  return [
    sourcePort,
    { x: sourcePort.x + ux * span, y: sourcePort.y + uy * span },
  ];
}

export function spatialPointComfortablyInViewport(
  screen: SpatialScreenPoint,
  camera: SpatialCameraModel,
  inset = ANALYZER_SPATIAL_FULL_PORT_INSET,
): boolean {
  return screen.x >= inset
    && screen.y >= inset
    && screen.x <= camera.viewportWidth - inset
    && screen.y <= camera.viewportHeight - inset;
}

export function projectedPathVisibleRatio(
  points: readonly SpatialScreenPoint[],
  camera: SpatialCameraModel,
  inset = 12,
): number {
  if (points.length === 0) return 0;
  return points.filter((point) => spatialPointComfortablyInViewport(point, camera, inset)).length / points.length;
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

function projectedRectOverlapRatio(rect: ProjectedRect, camera: SpatialCameraModel, inset = 12): number {
  const viewX = inset;
  const viewY = inset;
  const viewRight = camera.viewportWidth - inset;
  const viewBottom = camera.viewportHeight - inset;
  const overlapW = Math.max(0, Math.min(rect.x + rect.width, viewRight) - Math.max(rect.x, viewX));
  const overlapH = Math.max(0, Math.min(rect.y + rect.height, viewBottom) - Math.max(rect.y, viewY));
  const area = Math.max(1, rect.width * rect.height);
  return (overlapW * overlapH) / area;
}

export function shouldDrawFullAggregateEdge(options: {
  start: SpatialScreenPoint;
  end: SpatialScreenPoint;
  camera: SpatialCameraModel;
  extraZ: number;
  worldStart?: SpatialWorldPoint;
  worldEnd?: SpatialWorldPoint;
  selected?: boolean;
  hovered?: boolean;
}): boolean {
  if (!spatialPointComfortablyInViewport(options.start, options.camera)
    || !spatialPointComfortablyInViewport(options.end, options.camera)) {
    return false;
  }
  const control = projectedQuadraticControl(
    options.start,
    options.end,
    options.extraZ,
    options.camera,
    options.worldStart,
    options.worldEnd,
  );
  const samples = sampleProjectedQuadratic(options.start, options.end, control);
  const ratio = projectedPathVisibleRatio(samples, options.camera);
  const overlap = projectedRectOverlapRatio(projectedAabb(samples), options.camera);
  if (ratio < ANALYZER_SPATIAL_FULL_PATH_VISIBLE_RATIO || overlap < 0.55) return false;
  const chord = Math.hypot(options.end.x - options.start.x, options.end.y - options.start.y);
  if (options.selected || options.hovered) return chord < ANALYZER_SPATIAL_FULL_AGGREGATE_DISTANCE * 2.2;
  return chord <= ANALYZER_SPATIAL_FULL_AGGREGATE_DISTANCE;
}

export function estimateStubPillSize(caption: string): { width: number; height: number } {
  return {
    width: Math.min(280, Math.max(92, 30 + caption.length * 6.8)),
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

function segmentsIntersectViewport(
  start: SpatialScreenPoint,
  end: SpatialScreenPoint,
  camera: Pick<SpatialCameraModel, 'viewportWidth' | 'viewportHeight'>,
): boolean {
  const left = 0;
  const top = 0;
  const right = camera.viewportWidth;
  const bottom = camera.viewportHeight;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const ratio = q / p;
    if (p < 0) {
      if (ratio > t1) return false;
      if (ratio > t0) t0 = ratio;
    } else {
      if (ratio < t0) return false;
      if (ratio < t1) t1 = ratio;
    }
    return true;
  };
  return clip(-dx, start.x - left)
    && clip(dx, right - start.x)
    && clip(-dy, start.y - top)
    && clip(dy, bottom - start.y);
}

export function projectedPathIntersectsViewport(
  points: readonly SpatialScreenPoint[],
  camera: Pick<SpatialCameraModel, 'viewportWidth' | 'viewportHeight'>,
): boolean {
  return points.some((point) => spatialPointInViewport(point, camera, 0))
    || points.slice(1).some((point, index) => {
      const previous = points[index];
      return previous ? segmentsIntersectViewport(previous, point, camera) : false;
    });
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
  margin = ANALYZER_SPATIAL_STUB_VIEWPORT_MARGIN,
): ProjectedRect {
  const maxX = Math.max(margin, camera.viewportWidth - rect.width - margin);
  const maxY = Math.max(margin, camera.viewportHeight - rect.height - margin);
  return {
    ...rect,
    x: Math.min(maxX, Math.max(margin, rect.x)),
    y: Math.min(maxY, Math.max(margin, rect.y)),
  };
}

function stubOutward(side: 'left' | 'right' | 'top' | 'bottom'): SpatialScreenPoint {
  if (side === 'left') return { x: -1, y: 0 };
  if (side === 'right') return { x: 1, y: 0 };
  if (side === 'top') return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function stubSidesFromPreferred(preferred: 'left' | 'right' | 'top' | 'bottom'): Array<'left' | 'right' | 'top' | 'bottom'> {
  const opposite = oppositeSide(preferred);
  const rest = (['left', 'right', 'top', 'bottom'] as const).filter((side) => side !== preferred && side !== opposite);
  return [preferred, opposite, ...rest];
}

function stubPointsOnSide(
  home: ProjectedRect,
  side: 'left' | 'right' | 'top' | 'bottom',
  slotIndex: number,
  slotCount: number,
  length = 36,
): SpatialScreenPoint[] {
  const origin = pointOnProjectedSide(home, side, slotIndex, slotCount);
  const direction = stubOutward(side);
  return [origin, { x: origin.x + direction.x * length, y: origin.y + direction.y * length }];
}

function stubPillRect(
  points: readonly SpatialScreenPoint[],
  side: 'left' | 'right' | 'top' | 'bottom',
  size: { width: number; height: number },
): ProjectedRect {
  const tip = points.at(-1) ?? { x: 0, y: 0 };
  if (side === 'left') return { x: tip.x - size.width - 4, y: tip.y - size.height / 2, width: size.width, height: size.height };
  if (side === 'right') return { x: tip.x + 4, y: tip.y - size.height / 2, width: size.width, height: size.height };
  if (side === 'top') return { x: tip.x - size.width / 2, y: tip.y - size.height - 4, width: size.width, height: size.height };
  return { x: tip.x - size.width / 2, y: tip.y + 4, width: size.width, height: size.height };
}

function stubRectInViewport(
  rect: ProjectedRect,
  camera: Pick<SpatialCameraModel, 'viewportWidth' | 'viewportHeight'>,
  margin = ANALYZER_SPATIAL_STUB_VIEWPORT_MARGIN,
): boolean {
  return rect.x >= margin
    && rect.y >= margin
    && rect.x + rect.width <= camera.viewportWidth - margin
    && rect.y + rect.height <= camera.viewportHeight - margin;
}

function withStubGeometry(
  edge: ProjectedGraphEdge,
  points: SpatialScreenPoint[],
  pill: ProjectedRect,
): ProjectedGraphEdge {
  return {
    ...edge,
    points,
    path: projectedPathD(points),
    arrow: projectedArrow(points),
    pill: { x: pill.x + pill.width / 2, y: pill.y + pill.height / 2 },
  };
}

function translatePoints(points: SpatialScreenPoint[], dx: number, dy: number): SpatialScreenPoint[] {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

function stubUnionRect(points: readonly SpatialScreenPoint[], pill: ProjectedRect): ProjectedRect {
  return projectedAabb([
    ...points,
    { x: pill.x, y: pill.y },
    { x: pill.x + pill.width, y: pill.y + pill.height },
  ]);
}

function clampStubAssembly(
  points: SpatialScreenPoint[],
  pill: ProjectedRect,
  camera: SpatialCameraModel,
): { points: SpatialScreenPoint[]; pill: ProjectedRect } {
  const union = stubUnionRect(points, pill);
  const kept = keepProjectedRectInViewport(union, camera);
  const dx = kept.x - union.x;
  const dy = kept.y - union.y;
  return {
    points: translatePoints(points, dx, dy),
    pill: { ...pill, x: pill.x + dx, y: pill.y + dy },
  };
}

export function applySpatialStubLayout(
  edges: readonly ProjectedGraphEdge[],
  camera: SpatialCameraModel,
  options: {
    homeId?: string;
    homeBounds?: ProjectedRect;
    counterpartBounds: (edge: ProjectedGraphEdge) => ProjectedRect | undefined;
    pillSize: (edge: ProjectedGraphEdge) => { width: number; height: number };
  },
): ProjectedGraphEdge[] {
  const laidOut = new Map<string, ProjectedGraphEdge>();
  const compact = edges.filter((edge) => edge.compact && options.homeId && edge.stubHostId === options.homeId);
  const continuation = edges.filter((edge) => edge.continuation);

  continuation.forEach((edge) => {
    const size = options.pillSize(edge);
    const tip = edge.continuationKind === 'source-offscreen' ? edge.points.at(-1) : edge.points.at(-1);
    const visible = edge.continuationKind === 'source-offscreen' ? edge.points.at(-1) : edge.points[0];
    if (!visible || !tip) return;
    const pill = {
      x: tip.x - size.width / 2,
      y: tip.y - size.height - 6,
      width: size.width,
      height: size.height,
    };
    const clamped = clampStubAssembly(edge.points, pill, camera);
    laidOut.set(edge.id, withStubGeometry(edge, clamped.points, clamped.pill));
  });

  if (options.homeId && options.homeBounds) {
    const home = options.homeBounds;
    const homeCenter = projectedRectCenter(home);
    const assigned = compact.map((edge) => {
      const counterpart = options.counterpartBounds(edge);
      const other = counterpart ? projectedRectCenter(counterpart) : edge.points.at(-1) ?? homeCenter;
      const preferred = dominantSide(other.x - homeCenter.x, other.y - homeCenter.y);
      const size = options.pillSize(edge);
      const incoming = edge.stubHostId === edge.targetId;
      const side = stubSidesFromPreferred(preferred).find((candidate) => {
        const points = stubPointsOnSide(home, candidate, 0, 1);
        const pill = stubPillRect(points, candidate, size);
        return stubRectInViewport(stubUnionRect(points, pill), camera);
      }) ?? oppositeSide(preferred);
      if (!stubRectInViewport(stubUnionRect(stubPointsOnSide(home, side, 0, 1), stubPillRect(stubPointsOnSide(home, side, 0, 1), side, size)), camera)) {
        const retry = stubSidesFromPreferred(side).find((candidate) => {
          const points = stubPointsOnSide(home, candidate, 0, 1);
          return stubRectInViewport(stubUnionRect(points, stubPillRect(points, candidate, size)), camera);
        });
        return { edge, side: retry ?? side, size, incoming };
      }
      return { edge, side, size, incoming };
    });
    const bySide = new Map<'left' | 'right' | 'top' | 'bottom', typeof assigned>();
    assigned.forEach((item) => {
      const group = bySide.get(item.side) ?? [];
      group.push(item);
      bySide.set(item.side, group);
    });
    bySide.forEach((group, side) => {
      const ordered = [...group].sort((first, second) => first.edge.id.localeCompare(second.edge.id));
      ordered.forEach((item, index) => {
        const points = stubPointsOnSide(home, side, index, ordered.length);
        const directed = item.incoming ? [...points].reverse() : points;
        const pill = stubPillRect(points, side, item.size);
        const clamped = clampStubAssembly(directed, pill, camera);
        laidOut.set(item.edge.id, withStubGeometry(item.edge, clamped.points, clamped.pill));
      });
    });
  }

  return edges.map((edge) => laidOut.get(edge.id) ?? edge);
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
  hovered?: boolean;
  homeId?: string;
  sourceAnchor?: SpatialScreenPoint;
  targetAnchor?: SpatialScreenPoint;
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
  const sourceAnchor = options.sourceAnchor ?? projectedRectCenter(options.sourceBounds);
  const targetAnchor = options.targetAnchor ?? projectedRectCenter(options.targetBounds);
  const sourceIn = spatialPointInViewport(sourceAnchor, options.camera);
  const targetIn = spatialPointInViewport(targetAnchor, options.camera);
  const sourceVisible = sourceIn || projectedRectOverlapRatio(options.sourceBounds, options.camera, 0) > 0;
  const targetVisible = targetIn || projectedRectOverlapRatio(options.targetBounds, options.camera, 0) > 0;
  const start = options.aggregated
    ? options.ports.start
    : options.ports.start;
  const end = options.aggregated
    ? options.ports.end
    : options.ports.end;
  const continuationKind: SpatialContinuationKind | undefined = !options.aggregated
    && (options.selected || options.connected)
    && sourceVisible !== targetVisible
    ? (sourceVisible ? 'target-offscreen' : 'source-offscreen')
    : undefined;
  const continuation = !options.aggregated
    && (options.selected || options.connected)
    && sourceVisible !== targetVisible;
  let worldPoints: SpatialWorldPoint[] = [];
  if (options.worldSourceRect && options.worldTargetRect) {
    const sourceEndpoint: SpatialRouteEndpoint = {
      id: options.sourceId,
      x: options.worldSourceRect.x,
      y: options.worldSourceRect.y,
      width: options.worldSourceRect.width,
      height: options.worldSourceRect.height,
      regionId: options.sourceRegionId,
      packageId: options.sourcePackageId,
      elevation: options.sourceZ,
    };
    const targetEndpoint: SpatialRouteEndpoint = {
      id: options.targetId,
      x: options.worldTargetRect.x,
      y: options.worldTargetRect.y,
      width: options.worldTargetRect.width,
      height: options.worldTargetRect.height,
      regionId: options.targetRegionId,
      packageId: options.targetPackageId,
      elevation: options.targetZ,
    };
    worldPoints = routeSpatialEdge(sourceEndpoint, targetEndpoint, [], options.zoomLevel ?? 'near').points;
  }
  const points = worldPoints.length > 1
    ? worldPoints.map((point) => projectSpatialPoint(point, options.camera))
    : [start, end];
  const control = worldPoints.length > 1
    ? undefined
    : projectedQuadraticControl(start, end, extraZ, options.camera, options.worldStart, options.worldEnd);
  // Compact/stub geometry is intentionally no longer used for ordinary
  // relations.  A relation remains a source-to-target path and is clipped by
  // the viewport naturally; continuationKind is label metadata only.
  const compact = false;
  const stubHostId = continuationKind
    ? (continuationKind === 'source-offscreen' ? options.targetId : options.sourceId)
    : undefined;
  const caption = options.caption;
  const needsCaption = continuation || options.aggregated;
  const readable = caption === undefined || !needsCaption || caption.length > 0;
  // A path crossing the viewport with both endpoints outside is an
  // unanchored fragment, not a trustworthy relation.  Keep it culled until
  // at least one semantic endpoint or its card/region bounds are visible.
  const visible = readable
    && (sourceVisible || targetVisible)
    && projectedPathIntersectsViewport(points, options.camera);
  return {
    id: options.id,
    edgeIds: [...(options.edgeIds ?? [options.id])],
    sourceId: options.sourceId,
    targetId: options.targetId,
    aggregated: options.aggregated,
    compact,
    continuation,
    continuationKind,
    stubHostId,
    edgeClass,
    worldPoints,
    points,
    path: projectedPathD(points, control),
    arrow: projectedArrow(points, control),
    pill: projectedPathMidpoint(points),
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
