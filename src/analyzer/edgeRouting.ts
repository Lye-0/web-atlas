import { ANALYZER_NODE_WIDTH, ANALYZER_STRUCTURAL_HEADING_HEIGHT, type AnalyzerLayout, type PositionedNode } from './layout';
import type { AnalyzerViewEdge } from './types';

export type AnalyzerEdgeObstacleKind =
  | 'node'
  | 'fact-node'
  | 'summary-card'
  | 'summary-heading'
  | 'label'
  // Kept as soft aliases for callers that still describe painted surfaces.
  | 'summary'
  | 'band'
  | 'cluster'
  | 'lane';

export interface AnalyzerEdgeObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: AnalyzerEdgeObstacleKind;
  /** Explicitly overrides the kind-derived hardness for custom layout bounds. */
  hard?: boolean;
  priority?: number;
}

export interface AnalyzerEdgePoint {
  x: number;
  y: number;
}

export interface AnalyzerEdgeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AnalyzerFanoutFallbackReason = 'no-bus-candidates' | 'no-valid-bus-route' | 'direction-mismatch';

export type AnalyzerEdgeRoutingStrategy = 'structural-fanout' | 'generic' | 'generic-fallback';

export type AnalyzerFanoutDirection = 'left' | 'right' | 'up' | 'down';

export interface AnalyzerFanoutDirectionDiagnostic {
  direction: AnalyzerFanoutDirection;
  sideGap: number;
  candidateCount: number;
  validCandidateCount: number;
}

export type AnalyzerFanoutCandidateStatus = 'accepted' | 'rejected';

export type AnalyzerFanoutCandidateRejectReason =
  | 'source-entry-intersects-obstacle'
  | 'trunk-intersects-obstacle'
  | 'branch-intersects-obstacle'
  | 'branch-cannot-reach-target'
  | 'insufficient-clearance'
  | 'directionality-violation'
  | 'monotonicity-violation'
  | 'outside-valid-corridor'
  | 'summary-heading-collision'
  | 'candidate-invalid';

export interface AnalyzerFanoutObstacleDiagnostic {
  id: string;
  kind?: AnalyzerEdgeObstacleKind;
  bounds: AnalyzerEdgeBounds;
  inflatedBounds?: AnalyzerEdgeBounds;
}

export interface AnalyzerFanoutSegmentDiagnostic {
  valid: boolean;
  reason?: AnalyzerFanoutCandidateRejectReason;
  pathPoints?: AnalyzerEdgePoint[];
  rejectedByObstacleId?: string;
  rejectedByObstacleKind?: AnalyzerEdgeObstacleKind;
  rejectedByObstacleBounds?: AnalyzerEdgeBounds;
  rejectedByObstacle?: AnalyzerFanoutObstacleDiagnostic;
  excludedObstacleIds: string[];
}

export interface AnalyzerFanoutCandidateBranchDiagnostic extends AnalyzerFanoutSegmentDiagnostic {
  edgeId: string;
  targetId: string;
  targetLabel: string;
  branchPoints?: AnalyzerEdgePoint[];
  excludedHardObstacleIds: string[];
  excludedSoftObstacleIds: string[];
}

export interface AnalyzerFanoutCandidateDiagnostic {
  direction: AnalyzerFanoutDirection;
  candidateX?: number;
  candidateY?: number;
  busX?: number;
  busY?: number;
  status: AnalyzerFanoutCandidateStatus;
  sourceEntry: AnalyzerFanoutSegmentDiagnostic;
  trunk: AnalyzerFanoutSegmentDiagnostic;
  branches: AnalyzerFanoutCandidateBranchDiagnostic[];
  finalReason?: AnalyzerFanoutCandidateRejectReason;
  sourceRight?: number;
  targetGroupLeft?: number;
  clearance: number;
  availableWidth?: number;
  sourceBottom?: number;
  targetGroupTop?: number;
  availableHeight?: number;
}

export interface AnalyzerFanoutRoutingDiagnostic {
  fanoutGroupId: string;
  sourceId: string;
  edgeIds: string[];
  targetIds: string[];
  fanoutDetected: boolean;
  busCandidateCount: number;
  targetGroupBounds: AnalyzerEdgeBounds;
  candidateDiagnostics: AnalyzerFanoutCandidateDiagnostic[];
  evaluatedDirections: AnalyzerFanoutDirection[];
  directionDiagnostics: AnalyzerFanoutDirectionDiagnostic[];
  preferredDirection?: AnalyzerFanoutDirection;
  selectedDirection?: AnalyzerFanoutDirection;
  selectedBusX?: number;
  selectedBusY?: number;
  fallbackUsed: boolean;
  fallbackReason?: AnalyzerFanoutFallbackReason;
}

export interface AnalyzerEdgeRoutingDiagnostic {
  edgeId: string;
  sourceId: string;
  targetId: string;
  edgeKind?: AnalyzerViewEdge['kind'];
  presentation?: AnalyzerViewEdge['presentation'];
  routingStrategy: AnalyzerEdgeRoutingStrategy;
  fanoutGroupId?: string;
  fanoutDetected: boolean;
  busUsed: boolean;
  busCandidateCount: number;
  selectedBusX?: number;
  selectedBusY?: number;
  targetGroupBounds?: AnalyzerEdgeBounds;
  candidateDiagnostics?: AnalyzerFanoutCandidateDiagnostic[];
  directionDiagnostics?: AnalyzerFanoutDirectionDiagnostic[];
  evaluatedDirections?: AnalyzerFanoutDirection[];
  preferredDirection?: AnalyzerFanoutDirection;
  selectedDirection?: AnalyzerFanoutDirection;
  fallbackUsed: boolean;
  fallbackReason?: AnalyzerFanoutFallbackReason;
  pathPoints: AnalyzerEdgePoint[];
}

export interface AnalyzerEdgeRoutingOptions {
  clearance?: number;
  cornerRadius?: number;
  bendPenalty?: number;
  obstaclePenalty?: number;
  crossingPenalty?: number;
  /** Distance outside a Node body that remains traversable but less desirable. */
  softKeepOut?: number;
  /** Cost per pixel spent inside a Node's soft keep-out zone. */
  softProximityPenalty?: number;
  /** Non-linear base cost for consecutive soft-zone visits. */
  occlusionPenalty?: number;
  /** Additional cost per pixel for soft-zone overlap near a source/target port. */
  terminalLegPenalty?: number;
  /** Length of the source/target terminal leg that receives the readability cost. */
  terminalLegLength?: number;
  existingRoutes?: readonly (readonly AnalyzerEdgePoint[])[];
  enableFanout?: boolean;
  /** Development/test hook for inspecting fan-out bus selection and fallback. */
  onFanoutDiagnostic?: (diagnostic: AnalyzerFanoutRoutingDiagnostic) => void;
  /** Development/test hook for tracing each rendered route back to its source. */
  onEdgeDiagnostic?: (diagnostic: AnalyzerEdgeRoutingDiagnostic) => void;
  /** Prefer a view's primary flow axis when choosing source/target ports. */
  flowDirection?: 'auto' | 'horizontal' | 'vertical';
  bounds?: AnalyzerEdgeBounds;
}

export type AnalyzerRoutableEdge = Pick<AnalyzerViewEdge, 'id' | 'sourceId' | 'targetId'>
  & Partial<Pick<AnalyzerViewEdge, 'kind' | 'presentation'>>;

const DEFAULT_EDGE_CLEARANCE = 14;
const DEFAULT_CORNER_RADIUS = 10;
const DEFAULT_BEND_PENALTY = 150;
const DEFAULT_OBSTACLE_PENALTY = 18;
const DEFAULT_CROSSING_PENALTY = 900;
const DEFAULT_SOFT_KEEP_OUT = 18;
const DEFAULT_SOFT_PROXIMITY_PENALTY = 2.5;
const DEFAULT_OCCLUSION_PENALTY = 90;
const DEFAULT_TERMINAL_LEG_PENALTY = 3.5;
const DEFAULT_TERMINAL_LEG_LENGTH = 64;
const SHORT_ZIGZAG_LENGTH = 12;
const FANOUT_BUS_CLEARANCE = 32;
const FANOUT_CORRIDOR_PRIORITY_PENALTY = 80;
const VISIBILITY_ESCAPE_MARGIN = 32;
const FANOUT_CORRIDOR_MARGIN = 4;
const SOFT_ZONE_VISIT_THRESHOLD = 4;
const MAX_GRID_POINTS = 20_000;
const EPSILON = 0.0001;

type Direction = 'horizontal' | 'vertical';
type AxisDirection = AnalyzerFanoutDirection;

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

interface EdgePortGeometry {
  sourceBoundary: AnalyzerEdgePoint;
  targetBoundary: AnalyzerEdgePoint;
  start: AnalyzerEdgePoint;
  end: AnalyzerEdgePoint;
  direction: AxisDirection;
}

interface MonotonicConstraint {
  axis: 'x' | 'y';
  sign: -1 | 1;
}

interface FanoutGroupBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

type FanoutTrunkCandidatePriority = 'group-edge' | 'source-group' | 'internal';

interface FanoutTrunkCandidate {
  x?: number;
  y?: number;
  priority: FanoutTrunkCandidatePriority;
}

interface FanoutRouteResult {
  routes?: Map<string, AnalyzerEdgePoint[]>;
  busCandidateCount: number;
  candidateDiagnostics: AnalyzerFanoutCandidateDiagnostic[];
  evaluatedDirections: AnalyzerFanoutDirection[];
  directionDiagnostics: AnalyzerFanoutDirectionDiagnostic[];
  preferredDirection?: AnalyzerFanoutDirection;
  selectedDirection?: AnalyzerFanoutDirection;
  selectedBus?: FanoutTrunkCandidate;
  fallbackReason?: AnalyzerFanoutFallbackReason;
}

interface FanoutDirectionalRouteResult {
  routes?: Map<string, AnalyzerEdgePoint[]>;
  busCandidateCount: number;
  validCandidateCount: number;
  candidateDiagnostics: AnalyzerFanoutCandidateDiagnostic[];
  selectedBus?: FanoutTrunkCandidate;
}

export interface AnalyzerRouteSimplificationOptions {
  shortZigzagLength?: number;
  obstacles?: readonly InflatedObstacle[];
}

interface ResolvedRoutingOptions {
  clearance: number;
  cornerRadius: number;
  bendPenalty: number;
  obstaclePenalty: number;
  crossingPenalty: number;
  softKeepOut: number;
  softProximityPenalty: number;
  occlusionPenalty: number;
  terminalLegPenalty: number;
  terminalLegLength: number;
  softObstacles: readonly InflatedObstacle[];
  existingRoutes: readonly (readonly AnalyzerEdgePoint[])[];
  enableFanout: boolean;
  onFanoutDiagnostic?: (diagnostic: AnalyzerFanoutRoutingDiagnostic) => void;
  onEdgeDiagnostic?: (diagnostic: AnalyzerEdgeRoutingDiagnostic) => void;
  flowDirection: 'auto' | 'horizontal' | 'vertical';
  bounds?: AnalyzerEdgeBounds;
}

function pointKey(point: AnalyzerEdgePoint): string {
  return `${point.x}:${point.y}`;
}

function approximatelyEqual(first: number, second: number): boolean {
  return Math.abs(first - second) <= EPSILON;
}

function samePoint(first: AnalyzerEdgePoint, second: AnalyzerEdgePoint): boolean {
  return approximatelyEqual(first.x, second.x) && approximatelyEqual(first.y, second.y);
}

