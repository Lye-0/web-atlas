import { describe, expect, it } from 'vitest';
import {
  ANALYZER_SPATIAL_PLANE_THICKNESS,
  ANALYZER_SPATIAL_TILT_DEGREES,
  ANALYZER_SPATIAL_YAW_DEGREES,
  ANALYZER_SPATIAL_INCIDENT_EDGE_THRESHOLD,
  aggregateSpatialEdges,
  spatialEdgeAltitude,
  spatialEdgeClass,
  spatialModuleBlockDimensions,
  spatialLabelScreenScale,
  spatialModuleShouldRender,
  spatialModuleBudget,
  spatialEdgeEmptyReason,
  spatialRegionBorderStyle,
  spatialRegionFillOpacity,
  spatialRegionDepthElevation,
  spatialModuleElevation,
  spatialSelectionKind,
  spatialUsesRegionAggregation,
  spatialLocalEdgeBudget,
} from './spatialPresentation';
import { routeSpatialEdge, spatialRouteIntersectsObstacle, spatialRouteXyExcursion } from './spatialRouting';
import { collectSpatialEdges } from './spatialGraph';
import type { AnalyzerSemanticRegion, AnalyzerViewEdge, AnalyzerViewModel, AnalyzerViewNode } from './types';
import type { PositionedNode, PositionedSemanticRegion } from './layout';

