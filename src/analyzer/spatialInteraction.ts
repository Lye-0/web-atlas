import type { AnalyzerGraphTransform } from './camera';
import type { AnalyzerZoomLevel } from './zoom';
import { ANALYZER_FAR_ZOOM_THRESHOLD, ANALYZER_NEAR_ZOOM_THRESHOLD, semanticZoomLevelForScale } from './zoom';
import { projectSpatialPoint, type SpatialCameraModel, type SpatialScreenPoint, type SpatialWorldPoint } from './spatialCoordinates';
import { projectedPathD, type ProjectedGraphEdge } from './spatialProjectedGraph';

export const SPATIAL_INTERACTION_WHEEL_SETTLE_MS = 120;
export const SPATIAL_INTERACTION_SESSION_DEBOUNCE_MS = 180;
export const SPATIAL_LOD_FAR_ENTER = ANALYZER_FAR_ZOOM_THRESHOLD - 0.05;
export const SPATIAL_LOD_FAR_EXIT = ANALYZER_FAR_ZOOM_THRESHOLD + 0.05;
export const SPATIAL_LOD_NEAR_ENTER = ANALYZER_NEAR_ZOOM_THRESHOLD + 0.05;
export const SPATIAL_LOD_NEAR_EXIT = ANALYZER_NEAR_ZOOM_THRESHOLD - 0.05;

export interface SpatialInteractionCounters {
  layoutRecomputes: number;
  factRecomputes: number;
  aggregateRebuilds: number;
  edgeCollections: number;
  collisionSolves: number;
  hudUpdates: number;
  cameraVisualUpdates: number;
  sessionWrites: number;
  longTasks: number;
}

export function createSpatialInteractionCounters(): SpatialInteractionCounters {
  return {
    layoutRecomputes: 0,
    factRecomputes: 0,
    aggregateRebuilds: 0,
    edgeCollections: 0,
    collisionSolves: 0,
    hudUpdates: 0,
    cameraVisualUpdates: 0,
    sessionWrites: 0,
    longTasks: 0,
  };
}

export function spatialLodLevelWithHysteresis(
  scale: number,
  previous?: AnalyzerZoomLevel,
): AnalyzerZoomLevel {
  if (!previous) return semanticZoomLevelForScale(scale);
  if (previous === 'far') return scale > SPATIAL_LOD_NEAR_ENTER ? 'near' : scale >= SPATIAL_LOD_FAR_EXIT ? 'medium' : 'far';
  if (previous === 'near') return scale < SPATIAL_LOD_FAR_ENTER ? 'far' : scale <= SPATIAL_LOD_NEAR_EXIT ? 'medium' : 'near';
  if (scale < SPATIAL_LOD_FAR_ENTER) return 'far';
  if (scale > SPATIAL_LOD_NEAR_ENTER) return 'near';
  return 'medium';
}

export function panSpatialTransform(
  origin: AnalyzerGraphTransform,
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): AnalyzerGraphTransform {
  return {
    ...origin,
    x: origin.x + currentX - startX,
    y: origin.y + currentY - startY,
  };
}

export function zoomSpatialTransform(
  transform: AnalyzerGraphTransform,
  factor: number,
  anchorX: number,
  anchorY: number,
  minScale = 0.01,
  maxScale = 3,
): AnalyzerGraphTransform {
  const nextScale = Math.max(minScale, Math.min(maxScale, transform.scale * factor));
  const worldX = (anchorX - transform.x) / transform.scale;
  const worldY = (anchorY - transform.y) / transform.scale;
  return {
    ...transform,
    scale: nextScale,
    x: anchorX - worldX * nextScale,
    y: anchorY - worldY * nextScale,
  };
}

/** Orthographic projection is affine about the viewport centre, not (0, 0). */
export function zoomSpatialCamera(
  transform: AnalyzerGraphTransform,
  factor: number,
  anchorX: number,
  anchorY: number,
  viewport: { width: number; height: number },
): AnalyzerGraphTransform {
  return zoomSpatialTransform(transform, factor, anchorX - viewport.width / 2, anchorY - viewport.height / 2);
}

