import { describe, expect, it } from 'vitest';
import { projectSpatialPoint, spatialCameraModel } from './spatialCoordinates';
import { projectWorldRect } from './spatialProjectedGraph';
import { projectSpatialHeadings, type SpatialHeadingModel } from './spatialHeadings';

const heading: SpatialHeadingModel = {
  id: 'src', anchor: { x: 16, y: 15, z: 0 },
  bounds: { x: 0, y: 0, z: 0, width: 240, height: 140 },
  firstModuleTop: { x: 24, y: 42, z: 30 }, width: 300,
};
const camera = (scale: number, x = 0, y = 0) => spatialCameraModel({ scale, x, y }, 1000, 600);

describe('live spatial headings', () => {
  it('scales the complete heading while keeping it within its region and above its files', () => {
    const frames = [0.4, 1, 2].map(scale => {
      const model = camera(scale);
      const frame = projectSpatialHeadings([heading], model)[0]!;
      const region = projectWorldRect(heading.bounds, model);
      expect(frame.visible).toBe(true);
      expect(frame.x + frame.width).toBeLessThan(region.x + region.width);
      expect(frame.y + frame.height).toBeLessThan(projectSpatialPoint(heading.firstModuleTop!, model).y);
      return frame;
    });
    expect(frames[0]!.height).toBeLessThan(frames[1]!.height);
    expect(frames[1]!.height).toBeLessThan(frames[2]!.height);
  });

  it('reevaluates visibility directly from the live zoom and viewport', () => {
    expect(projectSpatialHeadings([heading], camera(0.1))[0]!.visible).toBe(false);
    expect(projectSpatialHeadings([heading], camera(0.7))[0]!.visible).toBe(true);
    expect(projectSpatialHeadings([heading], camera(0.7, 2000))[0]!.visible).toBe(false);
    expect(projectSpatialHeadings([heading], camera(0.7))[0]!.visible).toBe(true);
  });

  it('preserves semantic priority for collisions and applies pan without changing text size', () => {
    const models = [heading, { ...heading, id: 'lower-priority' }];
    const before = projectSpatialHeadings(models, camera(1));
    const after = projectSpatialHeadings(models, camera(1, 80, 20));
    expect(before.map(frame => frame.visible)).toEqual([true, false]);
    expect(after.map(frame => frame.visible)).toEqual([true, false]);
    expect(after[0]!.x - before[0]!.x).toBeCloseTo(80);
    expect(after[0]!.y - before[0]!.y).toBeCloseTo(20);
    expect(after[0]!.height).toBe(before[0]!.height);
  });
});
