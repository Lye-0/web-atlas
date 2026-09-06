import { Vector3, type Camera } from 'three';
import type { SemanticPosition } from '../../analyzer/semantic/presentation';

export interface FlowLabelContent { id: string; label: string; path: string; selected: boolean; match: boolean }
export interface FlowLabelPlacement extends FlowLabelContent { x: number; y: number }

/** R3F calls useFrame before WebGLRenderer updates the camera's world matrices. */
export function projectSemanticFlowLabels(camera: Camera, size: { width: number; height: number }, zoom: number, ordered: readonly SemanticPosition[], selectedIds: ReadonlySet<string>, matchIds: ReadonlySet<string>): FlowLabelPlacement[] {
  camera.updateMatrixWorld();
  const labels: FlowLabelPlacement[] = [], point = new Vector3();
  for (const item of ordered) {
    const selected = selectedIds.has(item.node.id), match = matchIds.has(item.node.id);
    if (labels.length >= 36 && !selected) break;
    point.set(item.x, item.y, item.z).project(camera);
    if (Math.abs(point.x) > .94 || Math.abs(point.y) > .82 || point.z < -1 || point.z > 1) continue;
    if (zoom < .45 && !selected && !match && item.node.kind !== 'entry' && labels.length >= 8) continue;
    const x = (point.x + 1) * size.width / 2, y = (1 - point.y) * size.height / 2;
    if (!selected && labels.some(label => Math.abs(label.x - x) < 160 && Math.abs(label.y - y) < 30)) continue;
    labels.push({ id: item.node.id, label: item.node.label, path: `${item.node.path ?? item.node.group}${item.node.line ? `:${item.node.line}` : ''}`, x, y, selected, match });
  }
  return labels;
}

/** Position belongs to the render frame; React only owns the label's content. */
export class FlowLabelLayer {
  private elements = new Map<string, HTMLButtonElement>();
  private placements = new Map<string, FlowLabelPlacement>();
  private content: FlowLabelContent[] = [];
  private active = true;

  constructor(private publish: (content: FlowLabelContent[]) => void) {}

  private place(id: string, element: HTMLButtonElement) {
    const position = this.active ? this.placements.get(id) : undefined;
    element.style.visibility = position ? 'visible' : 'hidden';
    element.style.pointerEvents = position ? 'auto' : 'none';
    element.tabIndex = position ? 0 : -1;
    element.setAttribute('aria-hidden', String(!position));
    if (position) element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(9px, -50%)`;
  }

  attach(id: string, element: HTMLButtonElement | null) {
    if (!element) { this.elements.delete(id); return; }
    this.elements.set(id, element);
    this.place(id, element);
  }

  update = (next: FlowLabelPlacement[]) => {
    if (!this.active) return;
    this.placements = new Map(next.map(label => [label.id, label]));
    for (const [id, element] of this.elements) this.place(id, element);
    if (next.length === this.content.length && next.every((label, index) => {
      const previous = this.content[index]!;
      return label.id === previous.id && label.label === previous.label && label.path === previous.path && label.selected === previous.selected && label.match === previous.match;
    })) return;
    this.content = next.map(({ id, label, path, selected, match }) => ({ id, label, path, selected, match }));
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
