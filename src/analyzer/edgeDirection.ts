/** The Module Dependency palette, interpreted relative to canonical source/target IDs. */
export const analyzerDirectionColors = { outgoing: '#82c6e2', incoming: '#dfb785', internal: '#afcbbd' } as const;
export type AnalyzerEdgeDirection = keyof typeof analyzerDirectionColors;
export function analyzerEdgeDirection(source: string, target: string, selected: ReadonlySet<string>): AnalyzerEdgeDirection | undefined {
  const outgoing = selected.has(source), incoming = selected.has(target);
  return outgoing && incoming ? 'internal' : incoming ? 'incoming' : outgoing ? 'outgoing' : undefined;
}
