import { describe, expect, it } from 'vitest';
import { analyzerEdgeArrowMarkerId, analyzerEdgeRelatedToSelection, analyzerForegroundEdges } from './edgePresentation';
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

  it('highlights only the incident edge when a target dependency is selected', () => {
    const edges = [
      edge('a-b', 'A', 'B'),
      edge('a-c', 'A', 'C'),
      edge('a-d', 'A', 'D'),
    ];

    expect(edges.filter((candidate) => analyzerEdgeRelatedToSelection(candidate, undefined, 'B')).map(({ id }) => id)).toEqual(['a-b']);
    expect(analyzerForegroundEdges(edges, undefined, 'B').map(({ id }) => id)).toEqual(['a-b']);
    expect(analyzerEdgeRelatedToSelection(edges[1]!, undefined, 'B')).toBe(false);
    expect(analyzerEdgeRelatedToSelection(edges[2]!, undefined, 'B')).toBe(false);
  });

  it('highlights every direct edge when the source package is selected', () => {
    const edges = [
      edge('a-b', 'A', 'B'),
      edge('a-c', 'A', 'C'),
      edge('a-d', 'A', 'D'),
    ];

    expect(analyzerForegroundEdges(edges, undefined, 'A').map(({ id }) => id)).toEqual(['a-b', 'a-c', 'a-d']);
  });

  it('highlights incoming and outgoing incident edges together', () => {
    const edges = [
      edge('a-b', 'A', 'B'),
      edge('c-b', 'C', 'B'),
      edge('b-d', 'B', 'D'),
      edge('b-e', 'B', 'E'),
      edge('a-e', 'A', 'E'),
    ];

    expect(analyzerForegroundEdges(edges, undefined, 'B').map(({ id }) => id)).toEqual(['a-b', 'c-b', 'b-d', 'b-e']);
  });

  it('does not propagate highlight through a related node to a second hop', () => {
    const edges = [
      edge('a-b', 'A', 'B'),
      edge('b-c', 'B', 'C'),
      edge('c-d', 'C', 'D'),
    ];

    expect(analyzerForegroundEdges(edges, undefined, 'B').map(({ id }) => id)).toEqual(['a-b', 'b-c']);
    expect(analyzerEdgeRelatedToSelection(edges[2]!, undefined, 'B')).toBe(false);
  });

  it('keeps External Summary highlight on the incident endpoint only', () => {
    const collapsed = [
      edge('root-summary', 'package:root', 'dependencies:external:summary'),
      edge('root-vite', 'package:root', 'technology:vite'),
    ];
    const expanded = [
      edge('root-left-pad', 'package:root', 'external-package:left-pad'),
      edge('root-vite', 'package:root', 'technology:vite'),
      edge('web-left-pad', 'package:web', 'external-package:left-pad'),
    ];

    expect(analyzerForegroundEdges(collapsed, undefined, 'dependencies:external:summary').map(({ id }) => id)).toEqual(['root-summary']);
    expect(analyzerForegroundEdges(collapsed, undefined, 'technology:vite').map(({ id }) => id)).toEqual(['root-vite']);
    expect(analyzerForegroundEdges(expanded, undefined, 'external-package:left-pad').map(({ id }) => id)).toEqual(['root-left-pad', 'web-left-pad']);
    expect(analyzerForegroundEdges(expanded, undefined, 'technology:vite').map(({ id }) => id)).toEqual(['root-vite']);
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
