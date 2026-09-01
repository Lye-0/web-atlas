import { analyzerPresentationCount, analyzerPresentationCountLabel } from './presentation';
import type { AnalyzerCluster, AnalyzerPresentationGroup, AnalyzerViewModel, AnalyzerViewNode } from './types';
import { ANALYZER_COMMAND_COMMON_LANE_ID, ANALYZER_EXTERNAL_SUMMARY_ID } from './projectors';

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
const DEPENDENCY_EXTERNAL_GROUP_BOTTOM = 14;
const DEPENDENCY_EXTERNAL_GROUP_INSET = 16;
const ARCHITECTURE_NODE_HEIGHT = 86;
const ARCHITECTURE_NODE_GAP = 10;
const ARCHITECTURE_TOP_PADDING = 36;
const ARCHITECTURE_BOTTOM_PADDING = 14;
const ARCHITECTURE_CLUSTER_ROW_GAP = 16;
const SUMMARY_NESTED_NODE_HEIGHT = 42;
const SUMMARY_GROUP_SIDE_PADDING = 20;
const SUMMARY_GROUP_HEADING_TOP = 8;
const SUMMARY_GROUP_HEADER_HEIGHT = 22;
const SUMMARY_GROUP_MEMBER_GAP = 16;
const SUMMARY_GROUP_MEMBER_OFFSET = SUMMARY_GROUP_HEADING_TOP + SUMMARY_GROUP_HEADER_HEIGHT + SUMMARY_GROUP_MEMBER_GAP;
const SUMMARY_GROUP_NESTED_GAP = 16;
const SUMMARY_GROUP_HEADING_CLEARANCE = SUMMARY_GROUP_NESTED_GAP;
const SUMMARY_GROUP_HEADING_OVERHANG = SUMMARY_GROUP_HEADER_HEIGHT + SUMMARY_GROUP_HEADING_CLEARANCE;
const SUMMARY_GROUP_EXTERNAL_GAP = 16;
const SUMMARY_GROUP_BOTTOM_PADDING = 20;
export const ANALYZER_STRUCTURAL_HEADING_HEIGHT = 28;
const STRUCTURAL_HEADING_HEIGHT = ANALYZER_STRUCTURAL_HEADING_HEIGHT;
const DEPENDENCY_EXTERNAL_GROUP_HEADER = SUMMARY_GROUP_MEMBER_OFFSET;

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
  count: number;
  countLabel: string;
  depth: number;
  kind: 'dependency-source';
  x: number;
  y: number;
  width: number;
  height: number;
  presentationId?: string;
}

export interface PositionedSummaryGroup {
  id: string;
  label: string;
  count: number;
  countLabel: string;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
}

