// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { OrthographicCamera } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SemanticFlow3D } from './SemanticFlow3D';
import type { FlowCameraCommand } from './SemanticFlow2D';

const state = vi.hoisted(() => ({ scene: {} as Record<string, unknown>, controls: [] as OrbitControls[] }));
vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }: { children: ReactNode }) => children, useThree: () => state.scene, useFrame: vi.fn() }));
vi.mock('./SpatialFlowParticles', () => ({ SpatialFlowParticles: () => null }));
vi.mock('three/addons/controls/OrbitControls.js', async importOriginal => {
  const original = await importOriginal<typeof import('three/addons/controls/OrbitControls.js')>();
  return { OrbitControls: class extends original.OrbitControls {
    constructor(...args: ConstructorParameters<typeof original.OrbitControls>) { super(...args); state.controls.push(this); }
  } };
});
afterEach(() => { vi.unstubAllGlobals(); state.controls.length = 0; });

it('keeps the orbit target through selection panel resize and saves using the current viewport', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'), canvas = document.createElement('canvas');
  document.body.append(host, canvas);
  const camera = new OrthographicCamera(-500, 500, 350, -350, .1, 1000000), invalidate = vi.fn();
  const gl = { domElement: canvas, getPixelRatio: () => 1 };
  state.scene = { camera, gl, invalidate, size: { width: 1000, height: 700 } };
  const root = createRoot(host), onCamera = vi.fn();
  const graph = { view: 'data-model' as const, nodes: [{ id: 'model', label: 'Model', kind: 'model' as const, group: 'Source', confidence: 'source' as const, evidence: [], attributes: {} }], edges: [] };
  const saved = { position: [700, 500, 1200] as [number, number, number], target: [400, 200, 100] as [number, number, number], zoom: 2 };
  const render = (selected: boolean, command?: FlowCameraCommand) => act(async () => root.render(<SemanticFlow3D graph={graph} selectedIds={new Set(selected ? ['model'] : [])} matchIds={new Set()} camera={saved} command={command} motion={{ enabled: false, reduced: false, visible: true }} autoAggregation={false} onCamera={onCamera} onSelect={() => {}} onSelectEdge={() => {}} onClear={() => {}} onUnavailable={() => {}} />));
  try {
    await render(true);
    const control = state.controls[0]!, rotation = camera.quaternion.toArray(), target = control.target.toArray(), position = camera.position.toArray();
    for (const [width, selected] of [[1400, false], [1000, true], [1400, false]] as const) {
      state.scene = { ...state.scene, size: { width, height: 700 } };
      await render(selected);
      expect(state.controls).toHaveLength(1);
      expect(control.target.toArray()).toEqual(target);
      expect(camera.position.toArray()).toEqual(position);
      expect(camera.quaternion.toArray()).toEqual(rotation);
      expect(camera.zoom).toBe(2);
    }
    await act(async () => { control.dispatchEvent({ type: 'end' }); });
    expect(onCamera).toHaveBeenLastCalledWith({ position, target, zoom: 2 });
    expect(camera.view?.fullWidth).toBe(1400);
    await render(false, { kind: 'zoom-in', nonce: 1 });
    expect(camera.zoom).toBeCloseTo(2.4);
    expect(control.target.toArray()).toEqual(target);
    await render(false, { kind: 'fit', nonce: 2 });
    expect(control.target.toArray()).not.toEqual(target);
    expect(state.controls).toHaveLength(1);
  } finally { await act(async () => root.unmount()); host.remove(); canvas.remove(); }
});
