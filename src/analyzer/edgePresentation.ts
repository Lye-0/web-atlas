import type { AnalyzerViewEdge } from './types';

export interface AnalyzerEdgeArrowState {
  selected: boolean;
  connected: boolean;
  bundle: boolean;
  focusDepth?: number;
}

/**
 * Returns the edges that belong to the foreground layer, keeping a selected
 * edge after all other foreground edges so shared routes cannot cover it.
 */
export function analyzerForegroundEdges(
  edges: readonly AnalyzerViewEdge[],
  selectedEdgeId?: string,
  selectedNodeId?: string,
): AnalyzerViewEdge[] {
  const foreground = edges.filter((edge) => edge.id === selectedEdgeId || Boolean(
    selectedNodeId && (edge.sourceId === selectedNodeId || edge.targetId === selectedNodeId),
  ));
  if (!selectedEdgeId) return foreground;

  const selectedIndex = foreground.findIndex((edge) => edge.id === selectedEdgeId);
  if (selectedIndex < 0 || selectedIndex === foreground.length - 1) return foreground;

  const selected = foreground[selectedIndex];
  return [...foreground.slice(0, selectedIndex), ...foreground.slice(selectedIndex + 1), selected];
}

export function analyzerEdgeArrowMarkerId({ selected, connected, bundle, focusDepth }: AnalyzerEdgeArrowState): string {
  if (selected) return 'analyzer-edge-arrow-selected';
  if (connected) return 'analyzer-edge-arrow-related';
  if (focusDepth !== undefined && focusDepth >= 3) return 'analyzer-edge-arrow-deep';
  if (bundle) return 'analyzer-edge-arrow-bundle';
  return 'analyzer-edge-arrow-normal';
}