export interface AnalyzerLayout {
  width: number;
  height: number;
  nodes: PositionedNode[];
  clusters: PositionedCluster[];
  lanes: PositionedLane[];
  bands: PositionedBand[];
  summaryGroups: PositionedSummaryGroup[];
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

function isExpandedPresentationSummary(view: AnalyzerViewModel, node: AnalyzerViewNode): boolean {
  return node.presentation?.role === 'summary'
    && Boolean(view.presentationGroups?.some((group) => group.id === node.id && group.expanded));
}

function isNestedSummary(view: AnalyzerViewModel, node: AnalyzerViewNode): boolean {
  const parentId = node.presentation?.parentId;
  return node.presentation?.role === 'summary'
    && Boolean(parentId && view.presentationGroups?.some((group) => group.id === parentId && group.expanded));
}

function nodesForCluster(view: AnalyzerViewModel, cluster: AnalyzerCluster): AnalyzerViewNode[] {
  const nodeIds = new Set(cluster.nodeIds);
  return view.nodes.filter((node) => nodeIds.has(node.id) && !isExpandedPresentationSummary(view, node));
}

function nodeHeight(view: AnalyzerViewModel, node: AnalyzerViewNode, expandedNodeIds: ReadonlySet<string>): number {
  if (isNestedSummary(view, node)) return SUMMARY_NESTED_NODE_HEIGHT;
  return expandedNodeIds.has(node.id) ? ANALYZER_NEAR_NODE_HEIGHT : ANALYZER_NODE_HEIGHT;
}

function verticalClusterHeight(view: AnalyzerViewModel, nodes: AnalyzerViewNode[], expandedNodeIds: ReadonlySet<string>): number {
  return TOP_PADDING + 20 + nodes.reduce((total, node) => total + nodeHeight(view, node, expandedNodeIds), 0) + Math.max(0, nodes.length - 1) * NODE_GAP;
}

function architectureNodeHeight(view: AnalyzerViewModel, node: AnalyzerViewNode, expandedNodeIds: ReadonlySet<string>): number {
  if (isNestedSummary(view, node)) return SUMMARY_NESTED_NODE_HEIGHT;
  return expandedNodeIds.has(node.id) ? ANALYZER_NEAR_NODE_HEIGHT : ARCHITECTURE_NODE_HEIGHT;
}

function hasExpandedPresentationMember(view: AnalyzerViewModel, nodes: AnalyzerViewNode[]): boolean {
  const groups = view.presentationGroups ?? [];
  const expandedGroupIds = new Set(groups.filter((group) => group.expanded).map((group) => group.id));
  if (expandedGroupIds.size === 0) return false;
  const parentByGroupId = new Map(groups.map((group) => [group.id, group.parentId]));
  return nodes.some((node) => {
    const visited = new Set<string>();
    let parentId: string | undefined = node.presentation?.parentId;
    while (parentId && !visited.has(parentId)) {
      if (expandedGroupIds.has(parentId)) return true;
      visited.add(parentId);
      parentId = parentByGroupId.get(parentId);
    }
    return false;
  });
}

function architectureClusterHeight(view: AnalyzerViewModel, nodes: AnalyzerViewNode[], expandedNodeIds: ReadonlySet<string>): number {
  const bottomPadding = hasExpandedPresentationMember(view, nodes)
    ? Math.max(ARCHITECTURE_BOTTOM_PADDING, SUMMARY_GROUP_BOTTOM_PADDING)
    : ARCHITECTURE_BOTTOM_PADDING;
  return ARCHITECTURE_TOP_PADDING
    + nodes.reduce((total, node) => total + architectureNodeHeight(view, node, expandedNodeIds), 0)
    + Math.max(0, nodes.length - 1) * ARCHITECTURE_NODE_GAP
    + bottomPadding;
}

function orderedArchitectureNodes(view: AnalyzerViewModel, nodes: AnalyzerViewNode[]): AnalyzerViewNode[] {
  const presentationGroupIds = new Set((view.presentationGroups ?? []).map((group) => group.id));
  const groupedNodes = new Map<string, AnalyzerViewNode[]>();
  const firstIndexByGroupId = new Map<string, number>();

  nodes.forEach((node, index) => {
    const parentId = node.presentation?.role === 'detail' ? node.presentation.parentId : undefined;
    if (!parentId || !presentationGroupIds.has(parentId)) return;
    const groupNodes = groupedNodes.get(parentId) ?? [];
    groupNodes.push(node);
    groupedNodes.set(parentId, groupNodes);
    if (!firstIndexByGroupId.has(parentId)) firstIndexByGroupId.set(parentId, index);
  });

  if (groupedNodes.size === 0) return nodes;
  const topLevelNodes = nodes.filter((node) => {
    const parentId = node.presentation?.role === 'detail' ? node.presentation.parentId : undefined;
    return !parentId || !presentationGroupIds.has(parentId);
  });
  const orderedGroups = [...groupedNodes.keys()].sort((firstId, secondId) => {
    return (firstIndexByGroupId.get(firstId) ?? 0) - (firstIndexByGroupId.get(secondId) ?? 0);
  });
  return [...topLevelNodes, ...orderedGroups.flatMap((groupId) => groupedNodes.get(groupId) ?? [])];
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
      const height = nodeHeight(view, node, expandedNodeIds);
      positionedNodes.push({ node, x: x + 20, y: nodeY, height });
      nodeY += height + NODE_GAP;
    });
    const height = verticalClusterHeight(view, nodes, expandedNodeIds);
    positionedClusters.push({ id: cluster.id, label: cluster.label, tone: cluster.tone, x, y, width: CLUSTER_WIDTH, height });
    maxHeight = Math.max(maxHeight, height + 40);
  });

  const width = Math.max(900, SIDE_PADDING * 2 + Math.max(1, positionedClusters.length) * CLUSTER_WIDTH + Math.max(0, positionedClusters.length - 1) * CLUSTER_GAP);
  return { width, height: maxHeight, nodes: positionedNodes, clusters: positionedClusters, lanes: [], bands: [], summaryGroups: [] };
}

