import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FlowLabelLayer, hitSemanticFlowEdge, hitSemanticFlowPoint, projectSemanticFlowLabels, type FlowLabelPlacement } from './semanticFlowLabels';
import { semanticFlowEdgePaths } from '../../analyzer/semantic/flowPresentation';
import type { SemanticPosition } from '../../analyzer/semantic/presentation';
import type { SemanticFlowRegion } from '../../analyzer/semantic/flowRegions';

const placement = (id = 'run', x = 100, y = 200): FlowLabelPlacement => ({ id, x, y, label: id, path: `src/${id}.ts:2`, selected: false, match: false });
const positioned = (id: string, x = 0, y = 0, z = 0): SemanticPosition => ({ x, y, z, node: { id, kind: 'function', label: id, path: `src/git/${id}.ts`, group: 'Source', confidence: 'source', evidence: [], attributes: {} } });
const region: SemanticFlowRegion = { id: 'directory:src/git', kind: 'directory', label: 'src/git', x: -300, y: -120, z: -20, width: 600, height: 240, count: 3, nodeIds: ['run', 'other', 'target'] };
const sceneCamera = () => { const camera = new OrthographicCamera(-500, 500, 400, -400, .1, 1000); camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0); return camera; };

describe('semantic 3D label synchronization', () => {
  it('projects the current camera before the renderer refreshes its world matrix', () => {
    const camera = new OrthographicCamera(-5, 5, 4, -4, .1, 1000);
    camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    camera.position.set(10, 0, 0); camera.lookAt(0, 0, 0);
    // OrbitControls changes the orientation after lookAt updates the old matrix.
    expect(Math.abs(new Vector3(1, 0, 0).project(camera).x)).toBeGreaterThan(.1);
    const labels = projectSemanticFlowLabels(camera, { width: 1000, height: 800 }, 1, [{ x: 1, y: 0, z: 0, node: {
      id: 'run', label: 'run', kind: 'function', group: 'Source', path: 'src/run.ts', line: 2, confidence: 'source', evidence: [], attributes: {},
    } }], new Set(['run']), new Set());
    expect(labels).toHaveLength(1);
    expect(labels[0]!.x).toBeCloseTo(500); expect(labels[0]!.y).toBeCloseTo(400);
    expect(labels[0]!.path).toBe('src/run.ts:2'); expect(labels[0]!.selected).toBe(true);
  });

  it('moves mounted labels in the frame without publishing coordinate-only React updates', () => {
    const publish = vi.fn(), layer = new FlowLabelLayer(publish), button = document.createElement('button');
    layer.update([placement()]); layer.attach('run', button);
    layer.update([placement('run', 123.25, 345.5)]);
    expect(button.style.transform).toBe('translate3d(123.25px, 345.5px, 0) translate(9px, -50%)');
    expect(button.style.visibility).toBe('visible'); expect(publish).toHaveBeenCalledOnce();
    expect(publish.mock.calls[0]![0][0]).not.toHaveProperty('x');
    const lateButton = document.createElement('button');
    layer.attach('run', null); layer.attach('run', lateButton);
    expect(lateButton.style.transform).toBe(button.style.transform);
    layer.update([placement('run', 456, 567)]);
    expect(button.style.transform).toContain('123.25px');
    expect(lateButton.style.transform).toContain('456px');
  });

  it('immediately removes culled labels from display and keyboard interaction while React catches up', () => {
    const publish = vi.fn(), layer = new FlowLabelLayer(publish), button = document.createElement('button');
    layer.update([placement()]); layer.attach('run', button);
    expect(button.tabIndex).toBe(0);
    layer.update([]);
    expect(button.style.visibility).toBe('hidden'); expect(button.style.pointerEvents).toBe('none');
    expect(button.tabIndex).toBe(-1); expect(button.getAttribute('aria-hidden')).toBe('true');
    layer.update([{ ...placement(), label: 'renamed', path: 'src/new.ts:9', selected: true, match: true }]);
    expect(button.style.visibility).toBe('visible'); expect(button.tabIndex).toBe(0);
    expect(publish).toHaveBeenLastCalledWith([{ id: 'run', label: 'renamed', path: 'src/new.ts:9', selected: true, match: true }]);
  });

  it('rejects delayed frames after cleanup and recovers retained refs during effect remount', () => {
    const publish = vi.fn(), layer = new FlowLabelLayer(publish), button = document.createElement('button');
    layer.update([placement()]); layer.attach('run', button);
    layer.suspend(); layer.update([placement('run', 300, 400)]);
    expect(publish).toHaveBeenCalledOnce(); expect(button.style.visibility).toBe('hidden');
    layer.resume(); layer.update([placement('run', 500, 600)]);
    expect(publish).toHaveBeenCalledTimes(2); expect(button.style.visibility).toBe('visible');
    expect(button.style.transform).toContain('500px, 600px');
    layer.attach('run', null); layer.suspend(); layer.update([]);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('uses region names in the far view and reveals representative names on approach', () => {
    const camera = sceneCamera(), positions = [positioned('run', -220), positioned('other'), positioned('target', 220)];
    const far = projectSemanticFlowLabels(camera, { width: 1000, height: 800 }, .2, positions, new Set(), new Set(), { regions: [region] });
    expect(far.map(label => label.label)).toEqual(['src/git']); expect(far[0]!.region).toBe(true);
    const near = projectSemanticFlowLabels(camera, { width: 1000, height: 800 }, 2, positions, new Set(), new Set(), { regions: [region] });
    expect(near.some(label => !label.region)).toBe(true);
    expect(near.filter(label => !label.region).length).toBeLessThanOrEqual(4);
  });

  it('keeps selected, hovered and selected-edge endpoints readable even in the far view', () => {
    const positions = [positioned('run'), positioned('hover', 10), positioned('target', 260)];
    const labels = projectSemanticFlowLabels(sceneCamera(), { width: 1000, height: 800 }, .1, positions, new Set(['run']), new Set(), {
      regions: [region], hoveredIds: new Set(['hover']), relatedIds: new Set(['target']), priorityIds: new Set(['target']),
    });
    expect(labels.filter(label => !label.region).map(label => label.id).sort()).toEqual(['hover', 'run', 'target']);
    expect(labels.find(label => label.id === 'hover')?.path).toBe('src/git/hover.ts');
    const run = labels.find(label => label.id === 'run')!, hover = labels.find(label => label.id === 'hover')!;
    expect(Math.abs(run.y - hover.y) >= 46 || Math.abs(run.x - hover.x) >= 225).toBe(true);
  });

  it('shows the currently visible region even after more than sixteen offscreen regions', () => {
    const hidden = Array.from({ length: 20 }, (_, index) => ({ ...region, id: `off-${index}`, label: `off-${index}`, count: 100, x: 10000 }));
    const labels = projectSemanticFlowLabels(sceneCamera(), { width: 1000, height: 800 }, .1, [], new Set(), new Set(), { regions: [...hidden, region] });
    expect(labels.map(label => label.label)).toEqual(['src/git']);
  });

  it('keeps the dot-to-label hover corridor and leader in the same frame, then clears both on suspension', () => {
    const layer = new FlowLabelLayer(() => {}), button = document.createElement('button'), line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    layer.update([{ ...placement('run', 250, 300), hovered: true, pointX: 200, pointY: 300, width: 120 }]);
    layer.attach('run', button); layer.attachLeader('run', line);
    expect(button.style.width).toBe('120px');
    expect(layer.hoverAt(210, 300)).toBe('run'); expect(layer.hoverAt(300, 300)).toBe('run'); expect(layer.hoverAt(800, 300)).toBeUndefined();
    expect(line.getAttribute('x1')).toBe('200'); expect(line.getAttribute('x2')).toBe('259');
    layer.update([{ ...placement('run', 260, 320), hovered: true, pointX: 210, pointY: 320, width: 120 }]);
    expect(line.getAttribute('y1')).toBe('320'); expect(line.getAttribute('y2')).toBe('320');
    layer.suspend(); expect(layer.hoverAt(300, 320)).toBeUndefined(); expect(line.style.visibility).toBe('hidden');
  });

  it('uses the closest visible dot for hover and click without inventing a region selection', () => {
    const camera = sceneCamera(), size = { width: 1000, height: 800 };
    expect(hitSemanticFlowPoint(camera, size, [positioned('back'), positioned('front', 0, 0, 50)], 500, 400)).toBe('front');
    expect(hitSemanticFlowPoint(camera, size, [positioned('run')], 800, 400)).toBeUndefined();
  });

  it('reserves a direct neighbour label before a competing region name', () => {
    const neighbour = positioned('callee', 0, 158);
    const competingRegion = { ...region, nodeIds: [], x: 0, y: 0, width: 100, height: 120 };
    const labels = projectSemanticFlowLabels(sceneCamera(), { width: 1000, height: 800 }, .2, [neighbour], new Set(), new Set(), {
      regions: [competingRegion], relatedIds: new Set(['callee']),
    });
    expect(labels[0]!.id).toBe('callee');
    expect(labels[0]!.x).toBeCloseTo(500);
    if (labels[1]) expect(labels[1]!.x).not.toBeCloseTo(500);
  });

  it('selects the displayed canonical curve without turning blank space into an edge', () => {
    const positions = [positioned('caller', -200), positioned('callee', 200)];
    const paths = semanticFlowEdgePaths({ view: 'function-call-flow', nodes: positions.map(item => item.node), edges: [{
      id: 'call-site-1', source: 'caller', target: 'callee', kind: 'calls', label: 'callee()', confidence: 'source', evidence: [], views: ['function-call-flow'],
    }] }, positions, new Set(['caller']), undefined, '3d');
    const midpoint = paths[0]!.points[24]!;
    expect(hitSemanticFlowEdge(sceneCamera(), { width: 1000, height: 800 }, paths, 500 + midpoint.x, 400 - midpoint.y)).toBe('call-site-1');
    expect(hitSemanticFlowEdge(sceneCamera(), { width: 1000, height: 800 }, paths, 500, 700)).toBeUndefined();
  });

  it('leaves room for the enlarged selected dot on both sides of its label', () => {
    for (const x of [0, 450]) {
      const label = projectSemanticFlowLabels(sceneCamera(), { width: 1000, height: 800 }, 3, [positioned('run', x)], new Set(['run']), new Set())[0]!;
      const left = label.x + 17, right = left + label.width!;
      expect(left >= label.pointX! + 16.99 || right <= label.pointX! - 16.99).toBe(true);
      const layer = new FlowLabelLayer(() => {}), button = document.createElement('button');
      layer.update([label]); layer.attach('run', button);
      expect(button.style.transform).toContain('translate(17px, -50%)');
    }
  });

  it.each(['representative', 'related', 'hovered', 'edge endpoint'])('keeps a %s label off its own dot after narrow-viewport clamping', kind => {
    const node = positioned('callback L39', 320), size = { width: 343, height: 618 };
    const labels = projectSemanticFlowLabels(sceneCamera(), size, 3, [node], new Set(), new Set(), {
      relatedIds: new Set(kind === 'related' ? [node.node.id] : []),
      hoveredIds: new Set(kind === 'hovered' ? [node.node.id] : []),
      priorityIds: new Set(kind === 'edge endpoint' ? [node.node.id] : []),
    });
    expect(labels).toHaveLength(1);
    const label = labels[0]!, left = label.x + 9, right = left + label.width!, height = label.hovered ? 46 : 28;
    const dx = Math.max(left - label.pointX!, label.pointX! - right, 0);
    const dy = Math.max(label.y - height / 2 - label.pointY!, label.pointY! - label.y - height / 2, 0);
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(8.99);
    expect(left).toBeGreaterThanOrEqual(0); expect(right).toBeLessThanOrEqual(size.width);
    expect(label.id).toBe(node.node.id);
  });

  it('retains visible names and their label sides through small camera and zoom movements', () => {
    const camera = sceneCamera(), size = { width: 1000, height: 800 };
    const positions = [positioned('run', -240), positioned('other', 0), positioned('target', 240)];
    const first = projectSemanticFlowLabels(camera, size, .8, positions, new Set(['run']), new Set());
    camera.position.x += .5; camera.lookAt(.5, 0, 0);
    const next = projectSemanticFlowLabels(camera, size, .69, positions, new Set(['run']), new Set(), { previous: first });
    expect(next.map(label => label.id)).toEqual(first.map(label => label.id));
    for (const label of next) {
      const previous = first.find(item => item.id === label.id)!;
      // Viewport clamping may absorb a subpixel camera movement at the edge.
      expect(Math.abs((label.x - label.pointX!) - (previous.x - previous.pointX!))).toBeLessThan(1);
      expect(Math.abs((label.y - label.pointY!) - (previous.y - previous.pointY!))).toBeLessThan(1);
    }
  });
});
