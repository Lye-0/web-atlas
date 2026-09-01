import { describe, expect, it } from 'vitest';
import {
  analyzerEdgeReadabilityCost,
  analyzerEdgeObstacles,
  analyzerEdgePath,
  analyzerEdgePathIntersectsObstacle,
  analyzerEdgePaths,
  analyzerEdgeRoute,
  analyzerEdgeRouteIntersectsObstacle,
  analyzerEdgeRoutes,
  analyzerRoundedOrthogonalPath,
  isAnalyzerEdgeObstacleHard,
  simplifyAnalyzerOrthogonalRoute,
  type AnalyzerEdgeObstacle,
} from './edgeRouting';
import { ANALYZER_NODE_WIDTH, type AnalyzerLayout, type PositionedNode } from './layout';
import type { AnalyzerViewEdge, AnalyzerViewNode } from './types';

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

function obstacle(id: string, x: number, y: number, width = 244, height = 106, kind?: AnalyzerEdgeObstacle['kind']): AnalyzerEdgeObstacle {
  return { id, x, y, width, height, ...(kind ? { kind } : {}) };
}

function edge(id: string, sourceId: string, targetId: string): AnalyzerViewEdge {
  return { id, sourceId, targetId, kind: 'uses', label: 'uses', evidenceIds: [], metadata: {} };
}

function nodeObstacle(positionedNode: PositionedNode): AnalyzerEdgeObstacle {
  return {
    id: `node:${positionedNode.node.id}`,
    x: positionedNode.x,
    y: positionedNode.y,
    width: ANALYZER_NODE_WIDTH,
    height: positionedNode.height,
    kind: 'node',
  };
}

function softNodeObstacle(id: string, x: number, y: number, width = 244, height = 60): AnalyzerEdgeObstacle {
  return { id, x, y, width, height, kind: 'node', hard: false };
}

function emptyLayout(nodes: PositionedNode[]): AnalyzerLayout {
  return { width: 1200, height: 800, nodes, clusters: [], lanes: [], bands: [], summaryGroups: [] };
}

describe('Analyzer edge obstacle classification', () => {
  it('treats fact nodes and collapsed Summary Cards as hard, but surfaces as pass-through', () => {
    const layout: AnalyzerLayout = {
      width: 900,
      height: 600,
      nodes: [positionedNode('fact', 80, 120), { ...positionedNode('summary-card', 420, 120), node: { ...positionedNode('summary-card', 420, 120).node, presentation: { role: 'summary', childNodeIds: [] } } }],
      clusters: [{ id: 'cluster', label: 'Architecture', tone: 'accent', x: 40, y: 40, width: 760, height: 500 }],
      lanes: [{ id: 'lane', label: 'COMMON', x: 40, y: 40, width: 760, height: 500 }],
      bands: [{ id: 'band', label: 'External Packages', count: 2, countLabel: 'PACKAGES', depth: 1, kind: 'dependency-source', x: 400, y: 100, width: 360, height: 300, presentationId: 'summary:external' }],
      summaryGroups: [{ id: 'summary:external', label: 'External Packages', count: 2, countLabel: 'PACKAGES', depth: 1, x: 100, y: 100, width: 360, height: 300 }],
    };

    const obstacles = analyzerEdgeObstacles(layout);
    expect(obstacles.filter((candidate) => candidate.kind === 'node' || candidate.kind === 'summary-card')).toHaveLength(2);
    expect(obstacles.some((candidate) => candidate.id === 'cluster')).toBe(false);
    expect(obstacles.some((candidate) => candidate.id === 'lane')).toBe(false);
    expect(obstacles.filter((candidate) => candidate.kind === 'summary-heading')).toHaveLength(2);
    expect(obstacles.some((candidate) => candidate.id === 'summary:external')).toBe(false);
    expect(obstacles.find((candidate) => candidate.id === 'summary-heading:summary:external')).toMatchObject({ width: 344, height: 30, priority: 3 });
    expect(isAnalyzerEdgeObstacleHard(obstacle('surface', 0, 0, 100, 100, 'cluster'))).toBe(false);
    expect(isAnalyzerEdgeObstacleHard(obstacle('region', 0, 0, 100, 100, 'summary'))).toBe(false);
  });
});

