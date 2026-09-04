import { describe, expect, it } from 'vitest';
import { ANALYZER_SPATIAL_TILT_DEGREES, ANALYZER_SPATIAL_YAW_DEGREES, spatialModuleElevation } from './spatialPresentation';
import { fitSpatialProjectedBounds, computeSpatialWorldBounds, spatialCameraModel } from './spatialCoordinates';
import {
  PROJECTED_EDGE_ALIGNMENT_EPSILON,
  applySpatialStubLayout,
  assignProjectedPerimeterPorts,
  buildProjectedGraphEdge,
  extraAltitudeForEdgeClass,
  projectWorldRect,
  projectedArrowPolygon,
  projectedModuleNode,
  projectedPathIsOpen,
  projectedPortOnRect,
  keepProjectedRectInViewport,
  spatialVisibleProjectedEdgeCount,
  projectedRectFromAnchor,
  projectedRouteExcursion,
  sameProjectedGeometry,
} from './spatialProjectedGraph';

function camera(panX = 0, panY = 0, scale = 1, tilt = 12) {
  return spatialCameraModel({ x: panX, y: panY, scale }, 800, 600, tilt);
}

function moduleEdge(options: {
  camera: ReturnType<typeof camera>;
  selected?: boolean;
  connected?: boolean;
}) {
  const source = projectedModuleNode('module:a', { x: 80, y: 90, z: spatialModuleElevation() }, options.camera);
  const target = projectedModuleNode('module:b', { x: 420, y: 90, z: spatialModuleElevation() }, options.camera);
  const ports = assignProjectedPerimeterPorts([{
    id: 'edge:a-b',
    source: source.cardBounds,
    target: target.cardBounds,
  }]).get('edge:a-b');
  if (!ports) throw new Error('missing ports');
  return {
    source,
    target,
    edge: buildProjectedGraphEdge({
      id: 'edge:a-b',
      sourceId: 'module:a',
      targetId: 'module:b',
      sourceRegionId: 'directory:a',
      targetRegionId: 'directory:a',
      sourceBounds: source.cardBounds,
      targetBounds: target.cardBounds,
      sourceZ: spatialModuleElevation(),
      targetZ: spatialModuleElevation(),
      sourcePackageId: 'package:a',
      targetPackageId: 'package:a',
      aggregated: false,
      selected: options.selected ?? false,
      connected: options.connected ?? false,
      dimmed: false,
      count: 1,
      camera: options.camera,
      ports,
    }),
  };
}

