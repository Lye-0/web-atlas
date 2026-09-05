import { describe, expect, it } from 'vitest';
import { packSpatialRegions, spatialModuleColumns } from './spatialPacking';

describe('spatial region packing', () => {
  it('packs heterogeneous siblings without overlaps or blank grid columns', () => {
    const items = Array.from({ length: 80 }, (_, i) => ({ width: 160 + i % 7 * 70, height: 70 + i % 11 * 40 }));
    const packed = packSpatialRegions(items, 24);
    expect(packSpatialRegions(items, 24)).toEqual(packed);
    items.forEach((item, index) => {
      const position = packed.positions[index]!;
      expect(position.x + item.width).toBeLessThanOrEqual(packed.width);
      expect(position.y + item.height).toBeLessThanOrEqual(packed.height);
      items.slice(index + 1).forEach((other, offset) => {
        const next = packed.positions[index + offset + 1]!;
        expect(position.x + item.width + 24 <= next.x || next.x + other.width + 24 <= position.x
          || position.y + item.height + 24 <= next.y || next.y + other.height + 24 <= position.y).toBe(true);
      });
    });
    expect(packed.width / packed.height).toBeGreaterThan(0.7);
    expect(packed.width / packed.height).toBeLessThan(2.5);
  });

  it('increases columns for dense directories rather than making long vertical strips', () => {
    expect(spatialModuleColumns(1, 150, 36)).toBe(1);
    expect(spatialModuleColumns(500, 150, 36)).toBeGreaterThan(10);
    expect(packSpatialRegions([], 24).positions).toEqual([]);
  });
});
