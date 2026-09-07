import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { configureSemanticFlowViewport } from './semanticFlowViewport';

describe('3D plot framing below navigation', () => {
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