describe('Analyzer orthogonal edge routing', () => {
  it('uses orthogonal geometry and preserves both boundary ports', () => {
    const source = positionedNode('source', 0, 100);
    const target = positionedNode('target', 600, 300);
    const route = analyzerEdgeRoute(source, target);
    const path = analyzerEdgePath(source, target);

    expect(route?.[0]).toEqual({ x: 244, y: 153 });
    expect(route?.at(-1)).toEqual({ x: 600, y: 353 });
    expect(path).toMatch(/^M 244 153 /);
    expect(path).not.toContain(' C ');
    expect(path).toContain(' Q ');
  });

  it('routes around an unrelated Fact Node while preserving both boundary ports', () => {
    const source = positionedNode('source', 0, 100);
    const target = positionedNode('target', 700, 100);
    const blocker = obstacle('blocker', 350, 100);
    const route = analyzerEdgeRoute(source, target, [blocker]);

    expect(route).toBeDefined();
    expect(route?.[0]).toEqual({ x: 244, y: 153 });
    expect(route?.at(-1)).toEqual({ x: 700, y: 153 });
    expect(analyzerEdgeRouteIntersectsObstacle(route ?? [], blocker)).toBe(false);
    expect(analyzerEdgePath(source, target, [blocker])).toContain(' Q ');
    expect(analyzerEdgePathIntersectsObstacle(source, target, blocker)).toBe(false);
  });

  it('passes through Cluster and expanded Summary surfaces without using outer rectangles', () => {
    const source = positionedNode('source', 0, 100);
    const target = positionedNode('target', 700, 100);
    const cluster = obstacle('cluster-surface', 280, 20, 360, 320, 'cluster');
    const region = obstacle('expanded-region-surface', 280, 20, 360, 320, 'summary');

    expect(analyzerEdgeRoute(source, target, [cluster])).toEqual(analyzerEdgeRoute(source, target));
    expect(analyzerEdgeRoute(source, target, [region])).toEqual(analyzerEdgeRoute(source, target));
    expect(analyzerEdgePathIntersectsObstacle(source, target, cluster)).toBe(true);
    expect(analyzerEdgePathIntersectsObstacle(source, target, region)).toBe(true);
  });

  it('avoids a Summary heading and a collapsed Summary Card', () => {
    const source = positionedNode('source', 0, 100);
    const target = positionedNode('target', 700, 100);
    const heading = obstacle('summary-heading', 330, 135, 210, 30, 'summary-heading');
    const card = obstacle('summary-card', 330, 100, 210, 106, 'summary-card');

    expect(analyzerEdgeRouteIntersectsObstacle(analyzerEdgeRoute(source, target, [heading]) ?? [], heading)).toBe(false);
    expect(analyzerEdgeRouteIntersectsObstacle(analyzerEdgeRoute(source, target, [card]) ?? [], card)).toBe(false);
  });

  it('uses crossing penalty to prefer the alternate orthogonal bend', () => {
    const source = positionedNode('source', 0, 100);
    const target = positionedNode('target', 600, 300);
    const existingRoute = [{ x: 400, y: 0 }, { x: 400, y: 200 }];
    const route = analyzerEdgeRoute(source, target, [], { existingRoutes: [existingRoute] });

    expect(route).toContainEqual({ x: 258, y: 353 });
  });

  it('uses the right/left ports and keeps horizontal routes x-monotonic in a horizontal flow', () => {
    const source = positionedNode('source', 0, 100);
    const target = positionedNode('target', 600, 600);
    const route = analyzerEdgeRoute(source, target, [], { flowDirection: 'horizontal' });

    expect(route?.[0]).toEqual({ x: 244, y: 153 });
    expect(route?.at(-1)).toEqual({ x: 600, y: 653 });
    expect(route?.every((point, index) => index === 0 || point.x >= route[index - 1]!.x)).toBe(true);
  });

  it('does not reverse behind the source when a horizontal route detours around a blocker', () => {
    const source = positionedNode('source', 0, 100);
    const target = positionedNode('target', 700, 100);
    const blocker = obstacle('blocker', 350, 100);
    const route = analyzerEdgeRoute(source, target, [blocker], { flowDirection: 'horizontal' });

    expect(route).toBeDefined();
    expect(route?.every((point, index) => index === 0 || point.x >= route[index - 1]!.x)).toBe(true);
    expect(Math.min(...(route ?? []).map((point) => point.x))).toBeGreaterThanOrEqual(source.x + ANALYZER_NODE_WIDTH);
    expect(analyzerEdgeRouteIntersectsObstacle(route ?? [], blocker)).toBe(false);
  });

  it('keeps fan-out edges away from sibling nodes and Summary bounds', () => {
    const source = positionedNode('source', 0, 40);
    const target = positionedNode('target', 700, 260);
    const sibling = obstacle('sibling-node', 350, 40);
    const summary = obstacle('unrelated-summary-member', 320, 220, 300, 180, 'summary-card');
    const route = analyzerEdgeRoute(source, target, [sibling, summary]);

    expect(route).toBeDefined();
    expect(analyzerEdgeRouteIntersectsObstacle(route ?? [], sibling)).toBe(false);
    expect(analyzerEdgeRouteIntersectsObstacle(route ?? [], summary)).toBe(false);
  });
});

