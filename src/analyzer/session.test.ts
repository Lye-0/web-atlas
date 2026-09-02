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
  it('starts at Stack Map and restores the active view without touching other view sessions', () => {
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

  it('maps legacy Architecture filters to the Stack Map filter vocabulary', () => {
    const view: AnalyzerViewModel = { ...viewModel(), view: 'architecture' };
    const restored = restoreAnalyzerViewSession({
      ...createInitialAnalyzerSessionState().views.architecture,
      filter: 'technology',
    }, view);

    expect(restored.filter).toBe('stack-usage');
  });

  it('restores Region selection and migrates a legacy Scope Node selection', () => {
    const view: AnalyzerViewModel = {
      ...viewModel(),
      view: 'architecture',
      nodes: [
        { id: 'stack-map:project', type: 'project', label: 'Project', evidenceIds: [], metadata: {} },
        { id: 'stack-usage:package:apps/web:react', type: 'stack-usage', label: 'React', evidenceIds: [], metadata: { stackMapRegionId: 'region:scope:apps/web' } },
      ],
      edges: [{ id: 'edge:region', sourceId: 'stack-map:project', targetId: 'region:scope:apps/web', kind: 'contains', label: 'contains', evidenceIds: [], metadata: {} }],
      regions: [{
        id: 'region:scope:apps/web',
        entityKind: 'region',
        regionKind: 'scope',
        label: 'WEB',
        subtitle: 'apps/web',
        childIds: ['stack-usage:package:apps/web:react'],
        ports: [
          { id: 'top', side: 'top' },
          { id: 'right', side: 'right' },
          { id: 'bottom', side: 'bottom' },
          { id: 'left', side: 'left' },
        ],
        selectable: true,
        evidenceIds: [],
        scopeKind: 'physical',
        metadata: { scopeId: 'package:apps/web', scopePath: 'apps/web', scopeKind: 'physical' },
      }],
    };

    const migrated = restoreAnalyzerViewSession({
      ...createInitialAnalyzerSessionState().views.architecture,
      selectedNodeId: 'stack-scope:package:apps/web',
      detailOpen: true,
    }, view);
    expect(migrated.selectedNodeId).toBeUndefined();
    expect(migrated.selectedRegionId).toBe('region:scope:apps/web');
    expect(migrated.selectedEdgeId).toBeUndefined();
    expect(migrated.detailOpen).toBe(true);

    const restored = restoreAnalyzerViewSession({
      ...migrated,
      selectedNodeId: undefined,
      selectedRegionId: 'region:scope:apps/web',
    }, view);
    expect(restored.selectedRegionId).toBe('region:scope:apps/web');

    const oldScopePrefix = restoreAnalyzerViewSession({
      ...createInitialAnalyzerSessionState().views.architecture,
      selectedNodeId: 'scope:apps/web',
      detailOpen: true,
    }, view);
    expect(oldScopePrefix.selectedNodeId).toBeUndefined();
    expect(oldScopePrefix.selectedRegionId).toBe('region:scope:apps/web');
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
