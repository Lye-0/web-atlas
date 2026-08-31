import type { AnalyzerCluster, AnalyzerViewModel, AnalyzerViewNode } from './types';

export const ANALYZER_NODE_WIDTH = 244;
export const ANALYZER_NODE_HEIGHT = 106;
export const ANALYZER_NEAR_NODE_HEIGHT = 236;

const CLUSTER_WIDTH = 284;
const CLUSTER_GAP = 36;
const CLUSTER_ROW_GAP = 34;
const NODE_GAP = 24;
const TOP_PADDING = 62;
const SIDE_PADDING = 28;
const COMMAND_COLUMN_GAP = 78;
const COMMAND_ROW_GAP = 38;
const COMMAND_TOP = 76;
const DEPENDENCY_MAX_ROWS = 4;

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

export interface AnalyzerLayout {
  width: number;
  height: number;
  nodes: PositionedNode[];
  clusters: PositionedCluster[];
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
  return { width, height: maxHeight, nodes: positionedNodes, clusters: positionedClusters };
}

function layoutArchitecture(view: AnalyzerViewModel, expandedNodeIds: ReadonlySet<string>): AnalyzerLayout {
  const clusters = clusterEntries(view);
  const columnCount = Math.min(3, Math.max(1, clusters.length));
  const heights = clusters.map((cluster) => verticalClusterHeight(nodesForCluster(view, cluster), expandedNodeIds));
  const rowHeights = Array.from({ length: Math.ceil(clusters.length / columnCount) }, (_, row) => Math.max(...heights.slice(row * columnCount, (row + 1) * columnCount), 420));
  const rowY: number[] = [];
  rowHeights.forEach((height, index) => rowY.push(20 + rowHeights.slice(0, index).reduce((total, rowHeight) => total + rowHeight + CLUSTER_ROW_GAP, 0)));

  const positionedNodes: PositionedNode[] = [];
  const positionedClusters: PositionedCluster[] = [];
  clusters.forEach((cluster, clusterIndex) => {
    const nodes = nodesForCluster(view, cluster);
    if (nodes.length === 0) return;
    const column = clusterIndex % columnCount;
    const row = Math.floor(clusterIndex / columnCount);
    const x = SIDE_PADDING + column * (CLUSTER_WIDTH + CLUSTER_GAP);
    const y = rowY[row] ?? 20;
    let nodeY = y + TOP_PADDING;
    nodes.forEach((node) => {
      const height = nodeHeight(node, expandedNodeIds);
      positionedNodes.push({ node, x: x + 20, y: nodeY, height });
      nodeY += height + NODE_GAP;
    });
    positionedClusters.push({ id: cluster.id, label: cluster.label, tone: cluster.tone, x, y, width: CLUSTER_WIDTH, height: heights[clusterIndex] ?? 420 });
  });

  const width = Math.max(900, SIDE_PADDING * 2 + columnCount * CLUSTER_WIDTH + Math.max(0, columnCount - 1) * CLUSTER_GAP);
  const height = Math.max(420, (rowY.at(-1) ?? 20) + (rowHeights.at(-1) ?? 420) + 40);
  return { width, height, nodes: positionedNodes, clusters: positionedClusters };
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
  return {
    width,
    height,
    nodes: positionedNodes,
    clusters: [{ id: 'command:execution', label: 'Execution order', tone: 'neutral', x: 20, y: 20, width: Math.max(560, width - 40), height: height - 40 }],
  };
}

function dependencyFlowLayout(view: AnalyzerViewModel, expandedNodeIds: ReadonlySet<string>): AnalyzerLayout {
  const dependencyClusters = orderedClusters(view).filter((cluster) => cluster.nodeIds.length > 0);
  const positionedNodes: PositionedNode[] = [];
  const positionedClusters: PositionedCluster[] = [];
  let x = SIDE_PADDING;
  let maxHeight = 420;

  dependencyClusters.forEach((cluster) => {
    const nodes = nodesForCluster(view, cluster);
    if (nodes.length === 0) return;
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

  return { width: Math.max(900, x - CLUSTER_GAP + SIDE_PADDING), height: maxHeight, nodes: positionedNodes, clusters: positionedClusters };
}

export function layoutAnalyzerView(view: AnalyzerViewModel, expandedNodeIds: ReadonlySet<string> = new Set()): AnalyzerLayout {
  if (view.view === 'architecture') return layoutArchitecture(view, expandedNodeIds);
  if (view.view === 'command') return commandFlowLayout(view, expandedNodeIds);
  if (view.view === 'dependencies') return dependencyFlowLayout(view, expandedNodeIds);
  return layoutColumnClusters(view, expandedNodeIds);
}
