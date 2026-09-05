import { describe, expect, it } from 'vitest';
import {
  ANALYZER_MODULE_NODE_HEIGHT,
  ANALYZER_MODULE_NODE_WIDTH,
  ANALYZER_MODULE_PACKAGE_GAP,
  layoutAnalyzerView,
  type PositionedNode,
  type PositionedSemanticRegion,
} from './layout';
import type { AnalyzerSemanticRegion, AnalyzerViewModel, AnalyzerViewNode } from './types';

function moduleNode(id: string, regionPath: string[]): AnalyzerViewNode {
  return {
    id,
    type: 'module',
    label: id,
    evidenceIds: [],
    metadata: { packageId: regionPath[0], regionPath },
  };
}

function region(
  id: string,
  regionKind: AnalyzerSemanticRegion['regionKind'],
  childIds: string[],
  options: { parentRegionId?: string; childRegionIds?: string[] } = {},
): AnalyzerSemanticRegion {
  return {
    id,
    entityKind: 'region',
    regionKind,
    label: id,
    childIds,
    childRegionIds: options.childRegionIds,
    parentRegionId: options.parentRegionId,
    ports: [],
    selectable: true,
    evidenceIds: [],
    metadata: { packageId: id.split(':')[1] ?? id },
  };
}

function fixture(): AnalyzerViewModel {
  const packageA = region('package:a', 'workspace-package', [], { childRegionIds: ['directory:a'] });
  const directoryA = region('directory:a', 'directory', ['module:a'], {
    parentRegionId: packageA.id,
    childRegionIds: ['directory:a:nested'],
  });
  const nested = region('directory:a:nested', 'directory', ['module:nested'], {
    parentRegionId: directoryA.id,
  });
  const packageB = region('package:b', 'workspace-package', ['module:b']);
  return {
    view: 'module-dependency',
    nodes: [
      moduleNode('module:a', [packageA.id, directoryA.id]),
      moduleNode('module:nested', [packageA.id, directoryA.id, nested.id]),
      moduleNode('module:b', [packageB.id]),
    ],
    edges: [],
    clusters: [],
    regions: [packageA, directoryA, nested, packageB],
    evidence: [],
    warnings: [],
  };
}

function within(inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

function nodeRect(positioned: PositionedNode): { x: number; y: number; width: number; height: number } {
  return { x: positioned.x, y: positioned.y, width: ANALYZER_MODULE_NODE_WIDTH, height: positioned.height };
}

function regionRect(positioned: PositionedSemanticRegion): { x: number; y: number; width: number; height: number } {
  return { x: positioned.x, y: positioned.y, width: positioned.width, height: positioned.height };
}

describe('module dependency layout containment', () => {
  it('packs nested regions bottom-up and keeps every child inside its parent', () => {
    const layout = layoutAnalyzerView(fixture());
    const regions = new Map((layout.regions ?? []).map((positioned) => [positioned.region.id, positioned]));
    const nodes = new Map(layout.nodes.map((positioned) => [positioned.node.id, positioned]));
    const packageA = regions.get('package:a')!;
    const directoryA = regions.get('directory:a')!;
    const nested = regions.get('directory:a:nested')!;

    expect(within(regionRect(directoryA), regionRect(packageA))).toBe(true);
    expect(within(regionRect(nested), regionRect(directoryA))).toBe(true);
    expect(within(nodeRect(nodes.get('module:a')!), regionRect(directoryA))).toBe(true);
    expect(within(nodeRect(nodes.get('module:nested')!), regionRect(nested))).toBe(true);
  });

  it('leaves only necessary bottom padding instead of a large empty tail', () => {
    const layout = layoutAnalyzerView(fixture());
    const regions = new Map((layout.regions ?? []).map((positioned) => [positioned.region.id, positioned]));
    const nodes = new Map(layout.nodes.map((positioned) => [positioned.node.id, positioned]));
    const packageA = regions.get('package:a')!;
    const directoryA = regions.get('directory:a')!;
    const nested = regions.get('directory:a:nested')!;
    const contentBottom = Math.max(
      nodeRect(nodes.get('module:a')!).y + ANALYZER_MODULE_NODE_HEIGHT,
      regionRect(nested).y + nested.height,
    );

    expect(packageA.y + packageA.height - (directoryA.y + directoryA.height)).toBeLessThanOrEqual(16);
    expect(directoryA.y + directoryA.height - contentBottom).toBeLessThanOrEqual(16);
    expect(regions.get('package:b')!.x - (packageA.x + packageA.width)).toBeCloseTo(ANALYZER_MODULE_PACKAGE_GAP);
  });

  it('packs a few children without a giant empty region', () => {
    const packageA = region('package:small', 'workspace-package', ['module:index', 'module:schema']);
    const view: AnalyzerViewModel = {
      view: 'module-dependency',
      nodes: [
        moduleNode('module:index', [packageA.id]),
        moduleNode('module:schema', [packageA.id]),
      ],
      edges: [],
      clusters: [],
      regions: [packageA],
      evidence: [],
      warnings: [],
    };
    const layout = layoutAnalyzerView(view);
    const packed = (layout.regions ?? []).find((item) => item.region.id === packageA.id)!;
    expect(packed.width).toBeLessThanOrEqual(ANALYZER_MODULE_NODE_WIDTH * 2 + 80);
    expect(packed.height).toBeLessThanOrEqual(ANALYZER_MODULE_NODE_HEIGHT + 90);
  });

  it('keeps a large package close to the union of its child footprints', () => {
    const packageWide = region('package:wide', 'workspace-package', [], {
      childRegionIds: ['directory:w1', 'directory:w2', 'directory:w3', 'directory:w4'],
    });
    const directories = [1, 2, 3, 4].map((index) => region(`directory:w${index}`, 'directory', [`module:w${index}`], {
      parentRegionId: packageWide.id,
    }));
    const view: AnalyzerViewModel = {
      view: 'module-dependency',
      nodes: directories.map((item, index) => moduleNode(`module:w${index + 1}`, [packageWide.id, item.id])),
      edges: [],
      clusters: [],
      regions: [packageWide, ...directories],
      evidence: [],
      warnings: [],
    };
    const layout = layoutAnalyzerView(view);
    const regions = new Map((layout.regions ?? []).map((positioned) => [positioned.region.id, positioned]));
    const packed = regions.get(packageWide.id)!;
    const children = directories.map((item) => regionRect(regions.get(item.id)!));
    const unionLeft = Math.min(...children.map((item) => item.x));
    const unionTop = Math.min(...children.map((item) => item.y));
    const unionRight = Math.max(...children.map((item) => item.x + item.width));
    const unionBottom = Math.max(...children.map((item) => item.y + item.height));
    expect(packed.x + packed.width - unionRight).toBeLessThanOrEqual(20);
    expect(unionLeft - packed.x).toBeLessThanOrEqual(20);
    expect(packed.y + packed.height - unionBottom).toBeLessThanOrEqual(20);
    expect(unionTop - packed.y).toBeLessThanOrEqual(48);
    expect((packed.width * packed.height) / Math.max(1, (unionRight - unionLeft) * (unionBottom - unionTop))).toBeLessThan(1.6);
  });
});
