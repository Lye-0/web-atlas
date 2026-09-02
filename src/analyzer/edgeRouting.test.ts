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
  type AnalyzerEdgeRoutingDiagnostic,
  type AnalyzerFanoutRoutingDiagnostic,
  type AnalyzerFanoutCandidateDiagnostic,
  type AnalyzerEdgePoint,
  type AnalyzerEdgeObstacle,
} from './edgeRouting';
import { ANALYZER_NODE_WIDTH, type AnalyzerLayout, type PositionedNode, type PositionedSemanticRegion } from './layout';
import type { AnalyzerSemanticRegion, AnalyzerViewEdge, AnalyzerViewNode } from './types';

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

function positionedRegion(id: string, x: number, y: number, width = 280, height = 220): PositionedSemanticRegion {
  const region: AnalyzerSemanticRegion = {
    id,
    entityKind: 'region',
    regionKind: 'scope',
    label: id,
    childIds: [],
    ports: [
      { id: `${id}:top`, side: 'top' },
      { id: `${id}:right`, side: 'right' },
      { id: `${id}:bottom`, side: 'bottom' },
      { id: `${id}:left`, side: 'left' },
    ],
    selectable: true,
    evidenceIds: [],
    metadata: {},
  };
  return { region, x, y, width, height, headingHeight: 28, memberGap: 14 };
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

  it('keeps a Semantic Region surface pass-through while protecting its heading', () => {
    const region = positionedRegion('region:scope:web', 420, 100);
    const layout: AnalyzerLayout = { ...emptyLayout([]), regions: [region] };
    const obstacles = analyzerEdgeObstacles(layout);
    const surface = obstacles.find((candidate) => candidate.id === 'region-surface:region:scope:web');
    const heading = obstacles.find((candidate) => candidate.id === 'region-heading:region:scope:web');

    expect(surface).toMatchObject({ kind: 'region-surface', hard: false, x: 420, y: 100, width: 280, height: 220 });
    expect(heading).toMatchObject({ kind: 'region-heading', x: 428, y: 114, width: 264, height: 28 });
    expect(isAnalyzerEdgeObstacleHard(surface!)).toBe(false);
    expect(isAnalyzerEdgeObstacleHard(heading!)).toBe(true);
  });
});

