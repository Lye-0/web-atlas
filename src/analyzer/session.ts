import type { AnalyzerGraphTransform } from './camera';
import type { AnalyzerFilter, AnalyzerProjectStore, AnalyzerViewId } from './types';

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
  views: Record<AnalyzerViewId, AnalyzerViewSession>;
  scanVersion: number;
}

export type AnalyzerViewSessionUpdate = Partial<AnalyzerViewSession> | ((current: AnalyzerViewSession) => AnalyzerViewSession);

export type AnalyzerSessionAction =
  | { type: 'replaceProject'; store: AnalyzerProjectStore }
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
    views: Object.fromEntries(analyzerViewIds.map((view) => [view, createInitialAnalyzerViewSession()])) as Record<AnalyzerViewId, AnalyzerViewSession>,
    scanVersion: 0,
  };
}

export function analyzerSessionReducer(state: AnalyzerSessionState, action: AnalyzerSessionAction): AnalyzerSessionState {
  if (action.type === 'replaceProject') {
    return {
      store: action.store,
      views: Object.fromEntries(analyzerViewIds.map((view) => [view, createInitialAnalyzerViewSession()])) as Record<AnalyzerViewId, AnalyzerViewSession>,
      scanVersion: state.scanVersion + 1,
    };
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
