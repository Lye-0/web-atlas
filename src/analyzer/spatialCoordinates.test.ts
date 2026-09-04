import { describe, expect, it } from 'vitest';
import { ANALYZER_MODULE_NODE_HEIGHT, ANALYZER_MODULE_NODE_WIDTH } from './layout';
import { ANALYZER_SPATIAL_YAW_DEGREES, spatialModuleElevation } from './spatialPresentation';
import { configureSpatialCamera } from './spatialThreeCamera';
import {
  ANALYZER_SPATIAL_FIT_PADDING,
  fitSpatialProjectedBounds,
  focusSpatialCamera,
  isCompatibleSpatialCameraTransform,
  layoutToThreePoint,
  moduleWorldAnchor,
  ndcInFrustum,
  overlayAnchorDrift,
  projectSpatialPoint,
  regionRectCorners,
  resolveSpatialOverlayCollision,
  spatialAggregatePillVisible,
  spatialCameraModel,
  spatialCameraPose,
  spatialHeadingFitPoints,
  spatialNdc,
  spatialPointInFrontOfCamera,
  spatialPortIsOnBoundary,
  spatialProjectedOccupancy,
  spatialRegionBoundaryPort,
  assignSpatialBoundaryPorts,
  computeSpatialWorldBounds,
  type SpatialWorldPoint,
} from './spatialCoordinates';
import * as THREE from 'three';

function camera(panX = 0, panY = 0, scale = 1) {
  return spatialCameraModel({ x: panX, y: panY, scale }, 800, 600);
}

