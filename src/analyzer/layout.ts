import type { AnalyzerCluster, AnalyzerViewModel, AnalyzerViewNode } from './types';

export const ANALYZER_NODE_WIDTH = 244;
export const ANALYZER_NODE_HEIGHT = 106;
export const ANALYZER_NEAR_NODE_HEIGHT = 236;

const CLUSTER_WIDTH = 284;
const CLUSTER_GAP = 36;
const NODE_GAP = 24;
const TOP_PADDING = 62;
const SIDE_PADDING = 28;
const COMMAND_COLUMN_GAP = 78;
const COMMAND_ROW_GAP = 38;
const COMMAND_TOP = 76;
const DEPENDENCY_MAX_ROWS = 4;
const DEPENDENCY_EXTERNAL_GROUP_GAP = 14;
const DEPENDENCY_EXTERNAL_GROUP_HEADER = 28;
const DEPENDENCY_EXTERNAL_GROUP_BOTTOM = 14;
const ARCHITECTURE_NODE_HEIGHT = 86;
const ARCHITECTURE_NODE_GAP = 10;
const ARCHITECTURE_TOP_PADDING = 36;
const ARCHITECTURE_BOTTOM_PADDING = 14;
const ARCHITECTURE_CLUSTER_ROW_GAP = 16;

export interface PositionedNode {
  node: AnalyzerViewNode;
  x: number;
  y: number;
  height: number;
}

