import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FlowLabelLayer, projectSemanticFlowLabels, type FlowLabelPlacement } from './semanticFlowLabels';

const placement = (id = 'run', x = 100, y = 200): FlowLabelPlacement => ({ id, x, y, label: id, path: `src/${id}.ts:2`, selected: false, match: false });

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
});
