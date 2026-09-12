import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AnalyzerSessionProvider } from '../analyzer';
import FlowAnalyzerPage from './FlowAnalyzerPage';
import { AnalyzerPage } from './AnalyzerPage';

vi.mock('../components/analyzer/AnalyzerEmptyOrbit', () => ({ AnalyzerEmptyOrbit: () => <div data-empty-orbit /> }));

describe('Analyzer without a project after reload', () => {
  it.each(['architecture', 'workspace', 'command', 'dependencies', 'module-dependency', 'runtime-flow', 'function-call-flow', 'data-flow', 'data-model', 'architecture-map'] as const)('%s uses the shared folder selection screen', async view => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    try {
      const page = view === 'runtime-flow' || view === 'function-call-flow' || view === 'data-flow' || view === 'data-model' || view === 'architecture-map'
        ? <FlowAnalyzerPage view={view} /> : <AnalyzerPage />;
      await act(async () => root.render(<MemoryRouter initialEntries={[`/analyzer/${view}`]}><AnalyzerSessionProvider>{page}</AnalyzerSessionProvider></MemoryRouter>));
      expect(host.querySelector('#analyzer-empty-title')?.textContent).toBe('解析するProject Folderを選択してください');
      expect(host.querySelector('[data-empty-orbit]')).not.toBeNull();
      expect(host.textContent).toContain('Reloadすると再選択が必要です');
      expect(host.querySelector('.analyzer-shell')).toBeNull();
      expect(host.querySelector('.analyzer-search-results')).toBeNull();
      expect(host.textContent).not.toContain('0 files indexed');
    } finally {
      await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
    }
  });
});