function validObstacle(obstacle: AnalyzerEdgeObstacle): boolean {
  return Number.isFinite(obstacle.x)
    && Number.isFinite(obstacle.y)
    && Number.isFinite(obstacle.width)
    && Number.isFinite(obstacle.height)
    && obstacle.width > 0
    && obstacle.height > 0;
}

export function isAnalyzerEdgeObstacleHard(obstacle: AnalyzerEdgeObstacle): boolean {
  if (!validObstacle(obstacle)) return false;
  if (obstacle.hard !== undefined) return obstacle.hard;
  return obstacle.kind !== 'summary'
    && obstacle.kind !== 'band'
    && obstacle.kind !== 'cluster'
    && obstacle.kind !== 'lane';
}

function containsPoint(obstacle: AnalyzerEdgeObstacle, point: AnalyzerEdgePoint): boolean {
  return point.x >= obstacle.x
    && point.x <= obstacle.x + obstacle.width
    && point.y >= obstacle.y
    && point.y <= obstacle.y + obstacle.height;
}

function containsPointStrict(obstacle: InflatedObstacle, point: AnalyzerEdgePoint): boolean {
  return point.x > obstacle.x + EPSILON
    && point.x < obstacle.right - EPSILON
    && point.y > obstacle.y + EPSILON
    && point.y < obstacle.bottom - EPSILON;
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

function resolveRoutingOptions(options: AnalyzerEdgeRoutingOptions): ResolvedRoutingOptions {
  const clearance = Math.max(4, options.clearance ?? DEFAULT_EDGE_CLEARANCE);
  const requestedRadius = options.cornerRadius ?? DEFAULT_CORNER_RADIUS;
  return {
    clearance,
    cornerRadius: Math.max(0, Math.min(Number.isFinite(requestedRadius) ? requestedRadius : DEFAULT_CORNER_RADIUS, clearance)),
    bendPenalty: Math.max(0, options.bendPenalty ?? DEFAULT_BEND_PENALTY),
    obstaclePenalty: Math.max(0, options.obstaclePenalty ?? DEFAULT_OBSTACLE_PENALTY),
    crossingPenalty: Math.max(0, options.crossingPenalty ?? DEFAULT_CROSSING_PENALTY),
    softKeepOut: Math.max(0, options.softKeepOut ?? DEFAULT_SOFT_KEEP_OUT),
    softProximityPenalty: Math.max(0, options.softProximityPenalty ?? DEFAULT_SOFT_PROXIMITY_PENALTY),
    occlusionPenalty: Math.max(0, options.occlusionPenalty ?? DEFAULT_OCCLUSION_PENALTY),
    terminalLegPenalty: Math.max(0, options.terminalLegPenalty ?? DEFAULT_TERMINAL_LEG_PENALTY),
    terminalLegLength: Math.max(0, options.terminalLegLength ?? DEFAULT_TERMINAL_LEG_LENGTH),
    softObstacles: [],
    existingRoutes: options.existingRoutes ?? [],
    enableFanout: options.enableFanout !== false,
    ...(options.onFanoutDiagnostic ? { onFanoutDiagnostic: options.onFanoutDiagnostic } : {}),
    ...(options.onEdgeDiagnostic ? { onEdgeDiagnostic: options.onEdgeDiagnostic } : {}),
    flowDirection: options.flowDirection ?? 'auto',
    ...(options.bounds ? { bounds: options.bounds } : {}),
  };
}

function nodeRight(node: PositionedNode): number {
  return node.x + ANALYZER_NODE_WIDTH;
}

function nodeBottom(node: PositionedNode): number {
  return node.y + node.height;
}

function nodeCenter(node: PositionedNode): AnalyzerEdgePoint {
  return { x: node.x + ANALYZER_NODE_WIDTH / 2, y: node.y + node.height / 2 };
}

function movePoint(point: AnalyzerEdgePoint, direction: AxisDirection, distance: number): AnalyzerEdgePoint {
  if (direction === 'right') return { x: point.x + distance, y: point.y };
  if (direction === 'left') return { x: point.x - distance, y: point.y };
  if (direction === 'down') return { x: point.x, y: point.y + distance };
  return { x: point.x, y: point.y - distance };
}

function oppositeDirection(direction: AxisDirection): AxisDirection {
  if (direction === 'right') return 'left';
  if (direction === 'left') return 'right';
  if (direction === 'down') return 'up';
  return 'down';
}

function edgePortGeometryForDirection(
  source: PositionedNode,
  target: PositionedNode,
  clearance: number,
  direction: AxisDirection,
): EdgePortGeometry {
  const sourceCenter = nodeCenter(source);
  const targetCenter = nodeCenter(target);
  const sourceBoundary = direction === 'right'
    ? { x: nodeRight(source), y: sourceCenter.y }
    : direction === 'left'
      ? { x: source.x, y: sourceCenter.y }
      : direction === 'down'
        ? { x: sourceCenter.x, y: nodeBottom(source) }
        : { x: sourceCenter.x, y: source.y };
  const targetBoundary = direction === 'right'
    ? { x: target.x, y: targetCenter.y }
    : direction === 'left'
      ? { x: nodeRight(target), y: targetCenter.y }
      : direction === 'down'
        ? { x: targetCenter.x, y: target.y }
        : { x: targetCenter.x, y: nodeBottom(target) };

  return {
    sourceBoundary,
    targetBoundary,
    start: movePoint(sourceBoundary, direction, clearance),
    end: movePoint(targetBoundary, oppositeDirection(direction), clearance),
    direction,
  };
}

function edgePortGeometry(
  source: PositionedNode,
  target: PositionedNode,
  clearance: number,
  flowDirection: ResolvedRoutingOptions['flowDirection'] = 'auto',
): EdgePortGeometry {
  const sourceCenter = nodeCenter(source);
  const targetCenter = nodeCenter(target);
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;
  const horizontal = flowDirection === 'horizontal'
    || (flowDirection === 'auto' && Math.abs(deltaX) >= Math.abs(deltaY));
  const direction: AxisDirection = horizontal
    ? (deltaX >= 0 ? 'right' : 'left')
    : (deltaY >= 0 ? 'down' : 'up');
  return edgePortGeometryForDirection(source, target, clearance, direction);
}

function monotonicConstraint(direction: AxisDirection): MonotonicConstraint {
  return direction === 'right'
    ? { axis: 'x', sign: 1 }
    : direction === 'left'
      ? { axis: 'x', sign: -1 }
      : direction === 'down'
        ? { axis: 'y', sign: 1 }
        : { axis: 'y', sign: -1 };
}

function segmentRespectsMonotonicity(
  first: AnalyzerEdgePoint,
  second: AnalyzerEdgePoint,
  constraint: MonotonicConstraint,
): boolean {
  const firstValue = constraint.axis === 'x' ? first.x : first.y;
  const secondValue = constraint.axis === 'x' ? second.x : second.y;
  return constraint.sign === 1
    ? secondValue >= firstValue - EPSILON
    : secondValue <= firstValue + EPSILON;
}

function routeRespectsMonotonicity(
  points: readonly AnalyzerEdgePoint[],
  constraint: MonotonicConstraint,
): boolean {
  return points.slice(1).every((point, index) => segmentRespectsMonotonicity(points[index]!, point, constraint));
}

function segmentIntersectsRect(first: AnalyzerEdgePoint, second: AnalyzerEdgePoint, obstacle: InflatedObstacle): boolean {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  let minimum = 0;
  let maximum = 1;

  const clip = (origin: number, direction: number, minimumBound: number, maximumBound: number): boolean => {
    if (approximatelyEqual(direction, 0)) return origin >= minimumBound && origin <= maximumBound;
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

function segmentOverlapLength(first: AnalyzerEdgePoint, second: AnalyzerEdgePoint, obstacle: InflatedObstacle): number {
  const direction = segmentDirection(first, second);
  if (!direction) return 0;
  if (direction === 'horizontal') {
    if (first.y <= obstacle.y + EPSILON || first.y >= obstacle.bottom - EPSILON) return 0;
    const overlap = Math.min(Math.max(first.x, second.x), obstacle.right) - Math.max(Math.min(first.x, second.x), obstacle.x);
    return overlap > EPSILON ? overlap : 0;
  }
  if (first.x <= obstacle.x + EPSILON || first.x >= obstacle.right - EPSILON) return 0;
  const overlap = Math.min(Math.max(first.y, second.y), obstacle.bottom) - Math.max(Math.min(first.y, second.y), obstacle.y);
  return overlap > EPSILON ? overlap : 0;
}

interface SoftZoneVisit {
  id: string;
  position: number;
  overlap: number;
}

function softZoneVisitsForSegment(
  first: AnalyzerEdgePoint,
  second: AnalyzerEdgePoint,
  softObstacles: readonly InflatedObstacle[],
): SoftZoneVisit[] {
  const direction = segmentDirection(first, second);
  if (!direction) return [];
  const horizontal = direction === 'horizontal';
  const startValue = horizontal ? first.x : first.y;
  const endValue = horizontal ? second.x : second.y;
  const sign = endValue >= startValue ? 1 : -1;
  return softObstacles
    .map((obstacle) => {
      const overlap = segmentOverlapLength(first, second, obstacle);
      const segmentMinimum = Math.min(startValue, endValue);
      const segmentMaximum = Math.max(startValue, endValue);
      const obstacleMinimum = horizontal ? obstacle.x : obstacle.y;
      const obstacleMaximum = horizontal ? obstacle.right : obstacle.bottom;
      const overlapStart = Math.max(segmentMinimum, obstacleMinimum);
      const overlapEnd = Math.min(segmentMaximum, obstacleMaximum);
      const entry = sign === 1 ? overlapStart : overlapEnd;
      return {
        id: obstacle.id,
        position: Math.abs(entry - startValue),
        overlap,
      };
    })
    .filter((visit) => visit.overlap >= SOFT_ZONE_VISIT_THRESHOLD)
    .sort((firstVisit, secondVisit) => firstVisit.position - secondVisit.position);
}

function routeSoftProximityCost(
  points: readonly AnalyzerEdgePoint[],
  options: ResolvedRoutingOptions,
): number {
  return points.slice(1).reduce((cost, point, index) => {
    const previous = points[index]!;
    return cost + options.softObstacles.reduce(
      (segmentCost, obstacle) => segmentCost + segmentOverlapLength(previous, point, obstacle) * options.softProximityPenalty,
      0,
    );
  }, 0);
}

interface RouteSoftZoneVisit {
  id: string;
  pathDistance: number;
  overlap: number;
}

function routeSoftZoneVisits(
  points: readonly AnalyzerEdgePoint[],
  softObstacles: readonly InflatedObstacle[],
): RouteSoftZoneVisit[] {
  const visits: RouteSoftZoneVisit[] = [];
  let travelled = 0;
  points.slice(1).forEach((point, index) => {
    const first = points[index]!;
    const segmentLength = Math.abs(point.x - first.x) + Math.abs(point.y - first.y);
    softZoneVisitsForSegment(points[index]!, point, softObstacles).forEach((visit) => {
      if (visits.at(-1)?.id !== visit.id) {
        visits.push({ id: visit.id, pathDistance: travelled + visit.position, overlap: visit.overlap });
      }
    });
    travelled += segmentLength;
  });
  return visits;
}

function consecutiveOcclusionCost(
  points: readonly AnalyzerEdgePoint[],
  options: ResolvedRoutingOptions,
): number {
  const visits = routeSoftZoneVisits(points, options.softObstacles);
  if (visits.length === 0 || options.occlusionPenalty <= 0) return 0;
  const continuationGap = Math.max(32, options.softKeepOut * 2);
  let currentRun: string[] = [];
  let previousVisit: RouteSoftZoneVisit | undefined;
  let cost = 0;
  const flush = (): void => {
    if (currentRun.length > 0) cost += options.occlusionPenalty * currentRun.length ** 2;
    currentRun = [];
  };
  visits.forEach((visit) => {
    const gap = previousVisit
      ? visit.pathDistance - (previousVisit.pathDistance + previousVisit.overlap)
      : 0;
    if (gap > continuationGap || currentRun.includes(visit.id)) flush();
    if (currentRun.at(-1) !== visit.id) currentRun.push(visit.id);
    previousVisit = visit;
  });
  flush();
  return cost;
}

function terminalSoftOverlapLength(
  points: readonly AnalyzerEdgePoint[],
  softObstacles: readonly InflatedObstacle[],
  length: number,
  fromStart: boolean,
): number {
  if (points.length < 2 || length <= 0) return 0;
  let remaining = length;
  let total = 0;
  const firstIndex = fromStart ? 0 : points.length - 2;
  const lastIndex = fromStart ? points.length - 1 : -1;
  const step = fromStart ? 1 : -1;
  for (let index = firstIndex; index !== lastIndex && remaining > EPSILON; index += step) {
    const first = fromStart ? points[index]! : points[index + 1]!;
    const second = fromStart ? points[index + 1]! : points[index]!;
    const segmentLength = Math.abs(second.x - first.x) + Math.abs(second.y - first.y);
    if (segmentLength <= EPSILON) continue;
    const visibleLength = Math.min(segmentLength, remaining);
    const ratio = visibleLength / segmentLength;
    const visibleEnd = {
      x: first.x + (second.x - first.x) * ratio,
      y: first.y + (second.y - first.y) * ratio,
    };
    total += softObstacles.reduce((overlap, obstacle) => overlap + segmentOverlapLength(first, visibleEnd, obstacle), 0);
    remaining -= visibleLength;
  }
  return total;
}

function terminalReadabilityCost(
  points: readonly AnalyzerEdgePoint[],
  options: ResolvedRoutingOptions,
): number {
  if (options.terminalLegPenalty <= 0 || options.terminalLegLength <= 0) return 0;
  const overlap = terminalSoftOverlapLength(points, options.softObstacles, options.terminalLegLength, true)
    + terminalSoftOverlapLength(points, options.softObstacles, options.terminalLegLength, false);
  return overlap * options.terminalLegPenalty;
}

function visibilitySegmentReadabilityCost(
  first: AnalyzerEdgePoint,
  second: AnalyzerEdgePoint,
  options: ResolvedRoutingOptions,
  isFirstSegment: boolean,
  isLastSegment: boolean,
): number {
  const visits = softZoneVisitsForSegment(first, second, options.softObstacles);
  const occlusionCost = visits.length * options.occlusionPenalty;
  const terminalCost = (isFirstSegment ? terminalSoftOverlapLength([first, second], options.softObstacles, options.terminalLegLength, true) : 0)
    + (isLastSegment ? terminalSoftOverlapLength([first, second], options.softObstacles, options.terminalLegLength, false) : 0);
  return occlusionCost + terminalCost * options.terminalLegPenalty;
}

function routeReadabilityPenalty(
  points: readonly AnalyzerEdgePoint[],
  options: ResolvedRoutingOptions,
): number {
  return consecutiveOcclusionCost(points, options) + terminalReadabilityCost(points, options);
}

/**
 * Exposes the soft readability portion of routing for deterministic tests and
 * layout diagnostics. The supplied rectangles are Node bodies; the same
 * keep-out expansion used by the router is applied before scoring them.
 */
export function analyzerEdgeReadabilityCost(
  points: readonly AnalyzerEdgePoint[],
  softObstacles: readonly AnalyzerEdgeObstacle[],
  options: AnalyzerEdgeRoutingOptions = {},
): number {
  const resolved = resolveRoutingOptions(options);
  const inflatedSoftObstacles = softObstacles
    .filter(validObstacle)
    .map((obstacle) => inflateObstacle(obstacle, resolved.softKeepOut));
  const scopedOptions = { ...resolved, softObstacles: inflatedSoftObstacles };
  return routeSoftProximityCost(points, scopedOptions) + routeReadabilityPenalty(points, scopedOptions);
}

function segmentClear(first: AnalyzerEdgePoint, second: AnalyzerEdgePoint, obstacles: readonly InflatedObstacle[]): boolean {
  if (!approximatelyEqual(first.x, second.x) && !approximatelyEqual(first.y, second.y)) return false;
  return !obstacles.some((obstacle) => {
    if (approximatelyEqual(first.y, second.y)) {
      const left = Math.min(first.x, second.x);
      const right = Math.max(first.x, second.x);
      return first.y > obstacle.y + EPSILON
        && first.y < obstacle.bottom - EPSILON
        && left < obstacle.right - EPSILON
        && right > obstacle.x + EPSILON;
    }
    const top = Math.min(first.y, second.y);
    const bottom = Math.max(first.y, second.y);
    return first.x > obstacle.x + EPSILON
      && first.x < obstacle.right - EPSILON
      && top < obstacle.bottom - EPSILON
      && bottom > obstacle.y + EPSILON;
  });
}

function pointClear(point: AnalyzerEdgePoint, obstacles: readonly InflatedObstacle[]): boolean {
  return !obstacles.some((obstacle) => containsPointStrict(obstacle, point));
}

function isEndpointObstacle(obstacle: AnalyzerEdgeObstacle, node: PositionedNode): boolean {
  const center = nodeCenter(node);
  return obstacle.id === node.node.id
    || obstacle.id === `node:${node.node.id}`
    || obstacle.id === `summary-card:${node.node.id}`
    || containsPoint(obstacle, center);
}

function relevantObstacles(
  source: PositionedNode,
  target: PositionedNode,
  obstacles: readonly AnalyzerEdgeObstacle[],
  clearance: number,
): InflatedObstacle[] {
  return obstacles
    .filter(isAnalyzerEdgeObstacleHard)
    .filter(validObstacle)
    .filter((obstacle) => !isEndpointObstacle(obstacle, source) && !isEndpointObstacle(obstacle, target))
    .map((obstacle) => inflateObstacle(obstacle, clearance));
}

function isSoftKeepOutObstacle(obstacle: AnalyzerEdgeObstacle): boolean {
  return obstacle.kind === 'node' || obstacle.kind === 'fact-node' || obstacle.kind === 'summary-card';
}

function relevantSoftObstacles(
  source: PositionedNode,
  target: PositionedNode,
  obstacles: readonly AnalyzerEdgeObstacle[],
  softKeepOut: number,
): InflatedObstacle[] {
  if (softKeepOut <= 0) return [];
  return obstacles
    .filter(isSoftKeepOutObstacle)
    .filter(validObstacle)
    .filter((obstacle) => !isEndpointObstacle(obstacle, source) && !isEndpointObstacle(obstacle, target))
    .map((obstacle) => inflateObstacle(obstacle, softKeepOut));
}

function segmentDirection(first: AnalyzerEdgePoint, second: AnalyzerEdgePoint): Direction | undefined {
  if (approximatelyEqual(first.x, second.x) && approximatelyEqual(first.y, second.y)) return undefined;
  return approximatelyEqual(first.y, second.y) ? 'horizontal' : 'vertical';
}

function segmentsCross(
  firstStart: AnalyzerEdgePoint,
  firstEnd: AnalyzerEdgePoint,
  secondStart: AnalyzerEdgePoint,
  secondEnd: AnalyzerEdgePoint,
): boolean {
  const firstDirection = segmentDirection(firstStart, firstEnd);
  const secondDirection = segmentDirection(secondStart, secondEnd);
  if (!firstDirection || !secondDirection || firstDirection === secondDirection) return false;
  const horizontalStart = firstDirection === 'horizontal' ? firstStart : secondStart;
  const horizontalEnd = firstDirection === 'horizontal' ? firstEnd : secondEnd;
  const verticalStart = firstDirection === 'vertical' ? firstStart : secondStart;
  const verticalEnd = firstDirection === 'vertical' ? firstEnd : secondEnd;
  const horizontalLeft = Math.min(horizontalStart.x, horizontalEnd.x);
  const horizontalRight = Math.max(horizontalStart.x, horizontalEnd.x);
  const verticalTop = Math.min(verticalStart.y, verticalEnd.y);
  const verticalBottom = Math.max(verticalStart.y, verticalEnd.y);
  return verticalStart.x > horizontalLeft + EPSILON
    && verticalStart.x < horizontalRight - EPSILON
    && horizontalStart.y > verticalTop + EPSILON
    && horizontalStart.y < verticalBottom - EPSILON;
}

function routeCrossesExisting(first: AnalyzerEdgePoint, second: AnalyzerEdgePoint, routes: readonly (readonly AnalyzerEdgePoint[])[]): boolean {
  return routes.some((route) => route.slice(1).some((point, index) => segmentsCross(first, second, route[index]!, point)));
}

function routeSegmentPenalty(
  first: AnalyzerEdgePoint,
  second: AnalyzerEdgePoint,
  obstacles: readonly InflatedObstacle[],
  options: ResolvedRoutingOptions,
): number {
  const obstaclePenalty = obstacles.some((obstacle) => segmentIntersectsRect(first, second, obstacle))
    ? options.obstaclePenalty
    : 0;
  const crossingPenalty = routeCrossesExisting(first, second, options.existingRoutes)
    ? options.crossingPenalty
    : 0;
  const softProximityPenalty = options.softObstacles.reduce(
    (penalty, obstacle) => penalty + segmentOverlapLength(first, second, obstacle) * options.softProximityPenalty,
    0,
  );
  return obstaclePenalty + crossingPenalty + softProximityPenalty;
}

function routeCost(
  points: readonly AnalyzerEdgePoint[],
  obstacles: readonly InflatedObstacle[],
  options: ResolvedRoutingOptions,
): number {
  const geometricCost = points.slice(1).reduce((cost, point, index) => {
    const previous = points[index]!;
    const distance = Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
    return cost
      + distance
      + routeSegmentPenalty(previous, point, obstacles, options)
      + (index > 0 ? options.bendPenalty : 0);
  }, 0);
  return geometricCost + routeReadabilityPenalty(points, options);
}

function routeIsClear(points: readonly AnalyzerEdgePoint[], obstacles: readonly InflatedObstacle[]): boolean {
  if (points.length < 2 || points.some((point) => !pointClear(point, obstacles))) return false;
  return points.slice(1).every((point, index) => segmentClear(points[index]!, point, obstacles));
}

function firstRouteObstacle(
  points: readonly AnalyzerEdgePoint[],
  obstacles: readonly InflatedObstacle[],
): InflatedObstacle | undefined {
  if (points.length < 2) return undefined;
  // Reuse the exact same predicates as routeIsClear so this helper only
  // explains an existing validation result; it does not introduce a second
  // collision rule for routing.
  return obstacles.find((obstacle) => !routeIsClear(points, [obstacle]));
}

function fanoutObstacleDiagnostic(
  obstacle: InflatedObstacle | undefined,
  originalObstacles: readonly AnalyzerEdgeObstacle[],
): AnalyzerFanoutObstacleDiagnostic | undefined {
  if (!obstacle) return undefined;
  const original = originalObstacles.find((candidate) => candidate.id === obstacle.id);
  const bounds = original
    ? {
        x: original.x,
        y: original.y,
        width: original.width,
        height: original.height,
      }
    : {
        x: obstacle.x,
        y: obstacle.y,
        width: obstacle.width,
        height: obstacle.height,
      };
  return {
    id: obstacle.id,
    ...(obstacle.kind ? { kind: obstacle.kind } : {}),
    bounds,
    inflatedBounds: {
      x: obstacle.x,
      y: obstacle.y,
      width: obstacle.right - obstacle.x,
      height: obstacle.bottom - obstacle.y,
    },
  };
}

function fanoutRejectReason(
  scope: 'source-entry' | 'trunk' | 'branch',
  obstacle?: InflatedObstacle,
): AnalyzerFanoutCandidateRejectReason {
  if (obstacle?.kind === 'summary-heading') return 'summary-heading-collision';
  if (scope === 'source-entry') return 'source-entry-intersects-obstacle';
  if (scope === 'trunk') return 'trunk-intersects-obstacle';
  return 'branch-intersects-obstacle';
}

function routeWithinBounds(points: readonly AnalyzerEdgePoint[], bounds?: AnalyzerEdgeBounds): boolean {
  if (!bounds) return true;
  return points.every((point) => point.x >= bounds.x - EPSILON
    && point.x <= bounds.x + bounds.width + EPSILON
    && point.y >= bounds.y - EPSILON
    && point.y <= bounds.y + bounds.height + EPSILON);
}

function addCoordinate(values: Set<number>, value: number): void {
  if (Number.isFinite(value)) values.add(value);
}

function buildVisibilityGraph(
  start: AnalyzerEdgePoint,
  end: AnalyzerEdgePoint,
  obstacles: readonly InflatedObstacle[],
  bounds?: AnalyzerEdgeBounds,
  monotonicity?: MonotonicConstraint,
  visibilityObstacles: readonly InflatedObstacle[] = obstacles,
): Map<string, Neighbor[]> | undefined {
  const xCoordinates = new Set<number>();
  const yCoordinates = new Set<number>();
  addCoordinate(xCoordinates, start.x);
  addCoordinate(xCoordinates, end.x);
  addCoordinate(yCoordinates, start.y);
  addCoordinate(yCoordinates, end.y);
  visibilityObstacles.forEach((obstacle) => {
    addCoordinate(xCoordinates, obstacle.x);
    addCoordinate(xCoordinates, obstacle.right);
    addCoordinate(xCoordinates, obstacle.x - FANOUT_CORRIDOR_MARGIN);
    addCoordinate(xCoordinates, obstacle.right + FANOUT_CORRIDOR_MARGIN);
    addCoordinate(yCoordinates, obstacle.y);
    addCoordinate(yCoordinates, obstacle.bottom);
    addCoordinate(yCoordinates, obstacle.y - FANOUT_CORRIDOR_MARGIN);
    addCoordinate(yCoordinates, obstacle.bottom + FANOUT_CORRIDOR_MARGIN);
  });

  if (visibilityObstacles.length > 0) {
    const minimumX = bounds ? bounds.x : Math.min(start.x, end.x, ...visibilityObstacles.map((obstacle) => obstacle.x));
    const maximumX = bounds ? bounds.x + bounds.width : Math.max(start.x, end.x, ...visibilityObstacles.map((obstacle) => obstacle.right));
    const minimumY = bounds ? bounds.y : Math.min(start.y, end.y, ...visibilityObstacles.map((obstacle) => obstacle.y));
    const maximumY = bounds ? bounds.y + bounds.height : Math.max(start.y, end.y, ...visibilityObstacles.map((obstacle) => obstacle.bottom));
    addCoordinate(xCoordinates, bounds ? minimumX : minimumX - VISIBILITY_ESCAPE_MARGIN);
    addCoordinate(xCoordinates, bounds ? maximumX : maximumX + VISIBILITY_ESCAPE_MARGIN);
    addCoordinate(yCoordinates, bounds ? minimumY : minimumY - VISIBILITY_ESCAPE_MARGIN);
    addCoordinate(yCoordinates, bounds ? maximumY : maximumY + VISIBILITY_ESCAPE_MARGIN);
  }

  const xs = [...xCoordinates]
    .filter((x) => !bounds || (x >= bounds.x && x <= bounds.x + bounds.width))
    .sort((first, second) => first - second);
  const ys = [...yCoordinates]
    .filter((y) => !bounds || (y >= bounds.y && y <= bounds.y + bounds.height))
    .sort((first, second) => first - second);
  if (xs.length * ys.length > MAX_GRID_POINTS) return undefined;

  const points = new Map<string, AnalyzerEdgePoint>();
  xs.forEach((x) => ys.forEach((y) => {
    const point = { x, y };
    if (pointClear(point, obstacles)) points.set(pointKey(point), point);
  }));
  if (!pointClear(start, obstacles) || !pointClear(end, obstacles)) return undefined;
  points.set(pointKey(start), start);
  points.set(pointKey(end), end);

  const graph = new Map<string, Neighbor[]>();
  points.forEach((point, key) => graph.set(key, []));
  const connect = (first: AnalyzerEdgePoint, second: AnalyzerEdgePoint): void => {
    if (!segmentClear(first, second, obstacles)) return;
    const direction = segmentDirection(first, second);
    if (!direction) return;
    const distance = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
    if (!monotonicity || segmentRespectsMonotonicity(first, second, monotonicity)) {
      graph.get(pointKey(first))?.push({ point: second, direction, distance });
    }
    if (!monotonicity || segmentRespectsMonotonicity(second, first, monotonicity)) {
      graph.get(pointKey(second))?.push({ point: first, direction, distance });
    }
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
    for (let index = 1; index < sameX.length; index += 1) connect(sameX[index - 1]!, sameX[index]!);
  });
  pointsByY.forEach((sameY) => {
    sameY.sort((first, second) => first.x - second.x);
    for (let index = 1; index < sameY.length; index += 1) connect(sameY[index - 1]!, sameY[index]!);
  });
  return graph;
}

function shortestVisibilityRoute(
  start: AnalyzerEdgePoint,
  end: AnalyzerEdgePoint,
  obstacles: readonly InflatedObstacle[],
  options: ResolvedRoutingOptions,
  monotonicity?: MonotonicConstraint,
): AnalyzerEdgePoint[] | undefined {
  const visibilityObstacles = [...obstacles, ...options.softObstacles];
  const graph = buildVisibilityGraph(start, end, obstacles, options.bounds, monotonicity, visibilityObstacles);
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
    const currentNeighbors = graph.get(current.state.pointKey);
    if (!currentNeighbors) continue;
    const [currentX, currentY] = current.state.pointKey.split(':').map(Number);
    const segmentStart = { x: currentX, y: currentY };
    currentNeighbors.forEach((neighbor) => {
      const nextDirection = neighbor.direction;
      const nextState: RouteState = { pointKey: pointKey(neighbor.point), direction: nextDirection };
      const nextKey = `${nextState.pointKey}|${nextDirection}`;
      const nextCost = current.cost
        + neighbor.distance
        + routeSegmentPenalty(segmentStart, neighbor.point, obstacles, options)
        + visibilitySegmentReadabilityCost(
          segmentStart,
          neighbor.point,
          options,
          current.state.pointKey === startKey,
          pointKey(neighbor.point) === endKey,
        )
        + (current.state.direction && current.state.direction !== nextDirection ? options.bendPenalty : 0);
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

function orthogonalCandidateRoutes(
  start: AnalyzerEdgePoint,
  end: AnalyzerEdgePoint,
  obstacles: readonly InflatedObstacle[],
  monotonicity?: MonotonicConstraint,
  visibilityObstacles: readonly InflatedObstacle[] = obstacles,
): AnalyzerEdgePoint[][] {
  const candidates: AnalyzerEdgePoint[][] = [];
  const add = (points: AnalyzerEdgePoint[]): void => {
    if (points.every((point, index) => index === 0 || Boolean(segmentDirection(points[index - 1]!, point)))
      && (!monotonicity || routeRespectsMonotonicity(points, monotonicity))) candidates.push(points);
  };
  if (approximatelyEqual(start.x, end.x) || approximatelyEqual(start.y, end.y)) add([start, end]);
  else {
    add([start, { x: end.x, y: start.y }, end]);
    add([start, { x: start.x, y: end.y }, end]);
  }

  const xCoordinates = new Set<number>([start.x, end.x]);
  const yCoordinates = new Set<number>([start.y, end.y]);
  visibilityObstacles.forEach((obstacle) => {
    xCoordinates.add(obstacle.x);
    xCoordinates.add(obstacle.right);
    xCoordinates.add(obstacle.x - FANOUT_CORRIDOR_MARGIN);
    xCoordinates.add(obstacle.right + FANOUT_CORRIDOR_MARGIN);
    yCoordinates.add(obstacle.y);
    yCoordinates.add(obstacle.bottom);
    yCoordinates.add(obstacle.y - FANOUT_CORRIDOR_MARGIN);
    yCoordinates.add(obstacle.bottom + FANOUT_CORRIDOR_MARGIN);
  });
  [...xCoordinates].forEach((x) => {
    if (approximatelyEqual(x, start.x) || approximatelyEqual(x, end.x)) return;
    add([start, { x, y: start.y }, { x, y: end.y }, end]);
  });
  [...yCoordinates].forEach((y) => {
    if (approximatelyEqual(y, start.y) || approximatelyEqual(y, end.y)) return;
    add([start, { x: start.x, y }, { x: end.x, y }, end]);
  });
  return candidates;
}

function fallbackRoute(
  start: AnalyzerEdgePoint,
  end: AnalyzerEdgePoint,
  obstacles: readonly InflatedObstacle[],
  options: ResolvedRoutingOptions,
  monotonicity?: MonotonicConstraint,
): AnalyzerEdgePoint[] {
  const visibilityObstacles = [...obstacles, ...options.softObstacles];
  const monotonicCandidates = orthogonalCandidateRoutes(start, end, obstacles, monotonicity, visibilityObstacles);
  const relaxedCandidates = monotonicity ? orthogonalCandidateRoutes(start, end, obstacles, undefined, visibilityObstacles) : [];
  const minimumX = options.bounds ? options.bounds.x : Math.min(start.x, end.x, ...visibilityObstacles.map((obstacle) => obstacle.x)) - VISIBILITY_ESCAPE_MARGIN;
  const maximumX = options.bounds ? options.bounds.x + options.bounds.width : Math.max(start.x, end.x, ...visibilityObstacles.map((obstacle) => obstacle.right)) + VISIBILITY_ESCAPE_MARGIN;
  const minimumY = options.bounds ? options.bounds.y : Math.min(start.y, end.y, ...visibilityObstacles.map((obstacle) => obstacle.y)) - VISIBILITY_ESCAPE_MARGIN;
  const maximumY = options.bounds ? options.bounds.y + options.bounds.height : Math.max(start.y, end.y, ...visibilityObstacles.map((obstacle) => obstacle.bottom)) + VISIBILITY_ESCAPE_MARGIN;
  const escapeCandidates = [
    [start, { x: minimumX, y: start.y }, { x: minimumX, y: end.y }, end],
    [start, { x: maximumX, y: start.y }, { x: maximumX, y: end.y }, end],
    [start, { x: start.x, y: minimumY }, { x: end.x, y: minimumY }, end],
    [start, { x: start.x, y: maximumY }, { x: end.x, y: maximumY }, end],
  ];
  const allCandidates = [...monotonicCandidates, ...relaxedCandidates, ...escapeCandidates];
  const best = (candidates: readonly AnalyzerEdgePoint[][]): AnalyzerEdgePoint[] | undefined => candidates
    .filter((candidate) => routeWithinBounds(candidate, options.bounds) && routeIsClear(candidate, obstacles))
    .sort((first, second) => routeCost(first, obstacles, options) - routeCost(second, obstacles, options))[0];
  return best(monotonicCandidates)
    ?? best(relaxedCandidates)
    ?? best(escapeCandidates)
    ?? allCandidates.find((candidate) => routeWithinBounds(candidate, options.bounds))
    ?? allCandidates[0]
    ?? [start, end];
}

function candidateRoute(
  source: PositionedNode,
  target: PositionedNode,
  obstacles: readonly InflatedObstacle[],
  options: ResolvedRoutingOptions,
): AnalyzerEdgePoint[] {
  const ports = edgePortGeometry(source, target, options.clearance, options.flowDirection);
  const monotonicity = monotonicConstraint(ports.direction);
  const visibilityObstacles = [...obstacles, ...options.softObstacles];
  const usable = (candidate: AnalyzerEdgePoint[]): boolean => routeWithinBounds(candidate, options.bounds) && routeIsClear(candidate, obstacles);
  const best = (candidates: AnalyzerEdgePoint[][]): AnalyzerEdgePoint[] | undefined => candidates
    .filter(usable)
    .sort((first, second) => routeCost(first, obstacles, options) - routeCost(second, obstacles, options))[0];
  const monotonicCandidates = orthogonalCandidateRoutes(ports.start, ports.end, obstacles, monotonicity, visibilityObstacles);
  const monotonicVisibility = shortestVisibilityRoute(ports.start, ports.end, obstacles, options, monotonicity);
  if (monotonicVisibility) monotonicCandidates.push(monotonicVisibility);
  const relaxedCandidates = orthogonalCandidateRoutes(ports.start, ports.end, obstacles, undefined, visibilityObstacles);
  const relaxedVisibility = shortestVisibilityRoute(ports.start, ports.end, obstacles, options);
  if (relaxedVisibility) relaxedCandidates.push(relaxedVisibility);
  const internalRoute = best(monotonicCandidates)
    ?? best(relaxedCandidates)
    ?? fallbackRoute(ports.start, ports.end, obstacles, options, monotonicity);
  const simplificationObstacles = [...obstacles, ...options.softObstacles];
  return simplifyAnalyzerOrthogonalRoute([
    ports.sourceBoundary,
    ...internalRoute,
    ports.targetBoundary,
  ], { obstacles: simplificationObstacles, shortZigzagLength: SHORT_ZIGZAG_LENGTH });
}

function replaceSlice(points: AnalyzerEdgePoint[], index: number, replacement: AnalyzerEdgePoint[]): AnalyzerEdgePoint[] {
  return [...points.slice(0, index), ...replacement, ...points.slice(index + 3)];
}

function validSimplification(points: AnalyzerEdgePoint[], obstacles?: readonly InflatedObstacle[]): boolean {
  return points.every((point, index) => index === 0 || Boolean(segmentDirection(points[index - 1]!, point)))
    && (!obstacles || routeIsClear(points, obstacles));
}

export function simplifyAnalyzerOrthogonalRoute(
  points: readonly AnalyzerEdgePoint[],
  options: AnalyzerRouteSimplificationOptions = {},
): AnalyzerEdgePoint[] {
  let compacted = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .reduce<AnalyzerEdgePoint[]>((result, point) => {
      if (!result.at(-1) || !samePoint(result.at(-1)!, point)) result.push({ x: point.x, y: point.y });
      return result;
    }, []);
  let changed = true;
  while (changed) {
    changed = false;
    const withoutCollinear: AnalyzerEdgePoint[] = [];
    compacted.forEach((point) => {
      const previous = withoutCollinear.at(-1);
      const beforePrevious = withoutCollinear.at(-2);
      if (beforePrevious && previous && (approximatelyEqual(beforePrevious.x, previous.x) && approximatelyEqual(previous.x, point.x)
        || approximatelyEqual(beforePrevious.y, previous.y) && approximatelyEqual(previous.y, point.y))) {
        withoutCollinear[withoutCollinear.length - 1] = point;
        changed = true;
      } else {
        withoutCollinear.push(point);
      }
    });
    compacted = withoutCollinear;
    const threshold = options.shortZigzagLength ?? SHORT_ZIGZAG_LENGTH;
    for (let index = 1; index + 2 < compacted.length; index += 1) {
      const first = compacted[index - 1]!;
      const second = compacted[index]!;
      const third = compacted[index + 1]!;
      const fourth = compacted[index + 2]!;
      const firstDirection = segmentDirection(first, second);
      const middleDirection = segmentDirection(second, third);
      const lastDirection = segmentDirection(third, fourth);
      const middleLength = Math.abs(third.x - second.x) + Math.abs(third.y - second.y);
      if (!firstDirection || !middleDirection || !lastDirection || firstDirection !== lastDirection || firstDirection === middleDirection || middleLength > threshold) continue;
      const replacement = firstDirection === 'horizontal'
        ? [first, { x: fourth.x, y: first.y }, fourth]
        : [first, { x: first.x, y: fourth.y }, fourth];
      if (!validSimplification(replacement, options.obstacles)) continue;
      compacted = replaceSlice(compacted, index, replacement);
      changed = true;
      break;
    }
  }
  return compacted;
}

function labelObstacle(id: string, x: number, y: number, width: number, label: string): AnalyzerEdgeObstacle {
  const estimatedWidth = Math.min(Math.max(48, width - 24), Math.max(48, label.length * 7 + 24));
  return {
    id,
    x: x + 12,
    y: y + 7,
    width: estimatedWidth,
    height: Math.max(22, ANALYZER_STRUCTURAL_HEADING_HEIGHT - 6),
    kind: 'label',
    priority: 4,
  };
}

function summaryHeadingObstacle(id: string, x: number, y: number, width: number): AnalyzerEdgeObstacle {
  return {
    id,
    x: x + 8,
    y: y + 4,
    width: Math.max(24, width - 16),
    height: 30,
    kind: 'summary-heading',
    priority: 3,
  };
}

export function analyzerEdgeObstacles(layout: AnalyzerLayout): AnalyzerEdgeObstacle[] {
  // `layout.nodes` is the same current geometry passed to `nodeStyle` by the
  // graph stage. Rebuilding this list from the current layout keeps selected
  // Evidence Preview and Summary presentation resizes in sync with routing.
  return [
    ...layout.nodes.map((positionedNode) => ({
      id: `node:${positionedNode.node.id}`,
      x: positionedNode.x,
      y: positionedNode.y,
      width: ANALYZER_NODE_WIDTH,
      height: positionedNode.height,
      kind: positionedNode.node.presentation?.role === 'summary' ? 'summary-card' as const : 'node' as const,
      priority: positionedNode.node.presentation?.role === 'summary' ? 2 : 1,
    })),
    ...layout.summaryGroups.map((group) => summaryHeadingObstacle(`summary-heading:${group.id}`, group.x, group.y, group.width)),
    ...layout.bands.map((band) => summaryHeadingObstacle(`band-heading:${band.id}`, band.x, band.y, band.width)),
    ...layout.clusters.map((cluster) => labelObstacle(`cluster-label:${cluster.id}`, cluster.x, cluster.y, cluster.width, cluster.label)),
    ...layout.lanes.map((lane) => labelObstacle(`lane-label:${lane.id}`, lane.x, lane.y, lane.width, lane.label)),
  ];
}

interface FanoutMember {
  edge: AnalyzerRoutableEdge;
  target: PositionedNode;
}

function fanoutTargetGroupBounds(members: readonly FanoutMember[]): FanoutGroupBounds | undefined {
  if (members.length === 0) return undefined;
  return {
    left: Math.min(...members.map(({ target }) => target.x)),
    right: Math.max(...members.map(({ target }) => nodeRight(target))),
    top: Math.min(...members.map(({ target }) => target.y)),
    bottom: Math.max(...members.map(({ target }) => nodeBottom(target))),
  };
}

function fanoutCandidatePriorityCost(priority: FanoutTrunkCandidatePriority): number {
  if (priority === 'group-edge') return 0;
  if (priority === 'source-group') return 1;
  return 2;
}

function fanoutSideGaps(
  source: PositionedNode,
  targetGroupBounds: FanoutGroupBounds,
): Record<AnalyzerFanoutDirection, number> {
  return {
    right: targetGroupBounds.left - nodeRight(source),
    left: source.x - targetGroupBounds.right,
    down: targetGroupBounds.top - nodeBottom(source),
    up: source.y - targetGroupBounds.bottom,
  };
}

function fanoutDirectionAxis(direction: AnalyzerFanoutDirection): 'horizontal' | 'vertical' {
  return direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
}

function fanoutCenterPreferredDirection(
  source: PositionedNode,
  targetGroupBounds: FanoutGroupBounds,
  flowDirection: ResolvedRoutingOptions['flowDirection'],
): AnalyzerFanoutDirection {
  const sourceCenter = nodeCenter(source);
  const targetCenter = {
    x: (targetGroupBounds.left + targetGroupBounds.right) / 2,
    y: (targetGroupBounds.top + targetGroupBounds.bottom) / 2,
  };
  if (flowDirection === 'horizontal') return targetCenter.x >= sourceCenter.x ? 'right' : 'left';
  if (flowDirection === 'vertical') return targetCenter.y >= sourceCenter.y ? 'down' : 'up';
  if (Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y)) {
    return targetCenter.x >= sourceCenter.x ? 'right' : 'left';
  }
  return targetCenter.y >= sourceCenter.y ? 'down' : 'up';
}

function fanoutDirectionSelection(
  source: PositionedNode,
  targetGroupBounds: FanoutGroupBounds,
  flowDirection: ResolvedRoutingOptions['flowDirection'],
): {
  preferredDirection: AnalyzerFanoutDirection;
  directions: AnalyzerFanoutDirection[];
  sideGaps: Record<AnalyzerFanoutDirection, number>;
} {
  const sideGaps = fanoutSideGaps(source, targetGroupBounds);
  const allowedDirections: AnalyzerFanoutDirection[] = flowDirection === 'horizontal'
    ? ['right', 'left']
    : flowDirection === 'vertical'
      ? ['down', 'up']
      : ['right', 'left', 'down', 'up'];
  const stableDirectionOrder: Record<AnalyzerFanoutDirection, number> = { right: 0, left: 1, down: 2, up: 3 };
  const byGap = (first: AnalyzerFanoutDirection, second: AnalyzerFanoutDirection): number => {
    const gapDelta = sideGaps[second] - sideGaps[first];
    if (Math.abs(gapDelta) > EPSILON) return gapDelta;
    return stableDirectionOrder[first] - stableDirectionOrder[second];
  };
  const positiveHorizontal = allowedDirections
    .filter((direction) => sideGaps[direction] > EPSILON && fanoutDirectionAxis(direction) === 'horizontal')
    .sort(byGap);
  const positiveVertical = allowedDirections
    .filter((direction) => sideGaps[direction] > EPSILON && fanoutDirectionAxis(direction) === 'vertical')
    .sort(byGap);
  const positiveDirections = [...positiveHorizontal, ...positiveVertical];
  const preferredDirection = positiveDirections[0]
    ?? fanoutCenterPreferredDirection(source, targetGroupBounds, flowDirection);
  const remainingDirections = allowedDirections
    .filter((direction) => !positiveDirections.includes(direction) && direction !== preferredDirection)
    .sort(byGap);
  return {
    preferredDirection,
    directions: [preferredDirection, ...positiveDirections.filter((direction) => direction !== preferredDirection), ...remainingDirections],
    sideGaps,
  };
}

function fanoutTrunkCandidates(
  ports: readonly EdgePortGeometry[],
  corridorObstacles: readonly InflatedObstacle[] = [],
  targetGroupBounds?: FanoutGroupBounds,
  clearance = DEFAULT_EDGE_CLEARANCE,
): FanoutTrunkCandidate[] {
  const first = ports[0];
  if (!first) return [];
  const collect = (
    values: Array<{ value: number; priority: FanoutTrunkCandidatePriority }>,
    minimum: number,
    maximum: number,
    axis: 'x' | 'y',
  ): FanoutTrunkCandidate[] => {
    const candidates = new Map<number, FanoutTrunkCandidatePriority>();
    values.forEach(({ value, priority }) => {
      if (!Number.isFinite(value) || value <= minimum + 4 || value >= maximum - 4) return;
      const existing = candidates.get(value);
      if (!existing || fanoutCandidatePriorityCost(priority) < fanoutCandidatePriorityCost(existing)) candidates.set(value, priority);
    });
    return [...candidates.entries()].map(([value, priority]) => axis === 'x' ? { x: value, priority } : { y: value, priority });
  };
  const horizontal = first.direction === 'left' || first.direction === 'right';
  if (horizontal) {
    const endXs = ports.map((port) => port.end.x);
    const minimumEnd = Math.min(...endXs);
    const maximumEnd = Math.max(...endXs);
    if (first.direction === 'right') {
      const groupLeft = targetGroupBounds?.left ?? minimumEnd + clearance;
      const corridorEnd = Math.min(minimumEnd, groupLeft - FANOUT_BUS_CLEARANCE);
      return collect([
        { value: groupLeft - FANOUT_BUS_CLEARANCE, priority: 'group-edge' },
        { value: first.start.x + (corridorEnd - first.start.x) / 2, priority: 'source-group' },
        ...corridorObstacles.flatMap((obstacle) => [
          { value: obstacle.x - FANOUT_CORRIDOR_MARGIN, priority: 'internal' as const },
          { value: obstacle.right + FANOUT_CORRIDOR_MARGIN, priority: 'internal' as const },
        ]),
      ], first.start.x, corridorEnd, 'x');
    }
    const groupRight = targetGroupBounds?.right ?? maximumEnd - clearance;
    const corridorStart = Math.max(maximumEnd, groupRight + FANOUT_BUS_CLEARANCE);
    return collect([
      { value: groupRight + FANOUT_BUS_CLEARANCE, priority: 'group-edge' },
      { value: first.start.x - (first.start.x - corridorStart) / 2, priority: 'source-group' },
      ...corridorObstacles.flatMap((obstacle) => [
        { value: obstacle.x - FANOUT_CORRIDOR_MARGIN, priority: 'internal' as const },
        { value: obstacle.right + FANOUT_CORRIDOR_MARGIN, priority: 'internal' as const },
      ]),
    ], corridorStart, first.start.x, 'x');
  }
  const endYs = ports.map((port) => port.end.y);
  const minimumEnd = Math.min(...endYs);
  const maximumEnd = Math.max(...endYs);
  if (first.direction === 'down') {
    const groupTop = targetGroupBounds?.top ?? minimumEnd + clearance;
    const corridorEnd = Math.min(minimumEnd, groupTop - FANOUT_BUS_CLEARANCE);
    return collect([
      { value: groupTop - FANOUT_BUS_CLEARANCE, priority: 'group-edge' },
      { value: first.start.y + (corridorEnd - first.start.y) / 2, priority: 'source-group' },
      ...corridorObstacles.flatMap((obstacle) => [
        { value: obstacle.y - FANOUT_CORRIDOR_MARGIN, priority: 'internal' as const },
        { value: obstacle.bottom + FANOUT_CORRIDOR_MARGIN, priority: 'internal' as const },
      ]),
    ], first.start.y, corridorEnd, 'y');
  }
  const groupBottom = targetGroupBounds?.bottom ?? maximumEnd - clearance;
  const corridorStart = Math.max(maximumEnd, groupBottom + FANOUT_BUS_CLEARANCE);
  return collect([
    { value: groupBottom + FANOUT_BUS_CLEARANCE, priority: 'group-edge' },
    { value: first.start.y - (first.start.y - corridorStart) / 2, priority: 'source-group' },
    ...corridorObstacles.flatMap((obstacle) => [
      { value: obstacle.y - FANOUT_CORRIDOR_MARGIN, priority: 'internal' as const },
      { value: obstacle.bottom + FANOUT_CORRIDOR_MARGIN, priority: 'internal' as const },
    ]),
  ], corridorStart, first.start.y, 'y');
}

function fanoutRouteForDirection(
  source: PositionedNode,
  members: readonly FanoutMember[],
  obstacles: readonly AnalyzerEdgeObstacle[],
  options: ResolvedRoutingOptions,
  targetGroupBounds: FanoutGroupBounds,
  direction: AnalyzerFanoutDirection,
): FanoutDirectionalRouteResult {
  const ports = members.map(({ target }) => edgePortGeometryForDirection(source, target, options.clearance, direction));
  const horizontal = direction === 'left' || direction === 'right';
  const hardObstacleInputs = obstacles
    .filter(isAnalyzerEdgeObstacleHard)
    .filter(validObstacle);
  const softObstacleInputs = obstacles
    .filter(isSoftKeepOutObstacle)
    .filter(validObstacle);
  const sourceExcludedHardObstacleIds = hardObstacleInputs
    .filter((obstacle) => isEndpointObstacle(obstacle, source))
    .map((obstacle) => obstacle.id);
  const sourceExcludedSoftObstacleIds = softObstacleInputs
    .filter((obstacle) => isEndpointObstacle(obstacle, source))
    .map((obstacle) => obstacle.id);
  const hardObstacles = hardObstacleInputs
    .filter((obstacle) => !isEndpointObstacle(obstacle, source))
    .map((obstacle) => inflateObstacle(obstacle, options.clearance));
  const softObstacles = softObstacleInputs
    .filter((obstacle) => !isEndpointObstacle(obstacle, source))
    .map((obstacle) => inflateObstacle(obstacle, options.softKeepOut));
  const candidates = fanoutTrunkCandidates(
    ports,
    [...hardObstacles, ...softObstacles],
    targetGroupBounds,
    options.clearance,
  );
  const relevantByEdgeId = new Map(members.map(({ edge, target }) => [
    edge.id,
    hardObstacles.filter((obstacle) => !isEndpointObstacle(obstacle, target)),
  ]));
  const relevantSoftByEdgeId = new Map(members.map(({ edge, target }) => [
    edge.id,
    softObstacles.filter((obstacle) => !isEndpointObstacle(obstacle, target)),
  ]));
  const excludedObstacleIdsByEdgeId = new Map(members.map(({ edge, target }) => {
    const excludedHardObstacleIds = [
      ...sourceExcludedHardObstacleIds,
      ...hardObstacles.filter((obstacle) => isEndpointObstacle(obstacle, target)).map((obstacle) => obstacle.id),
    ];
    const excludedSoftObstacleIds = [
      ...sourceExcludedSoftObstacleIds,
      ...softObstacles.filter((obstacle) => isEndpointObstacle(obstacle, target)).map((obstacle) => obstacle.id),
    ];
    return [edge.id, {
      excludedHardObstacleIds: [...new Set(excludedHardObstacleIds)],
      excludedSoftObstacleIds: [...new Set(excludedSoftObstacleIds)],
      excludedObstacleIds: [...new Set([...excludedHardObstacleIds, ...excludedSoftObstacleIds])],
    }];
  }));
  const monotonicity = monotonicConstraint(direction);
  const candidateRoutes: Array<{ routes: Map<string, AnalyzerEdgePoint[]>; cost: number; trunk: FanoutTrunkCandidate }> = [];
  const candidateDiagnostics: AnalyzerFanoutCandidateDiagnostic[] = [];
  const candidateCorridor = horizontal
    ? {
        sourceRight: nodeRight(source),
        targetGroupLeft: targetGroupBounds?.left,
        availableWidth: targetGroupBounds
          ? direction === 'right'
            ? targetGroupBounds.left - nodeRight(source)
            : source.x - targetGroupBounds.right
          : undefined,
      }
    : {
        sourceBottom: nodeBottom(source),
        targetGroupTop: targetGroupBounds?.top,
        availableHeight: targetGroupBounds
          ? direction === 'down'
            ? targetGroupBounds.top - nodeBottom(source)
            : source.y - targetGroupBounds.bottom
          : undefined,
      };
  candidates.forEach((trunk) => {
    const trunkCoordinate = horizontal ? trunk.x : trunk.y;
    const trunkRunsInsideTargetGroup = targetGroupBounds
      ? horizontal
        ? trunkCoordinate !== undefined &&
          trunkCoordinate > targetGroupBounds.left + EPSILON &&
          trunkCoordinate < targetGroupBounds.right - EPSILON
        : trunkCoordinate !== undefined &&
          trunkCoordinate > targetGroupBounds.top + EPSILON &&
          trunkCoordinate < targetGroupBounds.bottom - EPSILON
      : false;
    const routes = new Map<string, AnalyzerEdgePoint[]>();
    const trunkSpreadStart = Math.min(ports[0]!.start[horizontal ? 'y' : 'x'], ...ports.map((port) => port.end[horizontal ? 'y' : 'x']));
    const trunkSpreadEnd = Math.max(ports[0]!.start[horizontal ? 'y' : 'x'], ...ports.map((port) => port.end[horizontal ? 'y' : 'x']));
    const sharedTrunk = horizontal
      ? [
          ports[0]!.sourceBoundary,
          ports[0]!.start,
          { x: trunk.x!, y: ports[0]!.start.y },
          { x: trunk.x!, y: trunkSpreadStart },
          { x: trunk.x!, y: trunkSpreadEnd },
        ]
      : [
          ports[0]!.sourceBoundary,
          ports[0]!.start,
          { x: ports[0]!.start.x, y: trunk.y! },
          { x: trunkSpreadStart, y: trunk.y! },
          { x: trunkSpreadEnd, y: trunk.y! },
        ];
    const sourceEntryPoints = [ports[0]!.sourceBoundary, ports[0]!.start];
    const sourceEntryObstacle = firstRouteObstacle(sourceEntryPoints, hardObstacles);
    const trunkObstacle = firstRouteObstacle(sharedTrunk, hardObstacles);
    const trunkReason = trunkRunsInsideTargetGroup
      ? 'outside-valid-corridor' as const
      : trunkObstacle
        ? fanoutRejectReason('trunk', trunkObstacle)
        : undefined;
    const sourceEntryRejectedObstacle = fanoutObstacleDiagnostic(sourceEntryObstacle, obstacles);
    const trunkRejectedObstacle = fanoutObstacleDiagnostic(trunkObstacle, obstacles);
    const sourceEntryExclusions = [...new Set([...sourceExcludedHardObstacleIds, ...sourceExcludedSoftObstacleIds])];
    const trunkExclusions = sourceEntryExclusions;
    const candidateDiagnosticBase: AnalyzerFanoutCandidateDiagnostic = {
      direction,
      ...(trunk.x !== undefined ? { candidateX: trunk.x, busX: trunk.x } : {}),
      ...(trunk.y !== undefined ? { candidateY: trunk.y, busY: trunk.y } : {}),
      status: 'rejected',
      sourceEntry: {
        valid: !sourceEntryObstacle,
        ...(sourceEntryObstacle ? { reason: fanoutRejectReason('source-entry', sourceEntryObstacle) } : {}),
        pathPoints: sourceEntryPoints,
        ...(sourceEntryRejectedObstacle ? {
          rejectedByObstacleId: sourceEntryRejectedObstacle.id,
          rejectedByObstacleKind: sourceEntryRejectedObstacle.kind,
          rejectedByObstacleBounds: sourceEntryRejectedObstacle.bounds,
          rejectedByObstacle: sourceEntryRejectedObstacle,
        } : {}),
        excludedObstacleIds: sourceEntryExclusions,
      },
      trunk: {
        valid: !trunkRunsInsideTargetGroup && !trunkObstacle,
        ...(trunkReason ? { reason: trunkReason } : {}),
        pathPoints: sharedTrunk,
        ...(trunkRejectedObstacle ? {
          rejectedByObstacleId: trunkRejectedObstacle.id,
          rejectedByObstacleKind: trunkRejectedObstacle.kind,
          rejectedByObstacleBounds: trunkRejectedObstacle.bounds,
          rejectedByObstacle: trunkRejectedObstacle,
        } : {}),
        excludedObstacleIds: trunkExclusions,
      },
      branches: [],
      clearance: options.clearance,
      ...(horizontal ? candidateCorridor : {}),
      ...(!horizontal ? candidateCorridor : {}),
    };
    let valid = !trunkRunsInsideTargetGroup;
    let cost = 0;
    if (!routeIsClear(sharedTrunk, hardObstacles)) valid = false;
    const trunkOptions = { ...options, softObstacles };
    cost += routeSoftProximityCost(sharedTrunk, trunkOptions) + routeReadabilityPenalty(sharedTrunk, trunkOptions);
    cost += fanoutCandidatePriorityCost(trunk.priority) * FANOUT_CORRIDOR_PRIORITY_PENALTY;
    ports.forEach((port, index) => {
      const member = members[index]!;
      const route = horizontal
        ? [port.sourceBoundary, port.start, { x: trunk.x!, y: port.start.y }, { x: trunk.x!, y: port.end.y }, port.end, port.targetBoundary]
        : [port.sourceBoundary, port.start, { x: port.start.x, y: trunk.y! }, { x: port.end.x, y: trunk.y! }, port.end, port.targetBoundary];
      const relevant = relevantByEdgeId.get(member.edge.id) ?? [];
      const relevantSoft = relevantSoftByEdgeId.get(member.edge.id) ?? [];
      const memberOptions = { ...options, softObstacles: relevantSoft };
      const routeOutsideBounds = !routeWithinBounds(route, options.bounds);
      const routeMonotonicityViolation = !routeRespectsMonotonicity(route, monotonicity);
      const routeClear = routeIsClear(route, relevant);
      const routeObstacle = firstRouteObstacle(route, relevant);
      if (routeOutsideBounds || routeMonotonicityViolation || !routeClear) valid = false;
      const compacted = simplifyAnalyzerOrthogonalRoute(route, {
        obstacles: [...relevant, ...relevantSoft],
        shortZigzagLength: SHORT_ZIGZAG_LENGTH,
      });
      const compactedMonotonicityViolation = !routeRespectsMonotonicity(compacted, monotonicity);
      if (compactedMonotonicityViolation) valid = false;
      routes.set(member.edge.id, compacted);
      cost += routeCost(compacted, relevant, memberOptions);
      const exclusion = excludedObstacleIdsByEdgeId.get(member.edge.id) ?? {
        excludedObstacleIds: [],
        excludedHardObstacleIds: [],
        excludedSoftObstacleIds: [],
      };
      const rejectedObstacle = fanoutObstacleDiagnostic(routeObstacle, obstacles);
      const branchReason = routeObstacle
        ? fanoutRejectReason('branch', routeObstacle)
        : routeOutsideBounds
          ? 'outside-valid-corridor' as const
          : routeMonotonicityViolation || compactedMonotonicityViolation
            ? 'monotonicity-violation' as const
            : !routeClear
              ? 'candidate-invalid' as const
            : undefined;
      const branchPoints = horizontal
        ? [{ x: trunk.x!, y: port.end.y }, port.end, port.targetBoundary]
        : [{ x: port.end.x, y: trunk.y! }, port.end, port.targetBoundary];
      candidateDiagnosticBase.branches.push({
        edgeId: member.edge.id,
        targetId: member.target.node.id,
        targetLabel: member.target.node.label,
        valid: !routeOutsideBounds && !routeMonotonicityViolation && routeClear && !compactedMonotonicityViolation,
        ...(branchReason ? { reason: branchReason } : {}),
        branchPoints,
        pathPoints: compacted,
        ...(rejectedObstacle ? {
          rejectedByObstacleId: rejectedObstacle.id,
          rejectedByObstacleKind: rejectedObstacle.kind,
          rejectedByObstacleBounds: rejectedObstacle.bounds,
          rejectedByObstacle: rejectedObstacle,
        } : {}),
        excludedObstacleIds: exclusion.excludedObstacleIds,
        excludedHardObstacleIds: exclusion.excludedHardObstacleIds,
        excludedSoftObstacleIds: exclusion.excludedSoftObstacleIds,
      });
    });
    const rejectedBranch = candidateDiagnosticBase.branches.find((branch) => !branch.valid);
    const finalReason = valid
      ? undefined
      : trunkRunsInsideTargetGroup
        ? 'outside-valid-corridor' as const
        : sourceEntryObstacle
          ? fanoutRejectReason('source-entry', sourceEntryObstacle)
          : trunkObstacle
            ? fanoutRejectReason('trunk', trunkObstacle)
            : rejectedBranch?.reason ?? 'candidate-invalid';
    candidateDiagnostics.push({
      ...candidateDiagnosticBase,
      status: valid ? 'accepted' : 'rejected',
      ...(finalReason ? { finalReason } : {}),
    });
    if (valid) candidateRoutes.push({ routes, cost, trunk });
  });
  const selected = candidateRoutes.sort((first, second) => first.cost - second.cost)[0];
  if (!selected) {
    return {
      busCandidateCount: candidates.length,
      validCandidateCount: 0,
      candidateDiagnostics,
    };
  }
  return {
    routes: selected.routes,
    busCandidateCount: candidates.length,
    validCandidateCount: candidateRoutes.length,
    candidateDiagnostics,
    selectedBus: selected.trunk,
  };
}

function fanoutRoute(
  source: PositionedNode,
  members: readonly FanoutMember[],
  obstacles: readonly AnalyzerEdgeObstacle[],
  options: ResolvedRoutingOptions,
): FanoutRouteResult | undefined {
  if (members.length < 2) return undefined;
  const targetGroupBounds = fanoutTargetGroupBounds(members);
  if (!targetGroupBounds) return undefined;
  const selection = fanoutDirectionSelection(source, targetGroupBounds, options.flowDirection);
  const directionDiagnostics: AnalyzerFanoutDirectionDiagnostic[] = [];
  const candidateDiagnostics: AnalyzerFanoutCandidateDiagnostic[] = [];
  let busCandidateCount = 0;
  let selected: { direction: AnalyzerFanoutDirection; result: FanoutDirectionalRouteResult } | undefined;

  selection.directions.forEach((direction) => {
    const result = fanoutRouteForDirection(source, members, obstacles, options, targetGroupBounds, direction);
    busCandidateCount += result.busCandidateCount;
    candidateDiagnostics.push(...result.candidateDiagnostics);
    directionDiagnostics.push({
      direction,
      sideGap: selection.sideGaps[direction],
      candidateCount: result.busCandidateCount,
      validCandidateCount: result.validCandidateCount,
    });
    if (!selected && result.routes) selected = { direction, result };
  });

  if (!selected) {
    return {
      busCandidateCount,
      candidateDiagnostics,
      evaluatedDirections: selection.directions,
      directionDiagnostics,
      preferredDirection: selection.preferredDirection,
      fallbackReason: busCandidateCount === 0 ? 'no-bus-candidates' : 'no-valid-bus-route',
    };
  }
  return {
    routes: selected.result.routes,
    busCandidateCount,
    candidateDiagnostics,
    evaluatedDirections: selection.directions,
    directionDiagnostics,
    preferredDirection: selection.preferredDirection,
    selectedDirection: selected.direction,
    selectedBus: selected.result.selectedBus,
  };
}

function fanoutTargetGroupKey(target: PositionedNode): string {
  if (target.node.presentation?.role === 'summary') return `summary:${target.node.id}`;
  if (target.node.presentation?.parentId) return `presentation:${target.node.presentation.parentId}`;
  return `cluster:${target.node.clusterId ?? target.node.type}`;
}

function canUseFanout(edge: AnalyzerRoutableEdge): boolean {
  // Bundle edges represent a presentation aggregate, not a sibling set of
  // Fact Relations. Keeping them out of Fact fan-out prevents a summary path
  // from visually implying a relation between its member Nodes.
  return edge.presentation?.displayKind !== 'bundle';
}

export function analyzerEdgeRoute(
  source: PositionedNode,
  target: PositionedNode,
  obstacles: readonly AnalyzerEdgeObstacle[] = [],
  options: AnalyzerEdgeRoutingOptions = {},
): AnalyzerEdgePoint[] | undefined {
  const resolved = resolveRoutingOptions(options);
  const relevant = relevantObstacles(source, target, obstacles, resolved.clearance);
  const softObstacles = relevantSoftObstacles(source, target, obstacles, resolved.softKeepOut);
  return candidateRoute(source, target, relevant, { ...resolved, softObstacles });
}

export function analyzerEdgeRoutes(
  edges: readonly AnalyzerRoutableEdge[],
  positionedById: ReadonlyMap<string, PositionedNode>,
  obstacles: readonly AnalyzerEdgeObstacle[] = [],
  options: AnalyzerEdgeRoutingOptions = {},
): Map<string, AnalyzerEdgePoint[]> {
  const resolved = resolveRoutingOptions(options);
  const routes = new Map<string, AnalyzerEdgePoint[]>();
  const grouped = new Map<string, FanoutMember[]>();
  const fanoutDiagnosticsByEdgeId = new Map<string, AnalyzerFanoutRoutingDiagnostic>();
  if (resolved.enableFanout) {
    edges.forEach((edge) => {
      if (!canUseFanout(edge) || edge.sourceId === edge.targetId) return;
      const source = positionedById.get(edge.sourceId);
      const target = positionedById.get(edge.targetId);
      if (!source || !target) return;
      const targetGroupKey = fanoutTargetGroupKey(target);
      const key = [
        edge.sourceId,
        edge.kind ?? 'unknown',
        targetGroupKey,
      ].join('\u0000');
      const group = grouped.get(key) ?? [];
      group.push({ edge, target });
      grouped.set(key, group);
    });
    grouped.forEach((group) => {
      if (group.length < 2) return;
      const source = positionedById.get(group[0]!.edge.sourceId);
      if (!source) return;
      const targetGroupBounds = fanoutTargetGroupBounds(group);
      if (!targetGroupBounds) return;
      const fanout = fanoutRoute(source, group, obstacles, resolved);
      const fanoutGroupDirection = fanout?.selectedDirection
        ?? fanout?.preferredDirection
        ?? fanoutDirectionSelection(source, targetGroupBounds, resolved.flowDirection).preferredDirection;
      const fanoutGroupId = `fanout:${source.node.id}:${fanoutGroupDirection}:${group[0]!.edge.kind ?? 'unknown'}:${fanoutTargetGroupKey(group[0]!.target)}`;
      const fanoutDiagnostic: AnalyzerFanoutRoutingDiagnostic = {
        fanoutGroupId,
        sourceId: source.node.id,
        edgeIds: group.map(({ edge }) => edge.id),
        targetIds: group.map(({ edge }) => edge.targetId),
        fanoutDetected: true,
        busCandidateCount: fanout?.busCandidateCount ?? 0,
        candidateDiagnostics: fanout?.candidateDiagnostics ?? [],
        evaluatedDirections: fanout?.evaluatedDirections ?? [],
        directionDiagnostics: fanout?.directionDiagnostics ?? [],
        ...(fanout?.preferredDirection ? { preferredDirection: fanout.preferredDirection } : {}),
        ...(fanout?.selectedDirection ? { selectedDirection: fanout.selectedDirection } : {}),
        targetGroupBounds: {
          x: targetGroupBounds.left,
          y: targetGroupBounds.top,
          width: targetGroupBounds.right - targetGroupBounds.left,
          height: targetGroupBounds.bottom - targetGroupBounds.top,
        },
        ...(fanout?.selectedBus?.x !== undefined ? { selectedBusX: fanout.selectedBus.x } : {}),
        ...(fanout?.selectedBus?.y !== undefined ? { selectedBusY: fanout.selectedBus.y } : {}),
        fallbackUsed: !fanout?.routes,
        ...(fanout?.fallbackReason ? { fallbackReason: fanout.fallbackReason } : {}),
      };
      resolved.onFanoutDiagnostic?.(fanoutDiagnostic);
      group.forEach(({ edge }) => fanoutDiagnosticsByEdgeId.set(edge.id, fanoutDiagnostic));
      const fanoutRoutes = fanout?.routes;
      if (!fanoutRoutes) return;
      group.forEach(({ edge }) => {
        const route = fanoutRoutes.get(edge.id);
        if (route) routes.set(edge.id, route);
      });
    });
  }

  edges.forEach((edge) => {
    if (routes.has(edge.id)) return;
    const source = positionedById.get(edge.sourceId);
    const target = positionedById.get(edge.targetId);
    if (!source || !target) return;
    const route = analyzerEdgeRoute(source, target, obstacles, {
      ...options,
      existingRoutes: [...resolved.existingRoutes, ...routes.values()],
    });
    if (route) routes.set(edge.id, route);
  });
  if (resolved.onEdgeDiagnostic) {
    edges.forEach((edge) => {
      const fanoutDiagnostic = fanoutDiagnosticsByEdgeId.get(edge.id);
      resolved.onEdgeDiagnostic?.({
        edgeId: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        edgeKind: edge.kind,
        presentation: edge.presentation,
        routingStrategy: fanoutDiagnostic
          ? fanoutDiagnostic.fallbackUsed ? 'generic-fallback' : 'structural-fanout'
          : 'generic',
        ...(fanoutDiagnostic?.fanoutGroupId ? { fanoutGroupId: fanoutDiagnostic.fanoutGroupId } : {}),
        fanoutDetected: Boolean(fanoutDiagnostic),
        busUsed: Boolean(fanoutDiagnostic && !fanoutDiagnostic.fallbackUsed),
        busCandidateCount: fanoutDiagnostic?.busCandidateCount ?? 0,
        ...(fanoutDiagnostic?.selectedBusX !== undefined ? { selectedBusX: fanoutDiagnostic.selectedBusX } : {}),
        ...(fanoutDiagnostic?.selectedBusY !== undefined ? { selectedBusY: fanoutDiagnostic.selectedBusY } : {}),
        ...(fanoutDiagnostic?.targetGroupBounds ? { targetGroupBounds: fanoutDiagnostic.targetGroupBounds } : {}),
        ...(fanoutDiagnostic?.candidateDiagnostics ? { candidateDiagnostics: fanoutDiagnostic.candidateDiagnostics } : {}),
        ...(fanoutDiagnostic?.directionDiagnostics ? { directionDiagnostics: fanoutDiagnostic.directionDiagnostics } : {}),
        ...(fanoutDiagnostic?.evaluatedDirections ? { evaluatedDirections: fanoutDiagnostic.evaluatedDirections } : {}),
        ...(fanoutDiagnostic?.preferredDirection ? { preferredDirection: fanoutDiagnostic.preferredDirection } : {}),
        ...(fanoutDiagnostic?.selectedDirection ? { selectedDirection: fanoutDiagnostic.selectedDirection } : {}),
        fallbackUsed: fanoutDiagnostic?.fallbackUsed ?? false,
        ...(fanoutDiagnostic?.fallbackReason ? { fallbackReason: fanoutDiagnostic.fallbackReason } : {}),
        pathPoints: routes.get(edge.id)?.map(({ x, y }) => ({ x, y })) ?? [],
      });
    });
  }
  return routes;
}

export function analyzerRoundedOrthogonalPath(
  points: readonly AnalyzerEdgePoint[],
  radius = DEFAULT_CORNER_RADIUS,
): string {
  // Routing already simplified with its obstacle set. Drawing must not
  // collapse a short detour again without those obstacles in scope.
  const compacted = simplifyAnalyzerOrthogonalRoute(points, { shortZigzagLength: 0 });
  if (compacted.length === 0) return '';
  const format = (value: number): string => String(Number(value.toFixed(3)));
  const path: string[] = [`M ${format(compacted[0]!.x)} ${format(compacted[0]!.y)}`];
  const safeRadius = Math.max(0, Number.isFinite(radius) ? radius : DEFAULT_CORNER_RADIUS);
  for (let index = 1; index < compacted.length; index += 1) {
    const point = compacted[index]!;
    const previous = compacted[index - 1]!;
    const next = compacted[index + 1];
    if (!next) {
      path.push(`L ${format(point.x)} ${format(point.y)}`);
      continue;
    }
    const incomingLength = Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
    const outgoingLength = Math.abs(next.x - point.x) + Math.abs(next.y - point.y);
    const cornerRadius = Math.min(safeRadius, incomingLength / 2, outgoingLength / 2);
    if (cornerRadius <= EPSILON) {
      path.push(`L ${format(point.x)} ${format(point.y)}`);
      continue;
    }
    const before = {
      x: point.x + Math.sign(previous.x - point.x) * cornerRadius,
      y: point.y + Math.sign(previous.y - point.y) * cornerRadius,
    };
    const after = {
      x: point.x + Math.sign(next.x - point.x) * cornerRadius,
      y: point.y + Math.sign(next.y - point.y) * cornerRadius,
    };
    path.push(`L ${format(before.x)} ${format(before.y)} Q ${format(point.x)} ${format(point.y)} ${format(after.x)} ${format(after.y)}`);
  }
  return path.join(' ');
}

function quadraticPoint(first: AnalyzerEdgePoint, control: AnalyzerEdgePoint, second: AnalyzerEdgePoint, progress: number): AnalyzerEdgePoint {
  const inverse = 1 - progress;
  return {
    x: inverse ** 2 * first.x + 2 * inverse * progress * control.x + progress ** 2 * second.x,
    y: inverse ** 2 * first.y + 2 * inverse * progress * control.y + progress ** 2 * second.y,
  };
}

function roundedPathPolyline(points: readonly AnalyzerEdgePoint[], radius: number): AnalyzerEdgePoint[] {
  const compacted = simplifyAnalyzerOrthogonalRoute(points, { shortZigzagLength: 0 });
  if (compacted.length === 0) return [];
  const sampled: AnalyzerEdgePoint[] = [compacted[0]!];
  const safeRadius = Math.max(0, Number.isFinite(radius) ? radius : DEFAULT_CORNER_RADIUS);
  for (let index = 1; index < compacted.length; index += 1) {
    const point = compacted[index]!;
    const previous = compacted[index - 1]!;
    const next = compacted[index + 1];
    if (!next) {
      sampled.push(point);
      continue;
    }
    const incomingLength = Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
    const outgoingLength = Math.abs(next.x - point.x) + Math.abs(next.y - point.y);
    const cornerRadius = Math.min(safeRadius, incomingLength / 2, outgoingLength / 2);
    if (cornerRadius <= EPSILON) {
      sampled.push(point);
      continue;
    }
    const before = {
      x: point.x + Math.sign(previous.x - point.x) * cornerRadius,
      y: point.y + Math.sign(previous.y - point.y) * cornerRadius,
    };
    const after = {
      x: point.x + Math.sign(next.x - point.x) * cornerRadius,
      y: point.y + Math.sign(next.y - point.y) * cornerRadius,
    };
    sampled.push(before);
    for (let step = 1; step <= 16; step += 1) sampled.push(quadraticPoint(before, point, after, step / 16));
  }
  return sampled;
}

export function analyzerEdgePath(
  source: PositionedNode,
  target: PositionedNode,
  obstacles: readonly AnalyzerEdgeObstacle[] = [],
  options: AnalyzerEdgeRoutingOptions = {},
): string {
  const route = analyzerEdgeRoute(source, target, obstacles, options);
  if (!route || route.length < 2) return '';
  const resolved = resolveRoutingOptions(options);
  return analyzerRoundedOrthogonalPath(route, Math.min(resolved.cornerRadius, resolved.clearance));
}

export function analyzerEdgePaths(
  edges: readonly AnalyzerRoutableEdge[],
  positionedById: ReadonlyMap<string, PositionedNode>,
  obstacles: readonly AnalyzerEdgeObstacle[] = [],
  options: AnalyzerEdgeRoutingOptions = {},
): Map<string, string> {
  const routes = analyzerEdgeRoutes(edges, positionedById, obstacles, options);
  const resolved = resolveRoutingOptions(options);
  return new Map([...routes.entries()].map(([id, route]) => [id, analyzerRoundedOrthogonalPath(route, Math.min(resolved.cornerRadius, resolved.clearance))]));
}

export function analyzerEdgePathIntersectsObstacle(
  source: PositionedNode,
  target: PositionedNode,
  obstacle: AnalyzerEdgeObstacle,
  clearance = DEFAULT_EDGE_CLEARANCE,
): boolean {
  const options = resolveRoutingOptions({ clearance });
  const route = analyzerEdgeRoute(source, target, [obstacle], { clearance });
  const rounded = roundedPathPolyline(route ?? [], Math.min(options.cornerRadius, options.clearance));
  return analyzerEdgeRouteIntersectsObstacle(rounded, obstacle);
}

export function analyzerEdgeRouteIntersectsObstacle(
  route: readonly AnalyzerEdgePoint[],
  obstacle: AnalyzerEdgeObstacle,
  clearance = 0,
): boolean {
  if (!validObstacle(obstacle) || route.length < 2) return false;
  const inflated = inflateObstacle(obstacle, clearance);
  return route.slice(1).some((point, index) => segmentIntersectsRect(route[index]!, point, inflated));
}