describe('module dependency spatial presentation', () => {
  it('changes the rendered module budget by semantic zoom level', () => {
    expect(spatialModuleBudget('far')).toBe(0);
    expect(spatialModuleBudget('medium')).toBeGreaterThan(0);
    expect(spatialModuleBudget('near')).toBeGreaterThan(spatialModuleBudget('medium'));
  });

  it('uses a shallow pitched camera with yaw instead of a face-on map', () => {
    expect(ANALYZER_SPATIAL_TILT_DEGREES).toBeGreaterThanOrEqual(14);
    expect(ANALYZER_SPATIAL_TILT_DEGREES).toBeLessThan(24);
    expect(ANALYZER_SPATIAL_YAW_DEGREES).toBeGreaterThanOrEqual(0);
    expect(ANALYZER_SPATIAL_YAW_DEGREES).toBeLessThanOrEqual(6);
    expect(spatialLabelScreenScale(0.4)).toBeLessThan(spatialLabelScreenScale(1));
    expect(spatialLabelScreenScale(0.4)).toBeGreaterThanOrEqual(0.78);
  });

  it('uses layering instead of thick vertical side faces', () => {
    expect(ANALYZER_SPATIAL_PLANE_THICKNESS).toBeLessThan(0.5);
    expect(spatialRegionFillOpacity('workspace-package', 0)).toBeLessThan(0.25);
    expect(spatialEdgeEmptyReason({ factCount: 0, renderedCount: 0 })).toBe('no-dependency');
    expect(spatialEdgeEmptyReason({ factCount: 4, renderedCount: 0 })).toBe('density-budget');
    expect(spatialEdgeEmptyReason({ factCount: 4, candidateCount: 0, renderedCount: 0 })).toBe('no-dependency');
    expect(spatialEdgeEmptyReason({ factCount: 4, renderedCount: 2 })).toBe('none');
    expect(spatialRegionBorderStyle(true, 'directory').className).toBe('region-border-selected');
    expect(spatialRegionBorderStyle(false, 'workspace-package').className).toBe('region-border');
    expect(spatialRegionBorderStyle(true, 'directory').opacity).toBeLessThan(0.6);
  });

  it('keeps the package-to-edge depth hierarchy and preserves Far module existence', () => {
    expect(spatialRegionDepthElevation('workspace-package', 0)).toBeLessThan(spatialRegionDepthElevation('directory', 1));
    expect(spatialRegionDepthElevation('directory', 1)).toBeLessThan(spatialRegionDepthElevation('directory', 2));
    expect(spatialRegionDepthElevation('directory', 2)).toBeLessThan(spatialModuleElevation(2));
    expect(spatialEdgeAltitude('local')).toBeGreaterThan(spatialModuleElevation(0));
    expect(spatialEdgeAltitude('cross-directory')).toBeGreaterThan(spatialEdgeAltitude('local'));
    expect(spatialEdgeAltitude('cross-package')).toBeGreaterThan(spatialEdgeAltitude('cross-directory'));

    const far = spatialModuleBlockDimensions('far', 36);
    const near = spatialModuleBlockDimensions('near', 36);
    expect(far.width).toBeLessThan(near.width);
    expect(far.height).toBeLessThan(near.height);
    expect(far.depth).toBeGreaterThan(0);
    expect(far.zOffset).toBeGreaterThan(0);
    expect(near.zOffset).toBeLessThan(0);
  });

  it('keeps explicit selection visible at every zoom level without conflating collapse', () => {
    expect(spatialModuleShouldRender({ zoomLevel: 'far', hierarchyVisible: true })).toBe(false);
    expect(spatialModuleShouldRender({ zoomLevel: 'near', hierarchyVisible: false })).toBe(false);
    expect(spatialModuleShouldRender({ zoomLevel: 'far', hierarchyVisible: false, selected: true })).toBe(false);
    expect(spatialModuleShouldRender({ zoomLevel: 'far', hierarchyVisible: false, selectedEdgeEndpoint: true })).toBe(false);
    expect(spatialModuleShouldRender({ zoomLevel: 'medium', hierarchyVisible: true, selected: true })).toBe(true);
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

  it('raises cross-region routes into deterministic 3D arcs with bounded XY excursion', () => {
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
    const start = { x: 115, y: 98 };
    const end = { x: 595, y: 238 };
    expect(route.edgeClass).toBe('cross-package');
    expect(route.points.length).toBeGreaterThan(2);
    expect(Math.max(...route.points.map((point) => point.z))).toBe(spatialEdgeAltitude('cross-package'));
    expect(route.points.at(0)?.z).toBeCloseTo(18);
    expect(route.points.at(-1)?.z).toBeCloseTo(18);
    expect(spatialRouteXyExcursion(route.points, start, end)).toBeLessThan(1);
  });

  it('keeps local XY clearance short instead of wrapping a huge corridor', () => {
    const source = { id: 'module:a', x: 0, y: 80, width: 150, height: 36, regionId: 'directory:a', packageId: 'package:a', elevation: 18 };
    const target = { id: 'module:c', x: 500, y: 80, width: 150, height: 36, regionId: 'directory:a', packageId: 'package:a', elevation: 18 };
    const route = routeSpatialEdge(source, target, [{ id: 'module:b', x: 220, y: 80, width: 150, height: 36 }]);
    const start = { x: 75, y: 98 };
    const end = { x: 575, y: 98 };
    expect(route.edgeClass).toBe('local');
    expect(spatialRouteXyExcursion(route.points, start, end)).toBeLessThan(1);
    expect(Math.max(...route.points.map((point) => point.z))).toBeGreaterThan(18);
  });

  it('routes a spatial dependency around an intervening visible module card', () => {
    const source = { id: 'module:a', x: 0, y: 80, width: 150, height: 36, regionId: 'directory:a', packageId: 'package:a', elevation: 18 };
    const target = { id: 'module:c', x: 500, y: 80, width: 150, height: 36, regionId: 'directory:a', packageId: 'package:a', elevation: 18 };
    const blocker = { id: 'module:b', x: 250, y: 80, width: 150, height: 36 };
    const route = routeSpatialEdge(source, target, [blocker]);

    expect(route.points.length).toBeGreaterThan(2);
    expect(spatialRouteIntersectsObstacle(route.points, blocker)).toBe(false);
    expect(route.points[0]).toMatchObject({ x: source.x + source.width, y: source.y + source.height / 2, z: source.elevation });
    expect(route.points.at(-1)).toMatchObject({ x: target.x, y: target.y + target.height / 2, z: target.elevation });
  });
});

function node(id: string, regionPath: string[], packageId: string): AnalyzerViewNode {
  return {
    id,
    type: 'module',
    label: id,
    evidenceIds: [],
    metadata: { regionPath, packageId },
  };
}

function region(id: string, regionKind: AnalyzerSemanticRegion['regionKind'], parentRegionId?: string): AnalyzerSemanticRegion {
  return {
    id,
    entityKind: 'region',
    regionKind,
    label: id,
    childIds: [],
    ports: [],
    selectable: true,
    evidenceIds: [],
    metadata: { packageId: id.includes('package') ? id : parentRegionId },
    ...(parentRegionId ? { parentRegionId } : {}),
  };
}

function positionedNode(viewNode: AnalyzerViewNode): PositionedNode {
  return { node: viewNode, x: 0, y: 0, height: 36 };
}

function positionedRegion(viewRegion: AnalyzerSemanticRegion): PositionedSemanticRegion {
  return { region: viewRegion, x: 0, y: 0, width: 200, height: 120, headingHeight: 30, memberGap: 14 };
}

function edge(id: string, sourceId: string, targetId: string): AnalyzerViewEdge {
  return { id, sourceId, targetId, kind: 'imports', label: 'imports', evidenceIds: [], metadata: {} };
}

describe('module dependency spatial selection', () => {
  const packageA = region('package:a', 'workspace-package');
  const packageF = region('package:f', 'workspace-package');
  const directoryA = region('directory:a', 'directory', 'package:a');
  const directoryB = region('directory:b', 'directory', 'package:a');
  const directoryF = region('directory:f', 'directory', 'package:f');
  const moduleA = node('module:a', ['package:a', 'directory:a'], 'package:a');
  const moduleB = node('module:b', ['package:a', 'directory:a'], 'package:a');
  const moduleC = node('module:c', ['package:a', 'directory:b'], 'package:a');
  const moduleD = node('module:d', ['package:a', 'directory:b'], 'package:a');
  const moduleF = node('module:f', ['package:f', 'directory:f'], 'package:f');
  const moduleX = node('module:x', ['package:f', 'directory:f'], 'package:f');
  const moduleY = node('module:y', ['package:f', 'directory:f'], 'package:f');
  const view: AnalyzerViewModel = {
    view: 'module-dependency',
    nodes: [moduleA, moduleB, moduleC, moduleD, moduleF, moduleX, moduleY],
    edges: [
      edge('a-b', 'module:a', 'module:b'),
      edge('a-c', 'module:a', 'module:c'),
      edge('b-c', 'module:b', 'module:c'),
      edge('c-d', 'module:c', 'module:d'),
      edge('c-f', 'module:c', 'module:f'),
      edge('a-f', 'module:a', 'module:f'),
      edge('x-y', 'module:x', 'module:y'),
    ],
    clusters: [],
    evidence: [],
    warnings: [],
    regions: [packageA, packageF, directoryA, directoryB, directoryF],
  };
  const regionById = new Map((view.regions ?? []).map((item) => [item.id, item]));
  const visibleNodes = view.nodes.map(positionedNode);
  const visibleRegions = (view.regions ?? []).map(positionedRegion);
  const expanded = new Set(['directory:a', 'directory:b', 'directory:f', 'package:a', 'package:f']);

  it('keeps module selection on direct incident edges only', () => {
    expect(spatialSelectionKind({ selectedNodeId: 'module:b' })).toBe('module');
    const edges = collectSpatialEdges(view, visibleNodes, visibleRegions, regionById, expanded, 'near', 'module:b');
    const highlighted = edges.filter((item) => item.connected || item.selected).map((item) => `${item.sourceId}->${item.targetId}`);
    expect(highlighted).toEqual(['module:a->module:b', 'module:b->module:c']);
    expect(edges.some((item) => item.sourceId === 'module:x' && item.targetId === 'module:y')).toBe(false);
    expect(edges.some((item) => item.sourceId === 'module:c' && item.targetId === 'module:d' && item.connected)).toBe(false);
  });

  it('keeps unselected Medium edges on local modules and region aggregates', () => {
    const edges = collectSpatialEdges(view, visibleNodes, visibleRegions, regionById, expanded, 'medium');
    expect(edges.some((item) => item.sourceId === 'module:a' && item.targetId === 'module:b' && !item.aggregated)).toBe(true);
    expect(edges.some((item) => item.sourceId === 'module:a' && item.targetId === 'module:c' && !item.aggregated)).toBe(false);
    expect(edges.some((item) => item.sourceId === 'directory:a' && item.targetId === 'directory:b' && item.aggregated)).toBe(true);
  });

  it('groups high-degree incident edges by nearest visible region without changing facts', () => {
    const extras = Array.from({ length: ANALYZER_SPATIAL_INCIDENT_EDGE_THRESHOLD }, (_, index) => {
      const id = `module:extra-${index}`;
      return {
        node: node(id, ['package:a', 'directory:b'], 'package:a'),
        edge: edge(`extra-${index}`, id, 'module:b'),
      };
    });
    const crowded: AnalyzerViewModel = {
      ...view,
      nodes: [...view.nodes, ...extras.map((item) => item.node)],
      edges: [...view.edges, ...extras.map((item) => item.edge)],
    };
    const crowdedNodes = crowded.nodes.map(positionedNode);
    const edges = collectSpatialEdges(crowded, crowdedNodes, visibleRegions, regionById, expanded, 'near', 'module:b');
    expect(view.edges.length + extras.length).toBe(crowded.edges.length);
    expect(edges.some((item) => item.sourceId === 'directory:b' && item.targetId === 'module:b' && item.aggregated && item.count >= ANALYZER_SPATIAL_INCIDENT_EDGE_THRESHOLD)).toBe(true);
    expect(edges.filter((item) => item.sourceId.startsWith('module:extra-')).length).toBe(0);
    expect(edges.some((item) => item.sourceId === 'module:b' && item.targetId === 'module:c' && !item.aggregated)).toBe(true);
  });

  it('groups only the high-degree direction and keeps a single outgoing exact', () => {
    const extras = Array.from({ length: 20 }, (_, index) => {
      const id = `module:in-${index}`;
      return {
        node: node(id, ['package:a', 'directory:b'], 'package:a'),
        edge: edge(`in-${index}`, id, 'module:b'),
      };
    });
    const crowded: AnalyzerViewModel = {
      ...view,
      nodes: [...view.nodes, ...extras.map((item) => item.node)],
      edges: [...view.edges, ...extras.map((item) => item.edge)],
    };
    const edges = collectSpatialEdges(crowded, crowded.nodes.map(positionedNode), visibleRegions, regionById, expanded, 'near', 'module:b');
    expect(edges.some((item) => item.sourceId === 'directory:b' && item.targetId === 'module:b' && item.aggregated)).toBe(true);
    expect(edges.some((item) => item.sourceId === 'module:b' && item.targetId === 'module:c' && !item.aggregated)).toBe(true);
  });

  it('keeps low-degree incidents as exact module edges', () => {
    const low = node('module:low', ['package:a', 'directory:a'], 'package:a');
    const a = node('module:p1', ['package:a', 'directory:a'], 'package:a');
    const b = node('module:p2', ['package:a', 'directory:a'], 'package:a');
    const c = node('module:p3', ['package:a', 'directory:a'], 'package:a');
    const lowView: AnalyzerViewModel = {
      ...view,
      nodes: [...view.nodes, low, a, b, c],
      edges: [
        edge('p1', 'module:p1', 'module:low'),
        edge('p2', 'module:p2', 'module:low'),
        edge('p3', 'module:p3', 'module:low'),
      ],
    };
    const edges = collectSpatialEdges(lowView, lowView.nodes.map(positionedNode), visibleRegions, regionById, expanded, 'near', 'module:low');
    expect(edges.every((item) => !item.aggregated)).toBe(true);
    expect(edges).toHaveLength(3);
  });

  it('keeps incoming-only module selection as incoming endpoints', () => {
    const sink = node('module:sink', ['package:a', 'directory:a'], 'package:a');
    const sinkView: AnalyzerViewModel = {
      ...view,
      nodes: [...view.nodes, sink],
      edges: [
        edge('a-sink', 'module:a', 'module:sink'),
        edge('c-sink', 'module:c', 'module:sink'),
      ],
    };
    const edges = collectSpatialEdges(sinkView, sinkView.nodes.map(positionedNode), visibleRegions, regionById, expanded, 'near', 'module:sink');
    expect(edges.every((item) => item.targetId === 'module:sink')).toBe(true);
    expect(edges.every((item) => item.sourceId !== 'module:sink')).toBe(true);
  });

  it('uses directory boundary aggregation instead of highlighting internal module edges', () => {
    expect(spatialUsesRegionAggregation('near', 'directory')).toBe(true);
    const edges = collectSpatialEdges(view, visibleNodes, visibleRegions, regionById, expanded, 'near', undefined, 'directory:a');
    expect(edges.every((item) => item.aggregated)).toBe(true);
    expect(edges.some((item) => item.sourceId === 'module:a' && item.targetId === 'module:b')).toBe(false);
    expect(edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'directory:a', targetId: 'directory:b', connected: true, count: 2 }),
      expect.objectContaining({ sourceId: 'directory:a', targetId: 'directory:f', connected: true }),
    ]));
  });

  it('uses package boundary aggregation for cross-package relations', () => {
    expect(spatialSelectionKind({ selectedRegionKind: 'workspace-package' })).toBe('package');
    const edges = collectSpatialEdges(view, visibleNodes, visibleRegions, regionById, expanded, 'near', undefined, 'package:a');
    expect(edges.every((item) => item.aggregated)).toBe(true);
    expect(edges.some((item) => item.sourceId.startsWith('module:'))).toBe(false);
    expect(edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'package:a', targetId: 'package:f', connected: true, count: 2 }),
    ]));
    expect(edges.some((item) => item.sourceId === 'directory:a' && item.connected)).toBe(false);
  });

  it('hides unrelated module edges while a Directory is selected', () => {
    const edges = collectSpatialEdges(view, visibleNodes, visibleRegions, regionById, expanded, 'near', undefined, 'directory:a');
    expect(edges.every((item) => item.sourceId === 'directory:a' || item.targetId === 'directory:a')).toBe(true);
    expect(edges.some((item) => item.sourceId.startsWith('module:'))).toBe(false);
    expect(edges.some((item) => item.sourceId === 'directory:b' && item.targetId === 'directory:f')).toBe(false);
    expect(edges.some((item) => item.sourceId === 'module:x')).toBe(false);
  });

  it('hides unrelated module edges while a Package is selected', () => {
    const edges = collectSpatialEdges(view, visibleNodes, visibleRegions, regionById, expanded, 'near', undefined, 'package:a');
    expect(edges.every((item) => item.sourceId === 'package:a' || item.targetId === 'package:a')).toBe(true);
    expect(edges.some((item) => item.sourceId.startsWith('module:'))).toBe(false);
  });

  it('keeps Far package aggregates while a module remains selected', () => {
    const edges = collectSpatialEdges(view, visibleNodes, visibleRegions, regionById, expanded, 'far', 'module:b');
    expect(edges.every((item) => item.aggregated)).toBe(true);
    expect(edges.some((item) => item.sourceId.startsWith('module:'))).toBe(false);
    expect(edges.some((item) => (item.sourceId === 'package:a' && item.targetId === 'package:f') || (item.sourceId === 'package:f' && item.targetId === 'package:a'))).toBe(true);
  });

  it('does not zero Far package aggregates for a degree-0 selected module', () => {
    const isolated = node('module:z', ['package:a', 'directory:a'], 'package:a');
    const isolatedView: AnalyzerViewModel = { ...view, nodes: [...view.nodes, isolated] };
    const unselected = collectSpatialEdges(isolatedView, [...visibleNodes, positionedNode(isolated)], visibleRegions, regionById, expanded, 'far');
    const selected = collectSpatialEdges(isolatedView, [...visibleNodes, positionedNode(isolated)], visibleRegions, regionById, expanded, 'far', 'module:z');
    expect(unselected.length).toBeGreaterThan(0);
    expect(selected.length).toBe(unselected.length);
    expect(selected.every((item) => item.aggregated)).toBe(true);
  });

  it('keeps zero-degree module selection at zero visible edges', () => {
    const isolated = node('module:z', ['package:a', 'directory:a'], 'package:a');
    const isolatedView: AnalyzerViewModel = { ...view, nodes: [...view.nodes, isolated] };
    const edges = collectSpatialEdges(isolatedView, [...visibleNodes, positionedNode(isolated)], visibleRegions, regionById, expanded, 'near', 'module:z');
    expect(edges).toHaveLength(0);
  });

  it('caps same-directory local edges with a deterministic budget', () => {
    const extras = Array.from({ length: 8 }, (_, index) => {
      const id = `module:local-${index}`;
      return {
        node: node(id, ['package:a', 'directory:a'], 'package:a'),
        edge: edge(`local-${index}`, 'module:a', id),
      };
    });
    const crowded: AnalyzerViewModel = {
      ...view,
      nodes: [...view.nodes, ...extras.map((item) => item.node)],
      edges: [...view.edges, ...extras.map((item) => item.edge)],
    };
    const edges = collectSpatialEdges(crowded, crowded.nodes.map(positionedNode), visibleRegions, regionById, expanded, 'medium');
    const local = edges.filter((item) => !item.aggregated && item.sourceId.startsWith('module:') && item.targetId.startsWith('module:'));
    const directoryALocal = local.filter((item) => item.sourceId === 'module:a' || item.targetId === 'module:a' || item.sourceId.startsWith('module:local-') || item.targetId.startsWith('module:local-'));
    expect(directoryALocal.length).toBeLessThanOrEqual(spatialLocalEdgeBudget('medium'));
    expect(edges.some((item) => item.sourceId === 'module:a' && item.targetId === 'module:c')).toBe(false);
  });

  it('does not keep an exact module edge when one endpoint leaves the candidate set', () => {
    const edges = collectSpatialEdges(
      view,
      visibleNodes.filter((positioned) => positioned.node.id !== 'module:c'),
      visibleRegions,
      regionById,
      expanded,
      'near',
    );
    expect(edges.some((item) => item.sourceId === 'module:a' && item.targetId === 'module:c')).toBe(false);
    expect(edges.some((item) => item.sourceId === 'directory:a' && item.targetId === 'directory:b' && item.aggregated)).toBe(true);
  });

  it('preserves duplicate exact facts as a counted aggregate line', () => {
    const duplicated: AnalyzerViewModel = {
      ...view,
      edges: [edge('duplicate-1', 'module:a', 'module:b'), edge('duplicate-2', 'module:a', 'module:b')],
    };
    const relation = collectSpatialEdges(duplicated, visibleNodes, visibleRegions, regionById, expanded, 'near')
      .find((item) => item.sourceId === 'module:a' && item.targetId === 'module:b');
    expect(relation).toEqual(expect.objectContaining({
      aggregated: true,
      count: 2,
      edgeIds: ['duplicate-1', 'duplicate-2'],
    }));
  });
});
