import { Scene, WebGLRenderer, type WebGLRendererParameters } from 'three';
import { _roots } from '@react-three/fiber';

/** R3F 9 configures its renderer in an async layout task without a rejection
 * handler. Report initialization failure before unmounting that Canvas root.
 * A pending result prevents a second, unhandled renderer construction attempt;
 * it owns no renderer, timer, listener, or external reference. */
export async function recoverableWebGLRenderer(parameters: WebGLRendererParameters, onUnavailable: () => void): Promise<WebGLRenderer> {
  try { return new WebGLRenderer(parameters); }
  catch {
    // configure awaits gl before setting scene. R3F 9's delayed unmount calls
    // dispose(scene) before deleting its root; a missing scene would throw and
    // leave the failed root registered. Supply an empty, asset-free scene so
    // that the normal reconciler teardown can finish. Recheck on R3F upgrades.
    const root = parameters.canvas ? _roots.get(parameters.canvas) : undefined;
    // Do not notify store subscribers before gl exists: invalidate reads gl.xr.
    // This root never renders; its next operation is the ordinary unmount.
    const state = root?.store.getState();
    if (state && !state.scene) state.scene = new Scene();
    queueMicrotask(onUnavailable);
    return new Promise<WebGLRenderer>(() => {});
  }
}
