import { describe, expect, it } from 'vitest';
import { buildSpatialFlowData, SPATIAL_FLOW_MAX_PARTICLES_PER_PATH } from './spatialFlow';

describe('spatial flow paths', () => {
  it('retains source-to-target order, tube height, cumulative distance and direction color', () => {
    const points = [{ x: 5, y: 30, z: 8 }, { x: 8, y: 34, z: 8 }, { x: 8, y: 34, z: 20 }];
    const data = buildSpatialFlowData([{ id: 'imports', points, color: '#82c6e2' },
      { id: 'imported-by', points: [...points].reverse(), color: '#dfb785' }]);
    expect([...data.samples.slice(0, 12)]).toEqual([5, 30, 8, 0, 8, 34, 8, 5, 8, 34, 20, 17]);
    expect([...data.samples.slice(12)]).toEqual([8, 34, 20, 0, 8, 34, 8, 12, 5, 30, 8, 17]);
    expect(data.particles.filter(particle => particle.row < 0.5).every(particle => particle.color === '#82c6e2')).toBe(true);
    expect(data.particles.filter(particle => particle.row > 0.5).every(particle => particle.color === '#dfb785')).toBe(true);
    expect(data.particles.every(particle => particle.length === 17)).toBe(true);
  });

  it('bounds density on long paths and keeps phases stable through selection ordering changes', () => {
    const first = { id: 'first', points: [{ x: 0, y: 0, z: 0 }, { x: 100000, y: 0, z: 0 }], color: '#82c6e2' };
    const second = { ...first, id: 'second', color: '#dfb785' };
    const a = buildSpatialFlowData([first, second]);
    const b = buildSpatialFlowData([second, first]);
    expect(a.particles).toHaveLength(2 * SPATIAL_FLOW_MAX_PARTICLES_PER_PATH);
    expect(a.particles.filter(p => p.color === first.color).map(p => p.offset))
      .toEqual(b.particles.filter(p => p.color === first.color).map(p => p.offset));
    expect(a.particles.every(p => p.offset >= 0 && p.offset < 1)).toBe(true);
  });

  it('does not emit particles for empty or zero-length paths', () => {
    expect(buildSpatialFlowData([]).particles).toEqual([]);
    expect(buildSpatialFlowData([{ id: 'empty', points: [], color: '#fff' },
      { id: 'zero', points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], color: '#fff' }]).particles).toEqual([]);
  });

  it('uses three times the initial density for short, medium and long connections', () => {
    for (const [length, expected] of [[100, 6], [450, 9], [10000, 24]]) {
      const data = buildSpatialFlowData([{ id: 'edge', points: [{ x: 0, y: 0, z: 0 }, { x: length!, y: 0, z: 0 }], color: '#82c6e2' }]);
      expect(data.particles).toHaveLength(expected!);
    }
  });
});
