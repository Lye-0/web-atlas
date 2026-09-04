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
});