describe('projected graph layer', () => {
  it(`attaches A → B terminals to card perimeters within ${PROJECTED_EDGE_ALIGNMENT_EPSILON}px after pan, zoom, and tilt`, () => {
    const views = [
      camera(),
      camera(96, -40, 1),
      camera(0, 0, 0.55),
      camera(18, 24, 1.25, 10),
      camera(18, 24, 1.25, 14),
    ];
    views.forEach((view) => {
      const { source, target, edge } = moduleEdge({ camera: view });
      const start = edge.points[0];
      const end = edge.points.at(-1);
      expect(start).toBeTruthy();
      expect(end).toBeTruthy();
      expect(projectedPortOnRect(start!, source.cardBounds)).toBe(true);
      expect(projectedPortOnRect(end!, target.cardBounds)).toBe(true);
      expect(source.cardBounds.width).toBeGreaterThan(0);
      expect(source.cardBounds.height).toBeGreaterThan(0);
      expect(source.anchorX).toBeCloseTo(source.cardBounds.x + source.cardBounds.width / 2);
      expect(source.anchorY).toBeCloseTo(source.cardBounds.y + source.cardBounds.height / 2);
    });
  });

  it('keeps selected edge geometry identical to the unselected base path', () => {
    const view = camera(12, 8, 0.9);
    const base = moduleEdge({ camera: view, selected: false });
    const selected = moduleEdge({ camera: view, selected: true, connected: true });
    expect(sameProjectedGeometry(base.edge, selected.edge)).toBe(true);
    expect(selected.edge.selected).toBe(true);
    expect(base.edge.selected).toBe(false);
  });

  it('connects region aggregates on projected region bounds, not child modules', () => {
    const points = [
      { x: 0, y: 0, z: 8 },
      { x: 200, y: 160, z: 8 },
      { x: 360, y: 40, z: 8 },
      { x: 540, y: 180, z: 8 },
    ];
    const fitted = fitSpatialProjectedBounds(points, 800, 600);
    const view = spatialCameraModel(
      fitted,
      800,
      600,
      ANALYZER_SPATIAL_TILT_DEGREES,
      ANALYZER_SPATIAL_YAW_DEGREES,
      computeSpatialWorldBounds(points),
    );
    const regionA = projectWorldRect({ x: 0, y: 0, width: 200, height: 160, z: 8 }, view);
    const regionB = projectWorldRect({ x: 360, y: 40, width: 180, height: 140, z: 8 }, view);
    const child = projectedRectFromAnchor({ x: 80, y: 70 });
    const ports = assignProjectedPerimeterPorts([{ id: 'agg', source: regionA, target: regionB }]).get('agg');
    expect(ports).toBeTruthy();
    expect(projectedPortOnRect(ports!.start, regionA)).toBe(true);
    expect(projectedPortOnRect(ports!.end, regionB)).toBe(true);
    expect(projectedPortOnRect(ports!.start, child)).toBe(false);
    const edge = buildProjectedGraphEdge({
      id: 'agg',
      sourceId: 'directory:a',
      targetId: 'directory:b',
      sourceRegionId: 'directory:a',
      targetRegionId: 'directory:b',
      sourceBounds: regionA,
      targetBounds: regionB,
      sourceZ: 8,
      targetZ: 8,
      sourcePackageId: 'package:a',
      targetPackageId: 'package:a',
      aggregated: true,
      selected: false,
      connected: true,
      dimmed: false,
      count: 4,
      camera: view,
      ports: ports!,
    });
    expect(edge.pill).toEqual(edge.points[Math.floor(edge.points.length / 2)]);
    expect(edge.visible).toBe(true);
  });

  it('keeps local projected routes short and cross-package arcs off huge rectangles', () => {
    const view = camera();
    const local = moduleEdge({ camera: view }).edge;
    expect(local.edgeClass).toBe('local');
    expect(local.points.length).toBe(2);
    expect(projectedRouteExcursion(local.points)).toBeLessThan(1);
    expect(extraAltitudeForEdgeClass('cross-package', 16, 16)).toBeGreaterThan(extraAltitudeForEdgeClass('cross-directory', 16, 16));
    expect(extraAltitudeForEdgeClass('local', 16, 16)).toBe(0);
    const source = projectedModuleNode('module:a', { x: 80, y: 90, z: 16 }, view);
    const target = projectedModuleNode('module:b', { x: 520, y: 260, z: 16 }, view);
    const ports = assignProjectedPerimeterPorts([{ id: 'cross', source: source.cardBounds, target: target.cardBounds }]).get('cross');
    const cross = buildProjectedGraphEdge({
      id: 'cross',
      sourceId: 'module:a',
      targetId: 'module:b',
      sourceRegionId: 'directory:a',
      targetRegionId: 'directory:b',
      sourceBounds: source.cardBounds,
      targetBounds: target.cardBounds,
      sourceZ: 16,
      targetZ: 16,
      sourcePackageId: 'package:a',
      targetPackageId: 'package:b',
      aggregated: false,
      selected: false,
      connected: false,
      dimmed: false,
      count: 1,
      camera: view,
      ports: ports!,
      worldStart: { x: 80, y: 90, z: 16 },
      worldEnd: { x: 520, y: 260, z: 16 },
    });
    const chord = Math.hypot(
      (cross.points.at(-1)?.x ?? 0) - (cross.points[0]?.x ?? 0),
      (cross.points.at(-1)?.y ?? 0) - (cross.points[0]?.y ?? 0),
    );
    expect(cross.edgeClass).toBe('cross-package');
    expect(projectedPathIsOpen(cross.path)).toBe(true);
    expect(cross.path.includes(' Z')).toBe(false);
    expect(/Q /.test(cross.path)).toBe(true);
    expect(chord).toBeGreaterThan(40);
    const arrowPoints = projectedArrowPolygon(cross.arrow).split(' ').map((pair) => {
      const [x = 0, y = 0] = pair.split(',').map(Number);
      return { x, y };
    });
    const tip = arrowPoints[0]!;
    const arrowSpan = Math.max(...arrowPoints.map((point) => Math.hypot(point.x - tip.x, point.y - tip.y)));
    expect(arrowSpan).toBeLessThan(12);
  });

  it('keeps Far aggregate relations as complete source-to-target paths', () => {
    const view = camera();
    const home = { x: 40, y: 40, width: 180, height: 140 };
    const away = { x: 520, y: 40, width: 180, height: 140 };
    const ports = assignProjectedPerimeterPorts([{ id: 'far-agg', source: home, target: away }]).get('far-agg');
    const edge = buildProjectedGraphEdge({
      id: 'far-agg',
      sourceId: 'directory:home',
      targetId: 'directory:away',
      sourceRegionId: 'directory:home',
      targetRegionId: 'directory:away',
      sourceBounds: home,
      targetBounds: away,
      sourceZ: 8,
      targetZ: 8,
      aggregated: true,
      selected: false,
      connected: true,
      dimmed: false,
      count: 6,
      camera: view,
      ports: ports!,
      homeId: 'directory:home',
    });
    expect(edge.compact).toBe(false);
    expect(edge.points.length).toBe(2);
    expect(edge.points[0]?.x).toBeCloseTo(home.x + home.width);
    expect(edge.points.at(-1)?.x).toBeCloseTo(away.x);
    expect(projectedPathIsOpen(edge.path)).toBe(true);
  });

  it('pulls a neighbour card fully into the viewport when its anchor is visible', () => {
    const cameraModel = camera();
    const rect = { x: 760, y: 40, width: 150, height: 36 };
    const kept = keepProjectedRectInViewport(rect, cameraModel, 8);
    expect(kept.x + kept.width).toBeLessThanOrEqual(cameraModel.viewportWidth - 8);
    expect(kept.x).toBeGreaterThanOrEqual(8);
  });

  it('keeps an offscreen selected relation connected to the visible endpoint', () => {
    const view = camera();
    const source = { x: -240, y: 80, width: 150, height: 36 };
    const target = { x: 220, y: 80, width: 150, height: 36 };
    const ports = assignProjectedPerimeterPorts([{ id: 'offscreen', source, target }]).get('offscreen');
    const edge = buildProjectedGraphEdge({
      id: 'offscreen',
      sourceId: 'module:a',
      targetId: 'module:b',
      sourceRegionId: 'directory:a',
      targetRegionId: 'directory:a',
      sourceBounds: source,
      targetBounds: target,
      sourceZ: 16,
      targetZ: 16,
      aggregated: false,
      selected: false,
      connected: true,
      dimmed: false,
      count: 1,
      camera: view,
      ports: ports!,
      homeId: 'module:a',
      sourceAnchor: { x: source.x + 75, y: source.y + 18 },
      targetAnchor: { x: target.x + 75, y: target.y + 18 },
    });
    expect(edge.continuation).toBe(true);
    expect(edge.visible).toBe(true);
    expect(Math.hypot((edge.points.at(-1)?.x ?? 0) - (edge.points[0]?.x ?? 0), (edge.points.at(-1)?.y ?? 0) - (edge.points[0]?.y ?? 0))).toBeGreaterThan(250);
    expect(spatialVisibleProjectedEdgeCount([edge])).toBe(1);
  });

  it('points a source-offscreen continuation toward the visible target', () => {
    const view = camera();
    const source = { x: -240, y: 80, width: 150, height: 36 };
    const target = { x: 220, y: 80, width: 150, height: 36 };
    const ports = assignProjectedPerimeterPorts([{ id: 'off-a', source, target }]).get('off-a');
    const edge = buildProjectedGraphEdge({
      id: 'off-a',
      sourceId: 'module:a',
      targetId: 'module:b',
      sourceRegionId: 'directory:a',
      targetRegionId: 'directory:a',
      sourceBounds: source,
      targetBounds: target,
      sourceZ: 16,
      targetZ: 16,
      aggregated: false,
      selected: true,
      connected: true,
      dimmed: false,
      count: 1,
      camera: view,
      ports: ports!,
      sourceAnchor: { x: source.x + 75, y: source.y + 18 },
      targetAnchor: { x: target.x + 75, y: target.y + 18 },
    });
    const start = edge.points[0]!;
    const end = edge.points.at(-1)!;
    expect(edge.continuationKind).toBe('source-offscreen');
    expect(end.x).toBeCloseTo(ports!.end.x, 4);
    expect(end.y).toBeCloseTo(ports!.end.y, 4);
    expect(start.x).toBeLessThan(end.x);
    expect(edge.arrow.angle).toBeGreaterThan(-0.4);
    expect(edge.arrow.angle).toBeLessThan(0.4);
    expect(edge.path.includes(' Z')).toBe(false);
  });

  it('points a target-offscreen continuation toward the missing target', () => {
    const view = camera();
    const source = { x: 220, y: 80, width: 150, height: 36 };
    const target = { x: 920, y: 80, width: 150, height: 36 };
    const ports = assignProjectedPerimeterPorts([{ id: 'off-b', source, target }]).get('off-b');
    const edge = buildProjectedGraphEdge({
      id: 'off-b',
      sourceId: 'module:a',
      targetId: 'module:b',
      sourceRegionId: 'directory:a',
      targetRegionId: 'directory:a',
      sourceBounds: source,
      targetBounds: target,
      sourceZ: 16,
      targetZ: 16,
      aggregated: false,
      selected: true,
      connected: true,
      dimmed: false,
      count: 1,
      camera: view,
      ports: ports!,
      sourceAnchor: { x: source.x + 75, y: source.y + 18 },
      targetAnchor: { x: target.x + 75, y: target.y + 18 },
    });
    const start = edge.points[0]!;
    const end = edge.points.at(-1)!;
    expect(edge.continuationKind).toBe('target-offscreen');
    expect(start.x).toBeCloseTo(ports!.start.x, 4);
    expect(end.x).toBeGreaterThan(start.x);
    expect(edge.arrow.angle).toBeGreaterThan(-0.4);
    expect(edge.arrow.angle).toBeLessThan(0.4);
  });

  it('culls a path fragment when both semantic endpoints are outside the viewport', () => {
    const view = camera();
    const source = { x: -520, y: 80, width: 150, height: 36 };
    const target = { x: 1120, y: 80, width: 150, height: 36 };
    const ports = assignProjectedPerimeterPorts([{ id: 'orphaned', source, target }]).get('orphaned');
    const edge = buildProjectedGraphEdge({
      id: 'orphaned',
      sourceId: 'module:a',
      targetId: 'module:b',
      sourceRegionId: 'directory:a',
      targetRegionId: 'directory:b',
      sourceBounds: source,
      targetBounds: target,
      sourceZ: spatialModuleElevation(),
      targetZ: spatialModuleElevation(),
      aggregated: false,
      selected: true,
      connected: true,
      dimmed: false,
      count: 1,
      camera: view,
      ports: ports!,
    });
    expect(edge.continuation).toBe(false);
    expect(edge.visible).toBe(false);
  });

  it('keeps multiple aggregate relations as separate complete paths', () => {
    const view = camera();
    const home = { x: 4, y: 180, width: 160, height: 140 };
    const awayLeft = { x: -420, y: 180, width: 160, height: 140 };
    const awayLeftTwo = { x: -480, y: 80, width: 160, height: 140 };
    const portsA = assignProjectedPerimeterPorts([{ id: 'stub-a', source: home, target: awayLeft }]).get('stub-a')!;
    const portsB = assignProjectedPerimeterPorts([{ id: 'stub-b', source: home, target: awayLeftTwo }]).get('stub-b')!;
    const first = buildProjectedGraphEdge({
      id: 'stub-a',
      sourceId: 'directory:home',
      targetId: 'directory:away',
      sourceRegionId: 'directory:home',
      targetRegionId: 'directory:away',
      sourceBounds: home,
      targetBounds: awayLeft,
      sourceZ: 8,
      targetZ: 8,
      aggregated: true,
      selected: false,
      connected: true,
      dimmed: false,
      count: 16,
      camera: view,
      ports: portsA,
      homeId: 'directory:home',
    });
    const second = buildProjectedGraphEdge({
      id: 'stub-b',
      sourceId: 'directory:home',
      targetId: 'directory:away-two',
      sourceRegionId: 'directory:home',
      targetRegionId: 'directory:away-two',
      sourceBounds: home,
      targetBounds: awayLeftTwo,
      sourceZ: 8,
      targetZ: 8,
      aggregated: true,
      selected: false,
      connected: true,
      dimmed: false,
      count: 4,
      camera: view,
      ports: portsB,
      homeId: 'directory:home',
    });
    expect(first.compact).toBe(false);
    const laidOut = applySpatialStubLayout([first, second], view, {
      homeId: 'directory:home',
      homeBounds: home,
      counterpartBounds: (edge) => edge.id === 'stub-a' ? awayLeft : awayLeftTwo,
      pillSize: () => ({ width: 140, height: 18 }),
    });
    laidOut.forEach((edge) => expect(edge.compact).toBe(false));
    const [a, b] = laidOut;
    expect(a?.path).not.toBe(b?.path);
  });

  it('keeps a barely offscreen aggregate connected instead of replacing it with a stub', () => {
    const view = camera();
    const home = { x: 420, y: 200, width: 160, height: 120 };
    const away = { x: 790, y: 200, width: 180, height: 120 };
    const ports = assignProjectedPerimeterPorts([{ id: 'near-off', source: home, target: away }]).get('near-off')!;
    const edge = buildProjectedGraphEdge({
      id: 'near-off',
      sourceId: 'directory:home',
      targetId: 'directory:away',
      sourceRegionId: 'directory:home',
      targetRegionId: 'directory:away',
      sourceBounds: home,
      targetBounds: away,
      sourceZ: 8,
      targetZ: 8,
      aggregated: true,
      selected: false,
      connected: true,
      dimmed: false,
      count: 22,
      camera: view,
      ports,
      homeId: 'directory:home',
    });
    expect(edge.compact).toBe(false);
    expect(edge.visible).toBe(true);
    expect(Math.hypot((edge.points.at(-1)?.x ?? 0) - (edge.points[0]?.x ?? 0), (edge.points.at(-1)?.y ?? 0) - (edge.points[0]?.y ?? 0))).toBeGreaterThan(80);
  });

  it('never draws a full aggregate and a stub for the same relation', () => {
    const view = camera();
    const home = { x: 80, y: 80, width: 140, height: 100 };
    const away = { x: 240, y: 90, width: 140, height: 100 };
    const ports = assignProjectedPerimeterPorts([{ id: 'full', source: home, target: away }]).get('full')!;
    const edge = buildProjectedGraphEdge({
      id: 'full',
      sourceId: 'directory:home',
      targetId: 'directory:away',
      sourceRegionId: 'directory:home',
      targetRegionId: 'directory:away',
      sourceBounds: home,
      targetBounds: away,
      sourceZ: 8,
      targetZ: 8,
      aggregated: true,
      selected: false,
      connected: true,
      dimmed: false,
      count: 3,
      camera: view,
      ports,
      homeId: 'directory:home',
    });
    expect(edge.compact).toBe(false);
    expect(edge.continuation).toBe(false);
    expect(edge.points.length).toBe(2);
  });

  it('hides unlabeled compact stubs from the readable relation count', () => {
    const view = camera();
    const home = { x: 40, y: 40, width: 180, height: 140 };
    const away = { x: 520, y: 40, width: 180, height: 140 };
    const ports = assignProjectedPerimeterPorts([{ id: 'anon', source: home, target: away }]).get('anon')!;
    const edge = buildProjectedGraphEdge({
      id: 'anon',
      sourceId: 'directory:home',
      targetId: 'directory:away',
      sourceRegionId: 'directory:home',
      targetRegionId: 'directory:away',
      sourceBounds: home,
      targetBounds: away,
      sourceZ: 8,
      targetZ: 8,
      aggregated: true,
      selected: false,
      connected: true,
      dimmed: false,
      count: 3,
      camera: view,
      ports,
      homeId: 'directory:home',
      caption: '',
    });
    expect(edge.readable).toBe(false);
    expect(edge.visible).toBe(false);
    expect(spatialVisibleProjectedEdgeCount([edge])).toBe(0);
  });

  it('keeps incoming compact stubs arriving at the selected target', () => {
    const view = camera();
    const source = { x: 40, y: 80, width: 160, height: 40 };
    const target = { x: 360, y: 80, width: 160, height: 40 };
    const ports = assignProjectedPerimeterPorts([{ id: 'in', source, target }]).get('in')!;
    const edge = buildProjectedGraphEdge({
      id: 'in',
      sourceId: 'directory:away',
      targetId: 'module:sink',
      sourceRegionId: 'directory:away',
      targetRegionId: 'directory:home',
      sourceBounds: source,
      targetBounds: target,
      sourceZ: 8,
      targetZ: 16,
      aggregated: true,
      selected: false,
      connected: true,
      dimmed: false,
      count: 10,
      camera: view,
      ports,
      homeId: 'module:sink',
      caption: '← routes · 10',
    });
    const start = edge.points[0]!;
    const end = edge.points.at(-1)!;
    expect(end.x).toBeGreaterThan(start.x);
    expect(edge.arrow.angle).toBeGreaterThan(-0.6);
    expect(edge.arrow.angle).toBeLessThan(0.6);
  });
});