function layoutArchitecture(view: AnalyzerViewModel, expandedNodeIds: ReadonlySet<string>): AnalyzerLayout {
  const clusters = clusterEntries(view);
  const columnCount = Math.min(4, Math.max(1, clusters.length));
  const clusterNodes = clusters.map((cluster) => orderedArchitectureNodes(view, nodesForCluster(view, cluster)));
  const heights = clusterNodes.map((nodes) => architectureClusterHeight(view, nodes, expandedNodeIds));
  const rowHeights = Array.from({ length: Math.ceil(clusters.length / columnCount) }, (_, row) => Math.max(...heights.slice(row * columnCount, (row + 1) * columnCount), 260));
  const rowY: number[] = [];
  rowHeights.forEach((height, index) => rowY.push(20 + rowHeights.slice(0, index).reduce((total, rowHeight) => total + rowHeight + ARCHITECTURE_CLUSTER_ROW_GAP, 0)));

  const positionedNodes: PositionedNode[] = [];
  const positionedClusters: PositionedCluster[] = [];
  clusters.forEach((cluster, clusterIndex) => {
    const nodes = clusterNodes[clusterIndex] ?? [];
    if (nodes.length === 0) return;
    const column = clusterIndex % columnCount;
    const row = Math.floor(clusterIndex / columnCount);
    const x = SIDE_PADDING + column * (CLUSTER_WIDTH + CLUSTER_GAP);
    const y = rowY[row] ?? 20;
    let nodeY = y + ARCHITECTURE_TOP_PADDING;
    nodes.forEach((node) => {
      const height = architectureNodeHeight(view, node, expandedNodeIds);
      positionedNodes.push({ node, x: x + 20, y: nodeY, height });
      nodeY += height + ARCHITECTURE_NODE_GAP;
    });
    positionedClusters.push({ id: cluster.id, label: cluster.label, tone: cluster.tone, x, y, width: CLUSTER_WIDTH, height: heights[clusterIndex] ?? 420 });
  });

  const width = Math.max(900, SIDE_PADDING * 2 + columnCount * CLUSTER_WIDTH + Math.max(0, columnCount - 1) * CLUSTER_GAP);
  const height = Math.max(420, (rowY.at(-1) ?? 20) + (rowHeights.at(-1) ?? 420) + 40);
  return { width, height, nodes: positionedNodes, clusters: positionedClusters, lanes: [], bands: [], summaryGroups: [] };
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
  const nodes = view.nodes.filter((node) => !isExpandedPresentationSummary(view, node));
  const rankByNodeId = new Map(nodes.map((node) => [node.id, Math.max(0, Math.round(metadataNumber(node, 'executionRank') ?? 0))]));
  const maxRank = Math.max(0, ...rankByNodeId.values());
  const positionedNodes: PositionedNode[] = [];
  const laneGroups = new Map<string, AnalyzerViewNode[]>();
  nodes.forEach((node) => {
    const laneId = metadataString(node, 'laneId') || ANALYZER_COMMAND_COMMON_LANE_ID;
    const laneNodes = laneGroups.get(laneId) ?? [];
    laneNodes.push(node);
    laneGroups.set(laneId, laneNodes);
  });

  const orderedLaneGroups = [...laneGroups.entries()].sort(([firstId, firstNodes], [secondId, secondNodes]) => {
    if (firstId === ANALYZER_COMMAND_COMMON_LANE_ID) return -1;
    if (secondId === ANALYZER_COMMAND_COMMON_LANE_ID) return 1;
    const firstRank = Math.min(...firstNodes.map((node) => rankByNodeId.get(node.id) ?? 0));
    const secondRank = Math.min(...secondNodes.map((node) => rankByNodeId.get(node.id) ?? 0));
    if (firstRank !== secondRank) return firstRank - secondRank;
    const firstLabel = firstNodes.find((node) => metadataString(node, 'laneLabel'))?.metadata.laneLabel;
    const secondLabel = secondNodes.find((node) => metadataString(node, 'laneLabel'))?.metadata.laneLabel;
    return String(firstLabel ?? firstId).localeCompare(String(secondLabel ?? secondId));
  });

  const width = Math.max(900, SIDE_PADDING * 2 + (maxRank + 1) * ANALYZER_NODE_WIDTH + maxRank * COMMAND_COLUMN_GAP);
  let laneCursor = COMMAND_TOP;
  let maxBottom = COMMAND_TOP;
  const lanes = orderedLaneGroups.map(([id, laneNodes]) => {
    const sortedNodes = [...laneNodes].sort((first, second) => {
      const rankOrder = (rankByNodeId.get(first.id) ?? 0) - (rankByNodeId.get(second.id) ?? 0);
      if (rankOrder !== 0) return rankOrder;
      const branchOrder = metadataString(first, 'branchPath').localeCompare(metadataString(second, 'branchPath'));
      if (branchOrder !== 0) return branchOrder;
      const typeOrder = commandNodeOrder(first) - commandNodeOrder(second);
      return typeOrder !== 0 ? typeOrder : first.label.localeCompare(second.label);
    });
    const nodesByRank = new Map<number, AnalyzerViewNode[]>();
    sortedNodes.forEach((node) => {
      const rank = rankByNodeId.get(node.id) ?? 0;
      const rankNodes = nodesByRank.get(rank) ?? [];
      rankNodes.push(node);
      nodesByRank.set(rank, rankNodes);
    });
    const rankStackHeight = Math.max(0, ...[...nodesByRank.values()].map((rankNodes) => {
      const contentHeight = rankNodes.reduce((total, node) => total + nodeHeight(view, node, expandedNodeIds), 0);
      return contentHeight + Math.max(0, rankNodes.length - 1) * COMMAND_ROW_GAP;
    }));
    nodesByRank.forEach((rankNodes, rank) => {
      let y = laneCursor;
      rankNodes.forEach((node) => {
        const height = nodeHeight(view, node, expandedNodeIds);
        positionedNodes.push({ node, x: SIDE_PADDING + rank * (ANALYZER_NODE_WIDTH + COMMAND_COLUMN_GAP), y, height });
        y += height + COMMAND_ROW_GAP;
      });
    });
    const top = sortedNodes.length > 0 ? laneCursor : COMMAND_TOP;
    const bottom = top + rankStackHeight;
    const laneTop = Math.max(46, top - 18);
    const laneHeight = Math.max(52, bottom - laneTop + 36);
    maxBottom = Math.max(maxBottom, laneTop + laneHeight);
    laneCursor = laneTop + laneHeight + 34;
    const label = laneNodes.find((node) => typeof node.metadata.laneLabel === 'string')?.metadata.laneLabel;
    const summaryStepCount = laneNodes.find((node) => typeof node.metadata.stepCount === 'number')?.metadata.stepCount;
    const stepCount = typeof summaryStepCount === 'number' ? summaryStepCount : laneNodes.length;
    return {
      id,
      label: `${typeof label === 'string' ? label : id} · ${stepCount} STEPS`,
      x: 20,
      y: laneTop,
      width: Math.max(560, width - 40),
      height: laneHeight,
    };
  });

  const height = Math.max(420, maxBottom + 12);
  const laneWidth = Math.max(560, width - 40);
  const normalizedLanes = lanes.map((lane) => ({ ...lane, width: laneWidth }));
  return {
    width,
    height,
    nodes: positionedNodes,
    clusters: [],
    lanes: normalizedLanes,
    bands: [],
    summaryGroups: [],
  };
}

