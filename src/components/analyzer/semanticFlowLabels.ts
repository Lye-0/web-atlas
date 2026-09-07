import { Vector3, type Camera } from 'three';
import type { SemanticPosition } from '../../analyzer/semantic/presentation';
import type { SemanticFlowRegion } from '../../analyzer/semantic/flowRegions';
import type { FlowEdgePath } from '../../analyzer/semantic/flowPresentation';
import { semanticFlowPlot } from './semanticFlowViewport';

export interface FlowLabelContent { id: string; label: string; path: string; selected: boolean; match: boolean; hovered?: boolean; related?: boolean; region?: boolean; aggregate?: boolean }
export interface FlowLabelPlacement extends FlowLabelContent { x: number; y: number; pointX?: number; pointY?: number; width?: number }
export interface FlowConnectionNotice { id: string; status: 'offscreen' | 'unlabelled' }
export interface FlowLabelObstacle { left: number; top: number; width: number; height: number }
interface LabelContext { regions?: readonly SemanticFlowRegion[]; relatedIds?: ReadonlySet<string>; hoveredIds?: ReadonlySet<string>; priorityIds?: ReadonlySet<string>; overlayTop?: number; previous?: readonly FlowLabelPlacement[]; obstacles?: readonly FlowLabelObstacle[] }
const coversPoint = (obstacle: FlowLabelObstacle, x: number, y: number) => x >= obstacle.left && x <= obstacle.left + obstacle.width && y >= obstacle.top && y <= obstacle.top + obstacle.height;
const labelInset = (label: FlowLabelContent) => label.selected || label.aggregate ? 17 : 9;

export function semanticFlowConnectionNotices(camera: Camera, size: { width: number; height: number }, positions: readonly SemanticPosition[], ids: ReadonlySet<string>, labels: readonly FlowLabelPlacement[], overlayTop = 148, obstacles: readonly FlowLabelObstacle[] = []): FlowConnectionNotice[] {
  camera.updateMatrixWorld();
  const labelled = new Set(labels.map(label => label.id)), point = new Vector3();
  const plot = semanticFlowPlot(size.width, size.height, overlayTop);
  return positions.filter(item => ids.has(item.node.id)).flatMap<FlowConnectionNotice>(item => {
    point.set(item.x, item.y, item.z).project(camera);
    const x = (point.x + 1) * size.width / 2, y = (1 - point.y) * size.height / 2;
    if (x < 0 || x > size.width || y < plot.top || y > plot.bottom || point.z < -1 || point.z > 1) return [{ id: item.node.id, status: 'offscreen' as const }];
    return labelled.has(item.node.id) && !obstacles.some(obstacle => coversPoint(obstacle, x, y)) ? [] : [{ id: item.node.id, status: 'unlabelled' as const }];
  });
}

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

export function hitSemanticFlowEdge(camera: Camera, size: { width: number; height: number }, paths: readonly FlowEdgePath[], x: number, y: number) {
  camera.updateMatrixWorld();
  const point = new Vector3();
  let nearest: { id: string; distance: number } | undefined;
  for (const path of paths) {
    let previous: { x: number; y: number; z: number } | undefined;
    for (const vertex of path.points) {
      point.set(vertex.x, vertex.y, vertex.z).project(camera);
      const next = { x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2, z: point.z };
      if (previous && next.z >= -1 && next.z <= 1 && previous.z >= -1 && previous.z <= 1) {
        const dx = next.x - previous.x, dy = next.y - previous.y;
        const t = Math.max(0, Math.min(1, ((x - previous.x) * dx + (y - previous.y) * dy) / Math.max(.001, dx * dx + dy * dy)));
        const distance = Math.hypot(x - previous.x - dx * t, y - previous.y - dy * t);
        if (distance <= 7 && (!nearest || distance < nearest.distance)) nearest = { id: path.edge.id, distance };
      }
      previous = next;
    }
  }
  return nearest?.id;
}

