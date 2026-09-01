import { ANALYZER_NODE_WIDTH, type AnalyzerLayout, type PositionedNode } from './layout';

export interface AnalyzerEdgeObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: 'node' | 'summary' | 'band' | 'cluster' | 'lane';
}

export interface AnalyzerEdgePoint {
  x: number;
  y: number;
}

export interface AnalyzerEdgeRoutingOptions {
  clearance?: number;
}

const DEFAULT_EDGE_CLEARANCE = 14;
const DIRECT_CURVE_SAMPLES = 48;
const TURN_PENALTY = 120;
const MAX_GRID_POINTS = 20_000;

type Direction = 'horizontal' | 'vertical';

interface InflatedObstacle extends AnalyzerEdgeObstacle {
  right: number;
  bottom: number;
}

interface Neighbor {
  point: AnalyzerEdgePoint;
  direction: Direction;
  distance: number;
}

interface RouteState {
  pointKey: string;
  direction?: Direction;
}

function pointKey(point: AnalyzerEdgePoint): string {
  return `${point.x}:${point.y}`;
}

function validObstacle(obstacle: AnalyzerEdgeObstacle): boolean {
  return Number.isFinite(obstacle.x)
    && Number.isFinite(obstacle.y)
    && Number.isFinite(obstacle.width)
    && Number.isFinite(obstacle.height)
    && obstacle.width > 0
    && obstacle.height > 0;
}

function containsPoint(obstacle: AnalyzerEdgeObstacle, point: AnalyzerEdgePoint): boolean {
  return point.x >= obstacle.x
    && point.x <= obstacle.x + obstacle.width
    && point.y >= obstacle.y
    && point.y <= obstacle.y + obstacle.height;
}

function containsPointStrict(obstacle: InflatedObstacle, point: AnalyzerEdgePoint): boolean {
  return point.x > obstacle.x
    && point.x < obstacle.right
    && point.y > obstacle.y
    && point.y < obstacle.bottom;
}

function inflateObstacle(obstacle: AnalyzerEdgeObstacle, clearance: number): InflatedObstacle {
  return {
    ...obstacle,
    x: obstacle.x - clearance,
    y: obstacle.y - clearance,
    width: obstacle.width + clearance * 2,
    height: obstacle.height + clearance * 2,
    right: obstacle.x + obstacle.width + clearance,
    bottom: obstacle.y + obstacle.height + clearance,
  };
}

function directEdgePoints(source: PositionedNode, target: PositionedNode, clearance = DEFAULT_EDGE_CLEARANCE): {
  start: AnalyzerEdgePoint;
  end: AnalyzerEdgePoint;
  sourceBoundary: AnalyzerEdgePoint;
  targetBoundary: AnalyzerEdgePoint;
  goesRight: boolean;
} {
  const sourceCenterX = source.x + ANALYZER_NODE_WIDTH / 2;
  const targetCenterX = target.x + ANALYZER_NODE_WIDTH / 2;
  const goesRight = targetCenterX >= sourceCenterX;
  const sourceX = goesRight ? source.x + ANALYZER_NODE_WIDTH : source.x;
  const targetX = goesRight ? target.x : target.x + ANALYZER_NODE_WIDTH;
  const direction = goesRight ? 1 : -1;
  const sourceY = source.y + source.height / 2;
  const targetY = target.y + target.height / 2;

  return {
    sourceBoundary: { x: sourceX, y: sourceY },
    targetBoundary: { x: targetX, y: targetY },
    start: { x: sourceX + direction * clearance, y: sourceY },
    end: { x: targetX - direction * clearance, y: targetY },
    goesRight,
  };
}

function cubicPoint(
  start: AnalyzerEdgePoint,
  firstControl: AnalyzerEdgePoint,
  secondControl: AnalyzerEdgePoint,
  end: AnalyzerEdgePoint,
  progress: number,
): AnalyzerEdgePoint {
  const inverse = 1 - progress;
  return {
    x: inverse ** 3 * start.x
      + 3 * inverse ** 2 * progress * firstControl.x
      + 3 * inverse * progress ** 2 * secondControl.x
      + progress ** 3 * end.x,
    y: inverse ** 3 * start.y
      + 3 * inverse ** 2 * progress * firstControl.y
      + 3 * inverse * progress ** 2 * secondControl.y
      + progress ** 3 * end.y,
  };
}

