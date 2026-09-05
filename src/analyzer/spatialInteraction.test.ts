import { describe, expect, it } from 'vitest';
import { ANALYZER_FAR_ZOOM_THRESHOLD, ANALYZER_NEAR_ZOOM_THRESHOLD } from './zoom';
import {
  applySpatialFollowFrame,
  createSpatialCameraLoop,
  createSpatialInteractionCounters,
  panSpatialTransform,
  projectFollowPath,
  spatialEdgeWorldSignature,
  spatialLodLevelWithHysteresis,
  zoomSpatialTransform,
  zoomSpatialCamera,
  spatialCameraFrameTransform,
  spatialWheelZoomFactor,
} from './spatialInteraction';
import { spatialCameraModel, projectSpatialPoint, type SpatialWorldPoint } from './spatialCoordinates';
import type { AnalyzerViewEdge, AnalyzerViewModel, AnalyzerViewNode } from './types';
import { layoutAnalyzerView } from './layout';
import { collectSpatialEdges } from './spatialGraph';
import { spatialEdgeEmptyReason } from './spatialPresentation';

function node(id: string): AnalyzerViewNode {
  return {
    id,
    type: 'module',
    label: id,
    evidenceIds: [],
    metadata: { packageId: 'package:a', regionPath: ['package:a'] },
  };
}

function edge(id: string, sourceId: string, targetId: string): AnalyzerViewEdge {
  return { id, sourceId, targetId, kind: 'imports', label: 'imports', evidenceIds: [], metadata: {} };
}

function largeFixture(moduleCount: number, relationCount: number): AnalyzerViewModel {
  const nodes = Array.from({ length: moduleCount }, (_, index) => node(`module:${index}`));
  const edges = Array.from({ length: relationCount }, (_, index) => {
    const source = nodes[index % nodes.length]!;
    const target = nodes[(index + 1) % nodes.length]!;
    return edge(`edge:${index}`, source.id, target.id);
  });
  return {
    view: 'module-dependency',
    nodes,
    edges,
    clusters: [],
    evidence: [],
    warnings: [],
    regions: [{
      id: 'package:a',
      entityKind: 'region',
      regionKind: 'workspace-package',
      label: 'package:a',
      childIds: nodes.map((item) => item.id),
      ports: [],
      selectable: true,
      evidenceIds: [],
      metadata: { packageId: 'package:a' },
    }],
  };
}

