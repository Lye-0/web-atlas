/** Display-only aggregation. None of these records is a canonical graph entity. */
export interface AggregationPosition { x: number; y: number; z: number }
export interface AggregationGroupIdentity { id: string; label: string; minimumMembers?: number; level?: number; maximumProjectedSpan?: number }
export interface AggregationPoint extends AggregationPosition {
  id: string;
  group?: AggregationGroupIdentity;
  parentGroups?: readonly AggregationGroupIdentity[];
  category?: string;
}
export interface AggregationGroup extends AggregationPosition {
  id: string; label: string; memberIds: readonly string[]; minimumMembers: number;
  level?: number; maximumProjectedSpan?: number;
}
export interface AggregationProjection {
  /** Column-major world-to-clip matrix. Omitted by adapters with a fixed planar projection. */
  matrix?: readonly number[];
  width: number; height: number; zoom: number;
}
export interface DisplayAggregation extends AggregationPosition {
  id: string; groupId: string; label: string; memberIds: string[]; matchingCount: number;
  mode: 'automatic' | 'manual';
  breakdown?: Record<string, number>;
}

/** Short visible membership names; full labels remain available in inspection. */
export function shortAggregationLabels(groups: readonly { id: string; label: string }[]): ReadonlyMap<string, string> {
  const heads = groups.map(group => { const parts = group.label.replaceAll('\\', '/').split(' · '); return { id: group.id, head: parts[0]!, source: parts[1]?.includes('/') ? parts[1] : undefined }; });
  const paths = new Set(heads.flatMap(group => [group.head, ...group.source ? [group.source] : []]));
  const sourcePaths = new Map<string, Set<string>>();
  for (const group of heads) if (group.source) { const values = sourcePaths.get(group.head) ?? new Set(); values.add(group.source); sourcePaths.set(group.head, values); }
  const suffixes = new Map<string, number>();
  for (const path of paths) {
    const parts = path.split('/');
    for (let n = 1; n <= parts.length; n++) { const suffix = parts.slice(-n).join('/'); suffixes.set(suffix, (suffixes.get(suffix) ?? 0) + 1); }
  }
  const shorten = (path: string) => {
    const parts = path.split('/'); let short = path;
    for (let n = 1; n <= parts.length; n++) { const suffix = parts.slice(-n).join('/'); if (suffixes.get(suffix) === 1) { short = suffix; break; } }
    return short;
  };
  return new Map(heads.map(group => {
    const short = `${shorten(group.head)}${group.source && (sourcePaths.get(group.head)?.size ?? 0) > 1 ? ` · ${shorten(group.source)}` : ''}`;
    return [group.id, short.length > 48 ? `${short.slice(0, 45)}…` : short];
  }));
}
export interface AggregationCounts {
  scope: number; individual: number; automaticMembers: number; automaticGroups: number;
  manualMembers: number; manualGroups: number; representations: number;
}
export interface AutoAggregationResult {
  individualIds: ReadonlySet<string>;
  /** Total, disjoint mapping of the input scope. Filtered-out IDs are never restored. */
  ownerById: ReadonlyMap<string, string>;
  aggregates: DisplayAggregation[];
  activeGroupIds: ReadonlySet<string>;
  metrics: ReadonlyMap<string, { spacing: number; width: number; height: number; members: number; crowdedFraction: number }>;
  counts: AggregationCounts;
}

/** Keep renderer assets stable when a new camera sample changes only density metrics. */
export function stableAggregationRepresentation(next: AutoAggregationResult, previous?: AutoAggregationResult): AutoAggregationResult {
  if (next === previous || previous && next.ownerById === previous.ownerById && next.individualIds === previous.individualIds && next.aggregates === previous.aggregates) return next;
  if (!previous || previous.ownerById.size !== next.ownerById.size || previous.aggregates.length !== next.aggregates.length) return next;
  for (const [id, owner] of next.ownerById) if (previous.ownerById.get(id) !== owner) return next;
  let sameContent = true;
  for (let index = 0; index < next.aggregates.length; index++) {
    const current = next.aggregates[index]!, old = previous.aggregates[index]!;
    if (current.id !== old.id || current.label !== old.label || current.matchingCount !== old.matchingCount || current.x !== old.x || current.y !== old.y || current.z !== old.z
      || JSON.stringify(current.breakdown) !== JSON.stringify(old.breakdown)) { sameContent = false; break; }
  }
  return { ...next, ownerById: previous.ownerById, individualIds: previous.individualIds, aggregates: sameContent ? previous.aggregates : next.aggregates, counts: previous.counts };
}

const displayId = (group: string, canonical: ReadonlySet<string>) => {
  let id = `atlas-display:group:${group}`;
  while (canonical.has(id)) id += ':display';
  return id;
};

