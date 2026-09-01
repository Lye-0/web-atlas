import { describe, expect, it } from 'vitest';
import { analyzerEdgeArrowMarkerId, analyzerForegroundEdges } from './edgePresentation';
import type { AnalyzerViewEdge } from './types';

function edge(id: string, sourceId = 'source', targetId = 'target'): AnalyzerViewEdge {
  return {
    id,
    sourceId,
    targetId,
    kind: 'uses',
    label: id,
    evidenceIds: [],
    metadata: {},
  };
}

describe('analyzerForegroundEdges', () => {
  it('keeps the selected edge after related foreground edges', () => {
    const edges = [
      edge('unrelated', 'other', 'target'),
      edge('related', 'selected-node', 'target'),
      edge('selected', 'source', 'target'),
    ];

    expect(analyzerForegroundEdges(edges, 'selected', 'selected-node').map(({ id }) => id)).toEqual(['related', 'selected']);
  });

  it('places an edge-selected route in the foreground by itself', () => {
    const edges = [edge('first'), edge('selected'), edge('last')];

    expect(analyzerForegroundEdges(edges, 'selected').map(({ id }) => id)).toEqual(['selected']);
  });

  it('preserves related-edge order when no edge is selected', () => {
    const edges = [
      edge('first', 'selected-node', 'one'),
      edge('unrelated', 'other', 'target'),
      edge('second', 'two', 'selected-node'),
    ];

    expect(analyzerForegroundEdges(edges, undefined, 'selected-node').map(({ id }) => id)).toEqual(['first', 'second']);
  });
});

describe('analyzerEdgeArrowMarkerId', () => {
  it('keeps explicit selection stronger than related and semantic edge tones', () => {
    expect(analyzerEdgeArrowMarkerId({ selected: true, connected: true, bundle: true, focusDepth: 4 })).toBe('analyzer-edge-arrow-selected');
    expect(analyzerEdgeArrowMarkerId({ selected: false, connected: true, bundle: true, focusDepth: 4 })).toBe('analyzer-edge-arrow-related');
    expect(analyzerEdgeArrowMarkerId({ selected: false, connected: false, bundle: true, focusDepth: 4 })).toBe('analyzer-edge-arrow-deep');
  });

  it('uses the bundle marker for an ordinary bundled edge', () => {
    expect(analyzerEdgeArrowMarkerId({ selected: false, connected: false, bundle: true })).toBe('analyzer-edge-arrow-bundle');
    expect(analyzerEdgeArrowMarkerId({ selected: false, connected: false, bundle: false })).toBe('analyzer-edge-arrow-normal');
  });
});