describe('Analyzer Semantic Region endpoints', () => {
  it('routes a Project-to-Region relation to the Region boundary instead of a center endpoint', () => {
    const source = positionedNode('source', 0, 100);
    const region = positionedRegion('region:scope:web', 600, 100);
    const positions = new Map<string, PositionedNode | PositionedSemanticRegion>([
      [source.node.id, source],
      [region.region.id, region],
    ]);
    const routes = analyzerEdgeRoutes([edge('edge:source-region', 'source', region.region.id)], positions, analyzerEdgeObstacles({ ...emptyLayout([source]), regions: [region] }), { flowDirection: 'horizontal' });
    const route = routes.get('edge:source-region');

    expect(route).toBeDefined();
    expect(route?.[0]).toEqual({ x: source.x + ANALYZER_NODE_WIDTH, y: source.y + source.height / 2 });
    expect(route?.at(-1)).toEqual({ x: region.x, y: region.y + region.height / 2 });
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

  it('keeps a tall same-source fan-out on a dedicated corridor outside the target group', () => {
    const source = positionedNode('source', 0, 400);
    const targets = [
      positionedNode('target-a', 700, 40),
      positionedNode('target-b', 700, 200),
      positionedNode('target-c', 700, 360),
      positionedNode('target-d', 700, 520),
      positionedNode('target-e', 700, 680),
      positionedNode('target-f', 700, 840),
    ];
    const nodes = [source, ...targets];
    const positionedById = new Map(nodes.map((node) => [node.node.id, node]));
    const edges = targets.map((target) => edge(`edge:${target.node.id}`, 'source', target.node.id));
    const diagnostics: AnalyzerFanoutRoutingDiagnostic[] = [];
    const routes = analyzerEdgeRoutes(edges, positionedById, nodes.map(nodeObstacle), {
      flowDirection: 'horizontal',
      onFanoutDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const targetGroupLeft = Math.min(...targets.map((target) => target.x));
    const targetGroupRight = Math.max(...targets.map((target) => target.x + ANALYZER_NODE_WIDTH));
    const diagnostic = diagnostics[0];

    expect(routes.size).toBe(targets.length);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostic).toMatchObject({
      fanoutDetected: true,
      busCandidateCount: expect.any(Number),
      targetGroupBounds: { x: targetGroupLeft, y: 40, width: ANALYZER_NODE_WIDTH, height: 906 },
      fallbackUsed: false,
    });
    const selectedBusX = diagnostic?.selectedBusX;
    expect(selectedBusX).toBeLessThanOrEqual(targetGroupLeft - 32);
    const candidateDiagnostics: AnalyzerFanoutCandidateDiagnostic[] = diagnostic?.candidateDiagnostics ?? [];
    expect(candidateDiagnostics).toHaveLength(diagnostic?.busCandidateCount ?? 0);
    const selectedCandidate = candidateDiagnostics.find((candidate) => candidate.candidateX === selectedBusX);
    expect(selectedCandidate).toMatchObject({
      status: 'accepted',
      sourceRight: source.x + ANALYZER_NODE_WIDTH,
      targetGroupLeft,
      availableWidth: targetGroupLeft - (source.x + ANALYZER_NODE_WIDTH),
      clearance: 14,
      sourceEntry: { valid: true, pathPoints: expect.any(Array) },
      trunk: { valid: true, pathPoints: expect.any(Array) },
    });
    expect(selectedCandidate?.branches).toHaveLength(targets.length);
    expect(selectedCandidate?.branches.every((branch) => branch.valid)).toBe(true);
    const firstRoute = routes.get('edge:target-a') ?? [];
    const lastRoute = routes.get('edge:target-f') ?? [];
    expect(firstRoute.slice(0, 2)).toEqual(lastRoute.slice(0, 2));
    expect(firstRoute.some((point) => point.x > targetGroupLeft && point.x < targetGroupRight)).toBe(false);
    expect(firstRoute.some((point) => point.x > source.x + ANALYZER_NODE_WIDTH && point.x < targetGroupLeft)).toBe(true);
    targets.forEach((target) => {
      const route = routes.get(`edge:${target.node.id}`) ?? [];
      expect(route.every((point, index) => index === 0 || point.x >= route[index - 1]!.x)).toBe(true);
      expect(route.some((point) => point.x === selectedBusX)).toBe(true);
    });
  });

  it('explains rejected bus candidates with obstacle identity and endpoint exclusions', () => {
    const source = positionedNode('source', 0, 200);
    const targets = [
      positionedNode('target-a', 700, 100),
      positionedNode('target-b', 700, 300),
    ];
    const blocker = obstacle('blocking-corridor', 400, 0, 300, 600, 'fact-node');
    const nodes = [source, ...targets];
    const positionedById = new Map(nodes.map((node) => [node.node.id, node]));
    const edges = targets.map((target) => edge(`edge:${target.node.id}`, 'source', target.node.id));
    const diagnostics: AnalyzerFanoutRoutingDiagnostic[] = [];

    analyzerEdgeRoutes(edges, positionedById, [...nodes.map(nodeObstacle), blocker], {
      flowDirection: 'horizontal',
      onFanoutDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    const diagnostic = diagnostics[0];
    expect(diagnostic).toMatchObject({
      fanoutDetected: true,
      busCandidateCount: expect.any(Number),
      fallbackUsed: true,
      fallbackReason: 'no-valid-bus-route',
    });
    expect(diagnostic?.busCandidateCount).toBeGreaterThan(0);
    expect(diagnostic?.candidateDiagnostics).toHaveLength(diagnostic?.busCandidateCount ?? 0);
    expect(diagnostic?.candidateDiagnostics.every((candidate) => candidate.status === 'rejected')).toBe(true);
    expect(diagnostic?.candidateDiagnostics.some((candidate) => candidate.finalReason === 'trunk-intersects-obstacle')).toBe(true);
    expect(diagnostic?.candidateDiagnostics.some((candidate) => candidate.branches.some((branch) => (
      branch.reason === 'branch-intersects-obstacle'
      && branch.rejectedByObstacleId === blocker.id
      && branch.rejectedByObstacleKind === blocker.kind
      && branch.rejectedByObstacleBounds?.x === blocker.x
    )))).toBe(true);

    const candidate = diagnostic?.candidateDiagnostics.find((current) => current.finalReason === 'trunk-intersects-obstacle');
    expect(candidate).toMatchObject({
      candidateX: expect.any(Number),
      busX: expect.any(Number),
      sourceRight: source.x + ANALYZER_NODE_WIDTH,
      targetGroupLeft: targets[0]!.x,
      clearance: 14,
      sourceEntry: { valid: true },
      trunk: {
        valid: false,
        reason: 'trunk-intersects-obstacle',
        rejectedByObstacleId: blocker.id,
        rejectedByObstacleKind: blocker.kind,
        rejectedByObstacleBounds: { x: blocker.x, y: blocker.y, width: blocker.width, height: blocker.height },
      },
    });
    const firstBranch = candidate?.branches.find((branch) => branch.targetId === 'target-a');
    expect(firstBranch?.excludedObstacleIds).toEqual(expect.arrayContaining(['node:source', 'node:target-a']));
    expect(firstBranch?.excludedHardObstacleIds).toEqual(expect.arrayContaining(['node:source', 'node:target-a']));
    expect(firstBranch?.excludedObstacleIds).not.toContain('node:target-b');
    expect(firstBranch?.branchPoints).toEqual(expect.any(Array));
    expect(firstBranch?.pathPoints).toEqual(expect.any(Array));
  });

  it('prefers a clear horizontal side separation over a larger vertical center distance', () => {
    const source = positionedNode('source', 0, 0);
    const targets = [
      positionedNode('target-a', 500, 700),
      positionedNode('target-b', 500, 880),
    ];
    const positionedById = new Map([source, ...targets].map((node) => [node.node.id, node]));
    const edges = targets.map((target) => edge(`edge:${target.node.id}`, 'source', target.node.id));
    const diagnostics: AnalyzerFanoutRoutingDiagnostic[] = [];
    const routes = analyzerEdgeRoutes(edges, positionedById, [source, ...targets].map(nodeObstacle), {
      onFanoutDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const diagnostic = diagnostics[0];

    expect(diagnostic).toMatchObject({
      preferredDirection: 'right',
      selectedDirection: 'right',
      evaluatedDirections: expect.arrayContaining(['right', 'down']),
      fallbackUsed: false,
    });
    expect(diagnostic?.directionDiagnostics.find((current) => current.direction === 'right')).toMatchObject({
      sideGap: targets[0]!.x - (source.x + ANALYZER_NODE_WIDTH),
      validCandidateCount: expect.any(Number),
    });
    expect(routes.get('edge:target-a')?.every((point, index, route) => index === 0 || point.x >= route[index - 1]!.x)).toBe(true);
  });

  it('selects down when the target group is vertically separated and horizontally overlaps the source', () => {
    const source = positionedNode('source', 360, 0);
    const targets = [
      positionedNode('target-a', 300, 400),
      positionedNode('target-b', 560, 580),
    ];
    const positionedById = new Map([source, ...targets].map((node) => [node.node.id, node]));
    const edges = targets.map((target) => edge(`edge:${target.node.id}`, 'source', target.node.id));
    const diagnostics: AnalyzerFanoutRoutingDiagnostic[] = [];
    const routes = analyzerEdgeRoutes(edges, positionedById, [source, ...targets].map(nodeObstacle), {
      onFanoutDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const diagnostic = diagnostics[0];

    expect(diagnostic).toMatchObject({
      preferredDirection: 'down',
      selectedDirection: 'down',
      fallbackUsed: false,
    });
    expect(diagnostic?.directionDiagnostics.find((current) => current.direction === 'down')).toMatchObject({
      sideGap: targets[0]!.y - (source.y + source.height),
      validCandidateCount: expect.any(Number),
    });
    expect(routes.get('edge:target-a')?.every((point, index, route) => index === 0 || point.y >= route[index - 1]!.y)).toBe(true);
  });

  it('tries an alternate direction when the preferred horizontal Bus is invalid', () => {
    const source = positionedNode('source', 0, 0);
    const targets = [
      positionedNode('target-a', 500, 200),
      positionedNode('target-b', 760, 360),
    ];
    const rightEntryBlocker = obstacle('right-entry-blocker', 250, 0, 250, 80, 'fact-node');
    const nodes = [source, ...targets];
    const positionedById = new Map(nodes.map((node) => [node.node.id, node]));
    const edges = targets.map((target) => edge(`edge:${target.node.id}`, 'source', target.node.id));
    const diagnostics: AnalyzerFanoutRoutingDiagnostic[] = [];
    const routes = analyzerEdgeRoutes(edges, positionedById, [...nodes.map(nodeObstacle), rightEntryBlocker], {
      onFanoutDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const diagnostic = diagnostics[0];
    const rightEvaluation = diagnostic?.directionDiagnostics.find((current) => current.direction === 'right');
    const downEvaluation = diagnostic?.directionDiagnostics.find((current) => current.direction === 'down');

    expect(diagnostic).toMatchObject({
      preferredDirection: 'right',
      selectedDirection: 'down',
      evaluatedDirections: expect.arrayContaining(['right', 'down']),
      fallbackUsed: false,
    });
    expect(rightEvaluation).toMatchObject({ validCandidateCount: 0 });
    expect(downEvaluation).toMatchObject({ validCandidateCount: expect.any(Number) });
    expect(downEvaluation?.validCandidateCount).toBeGreaterThan(0);
    expect(routes.get('edge:target-a')?.every((point, index, route) => index === 0 || point.y >= route[index - 1]!.y)).toBe(true);
  });

  it('keeps selected and related presentation state out of fan-out geometry', () => {
    const source = positionedNode('source', 0, 400);
    const targets = [
      positionedNode('target-a', 700, 160),
      positionedNode('target-b', 700, 340),
      positionedNode('target-c', 700, 520),
    ];
    const nodes = [source, ...targets];
    const positionedById = new Map(nodes.map((node) => [node.node.id, node]));
    const edges = targets.map((target) => edge(`edge:${target.node.id}`, 'source', target.node.id));
    const selectedEdges = edges.map((currentEdge) => currentEdge.id === 'edge:target-b'
      ? { ...currentEdge, presentation: { emphasis: 'primary' as const } }
      : currentEdge);
    const diagnostics: AnalyzerEdgeRoutingDiagnostic[] = [];

    const normalRoutes = analyzerEdgeRoutes(edges, positionedById, nodes.map(nodeObstacle), { flowDirection: 'horizontal' });
    const presentedRoutes = analyzerEdgeRoutes(selectedEdges, positionedById, nodes.map(nodeObstacle), {
      flowDirection: 'horizontal',
      onEdgeDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const selectedDiagnostic = diagnostics.find((diagnostic) => diagnostic.edgeId === 'edge:target-b');

    expect(presentedRoutes).toEqual(normalRoutes);
    expect(selectedDiagnostic).toMatchObject({
      edgeId: 'edge:target-b',
      sourceId: 'source',
      targetId: 'target-b',
      routingStrategy: 'structural-fanout',
      fanoutGroupId: expect.stringContaining('fanout:source'),
      fanoutDetected: true,
      busUsed: true,
      fallbackUsed: false,
    });
    expect(selectedDiagnostic?.pathPoints).toEqual(presentedRoutes.get('edge:target-b'));
  });

  it('recomputes the vertical bus from the current target group bounds', () => {
    const source = positionedNode('source', 360, 700);
    const compactTargets = [
      positionedNode('target-a', 100, 100),
      positionedNode('target-b', 400, 240),
    ];
    const expandedTargets = [
      positionedNode('target-a', 100, 100),
      positionedNode('target-b', 400, 240, 260),
    ];
    const edgeModels = [edge('edge:a', 'source', 'target-a'), edge('edge:b', 'source', 'target-b')];
    const routeFor = (targets: PositionedNode[]): { route: AnalyzerEdgePoint[]; diagnostic?: AnalyzerFanoutRoutingDiagnostic } => {
      const nodes = [source, ...targets];
      const positionedById = new Map(nodes.map((node) => [node.node.id, node]));
      const diagnostics: AnalyzerFanoutRoutingDiagnostic[] = [];
      const routes = analyzerEdgeRoutes(edgeModels, positionedById, nodes.map(nodeObstacle), {
        flowDirection: 'vertical',
        onFanoutDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      });
      return { route: routes.get('edge:a') ?? [], diagnostic: diagnostics[0] };
    };
    const compact = routeFor(compactTargets);
    const expanded = routeFor(expandedTargets);
    const compactRoute = compact.route;
    const expandedRoute = expanded.route;
    const compactGroupBottom = Math.max(...compactTargets.map((target) => target.y + target.height));
    const expandedGroupBottom = Math.max(...expandedTargets.map((target) => target.y + target.height));
    const busCoordinate = (route: AnalyzerEdgePoint[], groupBottom: number): number | undefined => route
      .map((point) => point.y)
      .find((y) => y > groupBottom && y < source.y - 20);

    const compactBusY = busCoordinate(compactRoute, compactGroupBottom);
    const expandedBusY = busCoordinate(expandedRoute, expandedGroupBottom);

    expect(compactBusY).toBeDefined();
    expect(expandedBusY).toBeDefined();
    expect(expandedBusY).toBeGreaterThan(compactBusY!);
    expect(expandedBusY).toBeGreaterThan(expandedGroupBottom);
    expect(compact.diagnostic?.targetGroupBounds.height).toBe(compactGroupBottom - Math.min(...compactTargets.map((target) => target.y)));
    expect(expanded.diagnostic?.targetGroupBounds.height).toBe(expandedGroupBottom - Math.min(...expandedTargets.map((target) => target.y)));
    expect(expanded.diagnostic?.selectedBusY).toBe(expandedBusY);
  });

  it('falls back to generic routing when the source-target gap cannot contain a bus', () => {
    const source = positionedNode('source', 0, 200);
    const targets = [positionedNode('target-a', 270, 100), positionedNode('target-b', 270, 300)];
    const nodes = [source, ...targets];
    const positionedById = new Map(nodes.map((node) => [node.node.id, node]));
    const edges = targets.map((target) => edge(`edge:${target.node.id}`, 'source', target.node.id));
    const diagnostics: AnalyzerFanoutRoutingDiagnostic[] = [];
    const edgeDiagnostics: AnalyzerEdgeRoutingDiagnostic[] = [];
    const routes = analyzerEdgeRoutes(edges, positionedById, nodes.map(nodeObstacle), {
      flowDirection: 'horizontal',
      onFanoutDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      onEdgeDiagnostic: (diagnostic) => edgeDiagnostics.push(diagnostic),
    });

    expect(routes.size).toBe(2);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      fanoutDetected: true,
      busCandidateCount: 0,
      fallbackUsed: true,
      fallbackReason: 'no-bus-candidates',
    });
    expect(edgeDiagnostics).toHaveLength(2);
    expect(edgeDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: 'source',
        routingStrategy: 'generic-fallback',
        fanoutDetected: true,
        busUsed: false,
        fallbackUsed: true,
        fallbackReason: 'no-bus-candidates',
      }),
    ]));
    edges.forEach((currentEdge) => {
      const route = routes.get(currentEdge.id);
      expect(route).toBeDefined();
      expect(route?.[0]).toEqual({ x: source.x + ANALYZER_NODE_WIDTH, y: source.y + source.height / 2 });
      expect(route?.at(-1)).toEqual({ x: targets.find((target) => target.node.id === currentEdge.targetId)?.x, y: (targets.find((target) => target.node.id === currentEdge.targetId)?.y ?? 0) + 53 });
    });
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
