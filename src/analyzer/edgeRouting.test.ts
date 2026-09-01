import { describe, expect, it } from 'vitest';
import {
  analyzerEdgePath,
  analyzerEdgePathIntersectsObstacle,
  analyzerEdgeRoute,
  analyzerEdgeRouteIntersectsObstacle,
  type AnalyzerEdgeObstacle,
} from './edgeRouting';
import type { PositionedNode } from './layout';
import type { AnalyzerViewNode } from './types';

function positionedNode(id: string, x: number, y: number, height = 106): PositionedNode {
  const node: AnalyzerViewNode = {
    id,
    type: 'project',
    label: id,
    evidenceIds: [],
    metadata: {},
  };
  return { node, x, y, height };
}

function obstacle(id: string, x: number, y: number, width = 244, height = 106): AnalyzerEdgeObstacle {
  return { id, x, y, width, height };
}

describe('Analyzer edge routing', () => {
  it('keeps the existing cubic path when no unrelated bounds intersect it', () => {
    const source = positionedNode('source', 0, 100);
    const target = positionedNode('target', 600, 100);

    const path = analyzerEdgePath(source, target, [obstacle('below', 300, 300)]);

    expect(path).toMatch(/^M 244 153 C/);
    expect(path).toContain(' 600 153');
    expect(path).not.toContain(' L ');
  });

  it('routes around an unrelated node while preserving both boundary ports', () => {
    const source = positionedNode('source', 0, 100);
    const target = positionedNode('target', 700, 100);
    const blocker = obstacle('blocker', 350, 100);
    const route = analyzerEdgeRoute(source, target, [blocker]);

    expect(route).toBeDefined();
    expect(route?.[0]).toEqual({ x: 244, y: 153 });
    expect(route?.at(-1)).toEqual({ x: 700, y: 153 });
    expect(analyzerEdgeRouteIntersectsObstacle(route ?? [], blocker)).toBe(false);
    expect(analyzerEdgePath(source, target, [blocker])).toContain(' L ');
    expect(analyzerEdgePathIntersectsObstacle(source, target, blocker)).toBe(true);
  });

  it('keeps fan-out edges away from sibling node and Summary bounds', () => {
    const source = positionedNode('source', 0, 40);
    const target = positionedNode('target', 700, 260);
    const sibling = obstacle('sibling-node', 350, 40);
    const summary = obstacle('unrelated-summary', 320, 220, 300, 180);
    const route = analyzerEdgeRoute(source, target, [sibling, summary]);

    expect(route).toBeDefined();
    expect(analyzerEdgeRouteIntersectsObstacle(route ?? [], sibling)).toBe(false);
    expect(analyzerEdgeRouteIntersectsObstacle(route ?? [], summary)).toBe(false);
  });
});