function directEdgeGeometry(source: PositionedNode, target: PositionedNode): {
  start: AnalyzerEdgePoint;
  firstControl: AnalyzerEdgePoint;
  secondControl: AnalyzerEdgePoint;
  end: AnalyzerEdgePoint;
} {
  const { sourceBoundary, targetBoundary, goesRight } = directEdgePoints(source, target);
  const bend = Math.max(54, Math.abs(targetBoundary.x - sourceBoundary.x) * 0.38);
  return {
    start: sourceBoundary,
    firstControl: { x: sourceBoundary.x + (goesRight ? bend : -bend), y: sourceBoundary.y },
    secondControl: { x: targetBoundary.x + (goesRight ? -bend : bend), y: targetBoundary.y },
    end: targetBoundary,
  };
}

function segmentIntersectsRect(first: AnalyzerEdgePoint, second: AnalyzerEdgePoint, obstacle: InflatedObstacle): boolean {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  let minimum = 0;
  let maximum = 1;

  const clip = (origin: number, direction: number, minimumBound: number, maximumBound: number): boolean => {
    if (direction === 0) return origin >= minimumBound && origin <= maximumBound;
    const firstIntersection = (minimumBound - origin) / direction;
    const secondIntersection = (maximumBound - origin) / direction;
    const near = Math.min(firstIntersection, secondIntersection);
    const far = Math.max(firstIntersection, secondIntersection);
    minimum = Math.max(minimum, near);
    maximum = Math.min(maximum, far);
    return minimum <= maximum;
  };

  return clip(first.x, dx, obstacle.x, obstacle.right)
    && clip(first.y, dy, obstacle.y, obstacle.bottom);
}

function segmentClear(first: AnalyzerEdgePoint, second: AnalyzerEdgePoint, obstacles: InflatedObstacle[]): boolean {
  if (first.x !== second.x && first.y !== second.y) return false;
  return !obstacles.some((obstacle) => {
    if (first.y === second.y) {
      const left = Math.min(first.x, second.x);
      const right = Math.max(first.x, second.x);
      return first.y > obstacle.y
        && first.y < obstacle.bottom
        && left < obstacle.right
        && right > obstacle.x;
    }
    const top = Math.min(first.y, second.y);
    const bottom = Math.max(first.y, second.y);
    return first.x > obstacle.x
      && first.x < obstacle.right
      && top < obstacle.bottom
      && bottom > obstacle.y;
  });
}

function pointClear(point: AnalyzerEdgePoint, obstacles: InflatedObstacle[]): boolean {
  return !obstacles.some((obstacle) => containsPointStrict(obstacle, point));
}

function relevantObstacles(
  source: PositionedNode,
  target: PositionedNode,
  obstacles: readonly AnalyzerEdgeObstacle[],
  clearance: number,
): InflatedObstacle[] {
  const sourceCenter = { x: source.x + ANALYZER_NODE_WIDTH / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + ANALYZER_NODE_WIDTH / 2, y: target.y + target.height / 2 };
  return obstacles
    .filter(validObstacle)
    // A parent Summary / Cluster is a related container when an endpoint is inside it.
    .filter((obstacle) => !containsPoint(obstacle, sourceCenter) && !containsPoint(obstacle, targetCenter))
    .map((obstacle) => inflateObstacle(obstacle, clearance));
}

function directPathIntersectsAnyObstacle(source: PositionedNode, target: PositionedNode, obstacles: InflatedObstacle[]): boolean {
  if (obstacles.length === 0) return false;
  const geometry = directEdgeGeometry(source, target);
  let previous = geometry.start;
  for (let index = 1; index <= DIRECT_CURVE_SAMPLES; index += 1) {
    const current = cubicPoint(geometry.start, geometry.firstControl, geometry.secondControl, geometry.end, index / DIRECT_CURVE_SAMPLES);
    if (obstacles.some((obstacle) => segmentIntersectsRect(previous, current, obstacle))) return true;
    previous = current;
  }
  return false;
}

function addCoordinate(values: Set<number>, value: number): void {
  if (Number.isFinite(value)) values.add(value);
}

