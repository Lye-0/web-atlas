import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { semanticFlowEdgePaths } from './flowPresentation';
import { semanticFlowRegions } from './flowRegions';
import { semanticFlowRegionWire } from '../../components/analyzer/semanticFlow3DGeometry';
import type { SemanticGraph, SemanticNode } from './types';

const node = (id: string): SemanticNode => ({ id, label: id, kind: 'function', group: 'Source', confidence: 'source', evidence: [], attributes: {} });
const nodes = [node('a'), node('b'), node('c'), node('d')];
const graph: SemanticGraph = { view: 'function-call-flow', nodes, edges: [
  ['direct', 'a', 'b'], ['parallel', 'a', 'b'], ['reverse', 'b', 'a'], ['self', 'a', 'a'], ['vertical', 'b', 'c'], ['short', 'c', 'd'],
].map(([id, source, target]) => ({ id: id!, source: source!, target: target!, kind: 'calls', label: id!, confidence: 'source', evidence: [], views: ['function-call-flow'] })) };
const positions = nodes.map((node, index) => ({ node, x: [0, 400, 400, 404][index]!, y: [0, 180, -120, -118][index]!, z: [0, 0, 0, 0][index]! }));

describe('polish geometry scope', () => {
  // Recorded before the 3D fix from fcd28d02eb4c4329dabe5287c261e9c44282d61b.
  it('freezes every 2D curve sample and SVG port/path across straight, reciprocal, self, vertical and short edges', () => {
    const paths = semanticFlowEdgePaths(graph, positions, new Set(['a']), undefined, '2d');
    expect(paths.map(path => ({ id: path.edge.id, svg: path.svgPath, samples: createHash('sha256').update(JSON.stringify(path.points)).digest('hex') }))).toMatchSnapshot();
  });
  it('anchors every 3D path and arrow tip at the exact dot center through camera transforms and resizes', () => {
    const positioned = positions.map((point, index) => ({ ...point, z: index * 80 }));
    const paths = semanticFlowEdgePaths(graph, positioned, new Set(['a']), undefined, '3d');
    for (const size of [[343, 618], [1440, 900]]) for (const zoom of [.2, 1, 3, 8]) for (const eye of [[600, 450, 2200], [1800, -600, 500]]) {
      const camera = new OrthographicCamera(-size[0]! / 2, size[0]! / 2, size[1]! / 2, -size[1]! / 2, .1, 1000000);
      camera.position.set(eye[0]!, eye[1]!, eye[2]!); camera.lookAt(20, 30, 40); camera.zoom = zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      for (const path of paths) for (const [endpoint, id] of [[path.points[0]!, path.edge.source], [path.points.at(-1)!, path.edge.target]] as const) {
        const point = positioned.find(point => point.node.id === id)!;
        expect(endpoint).toEqual({ x: point.x, y: point.y, z: point.z });
        expect(new Vector3(endpoint.x, endpoint.y, endpoint.z).project(camera).toArray()).toEqual(new Vector3(point.x, point.y, point.z).project(camera).toArray());
      }
    }
    expect(paths.map(path => path.points)).toEqual(semanticFlowEdgePaths(graph, positioned, new Set(['b']), undefined, '3d').map(path => path.points));
  });
  it('constructs only twelve boundary strokes around existing group extents without altering members', () => {
    const before = JSON.stringify(positions), regions = semanticFlowRegions(positions, '3d');
    for (const region of regions) {
      const wire = semanticFlowRegionWire(region);
      expect(wire).toHaveLength(24);
      expect(new Set(wire.map(point => JSON.stringify(point))).size).toBe(8);
      for (const id of region.nodeIds) {
        const point = positions.find(point => point.node.id === id)!;
        expect(point.x).toBeGreaterThan(region.x); expect(point.x).toBeLessThan(region.x + region.width);
        expect(point.y).toBeGreaterThan(region.y); expect(point.y).toBeLessThan(region.y + region.height);
      }
    }
    expect(JSON.stringify(positions)).toBe(before);
  });
  it('retains the distinct target center when near-coincident points use a loop-shaped path', () => {
    const positioned = [{ node: nodes[0]!, x: 0, y: 0, z: 0 }, { node: nodes[1]!, x: .001, y: .002, z: .003 }];
    const paths = semanticFlowEdgePaths({ ...graph, edges: [graph.edges[0]!] }, positioned, new Set(['a']), undefined, '3d');
    expect(paths[0]!.points[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(paths[0]!.points.at(-1)).toEqual({ x: .001, y: .002, z: .003 });
  });
});
