import {
  spatialEdgeAltitude,
  spatialEdgeClass,
  spatialModuleElevation,
  type AnalyzerSpatialEdgeClass,
} from './spatialPresentation';

export interface SpatialRoutePoint {
  x: number;
  y: number;
  z: number;
}

export interface SpatialRouteEndpoint {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  regionId: string;
  packageId?: string;
  elevation?: number;
}

export interface SpatialRouteObstacle {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpatialRoute {
  edgeClass: AnalyzerSpatialEdgeClass;
  points: SpatialRoutePoint[];
}

export function spatialRouteEndpointFromAnchor(
  anchor: { x: number; y: number; z: number },
  meta: { id?: string; regionId: string; packageId?: string },
): SpatialRouteEndpoint {
  return {
    id: meta.id,
    x: anchor.x,
    y: anchor.y,
    width: 0,
    height: 0,
    regionId: meta.regionId,
    packageId: meta.packageId,
    elevation: anchor.z,
  };
}

function endpointCenter(endpoint: SpatialRouteEndpoint): { x: number; y: number } {
  return { x: endpoint.x + endpoint.width / 2, y: endpoint.y + endpoint.height / 2 };
}

function boundaryPoint(
  endpoint: SpatialRouteEndpoint,
  toward: { x: number; y: number },
): { x: number; y: number } {
  const center = endpointCenter(endpoint);
  if (endpoint.width <= 0 || endpoint.height <= 0) return center;
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? endpoint.x + endpoint.width : endpoint.x,
      y: Math.min(endpoint.y + endpoint.height, Math.max(endpoint.y, center.y + dy * (endpoint.width / 2) / Math.max(Math.abs(dx), 1))),
    };
  }
  return {
    x: Math.min(endpoint.x + endpoint.width, Math.max(endpoint.x, center.x + dx * (endpoint.height / 2) / Math.max(Math.abs(dy), 1))),
    y: dy >= 0 ? endpoint.y + endpoint.height : endpoint.y,
  };
}

function xyDistance(start: { x: number; y: number }, end: { x: number; y: number }): number {
  return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
}

const SPATIAL_ROUTE_CLEARANCE = 14;
const SPATIAL_ROUTE_CORNER_RADIUS = 10;

function segmentIntersectsRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  rect: SpatialRouteObstacle,
  padding = 0,
): boolean {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let tMin = 0;
  let tMax = 1;

  const clip = (origin: number, delta: number, minimum: number, maximum: number): boolean => {
    if (Math.abs(delta) < 0.0001) return origin >= minimum && origin <= maximum;
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    const near = Math.min(first, second);
    const far = Math.max(first, second);
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    return tMin <= tMax;
  };

  return clip(start.x, dx, left, right) && clip(start.y, dy, top, bottom);
}

function routeIntersectsObstacles(
  points: readonly { x: number; y: number }[],
  obstacles: readonly SpatialRouteObstacle[],
  padding = 1,
): boolean {
  return points.slice(1).some((point, index) => {
    const previous = points[index];
    return Boolean(previous) && obstacles.some((obstacle) => segmentIntersectsRect(previous, point, obstacle, padding));
  });
}

function roundedPolyline(points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length <= 2) return [...points];
  const result: { x: number; y: number }[] = [points[0]!];
  points.slice(1, -1).forEach((point, index) => {
    const previous = points[index]!;
    const next = points[index + 2]!;
    const incomingLength = Math.hypot(point.x - previous.x, point.y - previous.y);
    const outgoingLength = Math.hypot(next.x - point.x, next.y - point.y);
    if (incomingLength < 0.001 || outgoingLength < 0.001) return;

    const incomingDirection = {
      x: (previous.x - point.x) / incomingLength,
      y: (previous.y - point.y) / incomingLength,
    };
    const outgoingDirection = {
      x: (next.x - point.x) / outgoingLength,
      y: (next.y - point.y) / outgoingLength,
    };
    const cross = incomingDirection.x * outgoingDirection.y - incomingDirection.y * outgoingDirection.x;
    const dot = incomingDirection.x * outgoingDirection.x + incomingDirection.y * outgoingDirection.y;
    if (Math.abs(cross) < 0.001 && dot > 0.999) {
      result.push(point);
      return;
    }

    const radius = Math.min(SPATIAL_ROUTE_CORNER_RADIUS, incomingLength * 0.32, outgoingLength * 0.32);
    const entry = {
      x: point.x + incomingDirection.x * radius,
      y: point.y + incomingDirection.y * radius,
    };
    const exit = {
      x: point.x + outgoingDirection.x * radius,
      y: point.y + outgoingDirection.y * radius,
    };
    result.push(entry);
    for (let sample = 1; sample <= 4; sample += 1) {
      const t = sample / 4;
      const inverse = 1 - t;
      result.push({
        x: inverse * inverse * entry.x + 2 * inverse * t * point.x + t * t * exit.x,
        y: inverse * inverse * entry.y + 2 * inverse * t * point.y + t * t * exit.y,
      });
    }
  });
  result.push(points.at(-1)!);
  return result;
}