export interface PositionedCluster {
  id: string;
  label: string;
  tone: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedLane {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedBand {
  id: string;
  label: string;
  kind: 'dependency-source';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnalyzerLayout {
  width: number;
  height: number;
  nodes: PositionedNode[];
  clusters: PositionedCluster[];
  lanes: PositionedLane[];
  bands: PositionedBand[];
}

function clusterOrder(view: AnalyzerViewModel['view']): string[] {
  if (view === 'architecture') return ['architecture:project', 'architecture:apps', 'architecture:workspace', 'architecture:technology', 'architecture:runtime', 'architecture:resources', 'architecture:desktop'];
  if (view === 'workspace') return ['workspace:project', 'workspace:config', 'workspace:patterns', 'workspace:packages'];
  if (view === 'command') return ['command:user', 'command:scripts', 'command:commands', 'command:packages'];
  return ['dependencies:packages', 'dependencies:technology', 'dependencies:external'];
}

function orderedClusters(view: AnalyzerViewModel): AnalyzerCluster[] {
  const order = clusterOrder(view.view);
  return [...view.clusters].sort((a, b) => {
    const aIndex = order.indexOf(a.id);
    const bIndex = order.indexOf(b.id);
    return (aIndex < 0 ? order.length : aIndex) - (bIndex < 0 ? order.length : bIndex);
  });
}

function clusterEntries(view: AnalyzerViewModel): AnalyzerCluster[] {
  const clusters = orderedClusters(view);
  const assigned = new Set(clusters.flatMap((cluster) => cluster.nodeIds));
  const unassigned = view.nodes.filter((node) => !assigned.has(node.id));
  if (unassigned.length === 0) return clusters;
  return [
    ...clusters,
    { id: 'analyzer:other', label: 'Other', tone: 'neutral', nodeIds: unassigned.map((node) => node.id) },
  ];
}

function nodesForCluster(view: AnalyzerViewModel, cluster: AnalyzerCluster): AnalyzerViewNode[] {
  const nodeIds = new Set(cluster.nodeIds);
  return view.nodes.filter((node) => nodeIds.has(node.id));
}

function nodeHeight(node: AnalyzerViewNode, expandedNodeIds: ReadonlySet<string>): number {
  return expandedNodeIds.has(node.id) ? ANALYZER_NEAR_NODE_HEIGHT : ANALYZER_NODE_HEIGHT;
}

function verticalClusterHeight(nodes: AnalyzerViewNode[], expandedNodeIds: ReadonlySet<string>): number {
  return TOP_PADDING + 20 + nodes.reduce((total, node) => total + nodeHeight(node, expandedNodeIds), 0) + Math.max(0, nodes.length - 1) * NODE_GAP;
}

function architectureNodeHeight(node: AnalyzerViewNode, expandedNodeIds: ReadonlySet<string>): number {
  return expandedNodeIds.has(node.id) ? ANALYZER_NEAR_NODE_HEIGHT : ARCHITECTURE_NODE_HEIGHT;
}

function architectureClusterHeight(nodes: AnalyzerViewNode[], expandedNodeIds: ReadonlySet<string>): number {
  return ARCHITECTURE_TOP_PADDING
    + nodes.reduce((total, node) => total + architectureNodeHeight(node, expandedNodeIds), 0)
    + Math.max(0, nodes.length - 1) * ARCHITECTURE_NODE_GAP
    + ARCHITECTURE_BOTTOM_PADDING;
}

function layoutColumnClusters(view: AnalyzerViewModel, expandedNodeIds: ReadonlySet<string>): AnalyzerLayout {
  const positionedNodes: PositionedNode[] = [];
  const positionedClusters: PositionedCluster[] = [];
  let maxHeight = 420;

  clusterEntries(view).forEach((cluster, clusterIndex) => {
    const nodes = nodesForCluster(view, cluster);
    if (nodes.length === 0) return;
    const x = SIDE_PADDING + clusterIndex * (CLUSTER_WIDTH + CLUSTER_GAP);
    const y = 20;
    let nodeY = y + TOP_PADDING;
    nodes.forEach((node) => {
      const height = nodeHeight(node, expandedNodeIds);
      positionedNodes.push({ node, x: x + 20, y: nodeY, height });
      nodeY += height + NODE_GAP;
    });
    const height = verticalClusterHeight(nodes, expandedNodeIds);
    positionedClusters.push({ id: cluster.id, label: cluster.label, tone: cluster.tone, x, y, width: CLUSTER_WIDTH, height });
    maxHeight = Math.max(maxHeight, height + 40);
  });

  const width = Math.max(900, SIDE_PADDING * 2 + Math.max(1, positionedClusters.length) * CLUSTER_WIDTH + Math.max(0, positionedClusters.length - 1) * CLUSTER_GAP);
  return { width, height: maxHeight, nodes: positionedNodes, clusters: positionedClusters, lanes: [], bands: [] };
}

function layoutArchitecture(view: AnalyzerViewModel, expandedNodeIds: ReadonlySet<string>): AnalyzerLayout {
  const clusters = clusterEntries(view);
  const columnCount = Math.min(4, Math.max(1, clusters.length));
  const heights = clusters.map((cluster) => architectureClusterHeight(nodesForCluster(view, cluster), expandedNodeIds));
  const rowHeights = Array.from({ length: Math.ceil(clusters.length / columnCount) }, (_, row) => Math.max(...heights.slice(row * columnCount, (row + 1) * columnCount), 260));
  const rowY: number[] = [];
  rowHeights.forEach((height, index) => rowY.push(20 + rowHeights.slice(0, index).reduce((total, rowHeight) => total + rowHeight + ARCHITECTURE_CLUSTER_ROW_GAP, 0)));

  const positionedNodes: PositionedNode[] = [];
  const positionedClusters: PositionedCluster[] = [];
  clusters.forEach((cluster, clusterIndex) => {
    const nodes = nodesForCluster(view, cluster);
    if (nodes.length === 0) return;
    const column = clusterIndex % columnCount;
    const row = Math.floor(clusterIndex / columnCount);
    const x = SIDE_PADDING + column * (CLUSTER_WIDTH + CLUSTER_GAP);
    const y = rowY[row] ?? 20;
    let nodeY = y + ARCHITECTURE_TOP_PADDING;
    nodes.forEach((node) => {
      const height = architectureNodeHeight(node, expandedNodeIds);
      positionedNodes.push({ node, x: x + 20, y: nodeY, height });
      nodeY += height + ARCHITECTURE_NODE_GAP;
    });
    positionedClusters.push({ id: cluster.id, label: cluster.label, tone: cluster.tone, x, y, width: CLUSTER_WIDTH, height: heights[clusterIndex] ?? 420 });
  });

  const width = Math.max(900, SIDE_PADDING * 2 + columnCount * CLUSTER_WIDTH + Math.max(0, columnCount - 1) * CLUSTER_GAP);
  const height = Math.max(420, (rowY.at(-1) ?? 20) + (rowHeights.at(-1) ?? 420) + 40);
  return { width, height, nodes: positionedNodes, clusters: positionedClusters, lanes: [], bands: [] };
}

function metadataNumber(node: AnalyzerViewNode, key: string): number | undefined {
  const value = node.metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function metadataString(node: AnalyzerViewNode, key: string): string {
  const value = node.metadata[key];
  return typeof value === 'string' ? value : '';
}

function commandNodeOrder(node: AnalyzerViewNode): number {
  if (node.type === 'command') return 0;
  if (node.type === 'package-script') return 1;
  if (node.type === 'technology' || node.type === 'runtime') return 2;
  return 3;
}

function commandFlowLayout(view: AnalyzerViewModel, expandedNodeIds: ReadonlySet<string>): AnalyzerLayout {
  const rankByNodeId = new Map(view.nodes.map((node) => [node.id, Math.max(0, Math.round(metadataNumber(node, 'executionRank') ?? 0))]));
  const maxRank = Math.max(0, ...rankByNodeId.values());
  const nodesByRank = Array.from({ length: maxRank + 1 }, () => [] as AnalyzerViewNode[]);
  view.nodes.forEach((node) => nodesByRank[rankByNodeId.get(node.id) ?? 0]?.push(node));

  const positionedNodes: PositionedNode[] = [];
  let maxBottom = COMMAND_TOP;
  nodesByRank.forEach((nodes, rank) => {
    nodes.sort((first, second) => {
      const branchOrder = metadataString(first, 'branchPath').localeCompare(metadataString(second, 'branchPath'));
      if (branchOrder !== 0) return branchOrder;
      const typeOrder = commandNodeOrder(first) - commandNodeOrder(second);
      return typeOrder !== 0 ? typeOrder : first.label.localeCompare(second.label);
    });
    const x = SIDE_PADDING + rank * (ANALYZER_NODE_WIDTH + COMMAND_COLUMN_GAP);
    let y = COMMAND_TOP;
    nodes.forEach((node) => {
      const height = nodeHeight(node, expandedNodeIds);
      positionedNodes.push({ node, x, y, height });
      y += height + COMMAND_ROW_GAP;
    });
    maxBottom = Math.max(maxBottom, y - COMMAND_ROW_GAP);
  });

  const width = Math.max(900, SIDE_PADDING * 2 + (maxRank + 1) * ANALYZER_NODE_WIDTH + maxRank * COMMAND_COLUMN_GAP);
  const height = Math.max(420, maxBottom + 38);
  const laneGroups = new Map<string, PositionedNode[]>();
  positionedNodes.forEach((positionedNode) => {
    const laneId = positionedNode.node.metadata.laneId;
    if (typeof laneId !== 'string') return;
    const laneNodes = laneGroups.get(laneId) ?? [];
    laneNodes.push(positionedNode);
    laneGroups.set(laneId, laneNodes);
  });
  const lanes = [...laneGroups.entries()].map(([id, laneNodes]) => {
    const label = laneNodes.find((positionedNode) => typeof positionedNode.node.metadata.laneLabel === 'string')?.node.metadata.laneLabel;
    const summaryStepCount = laneNodes.find((positionedNode) => typeof positionedNode.node.metadata.stepCount === 'number')?.node.metadata.stepCount;
    const stepCount = typeof summaryStepCount === 'number' ? summaryStepCount : laneNodes.length;
    const top = Math.min(...laneNodes.map((positionedNode) => positionedNode.y));
    const bottom = Math.max(...laneNodes.map((positionedNode) => positionedNode.y + positionedNode.height));
    return {
      id,
      label: `${typeof label === 'string' ? label : id} · ${stepCount} STEPS`,
      x: 20,
      y: Math.max(46, top - 18),
      width: Math.max(560, width - 40),
      height: Math.max(52, bottom - Math.max(46, top - 18) + 36),
    };
  });
  return {
    width,
    height,
    nodes: positionedNodes,
    clusters: [],
    lanes,
    bands: [],
  };
}

interface DependencyExternalGroup {
  id: string;
  label: string;
  nodes: AnalyzerViewNode[];
}

function dependencyExternalGroups(view: AnalyzerViewModel, nodes: AnalyzerViewNode[]): DependencyExternalGroup[] {
  const nodeById = new Map(view.nodes.map((node) => [node.id, node]));
  const sourcesByExternalId = new Map<string, Set<string>>();
  view.edges.forEach((edge) => {
    const target = nodeById.get(edge.targetId);
    const source = nodeById.get(edge.sourceId);
    if (!target || target.type !== 'external-package' || !source || source.type === 'external-package') return;
    const sourceIds = sourcesByExternalId.get(target.id) ?? new Set<string>();
    sourceIds.add(source.id);
    sourcesByExternalId.set(target.id, sourceIds);
  });

  const groups = new Map<string, DependencyExternalGroup>();
  nodes.filter((node) => node.type === 'external-package' && node.presentation?.role !== 'summary').forEach((node) => {
    const sourceIds = [...(sourcesByExternalId.get(node.id) ?? [])].sort();
    const shared = sourceIds.length > 1;
    const groupId = shared ? 'shared' : sourceIds[0] ?? 'unlinked';
    const sourceLabels = sourceIds.map((sourceId) => nodeById.get(sourceId)?.label ?? sourceId);
    const label = shared
      ? 'Shared External'
      : sourceLabels[0]
        ? `${sourceLabels[0]} Dependencies`
        : 'Other External';
    const group = groups.get(groupId) ?? { id: groupId, label, nodes: [] };
    group.nodes.push(node);
    groups.set(groupId, group);
  });

  return [...groups.values()]
    .map((group) => ({ ...group, nodes: [...group.nodes].sort((a, b) => a.label.localeCompare(b.label)) }))
    .sort((a, b) => {
      if (a.id === 'shared') return -1;
      if (b.id === 'shared') return 1;
      return a.label.localeCompare(b.label);
    });
}

function dependencyFlowLayout(view: AnalyzerViewModel, expandedNodeIds: ReadonlySet<string>): AnalyzerLayout {
  const dependencyClusters = orderedClusters(view).filter((cluster) => cluster.nodeIds.length > 0);
  const positionedNodes: PositionedNode[] = [];
  const positionedClusters: PositionedCluster[] = [];
  const positionedBands: PositionedBand[] = [];
  let x = SIDE_PADDING;
  let maxHeight = 420;

  dependencyClusters.forEach((cluster) => {
    const nodes = nodesForCluster(view, cluster);
    if (nodes.length === 0) return;
    if (cluster.id === 'dependencies:external' && nodes.some((node) => node.type === 'external-package')) {
      const width = 40 + ANALYZER_NODE_WIDTH;
      const y = 20;
      const anchorNodes = nodes.filter((node) => node.presentation?.role === 'summary');
      const externalGroups = dependencyExternalGroups(view, nodes);
      let cursor = y + TOP_PADDING;
      anchorNodes.forEach((node) => {
        const height = nodeHeight(node, expandedNodeIds);
        positionedNodes.push({ node, x: x + 20, y: cursor, height });
        cursor += height + NODE_GAP;
      });
      externalGroups.forEach((group) => {
        const groupY = cursor - 8;
        const groupHeight = DEPENDENCY_EXTERNAL_GROUP_HEADER
          + group.nodes.reduce((total, node) => total + nodeHeight(node, expandedNodeIds), 0)
          + Math.max(0, group.nodes.length - 1) * NODE_GAP
          + DEPENDENCY_EXTERNAL_GROUP_BOTTOM;
        positionedBands.push({
          id: `dependency-band:${group.id}`,
          label: group.label,
          kind: 'dependency-source',
          x: x + 10,
          y: groupY,
          width: width - 20,
          height: groupHeight,
        });
        let nodeY = groupY + DEPENDENCY_EXTERNAL_GROUP_HEADER;
        group.nodes.forEach((node) => {
          const height = nodeHeight(node, expandedNodeIds);
          positionedNodes.push({ node, x: x + 20, y: nodeY, height });
          nodeY += height + NODE_GAP;
        });
        cursor = groupY + groupHeight + DEPENDENCY_EXTERNAL_GROUP_GAP;
      });
      const height = Math.max(220, cursor - y + 8);
      positionedClusters.push({ id: cluster.id, label: cluster.label, tone: cluster.tone, x, y, width, height });
      x += width + CLUSTER_GAP;
      maxHeight = Math.max(maxHeight, height + 40);
      return;
    }
    const trackCount = Math.max(1, Math.ceil(nodes.length / DEPENDENCY_MAX_ROWS));
    const rows = Math.min(DEPENDENCY_MAX_ROWS, nodes.length);
    const rowHeight = Math.max(...nodes.map((node) => nodeHeight(node, expandedNodeIds)), ANALYZER_NODE_HEIGHT);
    const width = 40 + trackCount * ANALYZER_NODE_WIDTH + Math.max(0, trackCount - 1) * NODE_GAP;
    const height = TOP_PADDING + 20 + rows * rowHeight + Math.max(0, rows - 1) * NODE_GAP;
    const y = 20;
    nodes.forEach((node, nodeIndex) => {
      const track = Math.floor(nodeIndex / DEPENDENCY_MAX_ROWS);
      const row = nodeIndex % DEPENDENCY_MAX_ROWS;
      positionedNodes.push({ node, x: x + 20 + track * (ANALYZER_NODE_WIDTH + NODE_GAP), y: y + TOP_PADDING + row * (rowHeight + NODE_GAP), height: nodeHeight(node, expandedNodeIds) });
    });
    positionedClusters.push({ id: cluster.id, label: cluster.label, tone: cluster.tone, x, y, width, height });
    x += width + CLUSTER_GAP;
    maxHeight = Math.max(maxHeight, height + 40);
  });

  return { width: Math.max(900, x - CLUSTER_GAP + SIDE_PADDING), height: maxHeight, nodes: positionedNodes, clusters: positionedClusters, lanes: [], bands: positionedBands };
}

export function layoutAnalyzerView(view: AnalyzerViewModel, expandedNodeIds: ReadonlySet<string> = new Set()): AnalyzerLayout {
  if (view.view === 'architecture') return layoutArchitecture(view, expandedNodeIds);
  if (view.view === 'command') return commandFlowLayout(view, expandedNodeIds);
  if (view.view === 'dependencies') return dependencyFlowLayout(view, expandedNodeIds);
  return layoutColumnClusters(view, expandedNodeIds);
}
