import { describe, expect, it } from 'vitest';
import { ANALYZER_SPATIAL_TILT_DEGREES, ANALYZER_SPATIAL_YAW_DEGREES, spatialModuleElevation } from './spatialPresentation';
import {
  assignSpatialBoundaryPorts,
  computeSpatialWorldBounds,
  fitSpatialProjectedBounds,
  projectSpatialPoint,
  spatialCameraModel,
  spatialPortIsOnBoundary,
} from './spatialCoordinates';
import {
  PROJECTED_EDGE_ALIGNMENT_EPSILON,
  assignProjectedPerimeterPorts,
  buildProjectedGraphEdge,
  extraAltitudeForEdgeClass,
  projectWorldRect,
  projectedArrowPolygon,
  projectedModuleNode,
  projectedPathIsOpen,
  projectedPathWithinViewport,
  projectedPortOnRect,
  keepProjectedRectInViewport,
  projectedRectFullyInViewport,
  spatialVisibleProjectedEdgeCount,
  projectedRectFromAnchor,
  projectedRouteExcursion,
  sameProjectedGeometry,
} from './spatialProjectedGraph';
import { spatialRouteIntersectsObstacle } from './spatialRouting';

function camera(panX = 0, panY = 0, scale = 1, tilt = 12) {
  return spatialCameraModel({ x: panX, y: panY, scale }, 800, 600, tilt);
}

