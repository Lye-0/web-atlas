import { Vector3, type Camera } from 'three';
import type { SemanticPosition } from '../../analyzer/semantic/presentation';
import type { SemanticFlowRegion } from '../../analyzer/semantic/flowRegions';

export interface FlowLabelContent { id: string; label: string; path: string; selected: boolean; match: boolean; hovered?: boolean; related?: boolean; region?: boolean }
export interface FlowLabelPlacement extends FlowLabelContent { x: number; y: number; pointX?: number; pointY?: number; width?: number }
interface LabelContext { regions?: readonly SemanticFlowRegion[]; relatedIds?: ReadonlySet<string>; hoveredIds?: ReadonlySet<string>; priorityIds?: ReadonlySet<string>; overlayTop?: number }

export function hitSemanticFlowPoint(camera: Camera, size: { width: number; height: number }, positions: readonly SemanticPosition[], x: number, y: number) {
  camera.updateMatrixWorld();
  const point = new Vector3(); let nearest: { id: string; distance: number; depth: number } | undefined;
  for (const item of positions) {
    point.set(item.x, item.y, item.z).project(camera);
    const distance = Math.hypot((point.x + 1) * size.width / 2 - x, (1 - point.y) * size.height / 2 - y);
    if (point.z >= -1 && point.z <= 1 && distance <= 13 && (!nearest || distance < nearest.distance - 1 || Math.abs(distance - nearest.distance) < 1 && point.z < nearest.depth)) nearest = { id: item.node.id, distance, depth: point.z };
  }
  return nearest?.id;
}