function buildVisibilityGraph(
  start: AnalyzerEdgePoint,
  end: AnalyzerEdgePoint,
  obstacles: InflatedObstacle[],
): Map<string, Neighbor[]> | undefined {
  const xCoordinates = new Set<number>();
  const yCoordinates = new Set<number>();
  addCoordinate(xCoordinates, start.x);
  addCoordinate(xCoordinates, end.x);
  addCoordinate(yCoordinates, start.y);
  addCoordinate(yCoordinates, end.y);
  obstacles.forEach((obstacle) => {
    addCoordinate(xCoordinates, obstacle.x);
    addCoordinate(xCoordinates, obstacle.right);
    addCoordinate(yCoordinates, obstacle.y);
    addCoordinate(yCoordinates, obstacle.bottom);
  });

  const xs = [...xCoordinates].sort((first, second) => first - second);
  const ys = [...yCoordinates].sort((first, second) => first - second);
  if (xs.length * ys.length > MAX_GRID_POINTS) return undefined;

  const points = new Map<string, AnalyzerEdgePoint>();
  xs.forEach((x) => ys.forEach((y) => {
    const point = { x, y };
    if (pointClear(point, obstacles)) points.set(pointKey(point), point);
  }));
  points.set(pointKey(start), start);
  points.set(pointKey(end), end);
  if (!pointClear(start, obstacles) || !pointClear(end, obstacles)) return undefined;

  const graph = new Map<string, Neighbor[]>();
  points.forEach((point, key) => graph.set(key, []));
  const connect = (first: AnalyzerEdgePoint, second: AnalyzerEdgePoint): void => {
    if (!segmentClear(first, second, obstacles)) return;
    const direction: Direction = first.x === second.x ? 'vertical' : 'horizontal';
    const distance = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
    if (distance === 0) return;
    graph.get(pointKey(first))?.push({ point: second, direction, distance });
    graph.get(pointKey(second))?.push({ point: first, direction, distance });
  };

  const pointsByX = new Map<number, AnalyzerEdgePoint[]>();
  const pointsByY = new Map<number, AnalyzerEdgePoint[]>();
  points.forEach((point) => {
    const sameX = pointsByX.get(point.x) ?? [];
    sameX.push(point);
    pointsByX.set(point.x, sameX);
    const sameY = pointsByY.get(point.y) ?? [];
    sameY.push(point);
    pointsByY.set(point.y, sameY);
  });
  pointsByX.forEach((sameX) => {
    sameX.sort((first, second) => first.y - second.y);
    for (let index = 1; index < sameX.length; index += 1) connect(sameX[index - 1], sameX[index]);
  });
  pointsByY.forEach((sameY) => {
    sameY.sort((first, second) => first.x - second.x);
    for (let index = 1; index < sameY.length; index += 1) connect(sameY[index - 1], sameY[index]);
  });
  return graph;
}

function shortestVisibilityRoute(start: AnalyzerEdgePoint, end: AnalyzerEdgePoint, obstacles: InflatedObstacle[]): AnalyzerEdgePoint[] | undefined {
  const graph = buildVisibilityGraph(start, end, obstacles);
  if (!graph) return undefined;
  const startKey = pointKey(start);
  const endKey = pointKey(end);
  const initialStateKey = `${startKey}|start`;
  const distances = new Map<string, number>([[initialStateKey, 0]]);
  const previous = new Map<string, string>();
  const states: Array<{ key: string; state: RouteState; cost: number }> = [{ key: initialStateKey, state: { pointKey: startKey }, cost: 0 }];
  const visited = new Set<string>();
  let finalStateKey: string | undefined;

  while (states.length > 0) {
    states.sort((first, second) => first.cost - second.cost);
    const current = states.shift();
    if (!current || visited.has(current.key)) continue;
    visited.add(current.key);
    if (current.state.pointKey === endKey) {
      finalStateKey = current.key;
      break;
    }
    const currentPoint = graph.get(current.state.pointKey);
    if (!currentPoint) continue;
    currentPoint.forEach((neighbor) => {
      const nextDirection = neighbor.direction;
      const nextState: RouteState = { pointKey: pointKey(neighbor.point), direction: nextDirection };
      const nextKey = `${nextState.pointKey}|${nextDirection}`;
      const nextCost = current.cost
        + neighbor.distance
        + (current.state.direction && current.state.direction !== nextDirection ? TURN_PENALTY : 0);
      if (nextCost >= (distances.get(nextKey) ?? Number.POSITIVE_INFINITY)) return;
      distances.set(nextKey, nextCost);
      previous.set(nextKey, current.key);
      states.push({ key: nextKey, state: nextState, cost: nextCost });
    });
  }

  if (!finalStateKey) return undefined;
  const route: AnalyzerEdgePoint[] = [];
  let currentKey: string | undefined = finalStateKey;
  while (currentKey) {
    const separator = currentKey.lastIndexOf('|');
    const pointKeyValue = currentKey.slice(0, separator);
    if (!graph.has(pointKeyValue)) break;
    const [x, y] = pointKeyValue.split(':').map(Number);
    route.push({ x, y });
    currentKey = previous.get(currentKey);
  }
  route.reverse();
  return route.length > 0 ? route : undefined;
}