function fittedCamera(points: readonly { x: number; y: number; z: number }[], tilt = 12) {
  const transform = fitSpatialProjectedBounds(points, 800, 600);
  return spatialCameraModel(transform, 800, 600, tilt, ANALYZER_SPATIAL_YAW_DEGREES, computeSpatialWorldBounds(points));
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
    const visibleView = fittedCamera([
      { x: 5, y: 72, z: spatialModuleElevation() },
      { x: 155, y: 108, z: spatialModuleElevation() },
      { x: 345, y: 72, z: spatialModuleElevation() },
      { x: 495, y: 108, z: spatialModuleElevation() },
    ]);
    expect(moduleEdge({ camera: visibleView }).edge.visible).toBe(true);
  });

  it('keeps Three world routes aligned with the projected card perimeter terminals', () => {
    const view = camera(18, 24, 1.1, 14);
    const sourceWorld = { x: 80, y: 90, width: 150, height: 36, z: spatialModuleElevation() };
    const targetWorld = { x: 420, y: 180, width: 150, height: 36, z: spatialModuleElevation() };
    const source = projectedModuleNode('module:a', { x: sourceWorld.x + 75, y: sourceWorld.y + 18, z: sourceWorld.z }, view);
    const target = projectedModuleNode('module:b', { x: targetWorld.x + 75, y: targetWorld.y + 18, z: targetWorld.z }, view);
    const ports = assignProjectedPerimeterPorts([{ id: 'world:a-b', source: source.cardBounds, target: target.cardBounds }]).get('world:a-b')!;
    const edge = buildProjectedGraphEdge({
      id: 'world:a-b',
      sourceId: 'module:a',
      targetId: 'module:b',
      sourceRegionId: 'directory:a',
      targetRegionId: 'directory:b',
      sourceBounds: source.cardBounds,
      targetBounds: target.cardBounds,
      sourceZ: sourceWorld.z,
      targetZ: targetWorld.z,
      sourcePackageId: 'package:a',
      targetPackageId: 'package:b',
      aggregated: false,
      selected: false,
      connected: false,
      dimmed: false,
      count: 1,
      camera: view,
      ports,
      worldSourceRect: sourceWorld,
      worldTargetRect: targetWorld,
      zoomLevel: 'near',
    });
    expect(edge.worldPoints.length).toBeGreaterThan(2);
    expect(edge.points[0]?.x).toBeCloseTo(ports.start.x, 6);
    expect(edge.points[0]?.y).toBeCloseTo(ports.start.y, 6);
    expect(edge.points.at(-1)?.x).toBeCloseTo(ports.end.x, 6);
    expect(edge.points.at(-1)?.y).toBeCloseTo(ports.end.y, 6);
    expect(projectedPortOnRect(edge.points[0]!, source.cardBounds)).toBe(true);
    expect(projectedPortOnRect(edge.points.at(-1)!, target.cardBounds)).toBe(true);
  });

  it('uses canonical world boundary terminals for projected region aggregate routes', () => {
    const sourceWorld = { x: 40, y: 80, width: 200, height: 160, z: 8 };
    const targetWorld = { x: 380, y: 120, width: 180, height: 140, z: 8 };
    const worldPoints = [
      { x: sourceWorld.x, y: sourceWorld.y, z: sourceWorld.z },
      { x: sourceWorld.x + sourceWorld.width, y: sourceWorld.y + sourceWorld.height, z: sourceWorld.z },
      { x: targetWorld.x, y: targetWorld.y, z: targetWorld.z },
      { x: targetWorld.x + targetWorld.width, y: targetWorld.y + targetWorld.height, z: targetWorld.z },
    ];
    const fitted = fitSpatialProjectedBounds(worldPoints, 800, 600);
    const view = spatialCameraModel(
      fitted,
      800,
      600,
      ANALYZER_SPATIAL_TILT_DEGREES,
      ANALYZER_SPATIAL_YAW_DEGREES,
      computeSpatialWorldBounds(worldPoints),
    );
    const sourceBounds = projectWorldRect(sourceWorld, view);
    const targetBounds = projectWorldRect(targetWorld, view);
    const worldPorts = assignSpatialBoundaryPorts([{ id: 'region-route', source: sourceWorld, target: targetWorld }]).get('region-route')!;
    const edge = buildProjectedGraphEdge({
      id: 'region-route',
      sourceId: 'directory:source',
      targetId: 'directory:target',
      sourceRegionId: 'directory:source',
      targetRegionId: 'directory:target',
      sourceBounds,
      targetBounds,
      sourceZ: sourceWorld.z,
      targetZ: targetWorld.z,
      sourcePackageId: 'package:a',
      targetPackageId: 'package:b',
      aggregated: true,
      selected: false,
      connected: false,
      dimmed: false,
      count: 2,
      camera: view,
      ports: {
        start: projectSpatialPoint(worldPorts.start, view),
        end: projectSpatialPoint(worldPorts.end, view),
      },
      worldSourceRect: sourceWorld,
      worldTargetRect: targetWorld,
      worldSourcePort: worldPorts.start,
      worldTargetPort: worldPorts.end,
      caption: 'source → target · 2',
    });
    expect(spatialPortIsOnBoundary(edge.worldPoints[0]!, sourceWorld)).toBe(true);
    expect(spatialPortIsOnBoundary(edge.worldPoints.at(-1)!, targetWorld)).toBe(true);
    expect(edge.points[0]?.x).toBeCloseTo(projectSpatialPoint(worldPorts.start, view).x, 6);
    expect(edge.points.at(-1)?.y).toBeCloseTo(projectSpatialPoint(worldPorts.end, view).y, 6);
  });

  it('keeps an occlusion-free Three route when a visible card sits between the endpoints', () => {
    const sourceWorld = { x: 80, y: 90, width: 150, height: 36, z: spatialModuleElevation() };
    const targetWorld = { x: 520, y: 90, width: 150, height: 36, z: spatialModuleElevation() };
    const blocker = { id: 'module:blocker', x: 300, y: 90, width: 150, height: 36 };
    const view = fittedCamera([
      { x: sourceWorld.x, y: sourceWorld.y, z: sourceWorld.z },
      { x: sourceWorld.x + sourceWorld.width, y: sourceWorld.y + sourceWorld.height, z: sourceWorld.z },
      { x: targetWorld.x, y: targetWorld.y, z: targetWorld.z },
      { x: targetWorld.x + targetWorld.width, y: targetWorld.y + targetWorld.height, z: targetWorld.z },
      { x: blocker.x - 14, y: blocker.y - 14, z: sourceWorld.z },
      { x: blocker.x + blocker.width + 14, y: blocker.y - 14, z: sourceWorld.z },
    ], 14);
    const source = projectedModuleNode('module:a', { x: sourceWorld.x + 75, y: sourceWorld.y + 18, z: sourceWorld.z }, view);
    const target = projectedModuleNode('module:b', { x: targetWorld.x + 75, y: targetWorld.y + 18, z: targetWorld.z }, view);
    const ports = assignProjectedPerimeterPorts([{ id: 'occlusion-free', source: source.cardBounds, target: target.cardBounds }]).get('occlusion-free');
    const edge = buildProjectedGraphEdge({
      id: 'occlusion-free',
      sourceId: 'module:a',
      targetId: 'module:b',
      sourceRegionId: 'directory:a',
      targetRegionId: 'directory:a',
      sourceBounds: source.cardBounds,
      targetBounds: target.cardBounds,
      sourceZ: sourceWorld.z,
      targetZ: targetWorld.z,
      sourcePackageId: 'package:a',
      targetPackageId: 'package:a',
      aggregated: false,
      selected: false,
      connected: false,
      dimmed: false,
      count: 1,
      camera: view,
      ports: ports!,
      worldSourceRect: sourceWorld,
      worldTargetRect: targetWorld,
      obstacles: [blocker],
      zoomLevel: 'near',
    });

    expect(edge.visible).toBe(true);
    expect(spatialRouteIntersectsObstacle(edge.worldPoints, blocker)).toBe(false);
    expect(projectedPortOnRect(edge.points[0]!, source.cardBounds)).toBe(true);
    expect(projectedPortOnRect(edge.points.at(-1)!, target.cardBounds)).toBe(true);
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
      caption: 'directory:a → directory:b · 4',
    });
    expect(edge.labelAnchor).toEqual(edge.points[Math.floor(edge.points.length / 2)]);
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
    });
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

  it('hides a selected relation when its source card is outside the viewport', () => {
    const view = camera();
    const source = { x: -240, y: 80, width: 150, height: 36 };
    const target = { x: 220, y: 80, width: 150, height: 36 };
    const ports = assignProjectedPerimeterPorts([{ id: 'hidden-source', source, target }]).get('hidden-source');
    const edge = buildProjectedGraphEdge({
      id: 'hidden-source',
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
    });
    expect(projectedRectFullyInViewport(source, view)).toBe(false);
    expect(projectedRectFullyInViewport(target, view)).toBe(true);
    expect(edge.visible).toBe(false);
    expect(spatialVisibleProjectedEdgeCount([edge])).toBe(0);
  });

  it('hides a selected relation when its target card is outside the viewport', () => {
    const view = camera();
    const source = { x: 220, y: 80, width: 150, height: 36 };
    const target = { x: 920, y: 80, width: 150, height: 36 };
    const ports = assignProjectedPerimeterPorts([{ id: 'hidden-target', source, target }]).get('hidden-target');
    const edge = buildProjectedGraphEdge({
      id: 'hidden-target',
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
    });
    expect(projectedRectFullyInViewport(source, view)).toBe(true);
    expect(projectedRectFullyInViewport(target, view)).toBe(false);
    expect(edge.visible).toBe(false);
  });

  it('hides an aggregate when either semantic Region is outside the viewport', () => {
    const view = camera();
    const home = { x: 40, y: 180, width: 160, height: 140 };
    const away = { x: 790, y: 180, width: 160, height: 140 };
    const ports = assignProjectedPerimeterPorts([{ id: 'hidden-region', source: home, target: away }]).get('hidden-region')!;
    const edge = buildProjectedGraphEdge({
      id: 'hidden-region',
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
      count: 16,
      camera: view,
      ports,
    });
    expect(projectedRectFullyInViewport(home, view)).toBe(true);
    expect(projectedRectFullyInViewport(away, view)).toBe(false);
    expect(edge.visible).toBe(false);
  });

  it('keeps a visible aggregate as one complete boundary-to-boundary path', () => {
    const view = camera();
    const home = { x: 80, y: 80, width: 140, height: 100 };
    const away = { x: 240, y: 90, width: 140, height: 100 };
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
      caption: 'directory:home → directory:away · 22',
    });
    expect(edge.visible).toBe(true);
    expect(edge.points.length).toBe(2);
    expect(projectedPathWithinViewport(edge.points, view)).toBe(true);
  });

  it('hides an unlabeled aggregate from the readable relation count', () => {
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
      caption: '',
    });
    expect(edge.readable).toBe(false);
    expect(edge.visible).toBe(false);
    expect(spatialVisibleProjectedEdgeCount([edge])).toBe(0);
  });

  it('keeps aggregate arrow direction from source Region to target Region', () => {
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
      caption: 'directory:away → module:sink · 10',
    });
    const start = edge.points[0]!;
    const end = edge.points.at(-1)!;
    expect(end.x).toBeGreaterThan(start.x);
    expect(edge.arrow.angle).toBeGreaterThan(-0.6);
    expect(edge.arrow.angle).toBeLessThan(0.6);
  });
});