/** R3F calls useFrame before WebGLRenderer updates the camera's world matrices. */
export function projectSemanticFlowLabels(camera: Camera, size: { width: number; height: number }, zoom: number, ordered: readonly SemanticPosition[], selectedIds: ReadonlySet<string>, matchIds: ReadonlySet<string>, context: LabelContext = {}): FlowLabelPlacement[] {
  camera.updateMatrixWorld();
  if (size.width <= 0 || size.height <= 0) return [];
  const labels: FlowLabelPlacement[] = [], point = new Vector3();
  const projected = ordered.map(item => {
    point.set(item.x, item.y, item.z).project(camera);
    return { item, x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2, visible: Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && point.z >= -1 && point.z <= 1 };
  }).filter(item => item.visible);
  const occupied: { left: number; top: number; width: number; height: number }[] = [];
  const cells = new Map<string, typeof projected>();
  for (const p of projected) {
    const key = `${Math.floor(p.x / 40)}:${Math.floor(p.y / 40)}`, cell = cells.get(key) ?? [];
    cell.push(p); cells.set(key, cell);
  }
  const pointOverlap = (id: string, rect: { left: number; top: number; width: number; height: number }) => {
    let count = 0;
    for (let x = Math.floor((rect.left - 6) / 40); x <= Math.floor((rect.left + rect.width + 6) / 40); x++) for (let y = Math.floor((rect.top - 6) / 40); y <= Math.floor((rect.top + rect.height + 6) / 40); y++) {
      for (const p of cells.get(`${x}:${y}`) ?? []) if (p.item.node.id !== id && p.x > rect.left - 6 && p.x < rect.left + rect.width + 6 && p.y > rect.top - 6 && p.y < rect.top + rect.height + 6) {
        if (++count === 16) return count * 300;
      }
    }
    return count * 300;
  };
  const top = Math.min(context.overlayTop ?? (size.width < 700 ? 198 : 148), Math.max(30, size.height - 120)), bottom = Math.max(top + 40, size.height - 76);
  const budget = Math.max(6, Math.min(24, Math.floor(size.width * size.height / 28000)));
  const place = (label: FlowLabelContent, px: number, py: number, force: boolean) => {
    const width = label.selected || label.hovered ? 225 : Math.min(220, Math.max(90, [...label.label].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 12 : 6.7), 16)));
    const height = label.region || label.selected || label.hovered ? 46 : 28;
    const choices = [[0, 0], [-width - 18, 0], [0, -height - 8], [0, height + 8], [-width - 18, -height - 8], [-width - 18, height + 8]];
    let fallback: { x: number; y: number; left: number; top: number; overlap: number } | undefined;
    for (const [dx, dy] of choices) {
      const x = Math.max(3, Math.min(size.width - width - 12, px + dx!)), y = Math.max(top + height / 2, Math.min(bottom - height / 2, py + dy!));
      const rect = { left: x + 9, top: y - height / 2, width, height };
      const overlap = occupied.reduce((sum, previous) => sum + Math.max(0, Math.min(rect.left + width + 6, previous.left + previous.width) - Math.max(rect.left - 6, previous.left))
        * Math.max(0, Math.min(rect.top + height + 5, previous.top + previous.height) - Math.max(rect.top - 5, previous.top)), 0)
        + (label.region ? 0 : pointOverlap(label.id, rect));
      if (!fallback || overlap < fallback.overlap) fallback = { x, y, left: rect.left, top: rect.top, overlap };
      if (overlap === 0) break;
    }
    if (!fallback || !force && fallback.overlap > 0) return false;
    occupied.push({ left: fallback.left, top: fallback.top, width, height });
    labels.push({ ...label, x: fallback.x, y: fallback.y, pointX: px, pointY: py, width });
    return true;
  };
  const nodeLabel = (item: SemanticPosition): FlowLabelContent => ({ id: item.node.id, label: item.node.label, path: `${item.node.path ?? item.node.group}${item.node.line ? `:${item.node.line}` : ''}`,
    selected: selectedIds.has(item.node.id), match: matchIds.has(item.node.id), ...(context.hoveredIds?.has(item.node.id) ? { hovered: true } : {}), ...(context.relatedIds?.has(item.node.id) ? { related: true } : {}) });
  const important = (id: string) => selectedIds.has(id) || context.hoveredIds?.has(id) || context.priorityIds?.has(id);
  for (const item of projected.filter(p => important(p.item.node.id)).sort((a, b) => Number(selectedIds.has(b.item.node.id)) - Number(selectedIds.has(a.item.node.id)))) place(nodeLabel(item.item), item.x, item.y, true);
  let regionCount = 0;
  for (const region of [...context.regions ?? []].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))) {
    if (regionCount >= 16) break;
    const corners = [[region.x, region.y], [region.x + region.width, region.y], [region.x, region.y + region.height], [region.x + region.width, region.y + region.height]].map(([x, y]) => {
      point.set(x!, y!, region.z).project(camera); return { x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2, z: point.z };
    });
    const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
    if (maxX < 0 || minX > size.width || maxY < 0 || minY > size.height || corners.every(p => p.z < -1 || p.z > 1)) continue;
    if (place({ id: `flow-region:${region.id}`, label: region.label, path: `${region.count.toLocaleString()}対象`, selected: false, match: false, region: true }, Math.max(12, minX + 8), Math.max(top, minY + 18), false)) regionCount++;
  }
  let nodeCount = 0, considered = 0;
  const regionCounts = new Map<string, number>(), regionAttempts = new Map<string, number>();
  const candidates = projected.filter(p => !important(p.item.node.id)).sort((a, b) => Number(context.relatedIds?.has(b.item.node.id)) - Number(context.relatedIds?.has(a.item.node.id)) || Number(matchIds.has(b.item.node.id)) - Number(matchIds.has(a.item.node.id)) || Number(b.item.node.kind === 'entry') - Number(a.item.node.kind === 'entry'));
  for (const item of candidates) {
    const related = context.relatedIds?.has(item.item.node.id), match = matchIds.has(item.item.node.id);
    if (nodeCount >= budget || considered >= budget * 6) break;
    if (!related && !match && zoom < .7) continue;
    const group = item.item.node.path?.split('/').slice(0, -1).join('/') ?? item.item.node.group;
    if (!related && !match && (regionCounts.get(group) ?? 0) >= (zoom >= 1.2 ? 4 : 1)) continue;
    if (!related && !match && (regionAttempts.get(group) ?? 0) >= (zoom >= 1.2 ? 16 : 4)) continue;
    regionAttempts.set(group, (regionAttempts.get(group) ?? 0) + 1); considered++;
    if (place(nodeLabel(item.item), item.x, item.y, false)) { nodeCount++; regionCounts.set(group, (regionCounts.get(group) ?? 0) + 1); }
  }
  return labels;
}

