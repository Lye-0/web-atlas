import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AnalyzerViewSession, AnalyzerViewSessionUpdate } from '../../analyzer/session';
import type { SemanticEdge } from '../../analyzer/semantic/types';
import { explorerLocationForNode, explorerParentLocation, explorerProjectLocation, resolveExplorerLocation, type ExplorerLocation, type SemanticExplorerModel } from '../../analyzer/semantic/semanticExplorer';
import { enterExplorerVisit, explorerSelection, initialExplorer2D, recordExplorerScroll, type Explorer2DState, type ExplorerSelection, type ExplorerVisit } from '../../analyzer/semantic/semanticExplorerState';
import { analyzerRoutes } from '../../utils/routes';

interface RouteStamp { view: string; scanVersion: number; visitId: string }
interface Props {
  view: 'runtime-flow' | 'function-call-flow'; scanVersion: number; session: AnalyzerViewSession; explorer: SemanticExplorerModel; ready: boolean;
  edges: readonly SemanticEdge[];
  updateView: (view: Props['view'], update: AnalyzerViewSessionUpdate) => void;
  onFocus: (mode: '2d' | '3d', ids: string[]) => void;
}

function visitSearch(visit: ExplorerVisit) {
  const params = new URLSearchParams({ mode: visit.mode, scope: visit.twoD.location.scopeId });
  if (visit.twoD.location.centerId) { params.set('center', visit.twoD.location.centerId); params.set('depth', String(visit.twoD.location.depth)); params.set('direction', visit.twoD.location.direction); }
  return `?${params}`;
}

