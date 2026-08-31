export type AnalyzerZoomLevel = 'far' | 'medium' | 'near';

export const ANALYZER_FAR_ZOOM_THRESHOLD = 0.55;
export const ANALYZER_NEAR_ZOOM_THRESHOLD = 0.95;

export function semanticZoomLevelForScale(scale: number): AnalyzerZoomLevel {
  if (scale < ANALYZER_FAR_ZOOM_THRESHOLD) return 'far';
  if (scale > ANALYZER_NEAR_ZOOM_THRESHOLD) return 'near';
  return 'medium';
}

export function displayedZoomLevelForNode(zoomLevel: AnalyzerZoomLevel, selected: boolean, expanded: boolean): AnalyzerZoomLevel {
  if (selected || expanded) return 'near';
  return zoomLevel === 'near' ? 'medium' : zoomLevel;
}