/** Position belongs to the render frame; React only owns the label's content. */
export class FlowLabelLayer {
  private elements = new Map<string, HTMLElement>();
  private leaders = new Map<string, SVGLineElement>();
  private placements = new Map<string, FlowLabelPlacement>();
  private content: FlowLabelContent[] = [];
  private active = true;

  constructor(private publish: (content: FlowLabelContent[]) => void) {}

  private place(id: string, element: HTMLElement) {
    const position = this.active ? this.placements.get(id) : undefined;
    element.style.visibility = position ? 'visible' : 'hidden';
    element.style.pointerEvents = position ? 'auto' : 'none';
    element.tabIndex = position ? 0 : -1;
    element.setAttribute('aria-hidden', String(!position));
    if (position) element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(9px, -50%)`;
    const leader = this.leaders.get(id);
    if (leader) {
      const visible = position && !position.region && position.pointX !== undefined && position.pointY !== undefined;
      leader.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) {
        leader.setAttribute('x1', String(position.pointX)); leader.setAttribute('y1', String(position.pointY));
        leader.setAttribute('x2', String(Math.max(position.x + 9, Math.min(position.x + 9 + (position.width ?? 0), position.pointX!)))); leader.setAttribute('y2', String(position.y));
      }
    }
  }

  attach(id: string, element: HTMLElement | null) {
    if (!element) { this.elements.delete(id); return; }
    this.elements.set(id, element);
    this.place(id, element);
  }

  attachLeader(id: string, element: SVGLineElement | null) {
    if (!element) { this.leaders.delete(id); return; }
    this.leaders.set(id, element); element.style.visibility = 'hidden';
    const label = this.elements.get(id); if (label) this.place(id, label);
  }

  hoverAt = (x: number, y: number) => {
    if (!this.active) return undefined;
    for (const label of this.placements.values()) if (label.hovered && !label.region && label.pointX !== undefined && label.pointY !== undefined) {
      // Keep the name while the pointer travels from its dot to the offset label.
      if (x >= Math.min(label.pointX - 13, label.x + 1) && x <= Math.max(label.pointX + 13, label.x + (label.width ?? 225) + 17)
        && y >= Math.min(label.pointY - 13, label.y - 30) && y <= Math.max(label.pointY + 13, label.y + 30)) return label.id;
    }
    return undefined;
  };

  update = (next: FlowLabelPlacement[]) => {
    if (!this.active) return;
    this.placements = new Map(next.map(label => [label.id, label]));
    for (const [id, element] of this.elements) this.place(id, element);
    if (next.length === this.content.length && next.every((label, index) => {
      const previous = this.content[index]!;
      return label.id === previous.id && label.label === previous.label && label.path === previous.path && label.selected === previous.selected && label.match === previous.match && Boolean(label.hovered) === Boolean(previous.hovered) && Boolean(label.related) === Boolean(previous.related) && Boolean(label.region) === Boolean(previous.region);
    })) return;
    this.content = next.map(({ id, label, path, selected, match, hovered, related, region }) => ({ id, label, path, selected, match, ...(hovered ? { hovered } : {}), ...(related ? { related } : {}), ...(region ? { region } : {}) }));
    this.publish(this.content);
  };

  resume() { this.active = true; }

  suspend() {
    this.active = false;
    this.placements.clear(); this.content = [];
    for (const [id, element] of this.elements) this.place(id, element);
    // React ref detach removes the entries on unmount; keeping them here also
    // supports StrictMode's effect cleanup/setup without losing mounted refs.
  }
}
