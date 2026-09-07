import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FlowLabelLayer, hitSemanticFlowEdge, hitSemanticFlowPoint, projectSemanticFlowLabels, semanticFlowConnectionNotices, type FlowLabelPlacement } from './semanticFlowLabels';
import { semanticFlowEdgePaths } from '../../analyzer/semantic/flowPresentation';
import type { SemanticPosition } from '../../analyzer/semantic/presentation';
import type { SemanticFlowRegion } from '../../analyzer/semantic/flowRegions';

const placement = (id = 'run', x = 100, y = 200): FlowLabelPlacement => ({ id, x, y, label: id, path: `src/${id}.ts:2`, selected: false, match: false });
const positioned = (id: string, x = 0, y = 0, z = 0): SemanticPosition => ({ x, y, z, node: { id, kind: 'function', label: id, path: `src/git/${id}.ts`, group: 'Source', confidence: 'source', evidence: [], attributes: {} } });
const region: SemanticFlowRegion = { id: 'directory:src/git', kind: 'directory', label: 'src/git', x: -300, y: -120, z: -20, width: 600, height: 240, count: 3, nodeIds: ['run', 'other', 'target'] };
const sceneCamera = () => { const camera = new OrthographicCamera(-500, 500, 400, -400, .1, 1000); camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0); return camera; };

