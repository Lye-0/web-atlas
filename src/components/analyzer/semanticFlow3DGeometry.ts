import type { FlowPoint } from '../../analyzer/semantic/flowPresentation';
import type { SemanticFlowRegion } from '../../analyzer/semantic/flowRegions';

/** A wire outline of existing membership extents; never changes point positions or ownership. */
export function semanticFlowRegionWire(region: SemanticFlowRegion): FlowPoint[] {
  const corners = [0, 1].flatMap(z => [0, 1].flatMap(y => [0, 1].map(x => ({ x: region.x + x * region.width, y: region.y + y * region.height, z: region.z + z * (region.depth ?? 0) }))));
  return corners.flatMap((point, index) => [1, 2, 4].filter(bit => !(index & bit)).flatMap(bit => [point, corners[index | bit]!]));
}
