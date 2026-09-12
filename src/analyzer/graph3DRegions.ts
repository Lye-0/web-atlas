import type { AnalyzerGraph3D, Graph3DVector } from './graph3D';

/** Render-only Scope ports. Facts, layout points and containment remain untouched. */
export function graph3DRegionAnchors(graph: AnalyzerGraph3D): ReadonlyMap<string, Graph3DVector> {
  const parents=new Map(graph.regions.map(region=>[region.original.id,region.original.parentRegionId]));
  return new Map(graph.regions.map(region => {
    let parent=region.original.parentRegionId,depth=0;const visited=new Set<string>();
    while(parent&&!visited.has(parent)){visited.add(parent);depth++;parent=parents.get(parent);}
    // Adjacent parent/child ports use opposite sides of their top-front edge.
    // This local offset avoids piling nested Scope ports onto the same corner.
    return [region.original.id, graph.source.view === 'architecture'
      ? [region.center[0] + (depth%2?1:-1)*region.size[0] * .38, region.center[1] + region.size[1] / 2, region.center[2] + region.size[2] / 2] as Graph3DVector
      : region.center];
  }));
}

/** Follow represented original parent IDs, including owners of compressed chains. */
export function graph3DRegionEmphasis(graph: AnalyzerGraph3D, selected?: string, hovered?: string) {
  const byId = new Map(graph.regions.map(region => [region.original.id, region.original]));
  const levels = new Map<string, 'selected' | 'hovered' | 'ancestor'>();
  for (const id of [selected, hovered]) {
    let parent = id && byId.get(id)?.parentRegionId;
    const visited = new Set<string>();
    while (parent && !visited.has(parent)) { visited.add(parent); levels.set(parent, 'ancestor'); parent = byId.get(parent)?.parentRegionId; }
  }
  if (hovered && byId.has(hovered)) levels.set(hovered, 'hovered');
  if (selected && byId.has(selected)) levels.set(selected, 'selected');
  return levels;
}