function compactPoints(points: AnalyzerEdgePoint[]): AnalyzerEdgePoint[] {
  const compacted: AnalyzerEdgePoint[] = [];
  points.forEach((point) => {
    const previous = compacted.at(-1);
    if (previous && previous.x === point.x && previous.y === point.y) return;
    const beforePrevious = compacted.at(-2);
    if (beforePrevious && previous && ((beforePrevious.x === previous.x && previous.x === point.x)
      || (beforePrevious.y === previous.y && previous.y === point.y))) {
      compacted[compacted.length - 1] = point;
      return;
    }
    compacted.push(point);
  });
  return compacted;
}

export function analyzerEdgeObstacles(layout: AnalyzerLayout): AnalyzerEdgeObstacle[] {
  return [
    ...layout.nodes.map((positionedNode) => ({
      id: `node:${positionedNode.node.id}`,
      x: positionedNode.x,
      y: positionedNode.y,
      width: ANALYZER_NODE_WIDTH,
      height: positionedNode.height,
      kind: 'node' as const,
    })),
    ...layout.summaryGroups.map((group) => ({
      id: `summary:${group.id}`,
      x: group.x,
      y: group.y,
      width: group.width,
      height: group.height,
      kind: 'summary' as const,
    })),
    ...layout.bands.map((band) => ({
      id: `band:${band.id}`,
      x: band.x,
      y: band.y,
      width: band.width,
      height: band.height,
      kind: 'band' as const,
    })),
    ...layout.clusters.map((cluster) => ({
      id: `cluster:${cluster.id}`,
      x: cluster.x,
      y: cluster.y,
      width: cluster.width,
      height: cluster.height,
      kind: 'cluster' as const,
    })),
    ...layout.lanes.map((lane) => ({
      id: `lane:${lane.id}`,
      x: lane.x,
      y: lane.y,
      width: lane.width,
      height: lane.height,
      kind: 'lane' as const,
    })),
  ];
}

export function analyzerEdgeRoute(
  source: PositionedNode,
  target: PositionedNode,
  obstacles: readonly AnalyzerEdgeObstacle[],
  options: AnalyzerEdgeRoutingOptions = {},
): AnalyzerEdgePoint[] | undefined {
  const clearance = Math.max(4, options.clearance ?? DEFAULT_EDGE_CLEARANCE);
  const relevant = relevantObstacles(source, target, obstacles, clearance);
  if (!directPathIntersectsAnyObstacle(source, target, relevant)) return undefined;
  const direct = directEdgePoints(source, target, clearance);
  const route = shortestVisibilityRoute(direct.start, direct.end, relevant);
  if (!route) return undefined;
  return compactPoints([direct.sourceBoundary, ...route, direct.targetBoundary]);
}

export function analyzerEdgePath(
  source: PositionedNode,
  target: PositionedNode,
  obstacles: readonly AnalyzerEdgeObstacle[] = [],
  options: AnalyzerEdgeRoutingOptions = {},
): string {
  const geometry = directEdgeGeometry(source, target);
  const directPath = `M ${geometry.start.x} ${geometry.start.y} C ${geometry.firstControl.x} ${geometry.firstControl.y}, ${geometry.secondControl.x} ${geometry.secondControl.y}, ${geometry.end.x} ${geometry.end.y}`;
  const route = analyzerEdgeRoute(source, target, obstacles, options);
  if (!route || route.length < 2) return directPath;
  return route.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export function analyzerEdgeRouteIntersectsObstacle(
  route: readonly AnalyzerEdgePoint[],
  obstacle: AnalyzerEdgeObstacle,
  clearance = 0,
): boolean {
  const inflated = inflateObstacle(obstacle, clearance);
  return route.slice(1).some((point, index) => segmentIntersectsRect(route[index], point, inflated));
}

export function analyzerEdgePathIntersectsObstacle(
  source: PositionedNode,
  target: PositionedNode,
  obstacle: AnalyzerEdgeObstacle,
  clearance = 0,
): boolean {
  const inflated = inflateObstacle(obstacle, clearance);
  const geometry = directEdgeGeometry(source, target);
  let previous = geometry.start;
  for (let index = 1; index <= DIRECT_CURVE_SAMPLES; index += 1) {
    const current = cubicPoint(geometry.start, geometry.firstControl, geometry.secondControl, geometry.end, index / DIRECT_CURVE_SAMPLES);
    if (segmentIntersectsRect(previous, current, inflated)) return true;
    previous = current;
  }
  return false;
}
