import type { AnalyzerViewSession } from '../session';
import { explorerProjectLocation, type ExplorerLocation } from './semanticExplorer';

export interface ExplorerCamera2D { x: number; y: number; scale: number }
export interface ExplorerCamera3D { position: [number, number, number]; target: [number, number, number]; zoom: number }
export interface Explorer2DState { location: ExplorerLocation; camera?: ExplorerCamera2D; scrollTop: number }
export interface ExplorerSelection { selectedNodeId?: string; selectedEdgeId?: string; semanticFieldId?: string; detailOpen: boolean }
export interface ExplorerVisit extends ExplorerSelection {
  id: string; previousId?: string; mode: '2d' | '3d'; twoD: Explorer2DState; camera3d?: ExplorerCamera3D;
}
export interface ExplorerSession {
  currentVisitId: string; visits: Record<string, ExplorerVisit>; twoD: Explorer2DState; visited2D: boolean; visited3D: boolean;
}

export const initialExplorer2D = (): Explorer2DState => ({ location: { ...explorerProjectLocation }, scrollTop: 0 });
export const explorerSelection = (session: AnalyzerViewSession): ExplorerSelection => ({ selectedNodeId: session.selectedNodeId, selectedEdgeId: session.selectedEdgeId, detailOpen: session.detailOpen, ...(session.semanticFieldId ? { semanticFieldId: session.semanticFieldId } : {}) });

export function enterExplorerVisit(current: AnalyzerViewSession, visit: ExplorerVisit): AnalyzerViewSession {
  return { ...current, selectedNodeId: visit.selectedNodeId, selectedEdgeId: visit.selectedEdgeId, semanticFieldId: visit.semanticFieldId, detailOpen: visit.detailOpen,
    flow: { expandedGroupIds: [], ...current.flow, mode: visit.mode },
    flowCameras: { ...current.flowCameras, '2d': visit.twoD.camera, '3d': visit.camera3d },
    explorer: { currentVisitId: visit.id, twoD: visit.twoD, visits: { ...current.explorer?.visits, [visit.id]: visit },
      visited2D: Boolean(current.explorer?.visited2D || visit.mode === '2d'), visited3D: Boolean(current.explorer?.visited3D || visit.mode === '3d') },
  };
}

export function recordExplorerSelection(current: AnalyzerViewSession, selection: ExplorerSelection): AnalyzerViewSession {
  const next = { ...current, ...selection }, navigation = current.explorer;
  if (!navigation) return next;
  const visit = navigation.visits[navigation.currentVisitId];
  return visit ? { ...next, explorer: { ...navigation, visits: { ...navigation.visits, [visit.id]: { ...visit, ...selection } } } } : next;
}

export function recordExplorerCamera(current: AnalyzerViewSession, mode: '2d' | '3d', camera: ExplorerCamera2D | ExplorerCamera3D): AnalyzerViewSession {
  const next = { ...current, flowCameras: { ...current.flowCameras, [mode]: camera } }, navigation = current.explorer;
  const visit = navigation?.visits[navigation.currentVisitId];
  if (!navigation || !visit || visit.mode !== mode) return next;
  const twoD = mode === '2d' ? { ...navigation.twoD, camera: camera as ExplorerCamera2D } : navigation.twoD;
  return { ...next, explorer: { ...navigation, twoD, visits: { ...navigation.visits, [visit.id]: { ...visit, twoD, ...(mode === '3d' ? { camera3d: camera as ExplorerCamera3D } : {}) } } } };
}

export function recordExplorerScroll(current: AnalyzerViewSession, scrollTop: number): AnalyzerViewSession {
  const navigation = current.explorer, visit = navigation?.visits[navigation.currentVisitId];
  if (!navigation || !visit || visit.mode !== '2d' || navigation.twoD.scrollTop === scrollTop) return current;
  const twoD = { ...navigation.twoD, scrollTop };
  return { ...current, explorer: { ...navigation, twoD, visits: { ...navigation.visits, [visit.id]: { ...visit, twoD } } } };
}
