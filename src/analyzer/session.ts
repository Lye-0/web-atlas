import type { AnalyzerGraphTransform } from './camera';
import type { DirectoryHandleLike } from './fileDiscovery';
import type { AnalyzerFilter, AnalyzerProjectStore, AnalyzerSemanticRegion, AnalyzerViewId, AnalyzerViewModel } from './types';

export interface AnalyzerViewSession {
  selectedNodeId?: string;
  selectedRegionId?: string;
  selectedEdgeId?: string;
  search: string;
  filter: AnalyzerFilter;
  expandedPresentationIds: ReadonlySet<string>;
  entryScriptId?: string;
  detailOpen: boolean;
  camera?: AnalyzerGraphTransform;
}

export interface AnalyzerSessionState {
  store?: AnalyzerProjectStore;
  folderHandle?: DirectoryHandleLike;
  activeView: AnalyzerViewId;
  views: Record<AnalyzerViewId, AnalyzerViewSession>;
  scanVersion: number;
}

export type AnalyzerViewSessionUpdate = Partial<AnalyzerViewSession> | ((current: AnalyzerViewSession) => AnalyzerViewSession);

export type AnalyzerSessionAction =
  | { type: 'replaceProject'; store: AnalyzerProjectStore; folderHandle?: DirectoryHandleLike }
  | { type: 'setActiveView'; view: AnalyzerViewId }
  | { type: 'updateView'; view: AnalyzerViewId; update: AnalyzerViewSessionUpdate };

export const analyzerViewIds: AnalyzerViewId[] = ['architecture', 'workspace', 'command', 'dependencies'];

export function createInitialAnalyzerViewSession(): AnalyzerViewSession {
  return {
    search: '',
    filter: 'all',
    expandedPresentationIds: new Set<string>(),
    detailOpen: false,
  };
}

export function createInitialAnalyzerSessionState(): AnalyzerSessionState {
  return {
    activeView: 'architecture',
    views: Object.fromEntries(analyzerViewIds.map((view) => [view, createInitialAnalyzerViewSession()])) as Record<AnalyzerViewId, AnalyzerViewSession>,
    scanVersion: 0,
  };
}

function sameStringSet(first: ReadonlySet<string>, second: ReadonlySet<string>): boolean {
  if (first.size !== second.size) return false;
  for (const value of first) if (!second.has(value)) return false;
  return true;
}

function normalizedFilterForView(filter: AnalyzerFilter, view: AnalyzerViewModel['view']): AnalyzerFilter {
  if (view !== 'architecture') return filter;
  if (filter === 'technology' || filter === 'runtime' || filter === 'resource') return 'stack-usage';
  if (filter === 'application' || filter === 'workspace-package' || filter === 'dotnet-project') return 'stack-scope';
  return filter;
}

function regionForLegacyScopeSelection(
  selectedNodeId: string | undefined,
  regions: readonly AnalyzerSemanticRegion[],
): AnalyzerSemanticRegion | undefined {
  if (!selectedNodeId) return undefined;
  const legacyScopeId = selectedNodeId.startsWith('stack-scope:')
    ? selectedNodeId.slice('stack-scope:'.length)
    : selectedNodeId.startsWith('scope:')
      ? selectedNodeId.slice('scope:'.length)
      : undefined;
  const legacyScopePath = legacyScopeId?.replace(/^package:/, '');
  const legacyFactId = legacyScopeId?.startsWith('dotnet:')
    ? legacyScopeId.slice('dotnet:'.length)
    : undefined;
  return regions.find((region) => {
    const scopeId = region.metadata.scopeId;
    const scopePath = region.metadata.scopePath;
    return region.id === selectedNodeId
      || (legacyFactId !== undefined && region.factId === legacyFactId)
      || (typeof scopeId === 'string' && (scopeId === legacyScopeId || scopeId === selectedNodeId))
      || (typeof scopePath === 'string' && (scopePath === legacyScopePath || scopePath === selectedNodeId));
  });
}

/**
 * Reconnects serializable session IDs to the freshly projected view model.
 * The session keeps IDs, never graph objects, so route remounts can safely
 * reuse the state even when projection creates new object identities.
 */
export function restoreAnalyzerViewSession(session: AnalyzerViewSession, view: AnalyzerViewModel): AnalyzerViewSession {
  const nodeIds = new Set(view.nodes.map((node) => node.id));
  const regions = view.regions ?? [];
  const regionIds = new Set(regions.map((region) => region.id));
  const edgeIds = new Set(view.edges.map((edge) => edge.id));
  const presentationIds = new Set([
    ...(view.presentationGroups?.map((group) => group.id) ?? []),
    ...view.nodes.filter((node) => node.presentation?.role === 'summary').map((node) => node.id),
  ]);
  const selectedNodeId = session.selectedNodeId && nodeIds.has(session.selectedNodeId)
    ? session.selectedNodeId
    : undefined;
  const selectedRegionId = selectedNodeId
    ? undefined
    : session.selectedRegionId && regionIds.has(session.selectedRegionId)
      ? session.selectedRegionId
      : regionForLegacyScopeSelection(session.selectedNodeId, regions)?.id;
  const selectedEdgeId = selectedNodeId || selectedRegionId
    ? undefined
    : session.selectedEdgeId && edgeIds.has(session.selectedEdgeId)
      ? session.selectedEdgeId
      : undefined;
  const expandedPresentationIds = new Set([...session.expandedPresentationIds].filter((id) => presentationIds.has(id)));
  const entryScriptId = view.view === 'command'
    && session.entryScriptId
    && session.entryScriptId !== view.entryScriptId
      ? view.entryScriptId
      : session.entryScriptId;
  const filter = normalizedFilterForView(session.filter, view.view);
  const detailOpen = session.detailOpen && Boolean(selectedNodeId || selectedRegionId || selectedEdgeId);

  if (
    selectedNodeId === session.selectedNodeId
    && selectedRegionId === session.selectedRegionId
    && selectedEdgeId === session.selectedEdgeId
    && sameStringSet(expandedPresentationIds, session.expandedPresentationIds)
    && filter === session.filter
    && entryScriptId === session.entryScriptId
    && detailOpen === session.detailOpen
  ) return session;

  return {
    ...session,
    selectedNodeId,
    selectedRegionId,
    selectedEdgeId,
    expandedPresentationIds,
    filter,
    entryScriptId,
    detailOpen,
  };
}

export function analyzerSessionReducer(state: AnalyzerSessionState, action: AnalyzerSessionAction): AnalyzerSessionState {
  if (action.type === 'replaceProject') {
    return {
      store: action.store,
      folderHandle: action.folderHandle,
      activeView: 'architecture',
      views: Object.fromEntries(analyzerViewIds.map((view) => [view, createInitialAnalyzerViewSession()])) as Record<AnalyzerViewId, AnalyzerViewSession>,
      scanVersion: state.scanVersion + 1,
    };
  }

  if (action.type === 'setActiveView') {
    return action.view === state.activeView ? state : { ...state, activeView: action.view };
  }

  const currentView = state.views[action.view];
  const nextView = typeof action.update === 'function'
    ? action.update(currentView)
    : { ...currentView, ...action.update };
  if (nextView === currentView) return state;

  return {
    ...state,
    views: {
      ...state.views,
      [action.view]: nextView,
    },
  };
}
