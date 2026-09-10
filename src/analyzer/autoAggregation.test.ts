import { describe, expect, it } from 'vitest';
import { buildAggregationGroups, prepareAutoAggregation, projectAutoAggregation, projectAggregationRelations, shortAggregationLabels, stableAggregationRepresentation, type AggregationPoint } from './autoAggregation';

const camera = { width: 1200, height: 800, zoom: 1 };
const points: AggregationPoint[] = Array.from({ length: 80 }, (_, index) => ({ id: `n${index}`, x: index % 10 * 4, y: Math.floor(index / 10) * 4, z: 0,
  group: { id: index < 40 ? 'one' : 'two', label: index < 40 ? 'first file' : 'second file' } }));
const groups = buildAggregationGroups(points);

describe('reversible 3D display ownership', () => {
  it('defers offscreen unfolding only for enabled Flow policy, reusing density but not stale pan ownership', () => {
    const points = Array.from({ length: 16 }, (_, i) => ({ id: `far-${i}`, x: 1300 + i % 4 * 40, y: Math.floor(i / 4) * 40, z: 0, group: { id: 'far', label: 'far file', minimumMembers: 4 } }));
    const groups = buildAggregationGroups(points), prepared = prepareAutoAggregation(points, groups);
    const matrix = [2 / 1200, 0, 0, 0, 0, 2 / 800, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const options = { points, groups, prepared, projection: { ...camera, matrix }, retainOffscreen: true };
    const offscreen = projectAutoAggregation({ ...options, enabled: true, protectedIds: new Set(['far-0']) });
    expect(offscreen.individualIds).toEqual(new Set(['far-0'])); expect(offscreen.aggregates[0]!.memberIds).toHaveLength(15);
    const moved = [...matrix]; moved[12] = -2;
    const onscreen = projectAutoAggregation({ ...options, projection: { ...camera, matrix: moved }, enabled: true, previousActiveGroupIds: offscreen.activeGroupIds });
    expect(onscreen.metrics).toBe(offscreen.metrics); expect(onscreen.individualIds.size).toBe(16);
    for (const shift of [-660, -680, -670]) {
      const border = [...matrix]; border[12] = shift / (camera.width / 2);
      const retained = projectAutoAggregation({ ...options, projection: { ...camera, matrix: border }, enabled: true, previousActiveGroupIds: offscreen.activeGroupIds });
      expect(retained.aggregates).toHaveLength(1);
      const unexpandedHistory = projectAutoAggregation({ ...options, projection: { ...camera, matrix: border }, enabled: true });
      expect(unexpandedHistory.individualIds.size).toBe(16);
    }
    for (const projection of [options.projection, { ...camera, matrix: moved }]) {
      expect(projectAutoAggregation({ ...options, projection, enabled: false }).individualIds.size).toBe(16);
    }
    expect(projectAutoAggregation({ ...options, enabled: true, expandedGroupIds: new Set(['far']) }).individualIds.size).toBe(16);
    expect(projectAutoAggregation({ ...options, enabled: true, retainOffscreen: false }).individualIds.size).toBe(16);
  });
  it('keeps a wide crowded remainder in its finest existing affiliation only when ON', () => {
    const crowded = Array.from({ length: 80 }, (_, i) => ({ id: `dense-${i}`, x: Math.floor(i / 2) * 20, y: i % 2, z: 0,
      group: { id: `tiny-${i}`, label: 'too small', minimumMembers: 8 },
      parentGroups: [{ id: 'file', label: 'file', level: 2, maximumProjectedSpan: 100, minimumMembers: 12 }, { id: 'directory', label: 'directory', level: 3, maximumProjectedSpan: 200, minimumMembers: 24 }] }));
    const groups = buildAggregationGroups(crowded);
    const on = projectAutoAggregation({ points: crowded, groups, enabled: true, projection: camera, protectedIds: new Set(['dense-0']) });
    expect(on.individualIds).toEqual(new Set(['dense-0'])); expect(on.aggregates.map(group => group.groupId)).toEqual(['file']);
    expect(on.aggregates[0]!.memberIds).toHaveLength(79);
    const off = projectAutoAggregation({ points: crowded, groups, enabled: false, projection: camera, previousActiveGroupIds: on.activeGroupIds });
    expect(off.individualIds.size).toBe(80); expect(off.aggregates).toEqual([]);
    const manual = projectAutoAggregation({ points: crowded, groups, enabled: true, projection: camera, expandedGroupIds: new Set(['file']) });
    expect(manual.individualIds.size).toBe(80);
  });
  it('keeps enough path context to distinguish same-named affiliations in compact labels', () => {
    const labels = shortAggregationLabels([{ id: 'a', label: 'parse · src/one/util.ts · 仮引数' }, { id: 'b', label: 'parse · src/two/util.ts · 仮引数' }, { id: 'c', label: 'src/git/parsers · 所属の集合' }]);
    expect(labels.get('a')).toBe('parse · one/util.ts'); expect(labels.get('b')).toBe('parse · two/util.ts'); expect(labels.get('c')).toBe('parsers');
  });
  it('reuses only density across pan, selection and query while preserving uncached ownership and history', () => {
    const prepared = prepareAutoAggregation(points, groups);
    const matrix = [.002, 0, 0, 0, 0, .0025, 0, 0, 0, 0, .001, 0, 0, 0, 0, 1];
    let previousActiveGroupIds: ReadonlySet<string> = new Set();
    let initialMetrics: unknown;
    for (const enabled of [true, false, true]) for (const pan of [0, .17, -.4]) {
      const moved = [...matrix]; moved[12] = pan;
      const options = { points, groups, enabled, projection: { ...camera, matrix: moved }, protectedIds: new Set(['n1']), matchIds: new Set(['n2']), previousActiveGroupIds };
      const cached = projectAutoAggregation({ ...options, prepared }), plain = projectAutoAggregation(options);
      expect(cached).toEqual(plain);
      expect(cached.counts.scope).toBe(80); expect(cached.individualIds.has('n1')).toBe(true);
      if (enabled) { initialMetrics ??= cached.metrics; expect(cached.metrics).toBe(initialMetrics); }
      previousActiveGroupIds = cached.activeGroupIds;
    }
    const different = points.slice(0, 1);
    expect(projectAutoAggregation({ points: different, groups: buildAggregationGroups(different), prepared, enabled: true, projection: camera }).counts.scope).toBe(1);
  });

  it('keeps cached split/merge, query, explicit expansion and manual OFF equivalent to fresh decisions', () => {
    const prepared = prepareAutoAggregation(points, groups);
    let history: ReadonlySet<string> = new Set();
    for (let repeat = 0; repeat < 3; repeat++) for (const zoom of [1, 50, 1]) for (const mode of ['auto', 'protected', 'expanded', 'manual', 'off']) {
      const options = { points, groups, projection: { ...camera, zoom }, enabled: mode !== 'off', previousActiveGroupIds: history,
        protectedIds: new Set(mode === 'protected' ? ['n1', 'n42'] : []), expandedGroupIds: new Set(mode === 'expanded' ? ['one'] : []),
        manualGroups: mode === 'manual' || mode === 'off' ? [groups[0]!] : [], matchIds: new Set(repeat % 2 ? ['n1', 'n40'] : []) };
      const cached = projectAutoAggregation({ ...options, prepared });
      expect(cached).toEqual(projectAutoAggregation(options));
      expect([...cached.individualIds, ...cached.aggregates.flatMap(group => group.memberIds)]).toHaveLength(80);
      history = cached.activeGroupIds;
    }
  });
  it('partitions the scope, removes protected members from counts and keeps source positions intact', () => {
    const snapshot = structuredClone(points);
    const result = projectAutoAggregation({ points, groups, enabled: true, projection: camera, protectedIds: new Set(['n1', 'n42', 'outside']), matchIds: new Set(['n2', 'n3', 'n42']) });
    expect(result.individualIds).toEqual(new Set(['n1', 'n42']));
    expect(result.counts).toEqual({ scope: 80, individual: 2, automaticMembers: 78, automaticGroups: 2, manualMembers: 0, manualGroups: 0, representations: 4 });
    expect(result.aggregates.map(group => group.matchingCount)).toEqual([2, 0]);
    expect(result.ownerById.has('outside')).toBe(false);
    expect(new Set([...result.individualIds, ...result.aggregates.flatMap(group => group.memberIds)]).size).toBe(80);
    expect(result.aggregates.flatMap(group => group.memberIds)).not.toContain('n1');
    expect(points).toEqual(snapshot);
  });

  it('preserves explicit manual ownership with OFF and every individual when there is no manual scope', () => {
    const manualGroups = [{ ...groups[0]!, id: 'manual:first' }];
    const off = projectAutoAggregation({ points, groups, enabled: false, manualGroups, projection: camera, protectedIds: new Set(['n1']) });
    expect(off.counts.individual).toBe(41); expect(off.counts.manualMembers).toBe(39); expect(off.counts.automaticMembers).toBe(0);
    expect(off.aggregates.every(group => group.mode === 'manual')).toBe(true);
    const all = projectAutoAggregation({ points, groups, enabled: false, projection: camera });
    expect([...all.ownerById].every(([id, owner]) => id === owner)).toBe(true); expect(all.counts.individual).toBe(80);
  });

  it('keeps explicit group expansion and sparse geometry independent of global target count', () => {
    const explicit = projectAutoAggregation({ points, groups, enabled: true, expandedGroupIds: new Set(['one']), projection: camera });
    expect(explicit.counts.individual).toBe(40); expect(explicit.aggregates.map(group => group.groupId)).toEqual(['two']);
    const sparse = points.map(point => ({ ...point, x: point.x * 100, y: point.y * 100 }));
    expect(projectAutoAggregation({ points: sparse, groups: buildAggregationGroups(sparse), enabled: true, projection: camera }).counts.automaticMembers).toBe(0);
  });

  it('uses a density deadband without moving stable representatives or rebuilding unchanged ownership', () => {
    const dense = projectAutoAggregation({ points, groups, enabled: true, projection: camera });
    const zoom = 18 / Math.sqrt(36 * 12 / 40);
    const boundary = projectAutoAggregation({ points, groups, enabled: true, projection: { ...camera, zoom }, previousActiveGroupIds: dense.activeGroupIds });
    expect(boundary.counts.automaticMembers).toBe(80);
    const entering = projectAutoAggregation({ points, groups, enabled: true, projection: { ...camera, zoom } });
    expect(entering.counts.individual).toBe(80);
    const stable = stableAggregationRepresentation(boundary, dense);
    expect(stable.ownerById).toBe(dense.ownerById); expect(stable.aggregates).toBe(dense.aggregates);
    expect(stable.metrics.get('one')!.spacing).toBeCloseTo(18);
    const near = projectAutoAggregation({ points, groups, enabled: true, projection: { ...camera, zoom: 50 }, previousActiveGroupIds: dense.activeGroupIds });
    expect(near.counts.individual).toBe(80);
  });

  it('updates aggregate match counts without rebuilding unchanged canonical ownership', () => {
    const before = projectAutoAggregation({ points, groups, enabled: true, projection: camera });
    const next = stableAggregationRepresentation(projectAutoAggregation({ points, groups, enabled: true, projection: camera, matchIds: new Set(['n2']) }), before);
    expect(next.ownerById).toBe(before.ownerById); expect(next.individualIds).toBe(before.individualIds);
    expect(next.aggregates[0]!.matchingCount).toBe(1); expect(before.aggregates[0]!.matchingCount).toBe(0);
    expect(next.counts).toEqual(before.counts);
  });

  it('keeps opposite, heterogeneous, uncertain and internal relations separate with their originals', () => {
    const ownership = projectAutoAggregation({ points, groups, enabled: true, projection: camera });
    const edge = (id: string, source: string, target: string, kind = 'uses', confidence = 'source') => ({ id, source, target, kind, confidence, evidence: [`evidence:${id}`] });
    const originals = [edge('a', 'n1', 'n41'), edge('b', 'n2', 'n42'), edge('reverse', 'n41', 'n1'), edge('other', 'n1', 'n41', 'assign'), edge('uncertain', 'n1', 'n41', 'uses', 'inferred'), edge('internal', 'n1', 'n2')];
    const relations = projectAggregationRelations(originals, ownership.ownerById);
    expect(relations).toHaveLength(5);
    expect(relations.find(item => item.originals.length === 2)?.originals).toEqual(originals.slice(0, 2));
    expect(relations.find(item => item.internal)?.originals[0]?.id).toBe('internal');
    expect(relations.flatMap(item => item.originals).map(edge => edge.id).sort()).toEqual(['a', 'b', 'internal', 'other', 'reverse', 'uncertain']);
    expect(relations.flatMap(item => item.originals).every(edge => originals.includes(edge))).toBe(true);
  });

  it('retains density history while a group is explicitly open or temporarily fully protected', () => {
    const active = projectAutoAggregation({ points, groups, enabled: true, projection: camera });
    const expanded = projectAutoAggregation({ points, groups, enabled: true, projection: camera, expandedGroupIds: new Set(['one', 'two']), previousActiveGroupIds: active.activeGroupIds });
    expect(expanded.counts.individual).toBe(80); expect(expanded.activeGroupIds).toEqual(active.activeGroupIds);
    const protectedResult = projectAutoAggregation({ points, groups, enabled: true, projection: camera, protectedIds: new Set(points.map(point => point.id)), previousActiveGroupIds: active.activeGroupIds });
    expect(protectedResult.counts.individual).toBe(80); expect(protectedResult.activeGroupIds).toEqual(active.activeGroupIds);
  });

  it('never reabsorbs an explicitly expanded child into overlapping automatic ancestors', () => {
    const hierarchy = points.map(point => ({ ...point, category: Number(point.id.slice(1)) % 2 ? 'use' : 'literal', parentGroups: [{ id: 'parent', label: 'file · mixed roles', level: 2, minimumMembers: 8, maximumProjectedSpan: 300 }] }));
    const candidates = buildAggregationGroups(hierarchy);
    const result = projectAutoAggregation({ points: hierarchy, groups: candidates, enabled: true, expandedGroupIds: new Set(['one']), projection: camera });
    expect(result.individualIds).toEqual(new Set(Array.from({ length: 40 }, (_, i) => `n${i}`)));
    expect(result.aggregates).toHaveLength(1); expect(result.aggregates[0]!.groupId).toBe('parent'); expect(result.aggregates[0]!.memberIds).toHaveLength(40);
    expect(result.aggregates[0]!.breakdown).toEqual({ literal: 20, use: 20 });
    const manual = projectAutoAggregation({ points: hierarchy, groups: candidates, enabled: true, manualGroups: [groups[0]!], projection: camera });
    expect(manual.counts.manualMembers).toBe(40); expect(manual.counts.automaticMembers).toBe(40); expect(manual.counts.scope).toBe(80);
    expect(manual.aggregates.flatMap(group => group.memberIds)).toHaveLength(80);
  });

  it('does not create a canonical route through disconnected members of a visual group', () => {
    const originals = [{ id: 'left', source: 'A', target: 'b1', kind: 'uses', confidence: 'source' }, { id: 'right', source: 'b2', target: 'C', kind: 'uses', confidence: 'source' }];
    const display = projectAggregationRelations(originals, new Map([['A', 'A'], ['b1', 'B'], ['b2', 'B'], ['C', 'C']]));
    expect(display.map(edge => [edge.source, edge.target])).toEqual([['A', 'B'], ['B', 'C']]);
    const reachable = new Set(['A']); let before = 0;
    while (before !== reachable.size) { before = reachable.size; for (const edge of originals) if (reachable.has(edge.source)) reachable.add(edge.target); }
    expect(reachable).toEqual(new Set(['A', 'b1']));
  });
});