/** R3F calls useFrame before WebGLRenderer updates the camera's world matrices. */
export function projectSemanticFlowLabels(camera: Camera, size: { width: number; height: number }, zoom: number, ordered: readonly SemanticPosition[], selectedIds: ReadonlySet<string>, matchIds: ReadonlySet<string>, context: LabelContext = {}): FlowLabelPlacement[] {
  camera.updateMatrixWorld();
  if (size.width <= 0 || size.height <= 0) return [];
  const labels: FlowLabelPlacement[] = [], point = new Vector3();
  const { top, bottom } = semanticFlowPlot(size.width, size.height, context.overlayTop ?? (size.width < 700 ? 198 : 148));
  const previous = new Map(context.previous?.map(label => [label.id, label]));
  const projected = ordered.map(item => {
    point.set(item.x, item.y, item.z).project(camera);
    return { item, x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2, visible: Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && point.z >= -1 && point.z <= 1 };
  }).filter(item => item.visible && item.y >= top && item.y <= bottom && !context.obstacles?.some(obstacle => coversPoint(obstacle, item.x, item.y)));
  const occupied: FlowLabelObstacle[] = [...context.obstacles ?? []];
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
  const budget = Math.max(6, Math.min(24, Math.floor(size.width * size.height / 28000)));
  const place = (label: FlowLabelContent, px: number, py: number, force: boolean) => {
    const width = Math.min(size.width < 700 ? 175 : 225, label.selected || label.hovered ? 225 : Math.min(220, Math.max(90, [...label.label].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 12 : 6.7), 16))));
    const height = label.region || label.selected || label.hovered || label.aggregate ? 46 : 28;
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
      if (ownDotOverlap || labelOverlap) continue;
      const overlap = pointOverlap(label.id, rect);
      if (!fallback || overlap < fallback.overlap) fallback = { x, y, left: rect.left, top: rect.top, overlap };
      if (overlap === 0) break;
    }
    if (!fallback || !force && fallback.overlap > 0) return false;
    occupied.push({ left: fallback.left, top: fallback.top, width, height });
    labels.push({ ...label, x: fallback.x, y: fallback.y, pointX: px, pointY: py, width });
    return true;
  };
  const nodeLabel = (item: SemanticPosition): FlowLabelContent => ({ id: item.node.id, label: item.node.label, path: item.node.attributes.displayAggregate === true ? `表示上の集約 · ${Number(item.node.attributes.targetCount).toLocaleString()}対象` : `${item.node.kind === 'external' ? '定義先未特定 · 呼び出し箇所 ' : ''}${item.node.path ?? item.node.group}${item.node.line ? `:${item.node.line}` : ''}`,
    selected: selectedIds.has(item.node.id), match: matchIds.has(item.node.id), ...(item.node.attributes.displayAggregate === true ? { aggregate: true } : {}), ...(context.hoveredIds?.has(item.node.id) ? { hovered: true } : {}), ...(context.relatedIds?.has(item.node.id) ? { related: true } : {}) });
  const required = (id: string) => selectedIds.has(id) || context.priorityIds?.has(id);
  const important = (id: string) => required(id) || context.hoveredIds?.has(id);
  // Reserve both explicitly selected endpoints before hover can consume space.
  for (const item of projected.filter(p => required(p.item.node.id)).sort((a, b) => Number(selectedIds.has(b.item.node.id)) - Number(selectedIds.has(a.item.node.id)) || a.item.node.id.localeCompare(b.item.node.id))) place(nodeLabel(item.item), item.x, item.y, true);
  let nodeCount = 0, relatedAttempts = 0;
  const stableOrder = (a: typeof projected[number], b: typeof projected[number]) => Number(previous.has(b.item.node.id)) - Number(previous.has(a.item.node.id)) || a.item.node.id.localeCompare(b.item.node.id);
  const relatedVisible = projected.filter(p => !important(p.item.node.id) && context.relatedIds?.has(p.item.node.id)).sort(stableOrder);
  for (const item of relatedVisible) {
    if (nodeCount >= budget || relatedAttempts++ >= budget * 8) break;
    if (place(nodeLabel(item.item), item.x, item.y, relatedVisible.length <= 3)) nodeCount++;
  }
  for (const item of projected.filter(p => !required(p.item.node.id) && context.hoveredIds?.has(p.item.node.id)).sort(stableOrder)) place(nodeLabel(item.item), item.x, item.y, false);
  for (const item of projected.filter(p => p.item.node.attributes.displayAggregate === true && !important(p.item.node.id))) place(nodeLabel(item.item), item.x, item.y, false);
  let regionCount = 0;
  const projectedById = new Map(projected.map(item => [item.item.node.id, item]));
  for (const region of [...context.regions ?? []].sort((a, b) => Number(previous.has(`flow-region:${b.id}`)) - Number(previous.has(`flow-region:${a.id}`)) || b.count - a.count || a.label.localeCompare(b.label))) {
    if (regionCount >= 16) break;
    const members = region.nodeIds.flatMap(id => { const p = projectedById.get(id); return p ? [{ x: p.x, y: p.y, z: 0 }] : []; });
    const corners = members.length ? members : [region.z, region.z + (region.depth ?? 0)].flatMap(z => [[region.x, region.y], [region.x + region.width, region.y], [region.x, region.y + region.height], [region.x + region.width, region.y + region.height]].map(([x, y]) => {
      point.set(x!, y!, z).project(camera); return { x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2, z: point.z };
    }));
    const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
    if (maxX < 0 || minX > size.width || maxY < 0 || minY > size.height || corners.every(p => p.z < -1 || p.z > 1)) continue;
    if (place({ id: `flow-region:${region.id}`, label: region.label, path: `${region.count.toLocaleString()}対象`, selected: false, match: false, region: true }, Math.max(12, minX), Math.max(top, minY - 38), false)) regionCount++;
  }
  let considered = 0;
  const regionCounts = new Map<string, number>(), regionAttempts = new Map<string, number>();
  const candidates = projected.filter(p => !important(p.item.node.id) && !context.relatedIds?.has(p.item.node.id) && p.item.node.attributes.displayAggregate !== true).sort((a, b) => Number(matchIds.has(b.item.node.id)) - Number(matchIds.has(a.item.node.id)) || stableOrder(a, b));
  for (const item of candidates) {
    const related = context.relatedIds?.has(item.item.node.id), match = matchIds.has(item.item.node.id);
    if (nodeCount >= budget || considered >= budget * 6) break;
    if (!related && !match && zoom < (previous.has(item.item.node.id) ? .62 : .78)) continue;
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
    if (position) {
      element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(${labelInset(position)}px, -50%)`;
      if (position.width !== undefined) element.style.width = `${position.width}px`;
    }
    const leader = this.leaders.get(id);
    if (leader) {
      const visible = position && !position.region && position.pointX !== undefined && position.pointY !== undefined;
      leader.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) {
        leader.setAttribute('x1', String(position.pointX)); leader.setAttribute('y1', String(position.pointY));
        const left = position.x + labelInset(position);
        leader.setAttribute('x2', String(Math.max(left, Math.min(left + (position.width ?? 0), position.pointX!)))); leader.setAttribute('y2', String(position.y));
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
      return label.id === previous.id && label.label === previous.label && label.path === previous.path && label.selected === previous.selected && label.match === previous.match && Boolean(label.hovered) === Boolean(previous.hovered) && Boolean(label.related) === Boolean(previous.related) && Boolean(label.region) === Boolean(previous.region) && Boolean(label.aggregate) === Boolean(previous.aggregate);
    })) return;
    this.content = next.map(({ id, label, path, selected, match, hovered, related, region, aggregate }) => ({ id, label, path, selected, match, ...(hovered ? { hovered } : {}), ...(related ? { related } : {}), ...(region ? { region } : {}), ...(aggregate ? { aggregate } : {}) }));
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