/** Stable membership and centroid are computed once from the original world positions. */
export function buildAggregationGroups(points: readonly AggregationPoint[]): AggregationGroup[] {
  const groups = new Map<string, AggregationGroup & { memberIds: string[] }>();
  for (const point of points) {
    for (const identity of [...point.group ? [point.group] : [], ...point.parentGroups ?? []]) {
      let group = groups.get(identity.id);
      if (!group) {
        group = { id: identity.id, label: identity.label, minimumMembers: identity.minimumMembers ?? 8, level: identity.level ?? 0, maximumProjectedSpan: identity.maximumProjectedSpan, memberIds: [], x: 0, y: 0, z: 0 };
        groups.set(group.id, group);
      }
      group.memberIds.push(point.id); group.x += point.x; group.y += point.y; group.z += point.z;
    }
  }
  return [...groups.values()].map(group => ({ ...group, memberIds: group.memberIds.sort(), x: group.x / group.memberIds.length, y: group.y / group.memberIds.length, z: group.z / group.memberIds.length }))
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
}

export function projectAggregationPoint(point: AggregationPosition, projection: AggregationProjection): { x: number; y: number } {
  const m = projection.matrix;
  if (!m || m.length !== 16) return { x: point.x * projection.zoom, y: point.y * projection.zoom };
  const w = m[3]! * point.x + m[7]! * point.y + m[11]! * point.z + m[15]!;
  const divide = Math.abs(w) < 1e-12 ? 1e-12 : w;
  return { x: (m[0]! * point.x + m[4]! * point.y + m[8]! * point.z + m[12]!) / divide * projection.width / 2,
    y: (m[1]! * point.x + m[5]! * point.y + m[9]! * point.z + m[13]!) / divide * projection.height / 2 };
}

type DensityMetrics = AutoAggregationResult['metrics'];
interface AggregationSample {
  enabled: boolean; metrics: DensityMetrics; protectedIds: ReadonlySet<string>; expandedGroupIds: ReadonlySet<string>;
  manualGroups: readonly AggregationGroup[]; matchIds: ReadonlySet<string>; previousActiveGroupIds: ReadonlySet<string>;
  result: AutoAggregationResult;
}
const equalIds = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a === b || a.size === b.size && [...a].every(id => b.has(id));

interface IndexedAggregationGroup { group: AggregationGroup; indices: number[]; displayId: string }
function aggregationDensity(points: readonly AggregationPoint[], groups: readonly IndexedAggregationGroup[], projection: AggregationProjection,
  screenX: Float64Array, screenY: Float64Array, crowded: Uint8Array): DensityMetrics {
  const metrics = new Map<string, { spacing: number; width: number; height: number; members: number; crowdedFraction: number }>();
  const cells = new Map<number, Map<number, number[]>>();
  crowded.fill(0);
  for (let index = 0; index < points.length; index++) {
    const projected = projectAggregationPoint(points[index]!, projection);
    screenX[index] = projected.x; screenY[index] = projected.y;
    const x = Math.floor(projected.x / 12), y = Math.floor(projected.y / 12);
    let column = cells.get(x); if (!column) { column = new Map(); cells.set(x, column); }
    let cell = column.get(y); if (!cell) { cell = []; column.set(y, cell); }
    cell.push(index);
  }
  for (let index = 0; index < points.length; index++) {
    const px = screenX[index]!, py = screenY[index]!, x = Math.floor(px / 12), y = Math.floor(py / 12);
    nearby: for (let dx = -1; dx <= 1; dx++) {
      const column = cells.get(x + dx); if (!column) continue;
      for (let dy = -1; dy <= 1; dy++) for (const other of column.get(y + dy) ?? []) {
        if (other !== index && (screenX[other]! - px) ** 2 + (screenY[other]! - py) ** 2 < 12 ** 2) { crowded[index] = 1; break nearby; }
      }
    }
  }
  for (const { group, indices } of groups) {
    if (indices.length < group.minimumMembers) continue;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, crowdedCount = 0;
    for (const index of indices) {
      const x = screenX[index]!, y = screenY[index]!;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      crowdedCount += crowded[index]!;
    }
    const width = Math.max(8, maxX - minX), height = Math.max(8, maxY - minY);
    const spacing = Math.sqrt(width * height / indices.length), crowdedFraction = crowdedCount / indices.length;
    metrics.set(group.id, { spacing, width, height, members: indices.length, crowdedFraction });
  }
  return metrics;
}

/** Owned by one immutable input, released with its renderer. Cache only four camera
 * footprints; translation cannot change distances in an affine projection. */
