import type { FlowLabelContent, FlowLabelPlacement, FlowLabelObstacle } from './semanticFlowLabels';
export const labelInset = (label: FlowLabelContent) => label.selected || label.aggregate ? 17 : 9;
export interface SpatialLabelPoint { id: string; x: number; y: number }
/** Shared collision, endpoint protection and retention; callers own semantic priority. */
export function createSpatialLabelPlacer(projected: readonly SpatialLabelPoint[], size: {width:number;height:number}, top: number, bottom: number, context: {obstacles?: readonly FlowLabelObstacle[];priorityIds?:ReadonlySet<string>;hoveredIds?:ReadonlySet<string>}, selectedIds: ReadonlySet<string>, previous: ReadonlyMap<string,FlowLabelPlacement>, measure?: (label:FlowLabelContent)=>{width:number;height:number}) {
  const labels: FlowLabelPlacement[] = [];
  const occupied: FlowLabelObstacle[] = [...context.obstacles ?? []];
  // A forced label may cover ordinary background dots, but never an active
  // endpoint (including the enlarged point and the arrow's connection area).
  const criticalCells = new Map<string, SpatialLabelPoint[]>();
  for (const p of projected) if (selectedIds.has(p.id) || context.priorityIds?.has(p.id) || context.hoveredIds?.has(p.id)) {
    const key = `${Math.floor(p.x / 40)}:${Math.floor(p.y / 40)}`, cell = criticalCells.get(key) ?? [];
    cell.push(p); criticalCells.set(key, cell);
  }
  const coversCritical = (id: string, rect: FlowLabelObstacle) => {
    for (let x = Math.floor((rect.left - 17) / 40); x <= Math.floor((rect.left + rect.width + 17) / 40); x++) for (let y = Math.floor((rect.top - 17) / 40); y <= Math.floor((rect.top + rect.height + 17) / 40); y++) {
      for (const p of criticalCells.get(`${x}:${y}`) ?? []) if (p.id !== id && p.x > rect.left - 17 && p.x < rect.left + rect.width + 17 && p.y > rect.top - 17 && p.y < rect.top + rect.height + 17) return true;
    }
    return false;
  };
  const cells = new Map<string, SpatialLabelPoint[]>();
  for (const p of projected) {
    const key = `${Math.floor(p.x / 40)}:${Math.floor(p.y / 40)}`, cell = cells.get(key) ?? [];
    cell.push(p); cells.set(key, cell);
  }
  const pointOverlap = (id: string, rect: { left: number; top: number; width: number; height: number }) => {
    let count = 0;
    for (let x = Math.floor((rect.left - 6) / 40); x <= Math.floor((rect.left + rect.width + 6) / 40); x++) for (let y = Math.floor((rect.top - 6) / 40); y <= Math.floor((rect.top + rect.height + 6) / 40); y++) {
      for (const p of cells.get(`${x}:${y}`) ?? []) if (p.id !== id && p.x > rect.left - 6 && p.x < rect.left + rect.width + 6 && p.y > rect.top - 6 && p.y < rect.top + rect.height + 6) {
        if (++count === 16) return count * 300;
      }
    }
    return count * 300;
  };
  const placedIds = new Set<string>();
  const place = (label: FlowLabelContent, px: number, py: number, force: boolean) => {
    if (placedIds.has(label.id) || !Number.isFinite(px) || !Number.isFinite(py)) return false;
    const measureText = (text: string) => [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 12 : 6.7), 16);
    // Hover must not grow a mounted hit box: a left-side label would then cover
    // its own dot and be relocated out from under the stationary pointer.
    const width = measure?.(label).width ?? Math.min(size.width < 700 ? 175 : 225, label.selected ? 225 : Math.min(220, Math.max(90, measureText(label.label), measureText(label.disambiguation ?? ''), measureText(label.roleLabel ?? ''))));
    // Each supplemental row has a fixed 16px line box in the mounted label.
    const height = measure?.(label).height ?? (label.region || label.selected || label.aggregate ? 46 : 28) + (label.disambiguation ? 16 : 0) + (label.roleLabel ? 16 : 0);
    const inset = labelInset(label);
    const prior = previous.get(label.id);
    const choices = [...(prior?.selected === label.selected && prior.pointX !== undefined && prior.pointY !== undefined ? [[prior.x - prior.pointX, prior.y - prior.pointY]] : []),
      [0, 0], [-width - inset * 2, 0], [0, -height - 8], [0, height + 8], [-width - inset * 2, -height - 8], [-width - inset * 2, height + 8],
      ...(force || label.related ? [2, 3, 4].flatMap(step => [[0, -(height + 8) * step], [0, (height + 8) * step], [-width - inset * 2, -(height + 8) * step], [-width - inset * 2, (height + 8) * step]]) : [])];
    let fallback: { x: number; y: number; left: number; top: number; overlap: number } | undefined;
    for (const [dx, dy] of choices) {
      const x = Math.max(3, Math.min(size.width - width - inset - 3, px + dx!)), y = Math.max(top + height / 2, Math.min(bottom - height / 2, py + dy!));
      const rect = { left: x + inset, top: y - height / 2, width, height };
      const clearance = prior ? 3 : 9;
      const ownDotOverlap = !label.region && px + inset > rect.left + .001 && px - inset < rect.left + width - .001
        && py + inset > rect.top + .001 && py - inset < rect.top + height - .001;
      const labelOverlap = occupied.reduce((sum, previous) => sum + Math.max(0, Math.min(rect.left + width + clearance, previous.left + previous.width) - Math.max(rect.left - clearance, previous.left))
        * Math.max(0, Math.min(rect.top + height + clearance, previous.top + previous.height) - Math.max(rect.top - clearance, previous.top)), 0);
      if (ownDotOverlap || labelOverlap || coversCritical(label.id, rect)) continue;
      const overlap = pointOverlap(label.id, rect);
      if (!fallback || overlap < fallback.overlap) fallback = { x, y, left: rect.left, top: rect.top, overlap };
      if (overlap === 0) break;
    }
    if (!fallback || !force && fallback.overlap > 0) return false;
    occupied.push({ left: fallback.left, top: fallback.top, width, height });
    placedIds.add(label.id);
    labels.push({ ...label, x: fallback.x, y: fallback.y, pointX: px, pointY: py, width, height });
    return true;
  };
  return { labels, place };
}
