import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { configureSemanticFlowViewport } from './semanticFlowViewport';

describe('3D plot framing below navigation', () => {
  it('holds screen coordinates through detail resize without moving the camera or world point', () => {
    const camera = new OrthographicCamera(-600, 600, 350, -350, .1, 10000), point = new Vector3(110, 80, 0);
    camera.position.set(0, 0, 2000); camera.updateMatrixWorld();
    const anchor = { width: 1200, centerY: 430 }, position = camera.position.clone();
    const screen = (width: number, height: number) => { const p = point.clone().project(camera); return [(p.x + 1) * width / 2, (1 - p.y) * height / 2]; };
    configureSemanticFlowViewport(camera, 1200, 700, 180, anchor); const before = screen(1200, 700);
    camera.left = -420; camera.right = 420; camera.top = 310; camera.bottom = -310;
    configureSemanticFlowViewport(camera, 840, 620, 260, anchor);
    const after = screen(840, 620); expect(after[0]).toBeCloseTo(before[0]!); expect(after[1]).toBeCloseTo(before[1]!); expect(camera.position).toEqual(position);
  });
  it.each([[1000, 600, 180], [390, 620, 260]])('keeps a focused target below navigation at %i × %i', (width, height, top) => {
    const target = new Vector3(230, -80, 150), camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 10000);
    camera.position.copy(target).add(new Vector3(800, 400, 1200)); camera.lookAt(target); camera.updateMatrixWorld();
    const savedPosition = camera.position.clone();
    const plot = configureSemanticFlowViewport(camera, width, height, top);
    for (const zoom of [.2, 1, 3]) {
      camera.zoom = zoom; camera.updateProjectionMatrix();
      const projected = target.clone().project(camera), y = (1 - projected.y) * height / 2;
      expect(y).toBeCloseTo(plot.centerY);
      expect(y).toBeGreaterThan(top); expect(y).toBeLessThan(plot.bottom);
      expect(camera.position).toEqual(savedPosition);
    }
  });
});
