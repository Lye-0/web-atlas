import { describe, expect, it } from 'vitest';
import {
  aggregateSpatialEdges,
  spatialEdgeAltitude,
  spatialEdgeClass,
  spatialModuleShouldRender,
  spatialModuleBudget,
} from './spatialPresentation';
import { routeSpatialEdge } from './spatialRouting';

describe('module dependency spatial presentation', () => {
  it('changes the rendered module budget by semantic zoom level', () => {
    expect(spatialModuleBudget('far')).toBe(0);
    expect(spatialModuleBudget('medium')).toBeGreaterThan(0);
    expect(spatialModuleBudget('near')).toBeGreaterThan(spatialModuleBudget('medium'));
  });

  it('keeps explicit selection visible at every zoom level without conflating collapse', () => {
    expect(spatialModuleShouldRender({ zoomLevel: 'far', hierarchyVisible: true })).toBe(false);
    expect(spatialModuleShouldRender({ zoomLevel: 'near', hierarchyVisible: false })).toBe(false);
    expect(spatialModuleShouldRender({ zoomLevel: 'far', hierarchyVisible: false, selected: true })).toBe(true);
    expect(spatialModuleShouldRender({ zoomLevel: 'far', hierarchyVisible: false, selectedEdgeEndpoint: true })).toBe(true);
  });

  it('aggregates presentation edges without changing fact identity', () => {
    expect(aggregateSpatialEdges([
      { sourceId: 'directory:a', targetId: 'directory:b' },
      { sourceId: 'directory:a', targetId: 'directory:b' },
      { sourceId: 'directory:a', targetId: 'directory:c' },
      { sourceId: 'directory:a', targetId: 'directory:a' },
    ])).toEqual([
      { sourceId: 'directory:a', targetId: 'directory:b', count: 2 },
      { sourceId: 'directory:a', targetId: 'directory:c', count: 1 },
    ]);
  });

  it('uses shallow local, cross-directory, and cross-package routing classes', () => {
    expect(spatialEdgeClass('package:a', 'package:a', 'directory:a', 'directory:a')).toBe('local');
    expect(spatialEdgeClass('package:a', 'package:a', 'directory:a', 'directory:b')).toBe('cross-directory');
    expect(spatialEdgeClass('package:a', 'package:b', 'directory:a', 'directory:b')).toBe('cross-package');
    expect(spatialEdgeAltitude('cross-package')).toBeGreaterThan(spatialEdgeAltitude('cross-directory'));
    expect(spatialEdgeAltitude('cross-directory')).toBeGreaterThan(spatialEdgeAltitude('local'));
  });

  it('raises cross-region routes into deterministic 3D arcs', () => {
    const source = {
      id: 'module:a',
      x: 40,
      y: 80,
      width: 150,
      height: 36,
      regionId: 'directory:a',
      packageId: 'package:a',
      elevation: 18,
    };
    const target = {
      id: 'module:b',
      x: 520,
      y: 220,
      width: 150,
      height: 36,
      regionId: 'directory:b',
      packageId: 'package:b',
      elevation: 18,
    };
    const route = routeSpatialEdge(source, target);
    expect(route.edgeClass).toBe('cross-package');
    expect(route.points.length).toBeGreaterThan(2);
    expect(Math.max(...route.points.map((point) => point.z))).toBe(spatialEdgeAltitude('cross-package'));
    expect(route.points.at(0)?.z).toBeCloseTo(21);
    expect(route.points.at(-1)?.z).toBeCloseTo(21);
  });

  it('keeps local routes outside non-endpoint module obstacles', () => {
    const route = routeSpatialEdge(
      { id: 'module:a', x: 0, y: 80, width: 150, height: 36, regionId: 'directory:a', packageId: 'package:a', elevation: 18 },
      { id: 'module:c', x: 500, y: 80, width: 150, height: 36, regionId: 'directory:a', packageId: 'package:a', elevation: 18 },
      [{ id: 'module:b', x: 220, y: 80, width: 150, height: 36 }],
    );
    const obstacle = { left: 212, right: 378, top: 72, bottom: 124 };
    route.points.slice(1).forEach((point, index) => {
      const previous = route.points[index];
      if (!previous) return;
      const horizontalHit = previous.y === point.y
        && point.y > obstacle.top
        && point.y < obstacle.bottom
        && Math.max(Math.min(previous.x, point.x), obstacle.left) < Math.min(Math.max(previous.x, point.x), obstacle.right);
      const verticalHit = previous.x === point.x
        && point.x > obstacle.left
        && point.x < obstacle.right
        && Math.max(Math.min(previous.y, point.y), obstacle.top) < Math.min(Math.max(previous.y, point.y), obstacle.bottom);
      expect(horizontalHit || verticalHit).toBe(false);
    });
  });
});