export function prepareAutoAggregation(points: readonly AggregationPoint[], groups: readonly AggregationGroup[]) {
  const pointById = new Map(points.map(point => [point.id, point]));
  const canonical = new Set(pointById.keys());
  const indexById = new Map(points.map((point, index) => [point.id, index]));
  const orderedGroups = [...groups].sort((a, b) => (b.level ?? 0) - (a.level ?? 0)).map(group => ({ group,
    indices: group.memberIds.flatMap(id => { const index = indexById.get(id); return index === undefined ? [] : [index]; }), displayId: displayId(`automatic:${group.id}`, canonical) }));
  const screenX = new Float64Array(points.length), screenY = new Float64Array(points.length), crowded = new Uint8Array(points.length);
  const samples = new Map<string, DensityMetrics>();
  const results: AggregationSample[] = [];
  const emptyMetrics: DensityMetrics = new Map();
  return { points, groups, pointById, canonical, indexById, orderedGroups, results, emptyMetrics, density(projection: AggregationProjection) {
    // OrbitControls' pan/update round trips introduce sub-pixel matrix noise.
    // Quantize coefficients, not world coordinates or membership decisions.
    const matrix = projection.matrix?.map(value => Math.round(value * 1e12) / 1e12);
    if (matrix?.length === 16 && matrix[3] === 0 && matrix[7] === 0 && matrix[11] === 0) { matrix[12] = 0; matrix[13] = 0; matrix[14] = 0; }
    const key = JSON.stringify([projection.width, projection.height, matrix ?? projection.zoom]);
    const old = samples.get(key); if (old) return old;
    // Use the normalized projection as well: pan cannot change grid rounding.
    const next = aggregationDensity(points, orderedGroups, { ...projection, matrix }, screenX, screenY, crowded);
    if (samples.size >= 4) samples.delete(samples.keys().next().value!);
    samples.set(key, next); return next;
  } };
}

export function projectAutoAggregation({ points, groups, enabled, protectedIds = new Set(), expandedGroupIds = new Set(), manualGroups = [], projection, previousActiveGroupIds = new Set(), matchIds = new Set(), prepared }: {
  points: readonly AggregationPoint[]; groups: readonly AggregationGroup[]; enabled: boolean;
  prepared?: ReturnType<typeof prepareAutoAggregation>;
  protectedIds?: ReadonlySet<string>; expandedGroupIds?: ReadonlySet<string>;
  manualGroups?: readonly AggregationGroup[]; projection: AggregationProjection;
  previousActiveGroupIds?: ReadonlySet<string>; matchIds?: ReadonlySet<string>;
}): AutoAggregationResult {
  const input = prepared?.points === points && prepared.groups === groups ? prepared : prepareAutoAggregation(points, groups);
  const { canonical, indexById } = input;
  const ownerById = new Map<string, string>(), aggregates: DisplayAggregation[] = [], activeGroupIds = new Set<string>();
  const metrics = enabled ? input.density(projection) : input.emptyMetrics;
  const cached = input.results.find(sample => sample.enabled === enabled && sample.metrics === metrics
    && equalIds(sample.protectedIds, protectedIds) && equalIds(sample.expandedGroupIds, expandedGroupIds) && equalIds(sample.matchIds, matchIds)
    && sample.manualGroups.length === manualGroups.length && sample.manualGroups.every((group, index) => group === manualGroups[index])
    && (!enabled || equalIds(sample.previousActiveGroupIds, previousActiveGroupIds) || equalIds(sample.result.activeGroupIds, previousActiveGroupIds)));
  if (cached) return cached.result;
  const explicitProtection = new Uint8Array(points.length), automaticProtection = new Uint8Array(points.length), matches = new Uint8Array(points.length);
  for (const id of protectedIds) { const index = indexById.get(id); if (index !== undefined) explicitProtection[index] = automaticProtection[index] = 1; }
  for (const id of matchIds) { const index = indexById.get(id); if (index !== undefined) matches[index] = 1; }
  // A child's explicit expansion protects its members from every ancestor candidate.
  for (const { group, indices } of input.orderedGroups) if (expandedGroupIds.has(group.id)) for (const index of indices) automaticProtection[index] = 1;
  const owners: (string | undefined)[] = new Array(points.length);
  const add = (group: AggregationGroup, indices: number[], mode: DisplayAggregation['mode'], id = displayId(`${mode}:${group.id}`, canonical)) => {
    if (!indices.length) return;
    const breakdown: Record<string, number> = {}, memberIds: string[] = []; let matchingCount = 0;
    for (const index of indices) {
      const point = points[index]!; owners[index] = id; memberIds.push(point.id); matchingCount += matches[index]!;
      const category = point.category ?? '対象'; breakdown[category] = (breakdown[category] ?? 0) + 1;
    }
    aggregates.push({ id, groupId: group.id, label: group.label, memberIds, matchingCount, mode, breakdown, x: group.x, y: group.y, z: group.z });
  };
  // Manual scope wins; automatic groups can only own the remainder.
  for (const group of manualGroups) add(group, group.memberIds.flatMap(id => { const index = indexById.get(id); return index !== undefined && !owners[index] && !explicitProtection[index] ? [index] : []; }), 'manual');
  if (enabled) for (const { group, indices, displayId } of input.orderedGroups) {
    // Density history belongs to the stable group, independently of temporary
    // protected points or a manual opening/closure of that same range.
    const density = metrics.get(group.id); if (!density) continue;
    const { spacing, width, height, crowdedFraction } = density;
    // Screen footprint incorporates zoom, distance and orientation. A wide deadband
    // avoids changes from tiny camera motions; camera adapters sample after gestures.
    const previous = previousActiveGroupIds.has(group.id);
    if (Math.max(width, height) > (group.maximumProjectedSpan ?? Infinity) * (previous ? 1.2 : 1)) continue;
    if (spacing > (previous ? 22 : 14) && crowdedFraction < (previous ? .4 : .65)) continue;
    activeGroupIds.add(group.id);
    if (expandedGroupIds.has(group.id)) continue;
    const hidden = indices.filter(index => !owners[index] && !automaticProtection[index]);
    if (hidden.length < 2) continue;
    add(group, hidden, 'automatic', displayId);
  }
  const individualIds = new Set<string>();
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!; if (!owners[index]) individualIds.add(point.id);
    ownerById.set(point.id, owners[index] ?? point.id);
  }
  const automatic = aggregates.filter(group => group.mode === 'automatic'), manual = aggregates.filter(group => group.mode === 'manual');
  const result = stableAggregationRepresentation({ individualIds, ownerById, aggregates, activeGroupIds, metrics, counts: {
    scope: canonical.size, individual: individualIds.size, automaticMembers: automatic.reduce((sum, group) => sum + group.memberIds.length, 0), automaticGroups: automatic.length,
    manualMembers: manual.reduce((sum, group) => sum + group.memberIds.length, 0), manualGroups: manual.length, representations: individualIds.size + aggregates.length,
  } }, input.results.at(-1)?.result);
  if (input.results.length >= 4) input.results.shift();
  input.results.push({ enabled, metrics, protectedIds: new Set(protectedIds), expandedGroupIds: new Set(expandedGroupIds), matchIds: new Set(matchIds), manualGroups: [...manualGroups], previousActiveGroupIds: new Set(previousActiveGroupIds), result });
  return result;
}

