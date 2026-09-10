import { useCallback, useReducer, useRef, type ReactNode } from 'react';
import { cancelSemanticAnalysis } from './semantic/client';
import { semanticTraceCache } from './semantic/traceCache';
import { analyzerSessionContext } from './sessionContext';
import { analyzerSessionReducer, createInitialAnalyzerSessionState } from './session';
import type { AnalyzerProjectStore, AnalyzerViewId } from './types';
import type { DirectoryHandleLike } from './fileDiscovery';
import type { AnalyzerViewSessionUpdate } from './session';

export function AnalyzerSessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(analyzerSessionReducer, undefined, createInitialAnalyzerSessionState);
  const currentStore = useRef(state.store);
  currentStore.current = state.store;
  const replaceProject = useCallback((store: AnalyzerProjectStore, folderHandle?: DirectoryHandleLike) => {
    const previous = currentStore.current;
    if (previous && previous !== store) { cancelSemanticAnalysis(previous); semanticTraceCache.delete(previous); }
    currentStore.current = store;
    dispatch({ type: 'replaceProject', store, folderHandle });
  }, []);
  const setActiveView = useCallback((view: AnalyzerViewId) => {
    dispatch({ type: 'setActiveView', view });
  }, []);
  const setFlowGroupBounds = useCallback((visible: boolean) => {
    dispatch({ type: 'setFlowGroupBounds', visible });
  }, []);
  const setAutoAggregation = useCallback((enabled: boolean) => {
    dispatch({ type: 'setAutoAggregation', enabled });
  }, []);
  const updateView = useCallback((view: AnalyzerViewId, update: AnalyzerViewSessionUpdate) => {
    dispatch({ type: 'updateView', view, update });
  }, []);

  return <analyzerSessionContext.Provider value={{ state, replaceProject, setActiveView, setFlowGroupBounds, setAutoAggregation, updateView }}>{children}</analyzerSessionContext.Provider>;
}