describe('Analyzer readability-aware edge routing', () => {
  it('keeps a soft keep-out zone traversable while choosing a clear corridor', () => {
    const source = positionedNode('source', 0, 77);
    const target = positionedNode('target', 700, 77);
    const softZone = softNodeObstacle('soft-zone', 350, 100);
    const directRoute = analyzerEdgeRoute(source, target, [softZone], { softKeepOut: 0 });
    const readableRoute = analyzerEdgeRoute(source, target, [softZone]);

    expect(directRoute).toBeDefined();
    expect(readableRoute).toBeDefined();
    expect(analyzerEdgeRouteIntersectsObstacle(directRoute ?? [], softZone)).toBe(true);
    expect(analyzerEdgeRouteIntersectsObstacle(readableRoute ?? [], softZone)).toBe(false);
    expect(readableRoute).not.toEqual(directRoute);
    expect(readableRoute?.some((point) => point.y < softZone.y || point.y > softZone.y + softZone.height)).toBe(true);
  });

  it('increases the occlusion cost non-linearly for consecutive hidden Nodes', () => {
    const route = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
    const makeZones = (count: number): AnalyzerEdgeObstacle[] => Array.from({ length: count }, (_, index) => softNodeObstacle(`zone-${index}`, 120 + index * 110, -20, 100, 40));
    const options = { terminalLegLength: 0 };
    const oneZone = analyzerEdgeReadabilityCost(route, makeZones(1), options);
    const twoZones = analyzerEdgeReadabilityCost(route, makeZones(2), options);
    const threeZones = analyzerEdgeReadabilityCost(route, makeZones(3), options);

    expect(twoZones).toBeGreaterThan(oneZone);
    expect(threeZones).toBeGreaterThan(twoZones);
    expect(threeZones - twoZones).toBeGreaterThan(twoZones - oneZone);
  });

  it('adds an extra readability cost to an occluded terminal leg', () => {
    const route = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
    const middleZone = [softNodeObstacle('middle-zone', 400, -20, 100, 40)];
    const terminalZone = [softNodeObstacle('terminal-zone', 930, -20, 100, 40)];
    const options = { terminalLegLength: 80 };

    expect(analyzerEdgeReadabilityCost(route, terminalZone, options)).toBeGreaterThan(analyzerEdgeReadabilityCost(route, middleZone, options));
  });

  it('moves a shared fan-out trunk out of a continuous soft Node column', () => {
    const source = positionedNode('source', 0, 200);
    const targets = [
      positionedNode('target-a', 700, 40),
      positionedNode('target-b', 700, 200),
      positionedNode('target-c', 700, 360),
    ];
    const nodes = [source, ...targets];
    const positionedById = new Map(nodes.map((node) => [node.node.id, node]));
    const edges = targets.map((target) => edge(`edge:${target.node.id}`, 'source', target.node.id));
    const softColumn = [
      softNodeObstacle('soft-column-a', 350, 20),
      softNodeObstacle('soft-column-b', 350, 160),
      softNodeObstacle('soft-column-c', 350, 300),
    ];
    const routes = analyzerEdgeRoutes(edges, positionedById, [...nodes.map(nodeObstacle), ...softColumn], { flowDirection: 'horizontal' });
    const sharedRoute = routes.get('edge:target-a') ?? [];
    const trunkX = sharedRoute.slice(1).map((point) => point.x).find((x) => x > source.x + ANALYZER_NODE_WIDTH && x < Math.min(...targets.map((target) => target.x)));

    expect(trunkX).toBeDefined();
    expect(trunkX! < 350 - 18 || trunkX! > 350 + 244 + 18).toBe(true);
  });
});

