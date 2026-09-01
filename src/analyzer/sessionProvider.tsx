import { useCallback, useReducer, type ReactNode } from 'react';
import { analyzerSessionContext } from './sessionContext';
import { analyzerSessionReducer, createInitialAnalyzerSessionState } from './session';
import type { AnalyzerProjectStore, AnalyzerViewId } from './types';
import type { DirectoryHandleLike } from './fileDiscovery';
import type { AnalyzerViewSessionUpdate } from './session';

export function AnalyzerSessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(analyzerSessionReducer, undefined, createInitialAnalyzerSessionState);
  const replaceProject = useCallback((store: AnalyzerProjectStore, folderHandle?: DirectoryHandleLike) => {
    dispatch({ type: 'replaceProject', store, folderHandle });
  }, []);
  const setActiveView = useCallback((view: AnalyzerViewId) => {
    dispatch({ type: 'setActiveView', view });
  }, []);
  const updateView = useCallback((view: AnalyzerViewId, update: AnalyzerViewSessionUpdate) => {
    dispatch({ type: 'updateView', view, update });
  }, []);

  return <analyzerSessionContext.Provider value={{ state, replaceProject, setActiveView, updateView }}>{children}</analyzerSessionContext.Provider>;
}
