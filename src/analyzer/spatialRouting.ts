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
  _obstacles: readonly SpatialRouteObstacle[] = [],
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
  const altitude = spatialEdgeAltitude(edgeClass, zoomLevel);
  const points = Array.from({ length: 17 }, (_, index) => bezierPoint(
    { ...start, z: sourceAltitude },
    control,
    control,
    { ...end, z: targetAltitude },
    index / 16,
    edgeClass === 'local' ? Math.max(sourceAltitude, targetAltitude) : altitude,
  ));
  return { edgeClass, points };
}