describe('Analyzer route simplification and rounded drawing', () => {
  it('removes duplicate and collinear points', () => {
    const route = simplifyAnalyzerOrthogonalRoute([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 40 },
      { x: 20, y: 100 },
      { x: 20, y: 100 },
      { x: 80, y: 100 },
    ]);

    expect(route).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 100 }, { x: 80, y: 100 }]);
  });

  it('removes a short zigzag when the shorter replacement remains orthogonal', () => {
    const route = simplifyAnalyzerOrthogonalRoute([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 6 },
      { x: 100, y: 6 },
    ], { shortZigzagLength: 8 });

    expect(route).toHaveLength(3);
    expect(route).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 6 }]);
  });

  it('rounds only orthogonal corners and clamps the radius to half of short segments', () => {
    const path = analyzerRoundedOrthogonalPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 12);
    const shortPath = analyzerRoundedOrthogonalPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }], 20);

    expect(path).toBe('M 0 0 L 88 0 Q 100 0 100 12 L 100 100');
    expect(path).not.toContain(' C ');
    expect(shortPath).toContain('L 6 0 Q 10 0 10 4');
  });
});

describe('Analyzer same-source fan-out', () => {
  it('shares the initial trunk while retaining every original edge ID', () => {
    const nodes = [
      positionedNode('source', 0, 140),
      positionedNode('target-a', 700, 80),
      positionedNode('target-b', 700, 260),
      positionedNode('other-source', 0, 500),
      positionedNode('other-target', 700, 500),
    ];
    const positionedById = new Map(nodes.map((node) => [node.node.id, node]));
    const edges = [
      edge('edge:a', 'source', 'target-a'),
      edge('edge:b', 'source', 'target-b'),
      edge('edge:other', 'other-source', 'other-target'),
    ];
    const routes = analyzerEdgeRoutes(edges, positionedById);
    const paths = analyzerEdgePaths(edges, positionedById);
    const first = routes.get('edge:a');
    const second = routes.get('edge:b');
    const unrelated = routes.get('edge:other');

    expect([...routes.keys()]).toEqual(['edge:a', 'edge:b', 'edge:other']);
    expect([...paths.keys()]).toEqual(['edge:a', 'edge:b', 'edge:other']);
    expect(first?.slice(0, 2)).toEqual(second?.slice(0, 2));
    expect(first).not.toEqual(second);
    expect(unrelated?.slice(0, 2)).not.toEqual(first?.slice(0, 2));
  });

  it('can disable rendering-only fan-out without changing edge identity', () => {
    const positionedById = new Map([
      ['source', positionedNode('source', 0, 140)],
      ['target-a', positionedNode('target-a', 700, 80)],
      ['target-b', positionedNode('target-b', 700, 260)],
    ]);
    const edges = [edge('edge:a', 'source', 'target-a'), edge('edge:b', 'source', 'target-b')];
    const routes = analyzerEdgeRoutes(edges, positionedById, [], { enableFanout: false });

    expect([...routes.keys()]).toEqual(['edge:a', 'edge:b']);
  });

  it('keeps every sibling target hard while routing each original Fact Edge', () => {
    const source = positionedNode('source', 0, 200);
    const targets = [
      positionedNode('target-a', 700, 40),
      positionedNode('target-b', 700, 200),
      positionedNode('target-c', 700, 360),
    ];
    const nodes = [source, ...targets];
    const positionedById = new Map(nodes.map((node) => [node.node.id, node]));
    const edges = targets.map((target) => edge(`edge:${target.node.id}`, 'source', target.node.id));
    const obstacles = nodes.map(nodeObstacle);
    const routes = analyzerEdgeRoutes(edges, positionedById, obstacles, { flowDirection: 'horizontal' });

    expect([...routes.keys()]).toEqual(['edge:target-a', 'edge:target-b', 'edge:target-c']);
    edges.forEach((currentEdge) => {
      const route = routes.get(currentEdge.id) ?? [];
      targets
        .filter((target) => target.node.id !== currentEdge.targetId)
        .forEach((sibling) => {
          expect(analyzerEdgeRouteIntersectsObstacle(route, nodeObstacle(sibling))).toBe(false);
        });
      expect(route.every((point, index) => index === 0 || point.x >= route[index - 1]!.x)).toBe(true);
    });

    const targetRoute = routes.get('edge:target-c') ?? [];
    const trunkX = targetRoute.slice(1).map((point) => point.x).find((x) => x > source.x + ANALYZER_NODE_WIDTH);
    expect(trunkX).toBeDefined();
    expect(trunkX).toBeGreaterThanOrEqual(source.x + ANALYZER_NODE_WIDTH);
    expect(trunkX).toBeLessThanOrEqual(Math.min(...targets.map((target) => target.x)));
  });

  it('keeps an A-to-C route from looking like a relation through the middle sibling B', () => {
    const source = positionedNode('source-a', 0, 200);
    const middleTarget = positionedNode('target-b', 300, 200);
    const farTarget = positionedNode('target-c', 700, 200);
    const nodes = [source, middleTarget, farTarget];
    const positionedById = new Map(nodes.map((node) => [node.node.id, node]));
    const edges = [edge('edge:a-b', 'source-a', 'target-b'), edge('edge:a-c', 'source-a', 'target-c')];
    const routes = analyzerEdgeRoutes(edges, positionedById, nodes.map(nodeObstacle), { flowDirection: 'horizontal' });
    const farRoute = routes.get('edge:a-c') ?? [];

    expect(analyzerEdgeRouteIntersectsObstacle(farRoute, nodeObstacle(middleTarget))).toBe(false);
    expect(farRoute.every((point, index) => index === 0 || point.x >= farRoute[index - 1]!.x)).toBe(true);
    expect([...routes.keys()]).toEqual(['edge:a-b', 'edge:a-c']);
  });

  it('keeps separate target groups on separate shared trunks', () => {
    const source = positionedNode('source', 0, 200);
    const techTargets = [
      { ...positionedNode('technology-a', 700, 40), node: { ...positionedNode('technology-a', 700, 40).node, clusterId: 'technology' } },
      { ...positionedNode('technology-b', 700, 240), node: { ...positionedNode('technology-b', 700, 240).node, clusterId: 'technology' } },
    ];
    const externalTargets = [
      { ...positionedNode('external-a', 1050, 40), node: { ...positionedNode('external-a', 1050, 40).node, clusterId: 'external' } },
      { ...positionedNode('external-b', 1050, 200), node: { ...positionedNode('external-b', 1050, 200).node, clusterId: 'external' } },
    ];
    const nodes = [source, ...techTargets, ...externalTargets];
    const positionedById = new Map(nodes.map((node) => [node.node.id, node]));
    const edges = [
      edge('edge:technology-a', 'source', 'technology-a'),
      edge('edge:technology-b', 'source', 'technology-b'),
      edge('edge:external-a', 'source', 'external-a'),
      edge('edge:external-b', 'source', 'external-b'),
    ];
    const routes = analyzerEdgeRoutes(edges, positionedById, nodes.map(nodeObstacle), { flowDirection: 'horizontal' });
    const technologyRoute = routes.get('edge:technology-a') ?? [];
    const technologySiblingRoute = routes.get('edge:technology-b') ?? [];
    const externalRoute = routes.get('edge:external-a') ?? [];

    expect(technologyRoute.slice(0, 2)).toEqual(technologySiblingRoute.slice(0, 2));
    expect(externalRoute[1]?.x).not.toBe(technologyRoute[1]?.x);
    expect(externalRoute[1]?.x).toBeGreaterThan(source.x + ANALYZER_NODE_WIDTH);
    expect(externalRoute[1]?.x).toBeLessThanOrEqual(Math.min(...externalTargets.map((target) => target.x)));
  });

  it('reroutes around the current expanded Node bounds instead of reusing the compact route', () => {
    const source = positionedNode('source', 0, 180);
    const target = positionedNode('target', 700, 180);
    const compactBlocker = positionedNode('blocker', 350, 100, 80);
    const expandedBlocker = positionedNode('blocker', 350, 100, 220);
    const positionedById = new Map([source, target].map((node) => [node.node.id, node]));
    const edgeModel = [edge('edge:source-target', 'source', 'target')];
    const compactObstacles = analyzerEdgeObstacles(emptyLayout([source, compactBlocker, target]));
    const expandedObstacles = analyzerEdgeObstacles(emptyLayout([source, expandedBlocker, target]));
    const compactRoute = analyzerEdgeRoutes(edgeModel, positionedById, compactObstacles, { flowDirection: 'horizontal' }).get('edge:source-target');
    const expandedRoute = analyzerEdgeRoutes(edgeModel, positionedById, expandedObstacles, { flowDirection: 'horizontal' }).get('edge:source-target');
    const expandedObstacle = expandedObstacles.find((candidate) => candidate.id === 'node:blocker');

    expect(compactObstacles.find((candidate) => candidate.id === 'node:blocker')?.height).toBe(80);
    expect(expandedObstacle?.height).toBe(220);
    expect(compactRoute).toBeDefined();
    expect(expandedRoute).toBeDefined();
    expect(expandedRoute).not.toEqual(compactRoute);
    expect(expandedObstacle).toBeDefined();
    expect(analyzerEdgeRouteIntersectsObstacle(expandedRoute ?? [], expandedObstacle!)).toBe(false);
  });
});
