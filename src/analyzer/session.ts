import type { AnalyzerGraphTransform } from './camera';
import type { DirectoryHandleLike } from './fileDiscovery';
import type { AnalyzerFilter, AnalyzerProjectStore, AnalyzerViewId, AnalyzerViewModel } from './types';

export interface AnalyzerViewSession {
  selectedNodeId?: string;
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

/**
 * Reconnects serializable session IDs to the freshly projected view model.
 * The session keeps IDs, never graph objects, so route remounts can safely
 * reuse the state even when projection creates new object identities.
 */
export function restoreAnalyzerViewSession(session: AnalyzerViewSession, view: AnalyzerViewModel): AnalyzerViewSession {
  const nodeIds = new Set(view.nodes.map((node) => node.id));
  const edgeIds = new Set(view.edges.map((edge) => edge.id));
  const presentationIds = new Set([
    ...(view.presentationGroups?.map((group) => group.id) ?? []),
    ...view.nodes.filter((node) => node.presentation?.role === 'summary').map((node) => node.id),
  ]);
  const selectedNodeId = session.selectedNodeId && nodeIds.has(session.selectedNodeId)
    ? session.selectedNodeId
    : undefined;
  const selectedEdgeId = selectedNodeId
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
  const detailOpen = session.detailOpen && Boolean(selectedNodeId || selectedEdgeId);

  if (
    selectedNodeId === session.selectedNodeId
    && selectedEdgeId === session.selectedEdgeId
    && sameStringSet(expandedPresentationIds, session.expandedPresentationIds)
    && entryScriptId === session.entryScriptId
    && detailOpen === session.detailOpen
  ) return session;

  return {
    ...session,
    selectedNodeId,
    selectedEdgeId,
    expandedPresentationIds,
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