describe('spatial world / screen coordinates', () => {
  it('projects a module world anchor to the same screen point used by the overlay card center', () => {
    const elevation = spatialModuleElevation(1);
    const node = { x: 120, y: 80, height: ANALYZER_MODULE_NODE_HEIGHT };
    const anchor = moduleWorldAnchor(node, elevation);
    const view = camera(40, 30, 0.8);
    const projected = projectSpatialPoint(anchor, view);
    const cardTopLeft = {
      x: projected.x - ANALYZER_MODULE_NODE_WIDTH / 2,
      y: projected.y - ANALYZER_MODULE_NODE_HEIGHT / 2,
    };
    expect(overlayAnchorDrift(cardTopLeft, { width: ANALYZER_MODULE_NODE_WIDTH, height: ANALYZER_MODULE_NODE_HEIGHT }, projected)).toBeCloseTo(0);
  });

  it('projects world points with a Three.js camera instead of a handwritten tangent shear', () => {
    const view = camera(20, 30, 1);
    const origin = projectSpatialPoint({ x: 0, y: 0, z: 0 }, view);
    const right = projectSpatialPoint({ x: 200, y: 0, z: 0 }, view);
    const down = projectSpatialPoint({ x: 0, y: 200, z: 0 }, view);
    const far = projectSpatialPoint({ x: 200, y: 200, z: 0 }, view);
    expect(far.x).not.toBeCloseTo(right.x, 0);
    expect(far.y).not.toBeCloseTo(down.y, 0);
    expect(Math.abs(right.y - origin.y)).toBeGreaterThan(8);
    expect(Math.abs(down.x - origin.x)).toBeGreaterThan(8);
    expect(Math.abs((right.y - origin.y) / Math.max(1, right.x - origin.x))).toBeGreaterThan(0.02);
    const elevated = projectSpatialPoint({ x: 80, y: 80, z: 40 }, view);
    const three = new THREE.OrthographicCamera();
    configureSpatialCamera(three, view);
    const vector = new THREE.Vector3(80, 40, 80);
    vector.project(three);
    expect(elevated.x).toBeCloseTo((vector.x * 0.5 + 0.5) * view.viewportWidth, 5);
    expect(elevated.y).toBeCloseTo((-vector.y * 0.5 + 0.5) * view.viewportHeight, 5);
    expect(ANALYZER_SPATIAL_YAW_DEGREES).toBeGreaterThan(0);
  });

  it('projects a region plane into a spatial quad rather than a face-on rectangle', () => {
    const view = camera();
    const corners = regionRectCorners({ x: 40, y: 60, width: 240, height: 160, z: 8 }).map((point) => projectSpatialPoint(point, view));
    const xs = new Set(corners.map((point) => Math.round(point.x)));
    const ys = new Set(corners.map((point) => Math.round(point.y)));
    expect(xs.size).toBeGreaterThan(2);
    expect(ys.size).toBeGreaterThan(2);
  });

  it('fits Far package heading footprints into the viewport inset', () => {
    const plane = regionRectCorners({ x: 0, y: 40, width: 220, height: 140, z: 2 });
    const headings = spatialHeadingFitPoints(
      [{ x: 0, y: 40, width: 220, headingHeight: 30, regionKind: 'workspace-package' }],
      () => 2,
    );
    const transform = fitSpatialProjectedBounds([...plane, ...headings], 800, 600, ANALYZER_SPATIAL_FIT_PADDING);
    const view = spatialCameraModel(transform, 800, 600, undefined, undefined, computeSpatialWorldBounds([...plane, ...headings]));
    headings.forEach((point) => {
      const screen = projectSpatialPoint(point, view);
      expect(screen.x).toBeGreaterThanOrEqual(ANALYZER_SPATIAL_FIT_PADDING.left - 8);
      expect(screen.y).toBeGreaterThanOrEqual(ANALYZER_SPATIAL_FIT_PADDING.top - 8);
      expect(screen.x).toBeLessThanOrEqual(800 - ANALYZER_SPATIAL_FIT_PADDING.right + 8);
    });
  });

  it('hides colliding Far package headings instead of stacking them', () => {
    const visibility = resolveSpatialOverlayCollision([
      { id: 'pkg-a', kind: 'package-heading', screen: { x: 40, y: 20, width: 180, height: 22 } },
      { id: 'pkg-b', kind: 'package-heading', screen: { x: 48, y: 18, width: 180, height: 22 } },
      { id: 'root', kind: 'root-package-heading', screen: { x: 42, y: 16, width: 160, height: 22 } },
      { id: 'directory', kind: 'major-directory-heading', screen: { x: 50, y: 14, width: 90, height: 22 } },
    ]);
    expect(visibility.get('root')).toBe('show');
    expect(visibility.get('pkg-a') === 'show' && visibility.get('pkg-b') === 'show').toBe(false);
    expect(visibility.get('directory')).toBe('hide');
  });

  it('hides Far directory headings that cover a package name without moving the package', () => {
    const visibility = resolveSpatialOverlayCollision([
      { id: 'package', kind: 'package-heading', screen: { x: 40, y: 20, width: 180, height: 22 } },
      { id: 'directory', kind: 'major-directory-heading', screen: { x: 48, y: 18, width: 90, height: 22 } },
      { id: 'pill', kind: 'aggregate-pill', screen: { x: 50, y: 16, width: 110, height: 18 } },
    ]);
    expect(visibility.get('package')).toBe('show');
    expect(visibility.get('directory')).toBe('hide');
    expect(visibility.get('pill')).toBe('hide');
  });

  it('places region aggregate endpoints on region boundaries instead of child modules', () => {
    const regionA = { x: 0, y: 0, width: 200, height: 160, z: 8 };
    const regionB = { x: 360, y: 40, width: 180, height: 140, z: 8 };
    const child = { x: 40, y: 50, width: 150, height: 36, z: 16 };
    const assigned = assignSpatialBoundaryPorts([
      { id: 'a-b-1', source: regionA, target: regionB },
      { id: 'a-b-2', source: regionA, target: regionB },
    ]);
    const first = assigned.get('a-b-1');
    const second = assigned.get('a-b-2');
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(spatialPortIsOnBoundary(first!.start, regionA)).toBe(true);
    expect(spatialPortIsOnBoundary(first!.end, regionB)).toBe(true);
    expect(spatialPortIsOnBoundary(second!.start, regionA)).toBe(true);
    expect(first!.start.x).not.toBeCloseTo(child.x + 75, 0);
    expect(first!.start.y).not.toBeCloseTo(child.y + 18, 0);
    expect(Math.hypot(first!.start.x - second!.start.x, first!.start.y - second!.start.y)).toBeGreaterThan(4);
    const single = spatialRegionBoundaryPort(regionA, regionB);
    expect(spatialPortIsOnBoundary(single, regionA)).toBe(true);
  });

  it('hides lower-priority overlay items without moving module cards off their anchors', () => {
    const visibility = resolveSpatialOverlayCollision([
      { id: 'pill', kind: 'aggregate-pill', screen: { x: 40, y: 40, width: 120, height: 18 } },
      { id: 'module', kind: 'module-card', screen: { x: 48, y: 36, width: 150, height: 36 } },
      { id: 'selected', kind: 'selected-module', screen: { x: 40, y: 30, width: 150, height: 36 } },
      { id: 'package', kind: 'package-heading', screen: { x: 36, y: 8, width: 160, height: 22 } },
      { id: 'minor', kind: 'minor-heading', screen: { x: 50, y: 12, width: 100, height: 18 } },
    ]);
    expect(visibility.get('selected')).toBe('show');
    expect(visibility.get('package')).toBe('hide');
    expect(visibility.get('module')).toBe('hide');
    expect(visibility.get('pill')).toBe('hide');
    expect(visibility.get('minor')).toBe('hide');
    const selectedCenter = { x: 40 + 75, y: 30 + 18 };
    expect(overlayAnchorDrift({ x: 40, y: 30 }, { width: 150, height: 36 }, selectedCenter)).toBeCloseTo(0);
  });

  it('keeps selected neighbours visible ahead of ordinary cards and pills', () => {
    const visibility = resolveSpatialOverlayCollision([
      { id: 'neighbour', kind: 'neighbour-module', screen: { x: 40, y: 36, width: 150, height: 36 } },
      { id: 'module', kind: 'module-card', screen: { x: 42, y: 38, width: 150, height: 36 } },
      { id: 'pill', kind: 'aggregate-pill', screen: { x: 48, y: 40, width: 120, height: 18 } },
    ]);
    expect(visibility.get('neighbour')).toBe('show');
    expect(visibility.get('module')).toBe('hide');
    expect(visibility.get('pill')).toBe('hide');
  });

  it('fits projected visible bounds and ignores a distant elevated arc apex', () => {
    const packages: SpatialWorldPoint[] = [
      { x: 0, y: 0, z: 2 },
      { x: 400, y: 0, z: 2 },
      { x: 0, y: 240, z: 2 },
      { x: 400, y: 240, z: 2 },
    ];
    const fitted = fitSpatialProjectedBounds(packages, 1000, 700);
    const occupancy = spatialProjectedOccupancy(packages, fitted, 1000, 700);
    expect(occupancy).toBeGreaterThan(0.4);
    const withArc = fitSpatialProjectedBounds([
      ...packages,
      { x: 200, y: 120, z: 44 },
    ], 1000, 700);
    expect(Math.abs(withArc.scale - fitted.scale)).toBeLessThan(0.08);
    expect(fitted.scale).toBeGreaterThan(0.5);
  });

  it('keeps Far aggregate pills and hides them in Medium unless selected or connected', () => {
    expect(spatialAggregatePillVisible('far', { aggregated: true, selected: false, connected: false })).toBe(true);
    expect(spatialAggregatePillVisible('medium', { aggregated: true, selected: false, connected: false })).toBe(false);
    expect(spatialAggregatePillVisible('near', { aggregated: true, selected: true, connected: false })).toBe(true);
    expect(spatialAggregatePillVisible('near', { aggregated: false, selected: true, connected: true })).toBe(false);
  });

  it('maps layout x/y-down/z-up to Three x/up/depth without looking at the origin', () => {
    expect(layoutToThreePoint({ x: 12000, y: 18000, z: 100 })).toEqual({ x: 12000, y: 100, z: 18000 });
  });

  it('fits a far-from-origin repository so representative points stay in NDC and in front of the camera', () => {
    const points: SpatialWorldPoint[] = [
      { x: 12000, y: 18000, z: 80 },
      { x: 12800, y: 18000, z: 80 },
      { x: 12000, y: 18800, z: 120 },
      { x: 12800, y: 18800, z: 120 },
    ];
    const fitted = fitSpatialProjectedBounds(points, 800, 600);
    expect(fitted.schema).toBe(2);
    const view = spatialCameraModel(fitted, 800, 600, undefined, undefined, computeSpatialWorldBounds(points));
    const pose = spatialCameraPose(view);
    const center = layoutToThreePoint(computeSpatialWorldBounds(points).center);
    expect(Math.hypot(pose.target.x - center.x, pose.target.y - center.y, pose.target.z - center.z)).toBeLessThan(400);
    expect(pose.eye.x).not.toBeCloseTo(0, 0);
    expect(pose.target.x).not.toBeCloseTo(0, 0);
    points.forEach((point) => {
      expect(spatialPointInFrontOfCamera(point, view)).toBe(true);
      expect(ndcInFrustum(spatialNdc(point, view))).toBe(true);
      const screen = projectSpatialPoint(point, view);
      expect(Number.isFinite(screen.x)).toBe(true);
      expect(Number.isFinite(screen.y)).toBe(true);
      expect(screen.x).toBeGreaterThan(-40);
      expect(screen.x).toBeLessThan(840);
      expect(screen.y).toBeGreaterThan(-40);
      expect(screen.y).toBeLessThan(640);
    });
    const three = new THREE.OrthographicCamera();
    configureSpatialCamera(three, view);
    const layoutPoint = points[0]!;
    const mapped = layoutToThreePoint(layoutPoint);
    const vector = new THREE.Vector3(mapped.x, mapped.y, mapped.z);
    vector.project(three);
    const projected = projectSpatialPoint(layoutPoint, view);
    expect(projected.x).toBeCloseTo((vector.x * 0.5 + 0.5) * view.viewportWidth, 4);
    expect(projected.y).toBeCloseTo((-vector.y * 0.5 + 0.5) * view.viewportHeight, 4);
  });

  it('treats pan as a screen-space shift on the same world-center pose', () => {
    const points: SpatialWorldPoint[] = [
      { x: 4000, y: 2500, z: 16 },
      { x: 4600, y: 3100, z: 16 },
    ];
    const bounds = computeSpatialWorldBounds(points);
    const identity = spatialCameraModel({ x: 0, y: 0, scale: 1, schema: 2 }, 800, 600, undefined, undefined, bounds);
    const panned = spatialCameraModel({ x: 40, y: 30, scale: 1, schema: 2 }, 800, 600, undefined, undefined, bounds);
    const before = projectSpatialPoint(bounds.center, identity);
    const after = projectSpatialPoint(bounds.center, panned);
    expect(after.x - before.x).toBeCloseTo(40, 5);
    expect(after.y - before.y).toBeCloseTo(30, 5);
  });

  it('falls back from a legacy camera schema instead of treating it as a stored spatial camera', () => {
    expect(isCompatibleSpatialCameraTransform({ x: 24, y: 24, scale: 1.05 })).toBe(false);
    expect(isCompatibleSpatialCameraTransform({ x: 24, y: 24, scale: 1.05, schema: 1 })).toBe(false);
    const points: SpatialWorldPoint[] = [
      { x: 200, y: 180, z: 8 },
      { x: 640, y: 520, z: 8 },
    ];
    const safe = fitSpatialProjectedBounds(points, 800, 600);
    expect(isCompatibleSpatialCameraTransform(safe)).toBe(true);
    const occupancy = spatialProjectedOccupancy(points, safe, 800, 600);
    expect(occupancy).toBeGreaterThan(0.2);
  });

  it('keeps Fit and Reset on the same world-center pose and focuses a module near the viewport center', () => {
    const points: SpatialWorldPoint[] = [
      { x: 8000, y: 9000, z: 10 },
      { x: 8600, y: 9600, z: 10 },
    ];
    const first = fitSpatialProjectedBounds(points, 1000, 700);
    const reset = fitSpatialProjectedBounds(points, 1000, 700);
    expect(reset).toEqual(first);
    const bounds = computeSpatialWorldBounds(points);
    const focused = focusSpatialCamera(points[0]!, first, 1000, 700, bounds);
    const view = spatialCameraModel(focused, 1000, 700, undefined, undefined, bounds);
    const screen = projectSpatialPoint(points[0]!, view);
    expect(screen.x).toBeCloseTo(500, 0);
    expect(screen.y).toBeCloseTo(350, 0);
    expect(spatialPointInFrontOfCamera(points[0]!, view)).toBe(true);
    expect(ndcInFrustum(spatialNdc(points[0]!, view))).toBe(true);
  });
});
