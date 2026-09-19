import { describe, expect, it } from 'vitest';
import { spatialRelationCurve } from './spatialRelationPath';

describe('2D card boundary approaches', () => {
  it.each([234, -234])('keeps the curve outside a diagonal target until its fixed port (%s)', y => {
    const a = { x: 0, y: 0, z: 0 }, b = { x: 364, y, z: 0 };
    for (const bend of [undefined, -72, 72]) {
      const path = spatialRelationCurve(a, b, bend, '2d');
      const end = path.points.at(-1)!, previous = path.points.at(-2)!;
      expect(path.points.every(p => Math.abs(p.x - b.x) >= 106 || Math.abs(p.y - b.y) >= 30)).toBe(true);
      expect(Math.sign(end.y - previous.y)).toBe(Math.sign(y));
      expect(Math.abs(end.y - previous.y)).toBeGreaterThan(1);
    }
  });
});
