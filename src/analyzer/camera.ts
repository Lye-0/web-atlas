import type { AnalyzerLayout, PositionedNode } from './layout';
import { ANALYZER_NODE_WIDTH } from './layout';

export interface AnalyzerGraphTransform {
  x: number;
  y: number;
  scale: number;
}

export const ANALYZER_DEFAULT_TRANSFORM: AnalyzerGraphTransform = { x: 24, y: 24, scale: 0.7 };

export interface AnalyzerFitPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ANALYZER_FIT_PADDING: AnalyzerFitPadding = { top: 48, right: 64, bottom: 48, left: 64 };

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
  positionedNode: PositionedNode,
  width: number,
  height: number,
  currentScale: number,
): AnalyzerGraphTransform {
  const scale = Math.max(0.82, Math.min(1.4, currentScale));
  return {
    scale,
    x: width / 2 - (positionedNode.x + ANALYZER_NODE_WIDTH / 2) * scale,
    y: height / 2 - (positionedNode.y + positionedNode.height / 2) * scale,
  };
}
