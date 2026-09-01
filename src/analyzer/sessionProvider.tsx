import { useCallback, useReducer, type ReactNode } from 'react';
import { analyzerSessionContext } from './sessionContext';
import { analyzerSessionReducer, createInitialAnalyzerSessionState } from './session';
import type { AnalyzerProjectStore, AnalyzerViewId } from './types';
import type { AnalyzerViewSessionUpdate } from './session';

export function AnalyzerSessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(analyzerSessionReducer, undefined, createInitialAnalyzerSessionState);
  const replaceProject = useCallback((store: AnalyzerProjectStore) => {
    dispatch({ type: 'replaceProject', store });
  }, []);
  const updateView = useCallback((view: AnalyzerViewId, update: AnalyzerViewSessionUpdate) => {
    dispatch({ type: 'updateView', view, update });
  }, []);

  return <analyzerSessionContext.Provider value={{ state, replaceProject, updateView }}>{children}</analyzerSessionContext.Provider>;
}