function altitudeForRoute(
  points: readonly { x: number; y: number }[],
  sourceAltitude: number,
  targetAltitude: number,
  altitude: number,
): SpatialRoutePoint[] {
  const totalLength = points.slice(1).reduce((total, point, index) => {
    const previous = points[index]!;
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
  let travelled = 0;
  return points.map((point, index) => {
    if (index > 0) {
      const previous = points[index - 1]!;
      travelled += Math.hypot(point.x - previous.x, point.y - previous.y);
    }
    const progress = totalLength > 0 ? travelled / totalLength : index / Math.max(1, points.length - 1);
    const baseline = sourceAltitude * (1 - progress) + targetAltitude * progress;
    return {
      x: point.x,
      y: point.y,
      z: baseline + Math.sin(Math.PI * progress) * Math.max(0, altitude - baseline),
    };
  });
}

function detourCandidates(
  start: { x: number; y: number },
  end: { x: number; y: number },
  obstacles: readonly SpatialRouteObstacle[],
): { x: number; y: number }[][] {
  const left = Math.min(...obstacles.map((obstacle) => obstacle.x)) - SPATIAL_ROUTE_CLEARANCE;
  const right = Math.max(...obstacles.map((obstacle) => obstacle.x + obstacle.width)) + SPATIAL_ROUTE_CLEARANCE;
  const top = Math.min(...obstacles.map((obstacle) => obstacle.y)) - SPATIAL_ROUTE_CLEARANCE;
  const bottom = Math.max(...obstacles.map((obstacle) => obstacle.y + obstacle.height)) + SPATIAL_ROUTE_CLEARANCE;
  const topLeft = { x: left, y: top };
  const topRight = { x: right, y: top };
  const bottomLeft = { x: left, y: bottom };
  const bottomRight = { x: right, y: bottom };
  return [
    [start, topLeft, topRight, end],
    [start, topRight, topLeft, end],
    [start, bottomLeft, bottomRight, end],
    [start, bottomRight, bottomLeft, end],
    [start, topLeft, bottomLeft, end],
    [start, bottomLeft, topLeft, end],
    [start, topRight, bottomRight, end],
    [start, bottomRight, topRight, end],
  ];
}

export function spatialRouteIntersectsObstacle(
  points: readonly SpatialRoutePoint[],
  obstacle: SpatialRouteObstacle,
  padding = 0,
): boolean {
  return points.slice(1).some((point, index) => {
    const previous = points[index];
    return Boolean(previous) && segmentIntersectsRect(previous, point, obstacle, padding);
  });
}

export function spatialRouteXyLength(points: readonly { x: number; y: number }[]): number {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    return total + (previous ? xyDistance(previous, point) : 0);
  }, 0);
}

export function spatialRouteXyExcursion(
  points: readonly { x: number; y: number }[],
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  return Math.max(0, spatialRouteXyLength(points) - xyDistance(start, end));
}

function bezierPoint(
  start: SpatialRoutePoint,
  controlStart: { x: number; y: number },
  controlEnd: { x: number; y: number },
  end: SpatialRoutePoint,
  progress: number,
  altitude: number,
): SpatialRoutePoint {
  const inverse = 1 - progress;
  const baseline = start.z * inverse + end.z * progress;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * progress * controlStart.x + 3 * inverse * progress ** 2 * controlEnd.x + progress ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * progress * controlStart.y + 3 * inverse * progress ** 2 * controlEnd.y + progress ** 3 * end.y,
    z: baseline + Math.sin(Math.PI * progress) * Math.max(0, altitude - baseline),
  };
}

/**
 * World-space routing stays on the source-target XY chord.
 * Cross-region edges raise in Z; the Projected Graph Layer turns that elevation into a screen arc.
 */
export function routeSpatialEdge(
  source: SpatialRouteEndpoint,
  target: SpatialRouteEndpoint,
  obstacles: readonly SpatialRouteObstacle[] = [],
  zoomLevel: 'far' | 'medium' | 'near' = 'near',
): SpatialRoute {
  const targetCenter = endpointCenter(target);
  const sourceCenter = endpointCenter(source);
  const start = boundaryPoint(source, targetCenter);
  const end = boundaryPoint(target, sourceCenter);
  const edgeClass = spatialEdgeClass(source.packageId, target.packageId, source.regionId, target.regionId);
  const control = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const sourceAltitude = source.elevation ?? spatialModuleElevation();
  const targetAltitude = target.elevation ?? spatialModuleElevation();
  const endpointMaximum = Math.max(sourceAltitude, targetAltitude);
  const classAltitude = spatialEdgeAltitude(edgeClass, zoomLevel);
  const altitude = edgeClass === 'local'
    ? endpointMaximum + 4
    : Math.max(classAltitude, endpointMaximum) + (classAltitude <= endpointMaximum ? 4 : 0);
  const blockingObstacles = obstacles.filter((obstacle) => (
    obstacle.width > 0
    && obstacle.height > 0
    && segmentIntersectsRect(start, end, obstacle)
  ));
  const directPoints = Array.from({ length: 17 }, (_, index) => bezierPoint(
    { ...start, z: sourceAltitude },
    control,
    control,
    { ...end, z: targetAltitude },
    index / 16,
    altitude,
  ));
  if (blockingObstacles.length === 0) return { edgeClass, points: directPoints };

  const candidate = detourCandidates(start, end, blockingObstacles)
    .map((points) => roundedPolyline(points))
    .filter((points) => !routeIntersectsObstacles(points, obstacles))
    .sort((first, second) => spatialRouteXyLength(first) - spatialRouteXyLength(second))[0];
  if (!candidate) return { edgeClass, points: directPoints };

  return {
    edgeClass,
    points: altitudeForRoute(candidate, sourceAltitude, targetAltitude, altitude),
  };
}