/** One compositor transform moves cards, arrows, labels and hit targets together. */
export function spatialCameraFrameTransform(base: SpatialCameraModel, next: SpatialCameraModel): string {
  const scale = next.scale / base.scale;
  const x = next.viewportWidth / 2 + next.panX - scale * (base.viewportWidth / 2 + base.panX);
  const y = next.viewportHeight / 2 + next.panY - scale * (base.viewportHeight / 2 + base.panY);
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

export function spatialWheelZoomFactor(delta: number, deltaMode = 0): number {
  const pixels = delta * (deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1);
  return Math.exp(-Math.max(-240, Math.min(240, pixels)) * 0.002);
}

export function spatialEdgeWorldSignature(edges: readonly Pick<ProjectedGraphEdge, 'id' | 'worldPoints'>[]): string {
  return edges.map((edge) => (
    `${edge.id}:${edge.worldPoints.map((point) => `${point.x},${point.y},${point.z}`).join(';')}`
  )).join('|');
}

export interface SpatialFollowBox {
  id: string;
  kind: 'box';
  world: SpatialWorldPoint;
  width: number;
  height: number;
  center?: boolean;
}

export interface SpatialFollowPath {
  id: string;
  kind: 'path';
  worldPoints: readonly SpatialWorldPoint[];
}

export type SpatialFollowItem = SpatialFollowBox | SpatialFollowPath;

export function projectFollowBox(
  item: SpatialFollowBox,
  camera: SpatialCameraModel,
): SpatialScreenPoint {
  const screen = projectSpatialPoint(item.world, camera);
  if (item.center) {
    return { x: screen.x - item.width / 2, y: screen.y - item.height / 2 };
  }
  return screen;
}

export function projectFollowPath(
  item: SpatialFollowPath,
  camera: SpatialCameraModel,
): string {
  return projectedPathD(item.worldPoints.map((point) => projectSpatialPoint(point, camera)));
}

export function applySpatialFollowFrame(
  items: readonly SpatialFollowItem[],
  elements: ReadonlyMap<string, HTMLElement | SVGElement>,
  camera: SpatialCameraModel,
): void {
  items.forEach((item) => {
    const element = elements.get(item.id);
    if (!element) return;
    if (item.kind === 'box') {
      const screen = projectFollowBox(item, camera);
      element.style.left = `${screen.x}px`;
      element.style.top = `${screen.y}px`;
      return;
    }
    if (element instanceof SVGElement && 'setAttribute' in element) {
      element.setAttribute('d', projectFollowPath(item, camera));
    }
  });
}

interface SpatialCameraLoopOptions {
  raf?: (callback: FrameRequestCallback) => number;
  caf?: (handle: number) => void;
  timeout?: (callback: () => void, ms: number) => number;
  clearTimeout?: (handle: number) => void;
  now?: () => number;
  wheelSettleMs?: number;
  sessionDebounceMs?: number;
  onVisualFrame: (transform: AnalyzerGraphTransform) => void;
  /** Camera and optional ambient motion share one render, after the DOM camera update. */
  onRenderFrame?: (elapsedSeconds: number) => void;
  onSettle: (transform: AnalyzerGraphTransform) => void;
  onSessionWrite: (transform: AnalyzerGraphTransform) => void;
  counters?: SpatialInteractionCounters;
}

export function createSpatialCameraLoop(options: SpatialCameraLoopOptions) {
  const raf = options.raf ?? ((callback) => requestAnimationFrame(callback));
  const caf = options.caf ?? ((handle) => cancelAnimationFrame(handle));
  const now = options.now ?? (() => performance.now());
  const scheduleTimeout = options.timeout ?? ((callback, ms) => window.setTimeout(callback, ms));
  const cancelScheduled = options.clearTimeout ?? ((handle) => window.clearTimeout(handle));
  const wheelSettleMs = options.wheelSettleMs ?? SPATIAL_INTERACTION_WHEEL_SETTLE_MS;
  const sessionDebounceMs = options.sessionDebounceMs ?? SPATIAL_INTERACTION_SESSION_DEBOUNCE_MS;
  const counters = options.counters;

  let pending: AnalyzerGraphTransform | undefined;
  let latest: AnalyzerGraphTransform | undefined;
  let frame: number | undefined;
  let wheelTimer: number | undefined;
  let sessionTimer: number | undefined;
  let interacting = false;
  let animating = false;
  let lastAnimationTime: number | undefined;

  const flushVisual = (timestamp = now()) => {
    frame = undefined;
    const cameraChanged = Boolean(pending);
    if (pending) {
      const next = pending;
      pending = undefined;
      latest = next;
      if (counters) counters.cameraVisualUpdates += 1;
      options.onVisualFrame(next);
    }
    const elapsed = animating && lastAnimationTime !== undefined ? Math.max(0, Math.min(0.05, (timestamp - lastAnimationTime) / 1000)) : 0;
    lastAnimationTime = animating ? timestamp : undefined;
    if (cameraChanged || animating) options.onRenderFrame?.(elapsed);
    if (animating && frame === undefined) frame = raf(flushVisual);
  };

  const scheduleVisual = (transform: AnalyzerGraphTransform) => {
    pending = transform;
    latest = transform;
    if (frame !== undefined) return;
    frame = raf(flushVisual);
  };

  const writeSession = (transform: AnalyzerGraphTransform) => {
    if (counters) counters.sessionWrites += 1;
    options.onSessionWrite(transform);
  };

  const settle = () => {
    if (wheelTimer !== undefined) {
      cancelScheduled(wheelTimer);
      wheelTimer = undefined;
    }
    if (frame !== undefined) {
      caf(frame);
      flushVisual();
    }
    interacting = false;
    const transform = latest;
    if (!transform) return;
    options.onSettle(transform);
    if (sessionTimer !== undefined) cancelScheduled(sessionTimer);
    sessionTimer = scheduleTimeout(() => {
      sessionTimer = undefined;
      writeSession(transform);
    }, sessionDebounceMs);
  };

  return {
    setAnimating(active: boolean) {
      if (active === animating) return;
      animating = active;
      lastAnimationTime = undefined;
      if (active && frame === undefined) frame = raf(flushVisual);
      if (!active && !pending && frame !== undefined) { caf(frame); frame = undefined; }
    },
    interacting: () => interacting,
    latest: () => latest,
    setTarget(transform: AnalyzerGraphTransform, kind: 'pan' | 'zoom' | 'programmatic') {
      if (sessionTimer !== undefined) {
        cancelScheduled(sessionTimer);
        sessionTimer = undefined;
      }
      if (kind !== 'zoom' && wheelTimer !== undefined) {
        cancelScheduled(wheelTimer);
        wheelTimer = undefined;
      }
      latest = transform;
      if (kind === 'programmatic') {
        interacting = false;
        scheduleVisual(transform);
        return;
      }
      interacting = true;
      scheduleVisual(transform);
      if (kind === 'zoom') {
        if (wheelTimer !== undefined) cancelScheduled(wheelTimer);
        wheelTimer = scheduleTimeout(() => {
          wheelTimer = undefined;
          settle();
        }, wheelSettleMs);
      }
    },
    pointerUp() {
      settle();
    },
    cancel() {
      if (frame !== undefined) caf(frame);
      if (wheelTimer !== undefined) cancelScheduled(wheelTimer);
      if (sessionTimer !== undefined) cancelScheduled(sessionTimer);
      frame = wheelTimer = sessionTimer = undefined;
      pending = latest = undefined;
      interacting = false;
      lastAnimationTime = undefined;
      if (animating) frame = raf(flushVisual);
    },
    dispose() {
      animating = false;
      if (frame !== undefined) caf(frame);
      if (wheelTimer !== undefined) cancelScheduled(wheelTimer);
      if (sessionTimer !== undefined) cancelScheduled(sessionTimer);
      if (latest && (sessionTimer !== undefined || interacting)) writeSession(latest);
    },
  };
}
