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
  if (!previous || previous.ownerById.size !== next.ownerById.size || previous.aggregates.length !== next.aggregates.length) return next;
  for (const [id, owner] of next.ownerById) if (previous.ownerById.get(id) !== owner) return next;
  for (let index = 0; index < next.aggregates.length; index++) {
    const current = next.aggregates[index]!, old = previous.aggregates[index]!;
    if (current.id !== old.id || current.label !== old.label || current.matchingCount !== old.matchingCount || current.x !== old.x || current.y !== old.y || current.z !== old.z
      || JSON.stringify(current.breakdown) !== JSON.stringify(old.breakdown)) return next;
  }
  return { ...next, ownerById: previous.ownerById, individualIds: previous.individualIds, aggregates: previous.aggregates, counts: previous.counts };
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

export function projectAutoAggregation({ points, groups, enabled, protectedIds = new Set(), expandedGroupIds = new Set(), manualGroups = [], projection, previousActiveGroupIds = new Set(), matchIds = new Set() }: {
  points: readonly AggregationPoint[]; groups: readonly AggregationGroup[]; enabled: boolean;
  protectedIds?: ReadonlySet<string>; expandedGroupIds?: ReadonlySet<string>;
  manualGroups?: readonly AggregationGroup[]; projection: AggregationProjection;
  previousActiveGroupIds?: ReadonlySet<string>; matchIds?: ReadonlySet<string>;
}): AutoAggregationResult {
  const pointById = new Map(points.map(point => [point.id, point])), canonical = new Set(pointById.keys());
  const ownerById = new Map<string, string>(), aggregates: DisplayAggregation[] = [], activeGroupIds = new Set<string>();
  const metrics = new Map<string, { spacing: number; width: number; height: number; members: number; crowdedFraction: number }>();
  const protectedMembers = new Set(protectedIds);
  // A child's explicit expansion protects its members from every ancestor candidate.
  for (const group of groups) if (expandedGroupIds.has(group.id)) for (const id of group.memberIds) protectedMembers.add(id);
  const screen = new Map<string, { x: number; y: number }>(), cells = new Map<string, { id: string; x: number; y: number }[]>(), crowded = new Set<string>();
  if (enabled) {
    for (const point of points) {
      const projected = projectAggregationPoint(point, projection); screen.set(point.id, projected);
      const key = `${Math.floor(projected.x / 12)}:${Math.floor(projected.y / 12)}`, cell = cells.get(key) ?? [];
      cell.push({ id: point.id, ...projected }); cells.set(key, cell);
    }
    for (const [id, point] of screen) {
      const x = Math.floor(point.x / 12), y = Math.floor(point.y / 12);
      nearby: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const other of cells.get(`${x + dx}:${y + dy}`) ?? []) {
        if (other.id !== id && (other.x - point.x) ** 2 + (other.y - point.y) ** 2 < 12 ** 2) { crowded.add(id); break nearby; }
      }
    }
  }
  const add = (group: AggregationGroup, memberIds: string[], mode: DisplayAggregation['mode']) => {
    if (!memberIds.length) return;
    const id = displayId(`${mode}:${group.id}`, canonical);
    for (const member of memberIds) ownerById.set(member, id);
    const breakdown: Record<string, number> = {};
    for (const member of memberIds) { const category = pointById.get(member)?.category ?? '対象'; breakdown[category] = (breakdown[category] ?? 0) + 1; }
    aggregates.push({ id, groupId: group.id, label: group.label, memberIds, matchingCount: memberIds.reduce((count, id) => count + Number(matchIds.has(id)), 0), mode, breakdown, x: group.x, y: group.y, z: group.z });
  };
  // Manual scope wins; automatic groups can only own the remainder.
  for (const group of manualGroups) add(group, group.memberIds.filter(id => canonical.has(id) && !ownerById.has(id) && !protectedIds.has(id)), 'manual');
  if (enabled) for (const group of [...groups].sort((a, b) => (b.level ?? 0) - (a.level ?? 0))) {
    // Density history belongs to the stable group, independently of temporary
    // protected points or a manual opening/closure of that same range.
    const members = group.memberIds.filter(id => canonical.has(id));
    if (members.length < group.minimumMembers) continue;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const id of members) {
      const point = screen.get(id)!;
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    }
    const width = Math.max(8, maxX - minX), height = Math.max(8, maxY - minY);
    const spacing = Math.sqrt(width * height / members.length);
    const crowdedFraction = members.reduce((count, id) => count + Number(crowded.has(id)), 0) / members.length;
    metrics.set(group.id, { spacing, width, height, members: members.length, crowdedFraction });
    // Screen footprint incorporates zoom, distance and orientation. A wide deadband
    // avoids changes from tiny camera motions; camera adapters sample after gestures.
    const previous = previousActiveGroupIds.has(group.id);
    if (Math.max(width, height) > (group.maximumProjectedSpan ?? Infinity) * (previous ? 1.2 : 1)) continue;
    if (spacing > (previous ? 22 : 14) && crowdedFraction < (previous ? .4 : .65)) continue;
    activeGroupIds.add(group.id);
    if (expandedGroupIds.has(group.id)) continue;
    const hidden = members.filter(id => !ownerById.has(id) && !protectedMembers.has(id));
    if (hidden.length < 2) continue;
    add(group, hidden, 'automatic');
  }
  const individualIds = new Set<string>();
  for (const point of points) if (!ownerById.has(point.id)) { individualIds.add(point.id); ownerById.set(point.id, point.id); }
  const automatic = aggregates.filter(group => group.mode === 'automatic'), manual = aggregates.filter(group => group.mode === 'manual');
  return { individualIds, ownerById, aggregates, activeGroupIds, metrics, counts: {
    scope: canonical.size, individual: individualIds.size, automaticMembers: automatic.reduce((sum, group) => sum + group.memberIds.length, 0), automaticGroups: automatic.length,
    manualMembers: manual.reduce((sum, group) => sum + group.memberIds.length, 0), manualGroups: manual.length, representations: individualIds.size + aggregates.length,
  } };
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
  for (const original of relations) {
    const source = owners.get(original.source), target = owners.get(original.target);
    if (!source || !target) continue;
    if (source === original.source && target === original.target) {
      result.push({ ...original, originals: [original], aggregated: false, internal: false }); continue;
    }
    const key = JSON.stringify([source, target, original.kind, original.confidence]);
    let edge = grouped.get(key);
    if (!edge) {
      let id = `atlas-display:relation:${key}`; while (canonicalIds.has(id)) id += ':display';
      edge = { id, source, target, kind: original.kind, confidence: original.confidence, originals: [], aggregated: true, internal: source === target };
      grouped.set(key, edge); result.push(edge);
    }
    edge.originals.push(original);
  }
  return result;
}
