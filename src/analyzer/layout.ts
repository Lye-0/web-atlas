import type { AnalyzerViewModel, AnalyzerViewNode } from './types';

export const ANALYZER_NODE_WIDTH = 244;
export const ANALYZER_NODE_HEIGHT = 106;
export const ANALYZER_NEAR_NODE_HEIGHT = 236;
const CLUSTER_WIDTH = 284;
const CLUSTER_GAP = 36;
const NODE_GAP = 24;
const TOP_PADDING = 62;
const SIDE_PADDING = 28;

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

function orderedClusters(view: AnalyzerViewModel): typeof view.clusters {
  const order = clusterOrder(view.view);
  return [...view.clusters].sort((a, b) => {
    const aIndex = order.indexOf(a.id);
    const bIndex = order.indexOf(b.id);
    return (aIndex < 0 ? order.length : aIndex) - (bIndex < 0 ? order.length : bIndex);
  });
}

export function layoutAnalyzerView(view: AnalyzerViewModel, expandedNodeIds: ReadonlySet<string> = new Set()): AnalyzerLayout {
  const positionedNodes: PositionedNode[] = [];
  const positionedClusters: PositionedCluster[] = [];
  const assigned = new Set<string>();
  let maxHeight = 420;

  orderedClusters(view).forEach((cluster, clusterIndex) => {
    const clusterNodes = view.nodes.filter((node) => cluster.nodeIds.includes(node.id));
    if (clusterNodes.length === 0) return;
    const x = SIDE_PADDING + clusterIndex * (CLUSTER_WIDTH + CLUSTER_GAP);
    const y = 20;
    let nodeY = y + TOP_PADDING;
    clusterNodes.forEach((node) => {
      const height = expandedNodeIds.has(node.id) ? ANALYZER_NEAR_NODE_HEIGHT : ANALYZER_NODE_HEIGHT;
      assigned.add(node.id);
      positionedNodes.push({ node, x: x + 20, y: nodeY, height });
      nodeY += height + NODE_GAP;
    });
    const height = TOP_PADDING + 20 + clusterNodes.reduce((total, node) => total + (expandedNodeIds.has(node.id) ? ANALYZER_NEAR_NODE_HEIGHT : ANALYZER_NODE_HEIGHT), 0) + Math.max(0, clusterNodes.length - 1) * NODE_GAP;
    positionedClusters.push({ id: cluster.id, label: cluster.label, tone: cluster.tone, x, y, width: CLUSTER_WIDTH, height });
    maxHeight = Math.max(maxHeight, height + 40);
  });

  const unassigned = view.nodes.filter((node) => !assigned.has(node.id));
  if (unassigned.length > 0) {
    const x = SIDE_PADDING + positionedClusters.length * (CLUSTER_WIDTH + CLUSTER_GAP);
    const y = 20;
    let nodeY = y + TOP_PADDING;
    unassigned.forEach((node) => {
      const height = expandedNodeIds.has(node.id) ? ANALYZER_NEAR_NODE_HEIGHT : ANALYZER_NODE_HEIGHT;
      positionedNodes.push({ node, x: x + 20, y: nodeY, height });
      nodeY += height + NODE_GAP;
    });
    const height = TOP_PADDING + 20 + unassigned.reduce((total, node) => total + (expandedNodeIds.has(node.id) ? ANALYZER_NEAR_NODE_HEIGHT : ANALYZER_NODE_HEIGHT), 0) + Math.max(0, unassigned.length - 1) * NODE_GAP;
    positionedClusters.push({ id: 'analyzer:other', label: 'Other', tone: 'neutral', x, y, width: CLUSTER_WIDTH, height });
    maxHeight = Math.max(maxHeight, height + 40);
  }

  const width = Math.max(900, SIDE_PADDING * 2 + Math.max(1, positionedClusters.length) * CLUSTER_WIDTH + Math.max(0, positionedClusters.length - 1) * CLUSTER_GAP);
  return { width, height: maxHeight, nodes: positionedNodes, clusters: positionedClusters };
}
