import { ANALYZER_FIT_PADDING, type AnalyzerGraphTransform, type AnalyzerFitPadding } from './camera';
import { ANALYZER_MODULE_NODE_HEIGHT, ANALYZER_MODULE_NODE_WIDTH } from './layout';
import {
  ANALYZER_SPATIAL_CAMERA_DISTANCE,
  ANALYZER_SPATIAL_CAMERA_SCHEMA,
  ANALYZER_SPATIAL_TILT_DEGREES,
  ANALYZER_SPATIAL_YAW_DEGREES,
  type AnalyzerSpatialZoomLevel,
} from './spatialPresentation';

/**
 * Layout / world coordinates for the Module Dependency spatial map:
 * - x: right
 * - y: down (same sense as the 2D graph layout)
 * - z: up / elevation
 */
export interface SpatialWorldPoint {
  x: number;
  y: number;
  z: number;
}

export interface SpatialScreenPoint {
  x: number;
  y: number;
}

export interface SpatialWorldBounds {
  min: SpatialWorldPoint;
  max: SpatialWorldPoint;
  center: SpatialWorldPoint;
  width: number;
  depth: number;
  height: number;
}

export interface SpatialCameraModel {
  viewportWidth: number;
  viewportHeight: number;
  panX: number;
  panY: number;
  scale: number;
  tiltDegrees: number;
  yawDegrees: number;
  bounds: SpatialWorldBounds;
}

export interface SpatialWorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export type SpatialOverlayKind =
  | 'selected-module'
  | 'neighbour-module'
  | 'hovered-module'
  | 'package-heading'
  | 'root-package-heading'
  | 'selected-region-heading'
  | 'module-card'
  | 'major-directory-heading'
  | 'aggregate-pill'
  | 'relation-label'
  | 'minor-heading';

export type SpatialOverlayVisibility = 'show' | 'compact' | 'hide';

export interface SpatialOverlayItem {
  id: string;
  kind: SpatialOverlayKind;
  screen: { x: number; y: number; width: number; height: number };
  /** Presentation-specific lock; ordinary items remain collision-managed by default. */
  locked?: boolean;
}

export const SPATIAL_OVERLAY_PRIORITY: Record<SpatialOverlayKind, number> = {
  'selected-module': 100,
  'neighbour-module': 95,
  'hovered-module': 90,
  'selected-region-heading': 96,
  'root-package-heading': 88,
  'package-heading': 80,
  'major-directory-heading': 58,
  'module-card': 50,
  'relation-label': 44,
  'aggregate-pill': 35,
  'minor-heading': 34,
};

const SPATIAL_FIT_MIN_SCALE = 0.18;
const SPATIAL_FIT_MAX_SCALE = 1.8;

export function computeSpatialWorldBounds(points: readonly SpatialWorldPoint[]): SpatialWorldBounds {
  if (points.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      width: 1,
      depth: 1,
      height: 1,
    };
  }
  const min = {
    x: Math.min(...points.map((point) => point.x)),
    y: Math.min(...points.map((point) => point.y)),
    z: Math.min(...points.map((point) => point.z)),
  };
  const max = {
    x: Math.max(...points.map((point) => point.x)),
    y: Math.max(...points.map((point) => point.y)),
    z: Math.max(...points.map((point) => point.z)),
  };
  return {
    min,
    max,
    center: {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    },
    width: Math.max(1, max.x - min.x),
    depth: Math.max(1, max.y - min.y),
    height: Math.max(1, max.z - min.z),
  };
}

export function spatialCameraModel(
  transform: AnalyzerGraphTransform,
  viewportWidth: number,
  viewportHeight: number,
  tiltDegrees = ANALYZER_SPATIAL_TILT_DEGREES,
  yawDegrees = ANALYZER_SPATIAL_YAW_DEGREES,
  bounds: SpatialWorldBounds = computeSpatialWorldBounds([]),
): SpatialCameraModel {
  return {
    viewportWidth,
    viewportHeight,
    panX: transform.x,
    panY: transform.y,
    scale: transform.scale,
    tiltDegrees,
    yawDegrees,
    bounds,
  };
}