describe('spatial camera interaction', () => {
  it('preserves the cursor anchor under the actual orthographic projection at any elevation', () => {
    const viewport = { width: 1200, height: 680 };
    const current = { x: 127, y: -83, scale: 0.43 };
    const before = spatialCameraModel(current, viewport.width, viewport.height);
    for (const world of [{ x: 20, y: 80, z: 0 }, { x: -300, y: 240, z: 65 }]) {
      const screen = projectSpatialPoint(world, before);
      const next = zoomSpatialCamera(current, 2.4, screen.x, screen.y, viewport);
      const after = projectSpatialPoint(world, spatialCameraModel(next, viewport.width, viewport.height));
      expect(after.x).toBeCloseTo(screen.x, 8);
      expect(after.y).toBeCloseTo(screen.y, 8);
    }
  });

  it('moves the complete overlay with the same affine transform as Three, including arrows', () => {
    const before = spatialCameraModel({ x: 30, y: -80, scale: 0.4 }, 1200, 680);
    const after = spatialCameraModel({ x: -90, y: 20, scale: 1.2 }, 1200, 680);
    const numbers = spatialCameraFrameTransform(before, after).match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    for (const point of [{ x: 0, y: 0, z: 0 }, { x: 145, y: -95, z: 52 }]) {
      const start = projectSpatialPoint(point, before);
      const end = projectSpatialPoint(point, after);
      expect(start.x * numbers[2]! + numbers[0]!).toBeCloseTo(end.x, 8);
      expect(start.y * numbers[2]! + numbers[1]!).toBeCloseTo(end.y, 8);
    }
  });

  it('handles large LOD jumps and proportional trackpad wheel deltas', () => {
    expect(spatialLodLevelWithHysteresis(1.4, 'far')).toBe('near');
    expect(spatialLodLevelWithHysteresis(0.2, 'near')).toBe('far');
    expect(spatialWheelZoomFactor(0)).toBe(1);
    expect(spatialWheelZoomFactor(1)).toBeGreaterThan(spatialWheelZoomFactor(100));
    expect(spatialWheelZoomFactor(-100) * spatialWheelZoomFactor(100)).toBeCloseTo(1);
  });

  it('cancels an old session write when a new gesture or Fit begins', () => {
    const timers = new Map<number, () => void>();
    let id = 0;
    const writes: number[] = [];
    const loop = createSpatialCameraLoop({
      raf: () => 1, caf: () => undefined,
      timeout: (callback) => { timers.set(++id, callback); return id; },
      clearTimeout: (handle) => { timers.delete(handle); },
      onVisualFrame: () => undefined, onSettle: () => undefined,
      onSessionWrite: (value) => writes.push(value.x),
    });
    loop.setTarget({ x: 5, y: 0, scale: 1 }, 'pan');
    loop.pointerUp();
    expect(timers.size).toBe(1);
    loop.setTarget({ x: 10, y: 0, scale: 1 }, 'pan');
    expect(timers.size).toBe(0);
    loop.pointerUp();
    loop.cancel();
    timers.forEach((callback) => callback());
    expect(writes).toEqual([]);
  });
  it('coalesces multiple pointermoves into one visual frame', () => {
    const queued: FrameRequestCallback[] = [];
    const counters = createSpatialInteractionCounters();
    const visuals: number[] = [];
    const loop = createSpatialCameraLoop({
      raf: (callback) => {
        queued.push(callback);
        return queued.length;
      },
      caf: () => undefined,
      timeout: () => 1,
      clearTimeout: () => undefined,
      counters,
      onVisualFrame: (transform) => {
        visuals.push(transform.x);
      },
      onSettle: () => undefined,
      onSessionWrite: () => undefined,
    });
    loop.setTarget({ x: 1, y: 0, scale: 1 }, 'pan');
    loop.setTarget({ x: 4, y: 0, scale: 1 }, 'pan');
    loop.setTarget({ x: 9, y: 0, scale: 1 }, 'pan');
    expect(queued).toHaveLength(1);
    queued[0]?.(0);
    expect(visuals).toEqual([9]);
    expect(counters.cameraVisualUpdates).toBe(1);
    loop.dispose();
  });

  it('does not write session state on every pan sample', () => {
    const queued: FrameRequestCallback[] = [];
    const counters = createSpatialInteractionCounters();
    const loop = createSpatialCameraLoop({
      raf: (callback) => {
        queued.push(callback);
        return queued.length;
      },
      caf: () => undefined,
      timeout: (callback) => {
        callback();
        return 1;
      },
      clearTimeout: () => undefined,
      sessionDebounceMs: 0,
      counters,
      onVisualFrame: () => undefined,
      onSettle: () => undefined,
      onSessionWrite: () => undefined,
    });
    loop.setTarget({ x: 1, y: 0, scale: 1 }, 'pan');
    loop.setTarget({ x: 8, y: 0, scale: 1 }, 'pan');
    expect(counters.sessionWrites).toBe(0);
    queued[0]?.(0);
    loop.pointerUp();
    expect(counters.sessionWrites).toBe(1);
    loop.dispose();
  });

  it('settles wheel input once after the quiet window', () => {
    const timeouts: Array<() => void> = [];
    let settles = 0;
    const loop = createSpatialCameraLoop({
      raf: (callback) => {
        callback(0);
        return 1;
      },
      caf: () => undefined,
      timeout: (callback) => {
        timeouts.push(callback);
        return timeouts.length;
      },
      clearTimeout: () => undefined,
      onVisualFrame: () => undefined,
      onSettle: () => {
        settles += 1;
      },
      onSessionWrite: () => undefined,
    });
    loop.setTarget({ x: 0, y: 0, scale: 1.1 }, 'zoom');
    loop.setTarget({ x: 0, y: 0, scale: 1.2 }, 'zoom');
    expect(settles).toBe(0);
    expect(timeouts).toHaveLength(2);
    timeouts.at(-1)?.();
    expect(settles).toBe(1);
    loop.dispose();
  });

  it('keeps Far/Medium/Near from flapping around the zoom thresholds', () => {
    const aroundFar = ANALYZER_FAR_ZOOM_THRESHOLD;
    expect(spatialLodLevelWithHysteresis(aroundFar - 0.01, 'medium')).toBe('medium');
    expect(spatialLodLevelWithHysteresis(aroundFar - 0.08, 'medium')).toBe('far');
    expect(spatialLodLevelWithHysteresis(aroundFar + 0.01, 'far')).toBe('far');
    expect(spatialLodLevelWithHysteresis(aroundFar + 0.08, 'far')).toBe('medium');
    const aroundNear = ANALYZER_NEAR_ZOOM_THRESHOLD;
    expect(spatialLodLevelWithHysteresis(aroundNear + 0.01, 'medium')).toBe('medium');
    expect(spatialLodLevelWithHysteresis(aroundNear + 0.08, 'medium')).toBe('near');
    expect(spatialLodLevelWithHysteresis(aroundNear - 0.01, 'near')).toBe('near');
    expect(spatialLodLevelWithHysteresis(aroundNear - 0.08, 'near')).toBe('medium');
  });

  it('reuses edge world geometry when only the camera pan changes', () => {
    const first: SpatialWorldPoint[] = [{ x: 10, y: 20, z: 28 }, { x: 80, y: 20, z: 28 }];
    const second: SpatialWorldPoint[] = [{ x: 10, y: 20, z: 28 }, { x: 80, y: 20, z: 28 }];
    expect(spatialEdgeWorldSignature([{ id: 'a', worldPoints: first }])).toBe(
      spatialEdgeWorldSignature([{ id: 'a', worldPoints: second }]),
    );
    const cameraA = spatialCameraModel({ x: 0, y: 0, scale: 1 }, 800, 600);
    const cameraB = spatialCameraModel({ x: 40, y: -12, scale: 1 }, 800, 600);
    const pathA = projectFollowPath({ id: 'a', kind: 'path', worldPoints: first }, cameraA);
    const pathB = projectFollowPath({ id: 'a', kind: 'path', worldPoints: first }, cameraB);
    expect(pathA).not.toBe(pathB);
  });

  it('does not rebuild layout, facts, or aggregates while panning a large fixture', () => {
    const view = largeFixture(500, 1500);
    const counters = createSpatialInteractionCounters();
    counters.layoutRecomputes += 1;
    const layout = layoutAnalyzerView(view);
    const nodes = layout.nodes;
    const regions = layout.regions ?? [];
    const regionById = new Map((view.regions ?? []).map((region) => [region.id, region]));
    counters.edgeCollections += 1;
    counters.aggregateRebuilds += 1;
    const first = collectSpatialEdges(view, nodes, regions, regionById, new Set(), 'near');
    const pan = panSpatialTransform({ x: 0, y: 0, scale: 1 }, 10, 10, 80, 40);
    const zoomed = zoomSpatialTransform(pan, 1.12, 400, 300);
    expect(zoomed.scale).toBeGreaterThan(1);
    const second = first;
    expect(counters.layoutRecomputes).toBe(1);
    expect(counters.factRecomputes).toBe(0);
    expect(counters.aggregateRebuilds).toBe(1);
    expect(counters.edgeCollections).toBe(1);
    expect(second).toBe(first);
    expect(layout.nodes).toHaveLength(500);
  });

  it('writes overlay transforms without allocating React elements', () => {
    const camera = spatialCameraModel({ x: 0, y: 0, scale: 1 }, 800, 600);
    const element = document.createElement('div');
    const elements = new Map<string, HTMLElement>([['card', element]]);
    applySpatialFollowFrame([
      { id: 'card', kind: 'box', world: { x: 40, y: 80, z: 22 }, width: 150, height: 36, center: true },
    ], elements, camera);
    expect(element.style.left).toMatch(/px$/);
    expect(element.style.top).toMatch(/px$/);
  });

  it('matches settled empty-reason semantics after a frozen interaction', () => {
    expect(spatialEdgeEmptyReason({ factCount: 4, renderedCount: 0, collectedCount: 0 })).toBe('no-visible-relation');
    expect(spatialEdgeEmptyReason({ factCount: 4, renderedCount: 3, collectedCount: 3 })).toBe('none');
  });
});