export function useSemanticExplorerNavigation({ view, scanVersion, session, explorer, edges, ready, updateView, onFocus }: Props) {
  const route = useLocation(), navigate = useNavigate();
  const current = useRef(session), model = useRef(explorer), serial = useRef(0), handled = useRef('');
  current.current = session; model.current = explorer;
  const edgeIndex = useMemo(() => new Map(edges.map(edge => [edge.id, edge])), [edges]);
  const selectedTargets = useCallback((stored: AnalyzerViewSession) => {
    const edge = stored.selectedEdgeId ? edgeIndex.get(stored.selectedEdgeId) : undefined;
    return stored.selectedNodeId ? [stored.selectedNodeId] : edge ? [edge.source, edge.target] : [];
  }, [edgeIndex]);
  const stamp = (route.state as { semanticExplorer?: RouteStamp } | null)?.semanticExplorer;
  const explicitJump = (route.state as { semanticExplorerJump?: { targetId?: string } } | null)?.semanticExplorerJump;
  const writeRoute = useCallback((visit: ExplorerVisit, replace: boolean) => {
    navigate({ pathname: analyzerRoutes[view], search: visitSearch(visit) }, { replace, state: { semanticExplorer: { view, scanVersion, visitId: visit.id } satisfies RouteStamp } });
  }, [navigate, view, scanVersion]);
  useLayoutEffect(() => {
    if (!ready) return;
    const key = `${view}:${scanVersion}:${route.key}`; if (handled.current === key) return; handled.current = key;
    const stored = current.current, existing = stamp?.view === view && stamp.scanVersion === scanVersion ? stored.explorer?.visits[stamp.visitId] : undefined;
    if (existing) {
      if (stored.explorer?.currentVisitId !== existing.id) updateView(view, state => enterExplorerVisit(state, existing));
      return;
    }
    const params = new URLSearchParams(route.search), validQuery = !stamp || stamp.scanVersion === scanVersion;
    const mode = validQuery && params.get('mode') === '3d' ? '3d' : validQuery && params.get('mode') === '2d' ? '2d' : stored.flow?.mode ?? (stored.semantic?.orbit ? '3d' : '2d');
    let twoD = stored.explorer?.twoD ?? initialExplorer2D();
    if (explicitJump) twoD = mode === '2d' ? { location: explicitJump.targetId ? explorerLocationForNode(model.current, explicitJump.targetId) : { ...explorerProjectLocation }, scrollTop: 0 } : twoD;
    else if (validQuery && params.has('scope')) twoD = { location: resolveExplorerLocation(model.current, {
      scopeId: params.get('scope')!, centerId: params.get('center') ?? undefined, depth: Math.min(5, Math.max(1, Number(params.get('depth')) || 1)),
      direction: params.get('direction') === 'incoming' ? 'incoming' : params.get('direction') === 'outgoing' ? 'outgoing' : 'both',
    }), scrollTop: 0 };
    else if (!stored.explorer && selectedTargets(stored)[0]) twoD = { location: explorerLocationForNode(model.current, selectedTargets(stored)[0]!), scrollTop: 0 };
    const visit: ExplorerVisit = { id: `entry:${key}`, previousId: explicitJump ? 'previous-route' : undefined, mode, twoD, camera3d: stored.flowCameras?.['3d'] ?? stored.semanticCamera, ...explorerSelection(stored) };
    updateView(view, state => enterExplorerVisit(state, visit)); writeRoute(visit, true);
    if (mode === '3d' && (explicitJump || !stored.explorer) && selectedTargets(stored).length) onFocus(mode, selectedTargets(stored));
  }, [ready, view, scanVersion, route.key, route.search, stamp, explicitJump, updateView, writeRoute, onFocus, selectedTargets]);

  const push = useCallback((mode: '2d' | '3d', twoD: Explorer2DState, selection?: ExplorerSelection, focusIds?: string[]) => {
    const stored = current.current;
    const visit: ExplorerVisit = { id: `visit:${view}:${scanVersion}:${Date.now()}:${++serial.current}`, previousId: stored.explorer?.currentVisitId,
      mode, twoD, camera3d: stored.flowCameras?.['3d'] ?? stored.semanticCamera, ...(selection ?? explorerSelection(stored)) };
    updateView(view, state => enterExplorerVisit(state, visit)); writeRoute(visit, false);
    if (focusIds?.length) onFocus(mode, focusIds);
  }, [view, scanVersion, updateView, writeRoute, onFocus]);
  const openLocation = useCallback((location: ExplorerLocation) => push('2d', { location, scrollTop: 0 }), [push]);
  const openNode = useCallback((id: string) => push('2d', { location: explorerLocationForNode(model.current, id), scrollTop: 0 }, { selectedNodeId: id, selectedEdgeId: undefined, detailOpen: true }), [push]);
  const jumpMode = useCallback((mode: '2d' | '3d', id: string) => push(mode,
    mode === '2d' ? { location: explorerLocationForNode(model.current, id), scrollTop: 0 } : current.current.explorer?.twoD ?? initialExplorer2D(),
    { selectedNodeId: id, selectedEdgeId: undefined, detailOpen: true }, mode === '3d' ? [id] : undefined), [push]);
  const changeMode = useCallback((mode: '2d' | '3d') => {
    const stored = current.current; if (stored.flow?.mode === mode) return;
    let twoD = stored.explorer?.twoD ?? initialExplorer2D();
    const first = mode === '2d' ? !stored.explorer?.visited2D : !stored.explorer?.visited3D;
    const targets = selectedTargets(stored);
    if (first && targets[0] && mode === '2d') twoD = { location: explorerLocationForNode(model.current, targets[0]), scrollTop: 0 };
    push(mode, twoD, undefined, first && mode === '3d' ? targets : undefined);
  }, [push, selectedTargets]);
  const location = useMemo(() => resolveExplorerLocation(explorer, session.explorer?.twoD.location ?? explorerProjectLocation), [explorer, session.explorer?.twoD.location]);
  const visit = session.explorer?.visits[session.explorer.currentVisitId];
  return {
    location, visitId: visit?.id ?? `pending:${view}:${scanVersion}`, scrollTop: session.explorer?.twoD.scrollTop ?? 0, canBack: Boolean(visit?.previousId),
    back: () => { if (visit?.previousId) navigate(-1); },
    openScope: (scopeId: string) => openLocation({ ...explorerProjectLocation, scopeId }), openNode, jumpMode, changeMode,
    revealNode: (id: string) => push('2d', { location: explorerLocationForNode(explorer, id), scrollTop: 0 }),
    parent: () => openLocation(explorerParentLocation(explorer, location)), project: () => openLocation({ ...explorerProjectLocation }),
    openDefinition: (id: string) => { const owner = explorer.owners.get(id); if (owner?.definitionAvailable) push('2d', { location: { ...explorerProjectLocation, scopeId: owner.scopeId }, scrollTop: 0 }, { selectedNodeId: id, detailOpen: true }, [id]); },
    changeLocal: (patch: Partial<Pick<ExplorerLocation, 'depth' | 'direction'>>) => { if (location.centerId) openLocation({ ...location, ...patch }); },
    saveScroll: (scrollTop: number) => updateView(view, state => recordExplorerScroll(state, scrollTop)),
  };
}