interface DependencyExternalGroup {
  id: string;
  label: string;
  summary?: AnalyzerViewNode;
  nodes: AnalyzerViewNode[];
  presentationId?: string;
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
  view.nodes
    .filter((node) => node.type === 'external-package' && node.presentation?.role === 'summary' && typeof node.metadata.externalGroupId === 'string')
    .forEach((summary) => {
      const groupId = String(summary.metadata.externalGroupId);
      groups.set(groupId, {
        id: groupId,
        label: typeof summary.metadata.externalGroupLabel === 'string' ? summary.metadata.externalGroupLabel : summary.label,
        summary,
        nodes: [],
        presentationId: summary.id,
      });
    });
  nodes.filter((node) => node.type === 'external-package' && node.presentation?.role !== 'summary').forEach((node) => {
    const metadataGroupId = node.metadata.externalGroupId;
    if (typeof metadataGroupId === 'string') {
      const existing = groups.get(metadataGroupId);
      const group = existing ?? {
        id: metadataGroupId,
        label: typeof node.metadata.externalGroupLabel === 'string' ? node.metadata.externalGroupLabel : metadataGroupId,
        nodes: [],
        presentationId: typeof node.metadata.externalGroupPresentationId === 'string' ? node.metadata.externalGroupPresentationId : undefined,
      };
      group.nodes.push(node);
      groups.set(metadataGroupId, group);
      return;
    }
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
      const flatExternalExpanded = view.presentationGroups?.some((group) => group.id === ANALYZER_EXTERNAL_SUMMARY_ID && group.expanded)
        && nodes.some((node) => node.type === 'external-package' && node.presentation?.parentId === ANALYZER_EXTERNAL_SUMMARY_ID)
        && !nodes.some((node) => node.type === 'external-package' && node.presentation?.role === 'summary' && typeof node.metadata.externalGroupId === 'string');
      if (flatExternalExpanded) {
        const externalDetails = nodes
          .filter((node) => node.type === 'external-package' && node.presentation?.role !== 'summary')
          .sort((first, second) => first.label.localeCompare(second.label));
        let cursor = y + TOP_PADDING;
        externalDetails.forEach((node) => {
          const height = nodeHeight(view, node, expandedNodeIds);
          positionedNodes.push({ node, x: x + 20, y: cursor, height });
          cursor += height + NODE_GAP;
        });
        const height = Math.max(220, cursor - y + 8);
        positionedClusters.push({ id: cluster.id, label: cluster.label, tone: cluster.tone, x, y, width, height });
        x += width + CLUSTER_GAP;
        maxHeight = Math.max(maxHeight, height + 40);
        return;
      }
      const anchorNodes = nodes.filter((node) => node.presentation?.role === 'summary' && typeof node.metadata.externalGroupId !== 'string');
      const externalGroups = dependencyExternalGroups(view, nodes);
      let cursor = y + TOP_PADDING;
      anchorNodes.forEach((node) => {
        const height = nodeHeight(view, node, expandedNodeIds);
        positionedNodes.push({ node, x: x + 20, y: cursor, height });
        cursor += height + NODE_GAP;
      });
      externalGroups.forEach((group) => {
        const groupSummary = group.summary && nodes.some((node) => node.id === group.summary?.id) ? group.summary : undefined;
        const presentationGroup = group.presentationId
          ? view.presentationGroups?.find((candidate) => candidate.id === group.presentationId)
          : undefined;
        const groupExpanded = Boolean(presentationGroup?.expanded);

        if (groupSummary && !groupExpanded) {
          const height = nodeHeight(view, groupSummary, expandedNodeIds);
          positionedNodes.push({ node: groupSummary, x: x + 20, y: cursor, height });
          cursor += height + NODE_GAP;
          return;
        }

        const groupNodes = [
          ...(groupSummary ? [groupSummary] : []),
          ...group.nodes,
        ];
        if (groupNodes.length === 0) return;
        const groupY = cursor - 8;
        const groupHeight = DEPENDENCY_EXTERNAL_GROUP_HEADER
          + groupNodes.reduce((total, node) => total + nodeHeight(view, node, expandedNodeIds), 0)
          + Math.max(0, groupNodes.length - 1) * NODE_GAP
          + DEPENDENCY_EXTERNAL_GROUP_BOTTOM;
        const count = presentationGroup?.count ?? (groupSummary ? analyzerPresentationCount(groupSummary) : group.nodes.length);
        const countLabel = presentationGroup?.countLabel ?? (groupSummary ? analyzerPresentationCountLabel(groupSummary) : 'PACKAGES');
        positionedBands.push({
          id: `dependency-band:${group.id}`,
          label: group.label,
          count,
          countLabel,
          depth: presentationDepth(view, group.presentationId),
          kind: 'dependency-source',
          x: x + DEPENDENCY_EXTERNAL_GROUP_INSET,
          y: groupY,
          width: width - DEPENDENCY_EXTERNAL_GROUP_INSET * 2,
          height: groupHeight,
          ...(group.presentationId ? { presentationId: group.presentationId } : {}),
        });
        let nodeY = groupY + DEPENDENCY_EXTERNAL_GROUP_HEADER;
        groupNodes.forEach((node) => {
          const height = nodeHeight(view, node, expandedNodeIds);
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
    const rowHeight = Math.max(...nodes.map((node) => nodeHeight(view, node, expandedNodeIds)), ANALYZER_NODE_HEIGHT);
    const width = 40 + trackCount * ANALYZER_NODE_WIDTH + Math.max(0, trackCount - 1) * NODE_GAP;
    const height = TOP_PADDING + 20 + rows * rowHeight + Math.max(0, rows - 1) * NODE_GAP;
    const y = 20;
    nodes.forEach((node, nodeIndex) => {
      const track = Math.floor(nodeIndex / DEPENDENCY_MAX_ROWS);
      const row = nodeIndex % DEPENDENCY_MAX_ROWS;
      positionedNodes.push({ node, x: x + 20 + track * (ANALYZER_NODE_WIDTH + NODE_GAP), y: y + TOP_PADDING + row * (rowHeight + NODE_GAP), height: nodeHeight(view, node, expandedNodeIds) });
    });
    positionedClusters.push({ id: cluster.id, label: cluster.label, tone: cluster.tone, x, y, width, height });
    x += width + CLUSTER_GAP;
    maxHeight = Math.max(maxHeight, height + 40);
  });

  return { width: Math.max(900, x - CLUSTER_GAP + SIDE_PADDING), height: maxHeight, nodes: positionedNodes, clusters: positionedClusters, lanes: [], bands: positionedBands, summaryGroups: [] };
}

function presentationParentMap(view: AnalyzerViewModel): Map<string, string> {
  const parentByNodeId = new Map<string, string>();
  view.nodes.forEach((node) => {
    if (node.presentation?.parentId) parentByNodeId.set(node.id, node.presentation.parentId);
  });
  view.presentationGroups?.forEach((group) => {
    group.childNodeIds.forEach((childNodeId) => {
      if (!parentByNodeId.has(childNodeId)) parentByNodeId.set(childNodeId, group.id);
    });
  });
  return parentByNodeId;
}

function summaryGroupNodes(view: AnalyzerViewModel, positionedNodes: PositionedNode[], group: AnalyzerPresentationGroup): PositionedNode[] {
  const parentByNodeId = presentationParentMap(view);
  const parentByGroupId = new Map(
    (view.presentationGroups ?? []).flatMap((candidate) => candidate.parentId ? [[candidate.id, candidate.parentId] as const] : []),
  );
  const parentOf = (nodeId: string): string | undefined => parentByNodeId.get(nodeId) ?? parentByGroupId.get(nodeId);
  return positionedNodes.filter((positionedNode) => {
    if (positionedNode.node.id === group.id) return true;
    const visited = new Set<string>();
    let parentId = parentOf(positionedNode.node.id);
    while (parentId && !visited.has(parentId)) {
      if (parentId === group.id) return true;
      visited.add(parentId);
      parentId = parentOf(parentId);
    }
    return false;
  });
}

function presentationDepth(view: AnalyzerViewModel, presentationId?: string): number {
  if (!presentationId) return 1;
  const groupsById = new Map((view.presentationGroups ?? []).map((group) => [group.id, group]));
  const visited = new Set<string>();
  let currentId: string | undefined = presentationId;
  let depth = 1;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const parentId: string | undefined = groupsById.get(currentId)?.parentId;
    if (!parentId) break;
    depth += 1;
    currentId = parentId;
  }
  return depth;
}

interface SummaryRegionBounds {
  id: string;
  parentId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // `visualTop` is the painted heading top, not just the outline top.
  headingHeight: number;
  headingClearance: number;
  headingOverhang: number;
  visualTop: number;
}

interface SummaryRegionSnapshot {
  summaryGroups: PositionedSummaryGroup[];
  regions: SummaryRegionBounds[];
  regionTopById: Map<string, number>;
  visualTopById: Map<string, number>;
}

function summaryRegionSnapshot(view: AnalyzerViewModel, layout: AnalyzerLayout): SummaryRegionSnapshot {
  const presentationGroupsById = new Map((view.presentationGroups ?? []).map((group) => [group.id, group]));
  const bandPresentationIds = new Set(layout.bands.flatMap((band) => band.presentationId ? [band.presentationId] : []));
  const rawSummaryGroups = (view.presentationGroups ?? [])
    .filter((group) => group.expanded && !bandPresentationIds.has(group.id))
    .flatMap((group): PositionedSummaryGroup[] => {
      const groupNodes = summaryGroupNodes(view, layout.nodes, group);
      if (groupNodes.length === 0) return [];
      const minX = Math.min(...groupNodes.map((positionedNode) => positionedNode.x));
      const minY = Math.min(...groupNodes.map((positionedNode) => positionedNode.y));
      const maxRight = Math.max(...groupNodes.map((positionedNode) => positionedNode.x + ANALYZER_NODE_WIDTH));
      const maxBottom = Math.max(...groupNodes.map((positionedNode) => positionedNode.y + positionedNode.height));
      const x = Math.max(0, minX - SUMMARY_GROUP_SIDE_PADDING);
      const y = Math.max(0, minY - SUMMARY_GROUP_HEADING_TOP - SUMMARY_GROUP_HEADING_OVERHANG);
      const right = maxRight + SUMMARY_GROUP_SIDE_PADDING;
      const bottom = maxBottom + SUMMARY_GROUP_BOTTOM_PADDING;
      return [{
        id: group.id,
        label: group.label,
        count: group.count,
        countLabel: group.countLabel,
        depth: presentationDepth(view, group.id),
        x,
        y,
        width: Math.max(ANALYZER_NODE_WIDTH + SUMMARY_GROUP_SIDE_PADDING * 2, right - x),
        height: Math.max(SUMMARY_GROUP_HEADING_TOP + SUMMARY_GROUP_HEADING_OVERHANG + SUMMARY_GROUP_BOTTOM_PADDING, bottom - y),
        ...(group.parentId ? { parentId: group.parentId } : {}),
      }];
    });
  const rawRegions: SummaryRegionBounds[] = [
    ...rawSummaryGroups.map(({ id, parentId, x, y, width, height }) => ({
      id,
      parentId,
      x,
      y,
      width,
      height,
      headingHeight: SUMMARY_GROUP_HEADER_HEIGHT,
      headingClearance: SUMMARY_GROUP_HEADING_CLEARANCE,
      headingOverhang: SUMMARY_GROUP_HEADING_OVERHANG,
      visualTop: y + SUMMARY_GROUP_HEADING_TOP,
    })),
    ...layout.bands.map((band) => ({
      id: band.presentationId ?? band.id,
      ...(band.presentationId && presentationGroupsById.get(band.presentationId)?.parentId
        ? { parentId: presentationGroupsById.get(band.presentationId)?.parentId }
        : {}),
      x: band.x,
      y: band.y,
      width: band.width,
      height: band.height,
      headingHeight: SUMMARY_GROUP_HEADER_HEIGHT,
      headingClearance: SUMMARY_GROUP_HEADING_CLEARANCE,
      headingOverhang: SUMMARY_GROUP_HEADING_OVERHANG,
      visualTop: band.y + SUMMARY_GROUP_HEADING_TOP,
    })),
  ];
  const regionsById = new Map(rawRegions.map((region) => [region.id, region]));
  const childrenByParent = new Map<string, SummaryRegionBounds[]>();
  rawRegions.forEach((region) => {
    if (!region.parentId) return;
    const children = childrenByParent.get(region.parentId) ?? [];
    children.push(region);
    childrenByParent.set(region.parentId, children);
  });
  const regionTop = (regionId: string, visited = new Set<string>()): number => {
    const region = regionsById.get(regionId);
    if (!region || visited.has(regionId)) return region?.y ?? 0;
    const nextVisited = new Set(visited);
    nextVisited.add(regionId);
    const childStarts = (childrenByParent.get(regionId) ?? [])
      .map((child) => regionTop(child.id, nextVisited) - child.headingHeight - child.headingClearance);
    return Math.min(region.y, ...childStarts);
  };
  const regionTopById = new Map(rawRegions.map((region) => [region.id, regionTop(region.id)]));
  const visualTopById = new Map(rawRegions.map((region) => [
    region.id,
    (regionTopById.get(region.id) ?? region.y) + (region.visualTop - region.y),
  ]));
  return { summaryGroups: rawSummaryGroups, regions: rawRegions, regionTopById, visualTopById };
}

function presentationIsWithin(groupsById: Map<string, AnalyzerPresentationGroup>, candidateId: string, ancestorId: string): boolean {
  const visited = new Set<string>();
  let currentId: string | undefined = candidateId;
  while (currentId && !visited.has(currentId)) {
    if (currentId === ancestorId) return true;
    visited.add(currentId);
    currentId = groupsById.get(currentId)?.parentId;
  }
  return false;
}

function summaryFlowContainerId(node: AnalyzerViewNode): string {
  const laneId = node.metadata.laneId;
  if (typeof laneId === 'string' && laneId.length > 0) return `lane:${laneId}`;
  return node.clusterId ? `cluster:${node.clusterId}` : 'flow:root';
}

function horizontalRangesOverlap(firstLeft: number, firstRight: number, secondLeft: number, secondRight: number): boolean {
  return firstLeft < secondRight && secondLeft < firstRight;
}

function structuralHeadingBottom(layout: AnalyzerLayout, containerId: string): number | undefined {
  if (containerId.startsWith('cluster:')) {
    const cluster = layout.clusters.find((candidate) => candidate.id === containerId.slice('cluster:'.length));
    return cluster ? cluster.y + STRUCTURAL_HEADING_HEIGHT : undefined;
  }
  if (containerId.startsWith('lane:')) {
    const lane = layout.lanes.find((candidate) => candidate.id === containerId.slice('lane:'.length));
    return lane ? lane.y + STRUCTURAL_HEADING_HEIGHT : undefined;
  }
  return undefined;
}

function previousSummaryBlockBottom(
  layout: AnalyzerLayout,
  snapshot: SummaryRegionSnapshot,
  groupsById: Map<string, AnalyzerPresentationGroup>,
  group: AnalyzerPresentationGroup,
  region: SummaryRegionBounds,
  memberIds: ReadonlySet<string>,
  containerId: string,
  firstMemberY: number,
  headingVisualTop: number,
): number | undefined {
  let previousBottom = structuralHeadingBottom(layout, containerId);
  const regionRight = region.x + region.width;
  layout.nodes.forEach((positionedNode) => {
    if (memberIds.has(positionedNode.node.id) || summaryFlowContainerId(positionedNode.node) !== containerId) return;
    if (positionedNode.y >= firstMemberY) return;
    if (!horizontalRangesOverlap(positionedNode.x, positionedNode.x + ANALYZER_NODE_WIDTH, region.x, regionRight)) return;
    previousBottom = Math.max(previousBottom ?? Number.NEGATIVE_INFINITY, positionedNode.y + positionedNode.height);
  });
  snapshot.regions.forEach((candidate) => {
    const candidateVisualTop = snapshot.visualTopById.get(candidate.id) ?? candidate.visualTop;
    if (candidate.id === group.id || candidateVisualTop >= headingVisualTop) return;
    const candidateIsPresentation = groupsById.has(candidate.id);
    if (candidateIsPresentation && (
      presentationIsWithin(groupsById, candidate.id, group.id)
      || presentationIsWithin(groupsById, group.id, candidate.id)
    )) return;
    if (!horizontalRangesOverlap(candidate.x, candidate.x + candidate.width, region.x, regionRight)) return;
    previousBottom = Math.max(previousBottom ?? Number.NEGATIVE_INFINITY, candidate.y + candidate.height);
  });
  return previousBottom;
}

function extendSummaryFlowContainer(layout: AnalyzerLayout, containerId: string, delta: number): void {
  if (containerId.startsWith('cluster:')) {
    const clusterId = containerId.slice('cluster:'.length);
    const cluster = layout.clusters.find((candidate) => candidate.id === clusterId);
    if (!cluster) return;
    const previousBottom = cluster.y + cluster.height;
    layout.clusters = layout.clusters.map((candidate) => candidate.id === clusterId
      ? { ...candidate, height: candidate.height + delta }
      : candidate);
    const laterClusterIds = new Set(
      layout.clusters
        .filter((candidate) => candidate.id !== clusterId && candidate.y >= previousBottom)
        .map((candidate) => candidate.id),
    );
    if (laterClusterIds.size === 0) return;
    layout.clusters = layout.clusters.map((candidate) => laterClusterIds.has(candidate.id) ? { ...candidate, y: candidate.y + delta } : candidate);
    layout.nodes = layout.nodes.map((positionedNode) => laterClusterIds.has(positionedNode.node.clusterId ?? '')
      ? { ...positionedNode, y: positionedNode.y + delta }
      : positionedNode);
    return;
  }
  if (containerId.startsWith('lane:')) {
    const laneId = containerId.slice('lane:'.length);
    const lane = layout.lanes.find((candidate) => candidate.id === laneId);
    if (!lane) return;
    const previousBottom = lane.y + lane.height;
    layout.lanes = layout.lanes.map((candidate) => candidate.id === laneId
      ? { ...candidate, height: candidate.height + delta }
      : candidate);
    const laterLaneIds = new Set(
      layout.lanes
        .filter((candidate) => candidate.id !== laneId && candidate.y >= previousBottom)
        .map((candidate) => candidate.id),
    );
    if (laterLaneIds.size === 0) return;
    layout.lanes = layout.lanes.map((candidate) => laterLaneIds.has(candidate.id) ? { ...candidate, y: candidate.y + delta } : candidate);
    layout.nodes = layout.nodes.map((positionedNode) => laterLaneIds.has(typeof positionedNode.node.metadata.laneId === 'string' ? positionedNode.node.metadata.laneId : '')
      ? { ...positionedNode, y: positionedNode.y + delta }
      : positionedNode);
  }
}

function resolveSummaryHeadingCollisions(view: AnalyzerViewModel, layout: AnalyzerLayout): AnalyzerLayout {
  const workingLayout: AnalyzerLayout = {
    ...layout,
    nodes: [...layout.nodes],
    clusters: [...layout.clusters],
    lanes: [...layout.lanes],
    bands: [...layout.bands],
    summaryGroups: [],
  };
  const groupsById = new Map((view.presentationGroups ?? []).map((group) => [group.id, group]));
  const expandedGroups = (view.presentationGroups ?? [])
    .filter((group) => group.expanded)
    .sort((first, second) => presentationDepth(view, first.id) - presentationDepth(view, second.id));

  expandedGroups.forEach((group) => {
    const snapshot = summaryRegionSnapshot(view, workingLayout);
    const region = snapshot.regions.find((candidate) => candidate.id === group.id);
    if (!region) return;
    const members = summaryGroupNodes(view, workingLayout.nodes, group);
    if (members.length === 0) return;
    const memberIds = new Set(members.map((positionedNode) => positionedNode.node.id));
    const membersByContainer = new Map<string, PositionedNode[]>();
    members.forEach((positionedNode) => {
      const containerId = summaryFlowContainerId(positionedNode.node);
      const containerMembers = membersByContainer.get(containerId) ?? [];
      containerMembers.push(positionedNode);
      membersByContainer.set(containerId, containerMembers);
    });
    const headingVisualTop = snapshot.visualTopById.get(group.id) ?? region.visualTop;
    const deltaByContainer = new Map<string, number>();
    membersByContainer.forEach((containerMembers, containerId) => {
      const firstMemberY = Math.min(...containerMembers.map((positionedNode) => positionedNode.y));
      const previousBottom = previousSummaryBlockBottom(workingLayout, snapshot, groupsById, group, region, memberIds, containerId, firstMemberY, headingVisualTop);
      if (previousBottom === undefined) return;
      // Reserve external clearance against the heading visual bounds before moving the flow.
      const delta = Math.max(0, previousBottom + SUMMARY_GROUP_EXTERNAL_GAP - headingVisualTop);
      if (delta > 0) deltaByContainer.set(containerId, delta);
    });
    if (deltaByContainer.size === 0) return;
    deltaByContainer.forEach((delta, containerId) => {
      const firstMemberY = Math.min(...(membersByContainer.get(containerId) ?? []).map((member) => member.y));
      workingLayout.nodes = workingLayout.nodes.map((positionedNode) => summaryFlowContainerId(positionedNode.node) === containerId && positionedNode.y >= firstMemberY
        ? { ...positionedNode, y: positionedNode.y + delta }
        : positionedNode);
      extendSummaryFlowContainer(workingLayout, containerId, delta);
    });
    const maxDelta = Math.max(...deltaByContainer.values());
    const firstMemberY = Math.min(...members.map((member) => member.y));
    const regionRight = region.x + region.width;
    workingLayout.bands = workingLayout.bands.map((band) => {
      const descendantBand = Boolean(band.presentationId && presentationIsWithin(groupsById, band.presentationId, group.id));
      const laterBand = band.y >= firstMemberY
        && horizontalRangesOverlap(band.x, band.x + band.width, region.x, regionRight);
      return descendantBand || laterBand ? { ...band, y: band.y + maxDelta } : band;
    });
  });
  return workingLayout;
}

function finalizeAnalyzerLayout(view: AnalyzerViewModel, layout: AnalyzerLayout): AnalyzerLayout {
  const resolvedLayout = resolveSummaryHeadingCollisions(view, layout);
  const snapshot = summaryRegionSnapshot(view, resolvedLayout);
  const rawSummaryGroups = snapshot.summaryGroups;
  const regionTopById = snapshot.regionTopById;
  const regionOffset = Math.max(0, ...[...regionTopById.values()].map((top) => -top));
  const shiftY = <T extends { y: number }>(items: T[]): T[] => regionOffset === 0
    ? items
    : items.map((item) => ({ ...item, y: item.y + regionOffset }));
  const summaryGroups = rawSummaryGroups.map((group) => {
    const y = (regionTopById.get(group.id) ?? group.y) + regionOffset;
    return {
      ...group,
      y,
      height: group.y + group.height + regionOffset - y,
    };
  });
  const bands = resolvedLayout.bands.map((band) => {
    const regionId = band.presentationId ?? band.id;
    const y = (regionTopById.get(regionId) ?? band.y) + regionOffset;
    return {
      ...band,
      y,
      height: band.y + band.height + regionOffset - y,
    };
  });
  const allBounds = [
    ...summaryGroups.map((group) => ({ right: group.x + group.width, bottom: group.y + group.height })),
    ...bands.map((band) => ({ right: band.x + band.width, bottom: band.y + band.height })),
  ];
  const positionedBottoms = [
    ...resolvedLayout.nodes.map((positionedNode) => positionedNode.y + positionedNode.height),
    ...resolvedLayout.clusters.map((cluster) => cluster.y + cluster.height),
    ...resolvedLayout.lanes.map((lane) => lane.y + lane.height),
    ...bands.map((band) => band.y + band.height),
    ...summaryGroups.map((group) => group.y + group.height),
  ];
  return {
    ...resolvedLayout,
    nodes: shiftY(resolvedLayout.nodes),
    clusters: shiftY(resolvedLayout.clusters),
    lanes: shiftY(resolvedLayout.lanes),
    bands,
    summaryGroups,
    width: Math.max(resolvedLayout.width, ...allBounds.map((bounds) => bounds.right + SIDE_PADDING)),
    height: Math.max(resolvedLayout.height + regionOffset, ...positionedBottoms.map((bottom) => bottom + regionOffset + SIDE_PADDING), ...allBounds.map((bounds) => bounds.bottom + SIDE_PADDING)),
  };
}

export function layoutAnalyzerView(view: AnalyzerViewModel, expandedNodeIds: ReadonlySet<string> = new Set()): AnalyzerLayout {
  const layout = view.view === 'architecture'
    ? layoutArchitecture(view, expandedNodeIds)
    : view.view === 'command'
      ? commandFlowLayout(view, expandedNodeIds)
      : view.view === 'dependencies'
        ? dependencyFlowLayout(view, expandedNodeIds)
        : layoutColumnClusters(view, expandedNodeIds);
  return finalizeAnalyzerLayout(view, layout);
}
