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

function endpointCenter(endpoint: SpatialRouteEndpoint): { x: number; y: number } {
  return { x: endpoint.x + endpoint.width / 2, y: endpoint.y + endpoint.height / 2 };
}

function segmentHitsObstacle(
  start: { x: number; y: number },
  end: { x: number; y: number },
  obstacle: SpatialRouteObstacle,
): boolean {
  const padding = 8;
  const left = obstacle.x - padding;
  const right = obstacle.x + obstacle.width + padding;
  const top = obstacle.y - padding;
  const bottom = obstacle.y + obstacle.height + padding;
  if (start.x === end.x) {
    return start.x > left && start.x < right
      && Math.max(Math.min(start.y, end.y), top) < Math.min(Math.max(start.y, end.y), bottom);
  }
  if (start.y === end.y) {
    return start.y > top && start.y < bottom
      && Math.max(Math.min(start.x, end.x), left) < Math.min(Math.max(start.x, end.x), right);
  }
  return false;
}

function routeLength(points: readonly { x: number; y: number }[]): number {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    return total + (previous ? Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) : 0);
  }, 0);
}

function routeAvoidsObstacles(
  points: readonly { x: number; y: number }[],
  obstacles: readonly SpatialRouteObstacle[],
  endpointIds: ReadonlySet<string>,
): boolean {
  return points.slice(1).every((point, index) => {
    const previous = points[index];
    if (!previous) return true;
    return obstacles
      .filter((obstacle) => !obstacle.id || !endpointIds.has(obstacle.id))
      .every((obstacle) => !segmentHitsObstacle(previous, point, obstacle));
  });
}

function simplifyRoute(points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y);
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

function routeForClass(
  points: readonly { x: number; y: number }[],
  edgeClass: AnalyzerSpatialEdgeClass,
  source: SpatialRouteEndpoint,
  target: SpatialRouteEndpoint,
): SpatialRoutePoint[] {
  const sourceZ = source.elevation ?? spatialModuleElevation();
  const targetZ = target.elevation ?? spatialModuleElevation();
  if (edgeClass === 'local') {
    return points.map((point) => ({ ...point, z: Math.max(sourceZ, targetZ) + 5 }));
  }
  const [start, ...rest] = points;
  const end = rest.at(-1);
  if (!start || !end) return [];
  const controlStart = rest[0] ?? end;
  const controlEnd = rest.at(-2) ?? start;
  const altitude = spatialEdgeAltitude(edgeClass);
  return Array.from({ length: 17 }, (_, index) => bezierPoint(
    { ...start, z: sourceZ + 3 },
    controlStart,
    controlEnd,
    { ...end, z: targetZ + 3 },
    index / 16,
    altitude,
  ));
}

/**
 * Routes module/region endpoints in XY only long enough to find a clear
 * corridor, then lifts cross-region paths into a deterministic 3D arc.
 */
export function routeSpatialEdge(
  source: SpatialRouteEndpoint,
  target: SpatialRouteEndpoint,
  obstacles: readonly SpatialRouteObstacle[] = [],
): SpatialRoute {
  const sourceCenter = endpointCenter(source);
  const targetCenter = endpointCenter(target);
  const horizontalDirection = targetCenter.x >= sourceCenter.x ? 1 : -1;
  const start = {
    x: sourceCenter.x + horizontalDirection * source.width / 2,
    y: sourceCenter.y,
  };
  const end = {
    x: targetCenter.x - horizontalDirection * target.width / 2,
    y: targetCenter.y,
  };
  const obstacleLeft = Math.min(start.x, end.x, ...obstacles.map((obstacle) => obstacle.x));
  const obstacleRight = Math.max(start.x, end.x, ...obstacles.map((obstacle) => obstacle.x + obstacle.width));
  const obstacleTop = Math.min(start.y, end.y, ...obstacles.map((obstacle) => obstacle.y));
  const obstacleBottom = Math.max(start.y, end.y, ...obstacles.map((obstacle) => obstacle.y + obstacle.height));
  const midX = (start.x + end.x) / 2;
  const xRoutes = [midX, obstacleLeft - 28, obstacleRight + 28].map((x) => [
    start,
    { x, y: start.y },
    { x, y: end.y },
    end,
  ]);
  const yRoutes = [obstacleTop - 28, obstacleBottom + 28].map((y) => [
    start,
    { x: start.x, y },
    { x: end.x, y },
    end,
  ]);
  const endpointIds = new Set<string>([source.id, target.id].filter((id): id is string => Boolean(id)));
  const selectedRoute = [...xRoutes, ...yRoutes]
    .map(simplifyRoute)
    .filter((route) => routeAvoidsObstacles(route, obstacles, endpointIds))
    .sort((first, second) => routeLength(first) + first.length * 8 - (routeLength(second) + second.length * 8))[0]
    ?? [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  const edgeClass = spatialEdgeClass(source.packageId, target.packageId, source.regionId, target.regionId);
  return { edgeClass, points: routeForClass(selectedRoute, edgeClass, source, target) };
}
