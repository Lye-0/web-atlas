import { describe, expect, it } from 'vitest';
import {
  analyzerSessionReducer,
  createInitialAnalyzerSessionState,
  type AnalyzerSessionState,
} from './session';
import type { AnalyzerProjectStore } from './types';

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

describe('Analyzer session store', () => {
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
    expect(state.views.architecture).toMatchObject({ search: '', filter: 'all', detailOpen: false });
    expect(state.views.architecture.selectedNodeId).toBeUndefined();
    expect(state.views.architecture.camera).toBeUndefined();
    expect(state.scanVersion).toBe(2);
  });
});
