/** Resolve displayed relation IDs once for labels, points, lines and particles. */
export function graph3DHoverEmphasis(edges: readonly { id: string; source: string; target: string; active: boolean }[], hovered?: string) {
  const edgeIds = new Set<string>(), nodeIds = new Set<string>();
  if (hovered) for (const edge of edges) {
    if (edge.active && (edge.id === hovered || edge.source === hovered || edge.target === hovered)) {
      edgeIds.add(edge.id); nodeIds.add(edge.source); nodeIds.add(edge.target);
    }
  }
  return { edgeIds, nodeIds };
}
