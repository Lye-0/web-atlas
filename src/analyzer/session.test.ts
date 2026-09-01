import { describe, expect, it } from 'vitest';
import {
  analyzerSessionReducer,
  createInitialAnalyzerSessionState,
  restoreAnalyzerViewSession,
  type AnalyzerSessionState,
} from './session';
import type { AnalyzerProjectStore, AnalyzerViewModel } from './types';
import type { DirectoryHandleLike } from './fileDiscovery';

function projectStore(scannedAt: string): AnalyzerProjectStore {
  return {
    files: [],
    facts: [],
    relations: [],
    evidence: [],
    sources: {},
    warnings: [],
    scannedAt,
  };
}

function withProject(): AnalyzerSessionState {
  return analyzerSessionReducer(createInitialAnalyzerSessionState(), {
    type: 'replaceProject',
    store: projectStore('first'),
  });
}

function viewModel(): AnalyzerViewModel {
  return {
    view: 'command',
    nodes: [
      { id: 'technology:vite', type: 'technology', label: 'Vite', evidenceIds: [], metadata: {} },
      { id: 'summary:api', type: 'command', label: 'DEV:API', evidenceIds: [], metadata: {}, presentation: { role: 'summary', childNodeIds: [] } },
    ],
    edges: [{ id: 'edge:vite', sourceId: 'technology:vite', targetId: 'summary:api', kind: 'uses', label: 'uses', evidenceIds: [], metadata: {} }],
    clusters: [],
    presentationGroups: [{ id: 'summary:api', label: 'DEV:API', count: 0, countLabel: 'STEPS', childNodeIds: [], expanded: true }],
    evidence: [],
    warnings: [],
    entryScriptId: 'script:root:build',
  };
}

describe('Analyzer session store', () => {
  it('starts at Architecture and restores the active view without touching other view sessions', () => {
    let state = createInitialAnalyzerSessionState();
    expect(state.activeView).toBe('architecture');
    state = analyzerSessionReducer(state, { type: 'setActiveView', view: 'command' });
    state = analyzerSessionReducer(state, { type: 'updateView', view: 'command', update: { camera: { x: 12, y: 18, scale: 0.8 }, entryScriptId: 'script:root:build' } });
    state = analyzerSessionReducer(state, { type: 'setActiveView', view: 'architecture' });
    state = analyzerSessionReducer(state, { type: 'setActiveView', view: 'command' });

    expect(state.activeView).toBe('command');
    expect(state.views.command.camera).toEqual({ x: 12, y: 18, scale: 0.8 });
    expect(state.views.command.entryScriptId).toBe('script:root:build');
    expect(state.views.architecture.camera).toBeUndefined();
  });

  it('re-resolves stable selection and entry IDs after projection without restoring stale entities', () => {
    const view = viewModel();
    const restored = restoreAnalyzerViewSession({
      ...createInitialAnalyzerSessionState().views.command,
      selectedNodeId: 'technology:vite',
      selectedEdgeId: 'edge:stale',
      detailOpen: true,
      expandedPresentationIds: new Set(['summary:api', 'summary:stale']),
      entryScriptId: 'script:removed',
    }, view);

    expect(restored.selectedNodeId).toBe('technology:vite');
    expect(restored.selectedEdgeId).toBeUndefined();
    expect(restored.detailOpen).toBe(true);
    expect(restored.expandedPresentationIds).toEqual(new Set(['summary:api']));
    expect(restored.entryScriptId).toBe('script:root:build');

    const missing = restoreAnalyzerViewSession({
      ...createInitialAnalyzerSessionState().views.command,
      selectedNodeId: 'technology:removed',
      detailOpen: true,
    }, view);
    expect(missing.selectedNodeId).toBeUndefined();
    expect(missing.detailOpen).toBe(false);
  });

  it('keeps the selected folder handle alongside the analysis result', () => {
    const folderHandle: DirectoryHandleLike = {
      kind: 'directory',
      name: 'git-lines',
      values: async function* values() {
        // The session only retains the handle; scanning has already completed.
      },
    };
    const state = analyzerSessionReducer(createInitialAnalyzerSessionState(), {
      type: 'replaceProject',
      store: projectStore('first'),
      folderHandle,
    });

    expect(state.store?.scannedAt).toBe('first');
    expect(state.folderHandle).toBe(folderHandle);
  });

  it('keeps each view state and camera independent across route changes', () => {
    let state = withProject();
    state = analyzerSessionReducer(state, {
      type: 'updateView',
      view: 'architecture',
      update: {
        selectedNodeId: 'technology:react',
        search: 'react',
        detailOpen: true,
        expandedPresentationIds: new Set(['architecture:technology:summary']),
        camera: { x: 120, y: 80, scale: 0.92 },
      },
    });
    state = analyzerSessionReducer(state, {
      type: 'updateView',
      view: 'command',
      update: {
        selectedNodeId: 'command:dev',
        expandedPresentationIds: new Set(['command:api']),
        camera: { x: -40, y: 35, scale: 1.1 },
      },
    });

    expect(state.views.architecture).toMatchObject({ selectedNodeId: 'technology:react', search: 'react', detailOpen: true, camera: { x: 120, y: 80, scale: 0.92 } });
    expect(state.views.architecture.expandedPresentationIds).toEqual(new Set(['architecture:technology:summary']));
    expect(state.views.command).toMatchObject({ selectedNodeId: 'command:dev', camera: { x: -40, y: 35, scale: 1.1 } });
    expect(state.views.command.expandedPresentationIds).toEqual(new Set(['command:api']));
  });

  it('supports reducer updates that build on the current camera and resets on a new project', () => {
    let state = withProject();
    state = analyzerSessionReducer(state, {
      type: 'updateView',
      view: 'architecture',
      update: { camera: { x: 10, y: 20, scale: 0.7 } },
    });
    state = analyzerSessionReducer(state, {
      type: 'updateView',
      view: 'architecture',
      update: (current) => ({
        ...current,
        camera: { ...current.camera!, x: current.camera!.x + 15 },
      }),
    });
    expect(state.views.architecture.camera).toEqual({ x: 25, y: 20, scale: 0.7 });

    state = analyzerSessionReducer(state, { type: 'replaceProject', store: projectStore('second') });
    expect(state.store?.scannedAt).toBe('second');
    expect(state.folderHandle).toBeUndefined();
    expect(state.activeView).toBe('architecture');
    expect(state.views.architecture).toMatchObject({ search: '', filter: 'all', detailOpen: false });
    expect(state.views.architecture.selectedNodeId).toBeUndefined();
    expect(state.views.architecture.camera).toBeUndefined();
    expect(state.scanVersion).toBe(2);
  });
});
