import type { AnalyzerLayout, PositionedGraphEndpoint } from './layout';
import { ANALYZER_NODE_WIDTH } from './layout';

export interface AnalyzerGraphTransform {
  x: number;
  y: number;
  scale: number;
  /** Module Dependency spatial camera schema. Absent on Views 1–4 and legacy spatial cameras. */
  schema?: number;
}

export const ANALYZER_DEFAULT_TRANSFORM: AnalyzerGraphTransform = { x: 24, y: 24, scale: 0.7 };

export interface AnalyzerFitPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ANALYZER_FIT_PADDING: AnalyzerFitPadding = { top: 48, right: 64, bottom: 48, left: 64 };

export function shouldRunAnalyzerInitialFit(hasStoredCamera: boolean): boolean {
  return !hasStoredCamera;
}

export interface AnalyzerViewportSize {
  width: number;
  height: number;
}

const ANALYZER_VIEWPORT_SAFE_INSET = 36;

function positionedEndpointWidth(endpoint: PositionedGraphEndpoint): number {
  return 'region' in endpoint ? endpoint.width : ANALYZER_NODE_WIDTH;
}

export function fitAnalyzerTransform(layout: AnalyzerLayout, width: number, height: number, padding: AnalyzerFitPadding = ANALYZER_FIT_PADDING): AnalyzerGraphTransform {
  if (width <= 0 || height <= 0 || layout.width <= 0 || layout.height <= 0) return ANALYZER_DEFAULT_TRANSFORM;

  const availableWidth = Math.max(1, width - padding.left - padding.right);
  const availableHeight = Math.max(1, height - padding.top - padding.bottom);
  const scale = Math.min(1, availableWidth / layout.width, availableHeight / layout.height);
  return {
    scale,
    x: padding.left + (availableWidth - layout.width * scale) / 2,
    y: padding.top + (availableHeight - layout.height * scale) / 2,
  };
}

export function focusAnalyzerTransform(
  positionedNode: PositionedGraphEndpoint,
  width: number,
  height: number,
  currentScale: number,
): AnalyzerGraphTransform {
  const scale = Math.max(0.82, Math.min(1.4, currentScale));
  return {
    scale,
    x: width / 2 - (positionedNode.x + positionedEndpointWidth(positionedNode) / 2) * scale,
    y: height / 2 - (positionedNode.y + positionedNode.height / 2) * scale,
  };
}

export function preserveAnalyzerTransformOnViewportResize(
  current: AnalyzerGraphTransform,
  previousViewport: AnalyzerViewportSize,
  nextViewport: AnalyzerViewportSize,
  selectedPosition?: PositionedGraphEndpoint,
): AnalyzerGraphTransform {
  const deltaY = (nextViewport.height - previousViewport.height) / 2;
  if (nextViewport.width === previousViewport.width && deltaY === 0) return current;

  let deltaX = (nextViewport.width - previousViewport.width) / 2;
  if (selectedPosition) {
    const selectedLeft = current.x + selectedPosition.x * current.scale;
    const selectedRight = current.x + (selectedPosition.x + positionedEndpointWidth(selectedPosition)) * current.scale;
    const minimum = ANALYZER_VIEWPORT_SAFE_INSET;
    const maximum = Math.max(minimum, nextViewport.width - ANALYZER_VIEWPORT_SAFE_INSET);
    deltaX = selectedRight > maximum
      ? maximum - selectedRight
      : selectedLeft < minimum
        ? minimum - selectedLeft
        : 0;
  }

  if (deltaX === 0 && deltaY === 0) return current;
  return { ...current, x: current.x + deltaX, y: current.y + deltaY };
}
