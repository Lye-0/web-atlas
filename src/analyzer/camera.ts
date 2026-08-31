import type { AnalyzerLayout, PositionedNode } from './layout';
import { ANALYZER_NODE_WIDTH } from './layout';

export interface AnalyzerGraphTransform {
  x: number;
  y: number;
  scale: number;
}

export const ANALYZER_DEFAULT_TRANSFORM: AnalyzerGraphTransform = { x: 24, y: 24, scale: 0.7 };

export function fitAnalyzerTransform(layout: AnalyzerLayout, width: number, height: number): AnalyzerGraphTransform {
  if (width <= 0 || height <= 0 || layout.width <= 0 || layout.height <= 0) return ANALYZER_DEFAULT_TRANSFORM;

  const availableWidth = Math.max(1, width - 60);
  const availableHeight = Math.max(1, height - 100);
  const scale = Math.min(1, availableWidth / layout.width, availableHeight / layout.height);
  return {
    scale,
    x: (width - layout.width * scale) / 2,
    y: (height - layout.height * scale) / 2 + 28,
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
