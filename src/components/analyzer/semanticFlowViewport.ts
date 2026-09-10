import type { OrthographicCamera } from 'three';

/** The navigation and direction legend occupy the canvas, so focus belongs to
 * the remaining plot area rather than the center of the full canvas. */
export function semanticFlowPlot(width: number, height: number, overlayTop = 148) {
  const bottom = Math.max(40, height - (width < 700 ? 90 : 76));
  const top = Math.max(0, Math.min(overlayTop, bottom - 40));
  return { top, bottom, height: bottom - top, centerY: (top + bottom) / 2 };
}

export function configureSemanticFlowViewport(camera: OrthographicCamera, width: number, height: number, overlayTop?: number, anchor?: { width: number; centerY: number }) {
  const plot = semanticFlowPlot(width, height, overlayTop);
  if (width > 0 && height > 0) camera.setViewOffset(width, height, anchor ? (width - anchor.width) / 2 : 0, height / 2 - (anchor?.centerY ?? plot.centerY), width, height);
  return plot;
}