describe('semantic 3D label synchronization', () => {
  it.each(['selected node', 'selected edge'])('keeps a 220×60 left-side label hit box fixed on hover and unhover beside %s priorities', selection => {
    const positions = [positioned('source', -100, -100), positioned('edge-end', -300, 100), positioned('peer', 300)];
    positions[2]!.node.label = 'callback L163';
    const selected = new Set(selection === 'selected node' ? ['source'] : []);
    const context = { relatedIds: new Set(['source', 'edge-end', 'peer']), priorityIds: new Set(selection === 'selected edge' ? ['source', 'edge-end'] : []),
      roles: new Map([['source', selection === 'selected node' ? 'selected' as const : 'source' as const], ['edge-end', 'target' as const], ['peer', 'outgoing' as const]]),
      displays: new Map([['peer', { title: 'callback L163', location: 'webview/src/components/GraphSvg.tsx:163', disambiguation: '範囲 12419–12451 · GraphSvg.tsx:163', tooltip: 'callback L163\nwebview/src/components/GraphSvg.tsx:163\nID: peer' }]]),
      view: 'function-call-flow' as const, relationKinds: new Map([['peer', new Set(['callback'])]]),
    };
    const camera = sceneCamera(), size = { width: 1000, height: 800 };
    const before = projectSemanticFlowLabels(camera, size, 1, positions, selected, new Set(), context);
    const hover = projectSemanticFlowLabels(camera, size, 1, positions, selected, new Set(), { ...context, previous: before, hoveredIds: new Set(['peer']), emphasisIds: new Set(['source', 'peer']) });
    const after = projectSemanticFlowLabels(camera, size, 1, positions, selected, new Set(), { ...context, previous: hover });
    const box = (labels: FlowLabelPlacement[], id: string) => { const label = labels.find(item => item.id === id)!; return { x: label.x, y: label.y, width: label.width, height: label.height }; };
    const initial = before.find(label => label.id === 'peer')!;
    expect(initial.width).toBe(220); expect(initial.height).toBe(60);
    expect(initial.x + 9 + initial.width!).toBeLessThanOrEqual(initial.pointX! - 9);
    for (const id of ['source', ...(selection === 'selected edge' ? ['edge-end'] : []), 'peer']) {
      expect(box(hover, id)).toEqual(box(before, id)); expect(box(after, id)).toEqual(box(before, id));
    }
    expect(hover.find(label => label.id === 'peer')).toMatchObject({ hovered: true, emphasized: true, roleLabel: 'コールバック先', tooltip: context.displays.get('peer')!.tooltip });
    const layer = new FlowLabelLayer(() => {}), button = document.createElement('button');
    layer.update(before); layer.attach('peer', button); const transform = button.style.transform;
    layer.update(hover); expect(button.style.transform).toBe(transform); expect(button.style.width).toBe('220px'); expect(button.style.height).toBe('60px');
    layer.update(after); expect(button.style.transform).toBe(transform);
  });

  it('reserves and mounts role and identity rows at their complete height without covering the dot or another label', () => {
    const positions = [positioned('source'), positioned('target', 20), positioned('hover', 30)];
    const labels = projectSemanticFlowLabels(sceneCamera(), { width: 1000, height: 800 }, .1, positions, new Set(), new Set(), {
      priorityIds: new Set(['source', 'target']), hoveredIds: new Set(['hover']), roles: new Map([['source', 'source'], ['target', 'target']]),
      displays: new Map(positions.map(point => [point.node.id, { title: point.node.label, location: 'src/same.ts:163', tooltip: point.node.id, disambiguation: `same.ts · 範囲 ${point.node.id === 'source' ? '12419–12454' : '12457–12501'}` }])),
    });
    expect(labels.slice(0, 2).map(label => label.id)).toEqual(['source', 'target']);
    for (const label of labels.slice(0, 2)) {
      expect(label.height).toBe(60);
      const button = document.createElement('button'), layer = new FlowLabelLayer(() => {});
      layer.update([label]); layer.attach(label.id, button); expect(button.style.height).toBe('60px');
    }
    const [a, b] = labels;
    expect(Math.abs(a!.y - b!.y) >= (a!.height! + b!.height!) / 2 || a!.x + a!.width! <= b!.x || b!.x + b!.width! <= a!.x).toBe(true);
  });

  it('keeps relation hover endpoints before the general neighbour budget while selected endpoints remain first', () => {
    const positions = [positioned('selected', -300), ...Array.from({ length: 35 }, (_, index) => positioned(`peer-${index}`, index % 5 * 50 - 100, Math.floor(index / 5) * 35 - 120))];
    const labels = projectSemanticFlowLabels(sceneCamera(), { width: 1000, height: 800 }, .1, positions, new Set(['selected']), new Set(), {
      relatedIds: new Set(positions.map(point => point.node.id)), emphasisIds: new Set(['selected', 'peer-34']),
    });
    expect(labels.slice(0, 2).map(label => label.id)).toEqual(['selected', 'peer-34']);
    expect(labels[1]!.emphasized).toBe(true); expect(labels.slice(2).every(label => label.dimmed)).toBe(true);
  });

  it('keeps a few direct endpoints ahead of unrelated names in a dense point cloud', () => {
    const positions = [positioned('caller', -240), positioned('Math.abs', 0, 5), positioned('Math.min', 28, -10),
      ...Array.from({ length: 60 }, (_, index) => positioned(`other-${index}`, (index % 10) * 13 - 45, Math.floor(index / 10) * 13 - 35))];
    const labels = projectSemanticFlowLabels(sceneCamera(), { width: 1000, height: 800 }, .1, positions, new Set(['caller']), new Set(), { relatedIds: new Set(['caller', 'Math.abs', 'Math.min']), regions: [region] });
    expect(labels.slice(0, 3).map(label => label.id)).toEqual(['caller', 'Math.abs', 'Math.min']);
    for (const label of labels.slice(0, 3)) {
      const inset = label.selected ? 17 : 9, height = label.selected ? 46 : 28;
      const left = label.x + inset, right = left + label.width!;
      expect(left >= label.pointX! + inset || right <= label.pointX! - inset || label.y - height / 2 >= label.pointY! + inset || label.y + height / 2 <= label.pointY! - inset).toBe(true);
    }
  });

  it('reserves both selected-edge names before hover, irrespective of input order', () => {
    const positions = [positioned('hover', 20), positioned('target', 30), positioned('source')];
    const context = { priorityIds: new Set(['source', 'target']), relatedIds: new Set(['source', 'target']) };
    const first = projectSemanticFlowLabels(sceneCamera(), { width: 1000, height: 800 }, .1, positions, new Set(), new Set(), context);
    const hovered = projectSemanticFlowLabels(sceneCamera(), { width: 1000, height: 800 }, .1, positions, new Set(), new Set(), { ...context, hoveredIds: new Set(['hover']), previous: first });
    expect(hovered.slice(0, 2).map(label => label.id)).toEqual(['source', 'target']);
    for (const label of hovered.slice(0, 2)) expect({ x: label.x, y: label.y }).toEqual({ x: first.find(item => item.id === label.id)!.x, y: first.find(item => item.id === label.id)!.y });
  });

  it('distinguishes offscreen connections from labels culled in view without moving the camera', () => {
    const camera = sceneCamera(), before = camera.position.toArray(), size = { width: 1000, height: 800 };
    const positions = [positioned('visible'), positioned('crowded', 10), positioned('outside', 1100), positioned('behind-toolbar', 0, 350)];
    const notices = semanticFlowConnectionNotices(camera, size, positions, new Set(positions.map(item => item.node.id)), [placement('visible')]);
    expect(notices).toEqual([{ id: 'crowded', status: 'unlabelled' }, { id: 'outside', status: 'offscreen' }, { id: 'behind-toolbar', status: 'offscreen' }]);
    expect(camera.position.toArray()).toEqual(before);
  });

  it('reserves measured disclosures and keeps covered connections reachable in the remaining list', () => {
    const camera = sceneCamera(), size = { width: 1000, height: 800 };
    const obstacles = [{ left: 280, top: 520, width: 330, height: 100 }];
    const positions = [positioned('beside-control', -240, -140), positioned('behind-control', -180, -170)];
    const relatedIds = new Set(positions.map(item => item.node.id));
    const labels = projectSemanticFlowLabels(camera, size, 1, positions, new Set(), new Set(), { relatedIds, obstacles });
    expect(labels.map(label => label.id)).toEqual(['beside-control']);
    const label = labels[0]!, left = label.x + 9;
    expect(left + label.width! <= 280 || label.y + 14 <= 520 || label.y - 14 >= 620 || left >= 610).toBe(true);
    expect(semanticFlowConnectionNotices(camera, size, positions, relatedIds, labels, 148, obstacles)).toEqual([{ id: 'behind-control', status: 'unlabelled' }]);
  });

  it('leaves room for the aggregate ring at maximum point scale, including the mounted label and leader', () => {
    for (const x of [0, 450]) {
      const item = positioned('aggregate', x); item.node.attributes = { displayAggregate: true, targetCount: 120 };
      const label = projectSemanticFlowLabels(sceneCamera(), { width: 1000, height: 800 }, 8, [item], new Set(), new Set())[0]!;
      const left = label.x + 17, right = left + label.width!;
      expect(left >= label.pointX! + 17 || right <= label.pointX! - 17 || label.y - 23 >= label.pointY! + 17 || label.y + 23 <= label.pointY! - 17).toBe(true);
      const layer = new FlowLabelLayer(() => {}), button = document.createElement('button'), leader = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      layer.update([label]); layer.attach('aggregate', button); layer.attachLeader('aggregate', leader);
      expect(button.style.transform).toContain('translate(17px, -50%)');
      expect(Number(leader.getAttribute('x2'))).toBeGreaterThanOrEqual(left);
      expect(Number(leader.getAttribute('x2'))).toBeLessThanOrEqual(right);
    }
  });
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
    const runLeft = run.x + 17, hoverLeft = hover.x + 9;
    expect(Math.abs(run.y - hover.y) >= (run.height! + hover.height!) / 2 || runLeft + run.width! <= hoverLeft || hoverLeft + hover.width! <= runLeft).toBe(true);
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
    const label = labels[0]!, left = label.x + 9, right = left + label.width!, height = label.height!;
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
