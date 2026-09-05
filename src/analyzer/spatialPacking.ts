export interface SpatialPackingItem { width: number; height: number }

export function spatialModuleColumns(count: number, width: number, height: number): number {
  return Math.min(Math.max(1, count), Math.max(3, Math.ceil(Math.sqrt(count * height * 1.5 / width))));
}

/** Deterministic shelf packing. Independent of camera, repository names and selection. */
export function packSpatialRegions(items: readonly SpatialPackingItem[], gap: number) {
  if (!items.length) return { width: 0, height: 0, positions: [] as { x: number; y: number }[] };
  const widest = Math.max(...items.map((item) => item.width));
  const area = items.reduce((sum, item) => sum + (item.width + gap) * (item.height + gap), 0);
  const order = items.map((item, index) => ({ ...item, index }))
    .sort((a, b) => b.height - a.height || b.width - a.width || a.index - b.index);
  const candidates = [0.8, 1, 1.25, 1.6, 2].map((factor) => {
    const limit = Math.max(widest, Math.sqrt(area) * factor);
    const shelves: { y: number; height: number; right: number }[] = [];
    const positions = Array.from({ length: items.length }, () => ({ x: 0, y: 0 }));
    let width = 0;
    let height = 0;
    for (const item of order) {
      let shelf = shelves.find((row) => row.right + gap + item.width <= limit && item.height <= row.height);
      if (!shelf) {
        shelf = { y: shelves.length ? height + gap : 0, height: item.height, right: -gap };
        shelves.push(shelf);
      }
      const x = shelf.right + gap;
      positions[item.index] = { x, y: shelf.y };
      shelf.right = x + item.width;
      width = Math.max(width, shelf.right);
      height = Math.max(height, shelf.y + shelf.height);
    }
    // Prefer compact space with a gentle landscape bias, avoiding long strips.
    const score = Math.max(width / 1.4, height) ** 2 + width * height * 0.15;
    return { width, height, positions, score };
  });
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]!;
}