export interface AggregationRelation { id: string; source: string; target: string; kind: string; confidence: string }
export interface DisplayAggregationRelation<R> {
  id: string; source: string; target: string; kind: string; confidence: string;
  originals: R[]; aggregated: boolean; internal: boolean;
}

/** Direction, kind and confidence are separate buckets; internal relations are retained.
 * This output is exclusively for display and must never feed graph traversal. */
export function projectAggregationRelations<R extends AggregationRelation>(relations: readonly R[], owners: ReadonlyMap<string, string>): DisplayAggregationRelation<R>[] {
  const grouped = new Map<string, DisplayAggregationRelation<R>>(), result: DisplayAggregationRelation<R>[] = [];
  const canonicalIds = new Set(relations.map(edge => edge.id));
  const tokens = new Map<string, number>();
  const token = (value: string) => { let id = tokens.get(value); if (id === undefined) { id = tokens.size; tokens.set(value, id); } return id; };
  for (const original of relations) {
    const source = owners.get(original.source), target = owners.get(original.target);
    if (!source || !target) continue;
    if (source === original.source && target === original.target) {
      result.push({ id: original.id, source, target, kind: original.kind, confidence: original.confidence, originals: [original], aggregated: false, internal: false }); continue;
    }
    // Intern the lookup tuple; only a newly created display relation needs the
    // complete, collision-free string ID. Original Evidence stays by reference.
    const key = `${token(source)}:${token(target)}:${token(original.kind)}:${token(original.confidence)}`;
    let edge = grouped.get(key);
    if (!edge) {
      let id = `atlas-display:relation:${JSON.stringify([source, target, original.kind, original.confidence])}`; while (canonicalIds.has(id)) id += ':display';
      edge = { id, source, target, kind: original.kind, confidence: original.confidence, originals: [], aggregated: true, internal: source === target };
      grouped.set(key, edge); result.push(edge);
    }
    edge.originals.push(original);
  }
  return result;
}
