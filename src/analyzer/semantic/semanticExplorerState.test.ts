import { expect, it } from 'vitest';
import { createInitialAnalyzerViewSession } from '../session';
import { enterExplorerVisit, initialExplorer2D, recordExplorerCamera, recordExplorerSelection, type ExplorerVisit } from './semanticExplorerState';

it.each(['clear', 'node', 'edge'] as const)('invalidates only the active path on %s while explicit history restores its own path', action => {
  const location = { ...initialExplorer2D().location, centerId: 'a', depth: 3 };
  const old: ExplorerVisit = { id: '2d-a', mode: '2d', twoD: { location, scrollTop: 90 }, activePath: location, selectedNodeId: 'a', detailOpen: true };
  const initial = enterExplorerVisit(createInitialAnalyzerViewSession(), old);
  const threeD = enterExplorerVisit(initial, { ...old, id: '3d-a', previousId: old.id, mode: '3d' });
  const changed = recordExplorerSelection(threeD, { selectedNodeId: action === 'node' ? 'zero-relations' : undefined, selectedEdgeId: action === 'edge' ? 'b-c' : undefined, detailOpen: action !== 'clear' });
  expect(changed.explorer!.visits['3d-a']!.activePath).toBeUndefined();
  expect(changed.explorer!.twoD).toEqual(old.twoD);
  const moved = recordExplorerCamera(changed, '3d', { position: [1, 2, 3], target: [0, 0, 0], zoom: 3 });
  expect(moved.explorer!.visits['3d-a']!.activePath).toBeUndefined();
  const back = enterExplorerVisit(moved, moved.explorer!.visits['2d-a']!);
  expect(back.selectedNodeId).toBe('a'); expect(back.explorer!.visits['2d-a']!.activePath).toEqual(location);
});

it('closing details or moving the camera preserves selection and its explicit relationship', () => {
  const twoD = initialExplorer2D(), activePath = { ...twoD.location, centerId: 'a', depth: 2 };
  const current = enterExplorerVisit(createInitialAnalyzerViewSession(), { id: 'a', mode: '3d', twoD, activePath, selectedNodeId: 'a', detailOpen: true });
  const closed = recordExplorerSelection(current, { selectedNodeId: 'a', detailOpen: false });
  expect(closed.explorer!.visits.a!.activePath).toBe(activePath);
  expect(closed.selectedNodeId).toBe('a'); expect(closed.detailOpen).toBe(false);
});