export function isCompatibleSpatialCameraTransform(transform: AnalyzerGraphTransform | undefined): boolean {
  return transform?.schema === ANALYZER_SPATIAL_CAMERA_SCHEMA
    && Number.isFinite(transform.x)
    && Number.isFinite(transform.y)
    && Number.isFinite(transform.scale)
    && transform.scale > 0;
}

export function withSpatialCameraSchema(transform: AnalyzerGraphTransform): AnalyzerGraphTransform {
  return { ...transform, schema: ANALYZER_SPATIAL_CAMERA_SCHEMA };
}

export interface SpatialVec3 {
  x: number;
  y: number;
  z: number;
}

export interface SpatialCameraPose {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  eye: SpatialVec3;
  target: SpatialVec3;
}

function vec(x: number, y: number, z: number): SpatialVec3 {
  return { x, y, z };
}

function addVec(a: SpatialVec3, b: SpatialVec3): SpatialVec3 {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scaleVec(a: SpatialVec3, scale: number): SpatialVec3 {
  return vec(a.x * scale, a.y * scale, a.z * scale);
}

function subVec(a: SpatialVec3, b: SpatialVec3): SpatialVec3 {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

function dotVec(a: SpatialVec3, b: SpatialVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossVec(a: SpatialVec3, b: SpatialVec3): SpatialVec3 {
  return vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function lengthSq(a: SpatialVec3): number {
  return dotVec(a, a);
}

function normalizeVec(a: SpatialVec3): SpatialVec3 {
  const length = Math.sqrt(lengthSq(a)) || 1;
  return scaleVec(a, 1 / length);
}

/**
 * Convert layout/world coordinates into Three.js world coordinates.
 * three.x = layout.x (right)
 * three.y = layout.z (up)
 * three.z = layout.y (depth; +Y-down becomes +Z so the pitched camera looks across the map)
 */
export function layoutToThreePoint(point: SpatialWorldPoint): SpatialVec3 {
  return vec(point.x, point.z, point.y);
}

export function layoutPointToThree(point: SpatialWorldPoint): SpatialVec3 {
  return layoutToThreePoint(point);
}

function spatialBoundsRadius(bounds: SpatialWorldBounds): number {
  const min = layoutToThreePoint(bounds.min);
  const max = layoutToThreePoint(bounds.max);
  return Math.max(
    1,
    Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2,
  );
}

function cameraDistance(bounds: SpatialWorldBounds): number {
  return Math.max(ANALYZER_SPATIAL_CAMERA_DISTANCE, spatialBoundsRadius(bounds) * 2.6);
}

function cameraOffset(model: SpatialCameraModel, distance: number): SpatialVec3 {
  const tilt = (model.tiltDegrees * Math.PI) / 180;
  const yaw = (model.yawDegrees * Math.PI) / 180;
  return vec(
    distance * Math.sin(tilt) * Math.sin(yaw),
    distance * Math.cos(tilt),
    distance * Math.sin(tilt) * Math.cos(yaw),
  );
}

function cameraAxes(eye: SpatialVec3, target: SpatialVec3): { x: SpatialVec3; y: SpatialVec3; z: SpatialVec3 } {
  let zAxis = subVec(eye, target);
  if (lengthSq(zAxis) === 0) zAxis = vec(0, 0, 1);
  zAxis = normalizeVec(zAxis);
  let xAxis = crossVec(vec(0, 1, 0), zAxis);
  if (lengthSq(xAxis) < 1e-8) xAxis = crossVec(vec(0, 1, 0.0001), zAxis);
  xAxis = normalizeVec(xAxis);
  const yAxis = normalizeVec(crossVec(zAxis, xAxis));
  return { x: xAxis, y: yAxis, z: zAxis };
}

function viewProject(point: SpatialVec3, pose: SpatialCameraPose): SpatialVec3 {
  const axes = cameraAxes(pose.eye, pose.target);
  const rel = subVec(point, pose.eye);
  const vx = dotVec(axes.x, rel);
  const vy = dotVec(axes.y, rel);
  const vz = dotVec(axes.z, rel);
  const { left, right, top, bottom, near, far } = pose;
  return vec(
    (2 * vx) / (right - left) - (right + left) / (right - left),
    (2 * vy) / (top - bottom) - (top + bottom) / (top - bottom),
    (2 * vz) / (near - far) - (far + near) / (far - near),
  );
}

function ndcToScreen(ndc: SpatialVec3, viewportWidth: number, viewportHeight: number): SpatialScreenPoint {
  return {
    x: (ndc.x * 0.5 + 0.5) * viewportWidth,
    y: (-ndc.y * 0.5 + 0.5) * viewportHeight,
  };
}

export function spatialCameraPose(model: SpatialCameraModel): SpatialCameraPose {
  const width = Math.max(1, model.viewportWidth);
  const height = Math.max(1, model.viewportHeight);
  const scale = Math.max(0.05, model.scale);
  const radius = spatialBoundsRadius(model.bounds);
  const distance = cameraDistance(model.bounds);
  const offset = cameraOffset(model, distance);
  const target = layoutToThreePoint(model.bounds.center);
  const depth = distance + radius * 3;
  const pose: SpatialCameraPose = {
    left: -width / (2 * scale),
    right: width / (2 * scale),
    top: height / (2 * scale),
    bottom: -height / (2 * scale),
    near: -depth,
    far: depth,
    eye: addVec(target, offset),
    target,
  };
  const axes = cameraAxes(pose.eye, pose.target);
  pose.target = addVec(pose.target, addVec(scaleVec(axes.x, -model.panX / scale), scaleVec(axes.y, model.panY / scale)));
  pose.eye = addVec(pose.target, offset);
  return pose;
}

export interface SpatialProjectionDiagnostics {
  layout: SpatialWorldPoint;
  three: SpatialVec3;
  camera: SpatialCameraPose;
  ndc: SpatialVec3;
  screen: SpatialScreenPoint;
}

export function spatialNdc(point: SpatialWorldPoint, model: SpatialCameraModel): SpatialVec3 {
  return viewProject(layoutToThreePoint(point), spatialCameraPose(model));
}

export function spatialProjectionDiagnostics(point: SpatialWorldPoint, model: SpatialCameraModel): SpatialProjectionDiagnostics {
  const pose = spatialCameraPose(model);
  const three = layoutToThreePoint(point);
  const ndc = viewProject(three, pose);
  return {
    layout: point,
    three,
    camera: pose,
    ndc,
    screen: sanitizeSpatialScreenPoint(ndcToScreen(ndc, Math.max(1, model.viewportWidth), Math.max(1, model.viewportHeight))),
  };
}

function sanitizeSpatialScreenPoint(screen: SpatialScreenPoint): SpatialScreenPoint {
  if (Number.isFinite(screen.x) && Number.isFinite(screen.y)) return screen;
  if (import.meta.env.DEV) {
    console.error('projectSpatialPoint produced a non-finite screen point', screen);
  }
  return { x: 0, y: 0 };
}

/**
 * Single world → screen mapping shared by Three.js planes and the Projected Graph Layer.
 */
export function projectSpatialPoint(point: SpatialWorldPoint, model: SpatialCameraModel): SpatialScreenPoint {
  const ndc = spatialNdc(point, model);
  return sanitizeSpatialScreenPoint(
    ndcToScreen(ndc, Math.max(1, model.viewportWidth), Math.max(1, model.viewportHeight)),
  );
}

export function focusSpatialCamera(
  anchor: SpatialWorldPoint,
  transform: AnalyzerGraphTransform,
  viewportWidth: number,
  viewportHeight: number,
  bounds: SpatialWorldBounds,
  tiltDegrees = ANALYZER_SPATIAL_TILT_DEGREES,
): AnalyzerGraphTransform {
  const scale = Math.max(0.72, Math.min(1.55, transform.scale));
  const focused = spatialCameraModel(
    { ...transform, scale },
    viewportWidth,
    viewportHeight,
    tiltDegrees,
    ANALYZER_SPATIAL_YAW_DEGREES,
    bounds,
  );
  const screen = projectSpatialPoint(anchor, focused);
  return withSpatialCameraSchema({
    scale,
    x: transform.x + viewportWidth / 2 - screen.x,
    y: transform.y + viewportHeight / 2 - screen.y,
  });
}

export function spatialPointInFrontOfCamera(point: SpatialWorldPoint, model: SpatialCameraModel): boolean {
  const pose = spatialCameraPose(model);
  const forward = normalizeVec(subVec(pose.target, pose.eye));
  return dotVec(subVec(layoutToThreePoint(point), pose.eye), forward) > 0;
}

export function ndcInFrustum(ndc: SpatialVec3, epsilon = 0.02): boolean {
  return ndc.x >= -1 - epsilon
    && ndc.x <= 1 + epsilon
    && ndc.y >= -1 - epsilon
    && ndc.y <= 1 + epsilon
    && ndc.z >= -1 - epsilon
    && ndc.z <= 1 + epsilon;
}

export function moduleWorldAnchor(
  node: { x: number; y: number; height?: number },
  elevation: number,
): SpatialWorldPoint {
  return {
    x: node.x + ANALYZER_MODULE_NODE_WIDTH / 2,
    y: node.y + (node.height ?? ANALYZER_MODULE_NODE_HEIGHT) / 2,
    z: elevation,
  };
}

export const ANALYZER_SPATIAL_FIT_PADDING: AnalyzerFitPadding = { top: 84, right: 92, bottom: 68, left: 92 };

export function spatialHeadingFitPoints(
  regions: readonly { x: number; y: number; width: number; headingHeight?: number; regionKind?: string }[],
  elevationFor: (region: { regionKind?: string }) => number,
): SpatialWorldPoint[] {
  return regions.flatMap((region) => {
    const z = elevationFor(region);
    const heading = regionHeadingWorldAnchor(region, z);
    return [
      heading,
      { x: region.x - 12, y: region.y - 18, z },
      { x: region.x + Math.min(region.width, 220), y: region.y - 18, z },
    ];
  });
}

export function regionHeadingWorldAnchor(
  region: { x: number; y: number; headingHeight?: number },
  elevation: number,
): SpatialWorldPoint {
  return {
    x: region.x + 16,
    y: region.y + (region.headingHeight ?? 30) / 2,
    z: elevation,
  };
}

export function regionRectCorners(rect: SpatialWorldRect): SpatialWorldPoint[] {
  return [
    { x: rect.x, y: rect.y, z: rect.z },
    { x: rect.x + rect.width, y: rect.y, z: rect.z },
    { x: rect.x, y: rect.y + rect.height, z: rect.z },
    { x: rect.x + rect.width, y: rect.y + rect.height, z: rect.z },
  ];
}

export function spatialPointInViewport(
  screen: SpatialScreenPoint,
  camera: Pick<SpatialCameraModel, 'viewportWidth' | 'viewportHeight'>,
  margin = 12,
): boolean {
  return screen.x >= -margin
    && screen.y >= -margin
    && screen.x <= camera.viewportWidth + margin
    && screen.y <= camera.viewportHeight + margin;
}

export function spatialSegmentViewportState(
  start: SpatialScreenPoint,
  end: SpatialScreenPoint,
  camera: Pick<SpatialCameraModel, 'viewportWidth' | 'viewportHeight'>,
): 'inside' | 'partial' | 'outside' {
  const startIn = spatialPointInViewport(start, camera, 0);
  const endIn = spatialPointInViewport(end, camera, 0);
  if (startIn && endIn) return 'inside';
  if (startIn || endIn) return 'partial';
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const hits = maxX >= 0 && minX <= camera.viewportWidth && maxY >= 0 && minY <= camera.viewportHeight;
  return hits ? 'partial' : 'outside';
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

function pointOnRectSide(
  rect: SpatialWorldRect,
  side: 'left' | 'right' | 'top' | 'bottom',
  slotIndex: number,
  slotCount: number,
): SpatialWorldPoint {
  const count = Math.max(1, slotCount);
  const t = (slotIndex + 1) / (count + 1);
  const inset = Math.min(12, Math.max(4, Math.min(rect.width, rect.height) * 0.08));
  if (side === 'right') return { x: rect.x + rect.width, y: rect.y + inset + (rect.height - inset * 2) * t, z: rect.z };
  if (side === 'left') return { x: rect.x, y: rect.y + inset + (rect.height - inset * 2) * t, z: rect.z };
  if (side === 'bottom') return { x: rect.x + inset + (rect.width - inset * 2) * t, y: rect.y + rect.height, z: rect.z };
  return { x: rect.x + inset + (rect.width - inset * 2) * t, y: rect.y, z: rect.z };
}

export function spatialRegionBoundarySides(
  source: SpatialWorldRect,
  target: SpatialWorldRect,
): { sourceSide: 'left' | 'right' | 'top' | 'bottom'; targetSide: 'left' | 'right' | 'top' | 'bottom' } {
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const sourceSide = dominantSide(targetCenter.x - sourceCenter.x, targetCenter.y - sourceCenter.y);
  return { sourceSide, targetSide: oppositeSide(sourceSide) };
}

export function spatialRegionBoundaryPort(
  source: SpatialWorldRect,
  target: SpatialWorldRect,
  slotIndex = 0,
  slotCount = 1,
  role: 'source' | 'target' = 'source',
): SpatialWorldPoint {
  const { sourceSide, targetSide } = spatialRegionBoundarySides(source, target);
  const side = role === 'source' ? sourceSide : targetSide;
  const rect = role === 'source' ? source : target;
  const port = pointOnRectSide(rect, side, slotIndex, slotCount);
  return {
    x: Math.min(rect.x + rect.width, Math.max(rect.x, port.x)),
    y: Math.min(rect.y + rect.height, Math.max(rect.y, port.y)),
    z: rect.z,
  };
}

export interface SpatialBoundaryPortAssignment {
  start: SpatialWorldPoint;
  end: SpatialWorldPoint;
}

export function assignSpatialBoundaryPorts(
  edges: readonly { id: string; source: SpatialWorldRect; target: SpatialWorldRect }[],
): Map<string, SpatialBoundaryPortAssignment> {
  const sourceSlots = new Map<string, string[]>();
  const targetSlots = new Map<string, string[]>();
  const sides = new Map<string, { sourceSide: 'left' | 'right' | 'top' | 'bottom'; targetSide: 'left' | 'right' | 'top' | 'bottom' }>();
  const ordered = [...edges].sort((first, second) => first.id.localeCompare(second.id));
  ordered.forEach((edge) => {
    const pair = spatialRegionBoundarySides(edge.source, edge.target);
    sides.set(edge.id, pair);
    const sourceKey = `${edge.source.x}:${edge.source.y}:${pair.sourceSide}`;
    const targetKey = `${edge.target.x}:${edge.target.y}:${pair.targetSide}`;
    const sourceGroup = sourceSlots.get(sourceKey) ?? [];
    sourceGroup.push(edge.id);
    sourceSlots.set(sourceKey, sourceGroup);
    const targetGroup = targetSlots.get(targetKey) ?? [];
    targetGroup.push(edge.id);
    targetSlots.set(targetKey, targetGroup);
  });
  const assigned = new Map<string, SpatialBoundaryPortAssignment>();
  ordered.forEach((edge) => {
    const pair = sides.get(edge.id);
    if (!pair) return;
    const sourceKey = `${edge.source.x}:${edge.source.y}:${pair.sourceSide}`;
    const targetKey = `${edge.target.x}:${edge.target.y}:${pair.targetSide}`;
    const sourceGroup = sourceSlots.get(sourceKey) ?? [edge.id];
    const targetGroup = targetSlots.get(targetKey) ?? [edge.id];
    assigned.set(edge.id, {
      start: pointOnRectSide(edge.source, pair.sourceSide, sourceGroup.indexOf(edge.id), sourceGroup.length),
      end: pointOnRectSide(edge.target, pair.targetSide, targetGroup.indexOf(edge.id), targetGroup.length),
    });
  });
  return assigned;
}

export function spatialPortIsOnBoundary(port: SpatialWorldPoint, rect: SpatialWorldRect, epsilon = 0.6): boolean {
  const onVertical = (Math.abs(port.x - rect.x) <= epsilon || Math.abs(port.x - (rect.x + rect.width)) <= epsilon)
    && port.y >= rect.y - epsilon
    && port.y <= rect.y + rect.height + epsilon;
  const onHorizontal = (Math.abs(port.y - rect.y) <= epsilon || Math.abs(port.y - (rect.y + rect.height)) <= epsilon)
    && port.x >= rect.x - epsilon
    && port.x <= rect.x + rect.width + epsilon;
  const inside = port.x >= rect.x - epsilon
    && port.x <= rect.x + rect.width + epsilon
    && port.y >= rect.y - epsilon
    && port.y <= rect.y + rect.height + epsilon;
  return inside && (onVertical || onHorizontal);
}

function rectsOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
  padding = 2,
): boolean {
  return first.x < second.x + second.width + padding
    && first.x + first.width + padding > second.x
    && first.y < second.y + second.height + padding
    && first.y + first.height + padding > second.y;
}

function compactOverlayRect(item: SpatialOverlayItem): { x: number; y: number; width: number; height: number } {
  if (item.kind === 'aggregate-pill' || item.kind === 'relation-label') {
    return { ...item.screen, width: Math.min(item.screen.width, 42) };
  }
  if (item.kind.endsWith('heading') || item.kind.includes('heading')) {
    return { ...item.screen, width: Math.min(item.screen.width, 88) };
  }
  return item.screen;
}

export function resolveSpatialOverlayCollision(
  items: readonly SpatialOverlayItem[],
): Map<string, SpatialOverlayVisibility> {
  const ordered = [...items].sort((first, second) => SPATIAL_OVERLAY_PRIORITY[second.kind] - SPATIAL_OVERLAY_PRIORITY[first.kind]
    || first.id.localeCompare(second.id));
  const kept: { id: string; screen: SpatialOverlayItem['screen'] }[] = [];
  const visibility = new Map<string, SpatialOverlayVisibility>();
  ordered.forEach((item) => {
    const locked = item.locked ?? (item.kind === 'selected-module'
      || item.kind === 'neighbour-module'
      || item.kind === 'hovered-module'
      || item.kind === 'selected-region-heading'
      || item.kind === 'relation-label');
    const blocked = () => kept.some((candidate) => candidate.id !== item.id && rectsOverlap(candidate.screen, item.screen));
    if (!blocked()) {
      kept.push({ id: item.id, screen: item.screen });
      visibility.set(item.id, 'show');
      return;
    }
    const compactScreen = compactOverlayRect(item);
    const compactBlocked = kept.some((candidate) => candidate.id !== item.id && rectsOverlap(candidate.screen, compactScreen));
    if (!compactBlocked && (item.kind === 'aggregate-pill' || item.kind.includes('heading'))) {
      kept.push({ id: item.id, screen: compactScreen });
      visibility.set(item.id, 'compact');
      return;
    }
    if (locked) {
      kept.push({ id: item.id, screen: item.screen });
      visibility.set(item.id, 'show');
      return;
    }
    visibility.set(item.id, 'hide');
  });
  return visibility;
}

export function overlayAnchorDrift(
  overlayTopLeft: SpatialScreenPoint,
  overlaySize: { width: number; height: number },
  projectedAnchor: SpatialScreenPoint,
): number {
  const center = { x: overlayTopLeft.x + overlaySize.width / 2, y: overlayTopLeft.y + overlaySize.height / 2 };
  return Math.hypot(center.x - projectedAnchor.x, center.y - projectedAnchor.y);
}

export function fitSpatialProjectedBounds(
  points: readonly SpatialWorldPoint[],
  viewportWidth: number,
  viewportHeight: number,
  padding: AnalyzerFitPadding = ANALYZER_FIT_PADDING,
  tiltDegrees = ANALYZER_SPATIAL_TILT_DEGREES,
): AnalyzerGraphTransform {
  if (viewportWidth <= 0 || viewportHeight <= 0 || points.length === 0) {
    return withSpatialCameraSchema({ x: padding.left, y: padding.top, scale: 0.5 });
  }
  const bounds = computeSpatialWorldBounds(points);
  const identity = spatialCameraModel({ x: 0, y: 0, scale: 1 }, viewportWidth, viewportHeight, tiltDegrees, ANALYZER_SPATIAL_YAW_DEGREES, bounds);
  const projected = points.map((point) => projectSpatialPoint(point, identity));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const contentWidth = Math.max(48, maxX - minX);
  const contentHeight = Math.max(48, maxY - minY);
  const availableWidth = Math.max(1, viewportWidth - padding.left - padding.right);
  const availableHeight = Math.max(1, viewportHeight - padding.top - padding.bottom);
  const scale = Math.min(SPATIAL_FIT_MAX_SCALE, Math.max(SPATIAL_FIT_MIN_SCALE, Math.min(availableWidth / contentWidth, availableHeight / contentHeight)));
  const scaled = spatialCameraModel({ x: 0, y: 0, scale }, viewportWidth, viewportHeight, tiltDegrees, ANALYZER_SPATIAL_YAW_DEGREES, bounds);
  const fitted = points.map((point) => projectSpatialPoint(point, scaled));
  const fittedMinX = Math.min(...fitted.map((point) => point.x));
  const fittedMaxX = Math.max(...fitted.map((point) => point.x));
  const fittedMinY = Math.min(...fitted.map((point) => point.y));
  const fittedMaxY = Math.max(...fitted.map((point) => point.y));
  return withSpatialCameraSchema({
    scale,
    x: padding.left + (availableWidth - (fittedMaxX - fittedMinX)) / 2 - fittedMinX,
    y: padding.top + (availableHeight - (fittedMaxY - fittedMinY)) / 2 - fittedMinY,
  });
}

export function spatialProjectedOccupancy(
  points: readonly SpatialWorldPoint[],
  transform: AnalyzerGraphTransform,
  viewportWidth: number,
  viewportHeight: number,
  tiltDegrees = ANALYZER_SPATIAL_TILT_DEGREES,
): number {
  if (points.length === 0 || viewportWidth <= 0 || viewportHeight <= 0) return 0;
  const camera = spatialCameraModel(
    transform,
    viewportWidth,
    viewportHeight,
    tiltDegrees,
    ANALYZER_SPATIAL_YAW_DEGREES,
    computeSpatialWorldBounds(points),
  );
  const screens = points.map((point) => projectSpatialPoint(point, camera));
  const minX = Math.min(...screens.map((point) => point.x));
  const maxX = Math.max(...screens.map((point) => point.x));
  const minY = Math.min(...screens.map((point) => point.y));
  const maxY = Math.max(...screens.map((point) => point.y));
  const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
  return area / (viewportWidth * viewportHeight);
}

export function spatialAggregatePillVisible(
  zoomLevel: AnalyzerSpatialZoomLevel,
  edge: { aggregated: boolean; selected: boolean; connected: boolean; compact?: boolean; continuation?: boolean },
  hovered = false,
): boolean {
  if (edge.continuation || edge.compact) return true;
  if (!edge.aggregated) return false;
  if (zoomLevel === 'far') return true;
  return edge.selected || edge.connected || hovered;
}
