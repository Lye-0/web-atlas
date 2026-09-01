import { createContext, useContext } from 'react';
import type { DirectoryHandleLike } from './fileDiscovery';
import type { AnalyzerProjectStore, AnalyzerViewId } from './types';
import type { AnalyzerSessionState, AnalyzerViewSessionUpdate } from './session';

export interface AnalyzerSessionContextValue {
  state: AnalyzerSessionState;
  replaceProject: (store: AnalyzerProjectStore, folderHandle?: DirectoryHandleLike) => void;
  updateView: (view: AnalyzerViewId, update: AnalyzerViewSessionUpdate) => void;
}

export const analyzerSessionContext = createContext<AnalyzerSessionContextValue | undefined>(undefined);

export function useAnalyzerSession(): AnalyzerSessionContextValue {
  const context = useContext(analyzerSessionContext);
  if (!context) throw new Error('useAnalyzerSession must be used within AnalyzerSessionProvider');
  return context;
}
