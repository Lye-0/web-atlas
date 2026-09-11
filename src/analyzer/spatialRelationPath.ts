export interface SpatialRelationPoint { x: number; y: number; z: number }
type FlowPoint = SpatialRelationPoint;

function cubicCurve(start: FlowPoint, c1: FlowPoint, c2: FlowPoint, end: FlowPoint) {
  const points = Array.from({ length: 49 }, (_, index) => {
    const t = index / 48, u = 1 - t;
    return { x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
      y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * end.y,
      z: u ** 3 * start.z + 3 * u ** 2 * t * c1.z + 3 * u * t ** 2 * c2.z + t ** 3 * end.z };
  });
  return { points, svgPath: `M${start.x},${start.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}` };
}

export function spatialRelationCurve(a: FlowPoint, b: FlowPoint, bend: number | undefined, mode: '2d' | '3d') {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < .01) {
    const side = (bend ?? 0) < 0 ? 1 : -1, extra = Math.abs(bend ?? 0);
    const start = mode === '2d' ? { x: a.x + 110, y: a.y + side * 10, z: a.z } : { x: a.x, y: a.y, z: a.z };
    const end = mode === '2d' ? { x: a.x + 42, y: a.y + side * 34, z: a.z } : { x: b.x, y: b.y, z: b.z };
    const c1 = { x: a.x + (mode === '2d' ? 200 : 58) + extra, y: start.y, z: a.z };
    const c2 = { x: a.x + (mode === '2d' ? 164 : 48), y: a.y + side * ((mode === '2d' ? 112 : 56) + extra), z: a.z };
    return cubicCurve(start, c1, c2, end);
  }
  // 3D dots use screen-pixel sizes: a world-space trim leaves a zoom-dependent gap.
  // Center endpoints share the dots' exact transform; label placement is independent.
  const boundary = mode === '2d' ? 1 / Math.max(Math.abs(dx / length) / 106, Math.abs(dy / length) / 30) + 4 : 0;
  const normalLength = Math.hypot(dx, dy);
  const normal = normalLength > .0001 ? { x: -dy / normalLength, y: dx / normalLength, z: 0 }
    : { x: dz >= 0 ? 1 : -1, y: 0, z: 0 };
  const trim = Math.min(.45, boundary / length);
  const start = { x: a.x + dx * trim, y: a.y + dy * trim, z: a.z + dz * trim };
  const end = { x: b.x - dx * trim, y: b.y - dy * trim, z: b.z - dz * trim };
  // A gentle arch also distinguishes a single connection from the node/lane grid.
  const arc = bend ?? Math.min(mode === '2d' ? 56 : 38, Math.max(6, length * (1 - 2 * trim) * .18));
  const control = (t: number) => ({ x: start.x + (end.x - start.x) * t + normal.x * arc * 4 / 3,
    y: start.y + (end.y - start.y) * t + normal.y * arc * 4 / 3, z: start.z + (end.z - start.z) * t });
  return cubicCurve(start, control(1 / 3), control(2 / 3), end);
}

