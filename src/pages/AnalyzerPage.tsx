import { CommandEntryControl } from '../components/analyzer/CommandEntryControl';
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ANALYZER_DEFAULT_TRANSFORM, ANALYZER_EXTERNAL_SUMMARY_ID, analyzerViewCounts, analyzerViewLabels, isCompatibleSpatialCameraTransform, presentationOwnsNode, presentAnalyzerView, projectAnalyzerView, restoreAnalyzerViewSession, useAnalyzerSession } from '../analyzer';
import type { AnalyzerGraphTransform, AnalyzerProjectStore, AnalyzerSemanticRegion, AnalyzerViewCounts, AnalyzerViewId, AnalyzerViewModel, AnalyzerViewNode, AnalyzerViewSession, DirectoryHandleLike } from '../analyzer';
import { AnalyzerDetailPanel } from '../components/analyzer/AnalyzerDetailPanel';
import { AnalyzerEmptyState } from '../components/analyzer/AnalyzerEmptyState';
import { AnalyzerGraphStage } from '../components/analyzer/AnalyzerGraphStage';
import { AnalyzerToolbar } from '../components/analyzer/AnalyzerToolbar';
import { useWorkspaceFullscreen } from '../components/analyzer/useWorkspaceFullscreen';
import { isSemanticView } from '../analyzer/semantic/types';
import { AnalyzerProjectHeader, AnalyzerViewHeading } from '../components/analyzer/AnalyzerViewChrome';
import { SearchResultStrip } from '../components/analyzer/SearchResultStrip';
import { analyzerEntitySearchDocument, compareAnalyzerSearchResults, matchAnalyzerSearch, moduleSearchDocument } from '../analyzer/search';

const SemanticAnalyzerPage = lazy(() => import('./SemanticAnalyzerPage'));
const AnalyzerGraph3DStage = lazy(async () => ({ default: (await import('../components/analyzer/AnalyzerGraph3DStage')).AnalyzerGraph3DStage }));

const viewIds = new Set<AnalyzerViewId>(['architecture', 'workspace', 'command', 'dependencies', 'module-dependency']);
const AnalyzerSpatialGraphStage = lazy(async () => {
  const module = await import('../components/analyzer/AnalyzerSpatialGraphStage');
  return { default: module.AnalyzerSpatialGraphStage };
});

type AnalyzerSearchResult =
  | { kind: 'node'; item: AnalyzerViewNode }
  | { kind: 'region'; item: AnalyzerSemanticRegion };

class AnalyzerRenderBoundary extends Component<{ children: ReactNode; onUnavailable?: () => void }, { failed: boolean; retry: number }> {
  state = { failed: false, retry: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable?.(); }
  render() {
    return this.state.failed ? <div className="analyzer-graph-stage" role="alert"><p>描画を利用できません。WebGLの利用可否を確認して再試行できます。検索と詳細から対象を確認できます。</p><button type="button" onClick={() => this.setState(current => ({ failed: false, retry: current.retry + 1 }))}>描画を再試行</button></div>
      : <div key={this.state.retry} style={{ display: 'contents' }}>{this.props.children}</div>;
  }
}

function viewFromPath(pathname: string): AnalyzerViewId {
  const lastSegment = pathname.split('/').filter(Boolean).at(-1);
  return lastSegment && viewIds.has(lastSegment as AnalyzerViewId) ? lastSegment as AnalyzerViewId : 'architecture';
}

export function AnalyzerPage() {
  const { pathname } = useLocation();
  const id = pathname.split('/').at(-1) ?? '';
  return isSemanticView(id) ? <Suspense fallback={<p role="status">Analyzerを読み込み中…</p>}><SemanticAnalyzerPage view={id} /></Suspense> : <LegacyAnalyzerPage />;
}

function LegacyAnalyzerPage() {
  const location = useLocation();
  const view = viewFromPath(location.pathname);
  const { state: session, replaceProject, setActiveView, updateView, setAutoAggregation, setFlowGroupBounds } = useAnalyzerSession();
  const store = session.store;
  const fullscreen = useWorkspaceFullscreen(Boolean(store));
  const storedViewState = session.views[view];
  const [focusRequest, setFocusRequest] = useState<{ view: AnalyzerViewId; store: AnalyzerProjectStore | undefined; entityId: string; nonce: number; entityIds?: string[] }>();
  const focusNonce = useRef(0);
  const [reportedCounts, setReportedCounts] = useState<{ model: AnalyzerViewModel; counts: AnalyzerViewCounts }>();

  const model = useMemo(() => store ? projectAnalyzerView(store, view, storedViewState.entryScriptId) : undefined, [store, storedViewState.entryScriptId, view]);
  const viewState = useMemo(() => model ? restoreAnalyzerViewSession(storedViewState, model) : storedViewState, [model, storedViewState]);
  const { selectedNodeId, selectedRegionId, selectedEdgeId, search, filter, expandedPresentationIds, entryScriptId, detailOpen } = viewState;
  const is3D = viewState.graphMode === '3d';
  const [unavailable3D, setUnavailable3D] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState<string>();
  const switchMode = (mode: '2d' | '3d') => {
    setFocusRequest(undefined); setReportedCounts(undefined);
    const summary = model?.nodes.find(node => node.id === selectedNodeId)?.presentation?.role === 'summary';
    updateView(view, { graphMode: mode, ...(summary && view !== 'command' ? { selectedNodeId: undefined, selectedEdgeId: undefined, detailOpen: false } : {}) });
    if (mode === '3d') setUnavailable3D(false);
  };
  const scripts = useMemo(() => store?.facts.filter((fact) => fact.kind === 'package-script') ?? [], [store]);
  const effectiveEntryScriptId = entryScriptId ?? model?.entryScriptId;
  const searchResults = useMemo<AnalyzerSearchResult[]>(() => {
    if (!model || !search.trim()) return [];
    if (view === 'module-dependency') return model.nodes
      .filter(node => node.type === 'module' && (filter === 'all' || filter === 'module'))
      .flatMap(item => {
        const match = matchAnalyzerSearch(moduleSearchDocument(item), search);
        return match ? [{ item, match, label: item.label, path: String(item.metadata.modulePath ?? ''), id: item.id }] : [];
      }).sort(compareAnalyzerSearchResults).map(({ item }) => ({ kind: 'node', item }));
    const candidates: AnalyzerSearchResult[] = [
      ...model.nodes.filter(node => (filter === 'all' || node.type === filter) && !(is3D && view === 'dependencies' && node.presentation?.role === 'summary')).map(item => ({ kind: 'node' as const, item })),
      ...(model.regions ?? []).filter(() => filter === 'all' || filter === 'stack-scope').map(item => ({ kind: 'region' as const, item })),
    ];
    return candidates.flatMap(result => {
      const match = matchAnalyzerSearch(analyzerEntitySearchDocument(result.item), search);
      return match ? [{ result, match, label: result.item.label, path: result.item.subtitle, id: result.item.id }] : [];
    }).sort(compareAnalyzerSearchResults).map(({ result }) => result);
  }, [model, search, view, filter, is3D]);

  const fallbackCounts = useMemo(() => {
    if (!model) return { visibleNodes: 0, totalNodes: 0, hiddenNodes: 0 };
    if (view === 'module-dependency') {
      const totalNodes = model.nodes.filter((node) => node.type === 'module').length;
      return { visibleNodes: 0, totalNodes, hiddenNodes: totalNodes };
    }
    const presented = presentAnalyzerView(model, { expandedPresentationIds, filter, search: '', selectedEdgeId, selectedNodeId, selectedRegionId });
    return presented.counts ?? analyzerViewCounts(model);
  }, [expandedPresentationIds, filter, model, selectedEdgeId, selectedNodeId, selectedRegionId, view]);
  const nodeCounts = reportedCounts && reportedCounts.model === model ? reportedCounts.counts : fallbackCounts;

  useEffect(() => {
    setActiveView(view);
    if (viewState !== storedViewState) updateView(view, viewState);
  }, [setActiveView, storedViewState, updateView, view, viewState]);

  useEffect(() => {
    setFocusRequest(undefined);
    setReportedCounts(undefined);
    setSelectionNotice(undefined);
  }, [view, store]);

  const handleScanned = (nextStore: AnalyzerProjectStore, folderHandle?: DirectoryHandleLike) => {
    replaceProject(nextStore, folderHandle);
    setFocusRequest(undefined);
    setReportedCounts(undefined);
  };

  const requestFocus = useCallback((entityId: string) => {
    setFocusRequest({ view, store, entityId, nonce: ++focusNonce.current });
  }, [view, store]);
  const focusedRoute = useRef<string | undefined>(undefined);
  useEffect(() => {
    const target = location.state?.analyzerFocus as { view?: string; id?: string; scanVersion?: number } | undefined;
    if (focusedRoute.current === location.key || !target?.id || target.view !== view || target.scanVersion !== session.scanVersion || !model?.nodes.some(node => node.id === target.id)) return;
    focusedRoute.current = location.key; requestFocus(target.id);
  }, [location.key, location.state, model, requestFocus, session.scanVersion, view]);

  const updateCamera = useCallback((update: AnalyzerGraphTransform | ((current: AnalyzerGraphTransform) => AnalyzerGraphTransform)) => {
    updateView(view, (current) => ({
      ...current,
      camera: typeof update === 'function'
        ? update(current.camera ?? ANALYZER_DEFAULT_TRANSFORM)
        : update,
    }));
  }, [updateView, view]);

  const reportCounts = useCallback((counts: AnalyzerViewCounts) => {
    if (!model) return;
    setReportedCounts((current) => current?.model === model
      && current.counts.visibleNodes === counts.visibleNodes
      && current.counts.totalNodes === counts.totalNodes
      && current.counts.hiddenNodes === counts.hiddenNodes
      ? current
      : { model, counts });
  }, [model]);

  const selectNode = useCallback((nodeId: string, focus = false) => {
    setSelectionNotice(undefined);
    // Spatial ownership extracts the selected entity from a closed scope. A
    // selection must not turn that temporary exception into a directory opening.
    updateView(view, {
      selectedNodeId: nodeId,
      selectedRegionId: undefined,
      selectedEdgeId: undefined,
      detailOpen: true,
    });
    if (focus) requestFocus(nodeId); else setFocusRequest(undefined);
  }, [requestFocus, updateView, view]);

  const selectRegion = useCallback((regionId: string, focus = false) => {
    setSelectionNotice(undefined);
    const expanded = new Set(expandedPresentationIds);
    if (view === 'module-dependency' && !is3D) {
      if (expanded.size === 0) {
        model?.regions?.filter((region) => region.regionKind === 'directory').forEach((region) => expanded.add(region.id));
      }
      const regionById = new Map((model?.regions ?? []).map((region) => [region.id, region]));
      const visited = new Set<string>();
      let current = regionById.get(regionId);
      while (current && !visited.has(current.id)) {
        expanded.add(current.id);
        visited.add(current.id);
        current = current.parentRegionId ? regionById.get(current.parentRegionId) : undefined;
      }
    }
    updateView(view, {
      selectedNodeId: undefined,
      selectedRegionId: regionId,
      selectedEdgeId: undefined,
      detailOpen: true,
      ...(expanded.size !== expandedPresentationIds.size ? { expandedPresentationIds: expanded } : {}),
    });
    if (focus) requestFocus(regionId); else setFocusRequest(undefined);
  }, [expandedPresentationIds, model, requestFocus, updateView, view, is3D]);

  const selectEdge = useCallback((edgeId: string) => {
    setSelectionNotice(undefined);
    setFocusRequest(undefined);
    updateView(view, {
      selectedEdgeId: edgeId,
      selectedNodeId: undefined,
      selectedRegionId: undefined,
      detailOpen: true,
    });
  }, [updateView, view]);

  const clearSelection = useCallback(() => {
    setFocusRequest(undefined);
    updateView(view, { selectedNodeId: undefined, selectedRegionId: undefined, selectedEdgeId: undefined, detailOpen: false });
  }, [updateView, view]);

  const focusConnection = useCallback((sourceId: string, targetId: string) => {
    if (view !== 'module-dependency' || !model) return;
    const relation = model.edges.find(edge => edge.sourceId === sourceId && edge.targetId === targetId);
    if (relation) updateView(view, { selectedEdgeId: relation.id, selectedNodeId: undefined, selectedRegionId: undefined, detailOpen: true });
    setFocusRequest({ view, store, entityId: sourceId, entityIds: [sourceId, targetId], nonce: ++focusNonce.current });
  }, [model, updateView, view, store]);

  const closeDetail = useCallback(() => {
    updateView(view, { detailOpen: false });
  }, [updateView, view]);

  const togglePresentation = useCallback((presentationId: string, options: { select?: boolean } = {}) => {
    if (!model) return;
    if (is3D && (view === 'dependencies' || view === 'module-dependency')) {
      const summary = model.nodes.find(node => node.id === presentationId);
      const groupIds = presentationId === ANALYZER_EXTERNAL_SUMMARY_ID
        ? [...new Set(model.nodes.filter(node => node.type === 'external-package' && node.presentation?.role !== 'summary').map(node => String(node.metadata.externalGroupId ?? node.type)))]
        : [String(summary?.metadata.externalGroupId ?? presentationId)];
      const expandedGroupIds = new Set(viewState.graph3DAggregation?.expandedGroupIds ?? []), collapsedGroupIds = new Set(viewState.graph3DAggregation?.collapsedGroupIds ?? []);
      const open = groupIds.every(id => !collapsedGroupIds.has(id));
      for (const id of groupIds) { if (open) { collapsedGroupIds.add(id); expandedGroupIds.delete(id); } else { expandedGroupIds.add(id); collapsedGroupIds.delete(id); } }
      updateView(view, { graph3DAggregation: { expandedGroupIds: [...expandedGroupIds], collapsedGroupIds: [...collapsedGroupIds] } });
      return;
    }
    const next = new Set(expandedPresentationIds);
    if (view === 'module-dependency' && next.size === 0) {
      // Empty is the initial fully expanded atlas. Materialize that state
      // before the first toggle, including package IDs so all directories
      // can be collapsed without reverting to the initial overview.
      model.regions?.forEach((region) => next.add(region.id));
    }
    const currentlyExpanded = next.has(presentationId);

    const selectedNodeIsDescendant = Boolean(selectedNodeId && presentationOwnsNode(model, presentationId, selectedNodeId));
    const selectedEdgeTouchesDescendant = Boolean(selectedEdgeId && (() => {
      const selectedEdge = model.edges.find((edge) => edge.id === selectedEdgeId);
      return selectedEdge
        ? presentationOwnsNode(model, presentationId, selectedEdge.sourceId) || presentationOwnsNode(model, presentationId, selectedEdge.targetId)
        : false;
    })());
    const effectivelyExpanded = currentlyExpanded || selectedNodeIsDescendant || selectedEdgeTouchesDescendant;
    if (effectivelyExpanded) next.delete(presentationId);
    else next.add(presentationId);
    const shouldFallbackToSummary = effectivelyExpanded && (selectedNodeIsDescendant || selectedEdgeTouchesDescendant);
    updateView(view, {
      expandedPresentationIds: next,
      ...(options.select || shouldFallbackToSummary
        ? { selectedNodeId: presentationId, selectedRegionId: undefined, selectedEdgeId: undefined, detailOpen: true }
        : {}),
    });
  }, [expandedPresentationIds, model, selectedEdgeId, selectedNodeId, updateView, view, is3D, viewState.graph3DAggregation]);

  const externalPresentationIds = useMemo(() => model?.nodes
    .filter((node) => node.presentation?.role === 'summary'
      && (node.id === ANALYZER_EXTERNAL_SUMMARY_ID || typeof node.metadata.externalGroupId === 'string'))
    .map((node) => node.id) ?? [], [model]);
  const externalExpanded = Boolean(model
    && expandedPresentationIds.has(ANALYZER_EXTERNAL_SUMMARY_ID)
    && externalPresentationIds.every((presentationId) => expandedPresentationIds.has(presentationId)));

  const toggleExternal = useCallback(() => {
    if (!model) return;
    const isExpanded = externalPresentationIds.length > 0
      && externalPresentationIds.every((presentationId) => expandedPresentationIds.has(presentationId));
    const next = new Set(expandedPresentationIds);
    externalPresentationIds.forEach((presentationId) => {
      if (isExpanded) next.delete(presentationId);
      else next.add(presentationId);
    });
    const update: Partial<AnalyzerViewSession> = { expandedPresentationIds: next };
    if (isExpanded) {
      const selectedNodeIsDescendant = Boolean(selectedNodeId && presentationOwnsNode(model, ANALYZER_EXTERNAL_SUMMARY_ID, selectedNodeId));
      const selectedEdgeTouchesDescendant = Boolean(selectedEdgeId && (() => {
        const selectedEdge = model.edges.find((edge) => edge.id === selectedEdgeId);
        return selectedEdge
          ? presentationOwnsNode(model, ANALYZER_EXTERNAL_SUMMARY_ID, selectedEdge.sourceId)
            || presentationOwnsNode(model, ANALYZER_EXTERNAL_SUMMARY_ID, selectedEdge.targetId)
            : false;
      })());
      if (selectedNodeIsDescendant || selectedEdgeTouchesDescendant) {
        update.selectedNodeId = ANALYZER_EXTERNAL_SUMMARY_ID;
        update.selectedRegionId = undefined;
        update.selectedEdgeId = undefined;
        update.detailOpen = true;
      }
    }
    updateView(view, update);
  }, [expandedPresentationIds, externalPresentationIds, model, selectedEdgeId, selectedNodeId, updateView, view]);

  const [detailLabelFocus,setDetailLabelFocus]=useState<string>();
  useEffect(()=>setDetailLabelFocus(undefined),[view,store,selectedNodeId,selectedRegionId,selectedEdgeId,is3D]);
  const activeFocusRequest = focusRequest?.view === view && focusRequest.store === store ? focusRequest : undefined;

  const changeEntry = (value: string) => {
              if (!store) return;
              if (is3D && (selectedNodeId || selectedRegionId || selectedEdgeId)) {
                const nextModel = projectAnalyzerView(store, view, value || undefined);
                const valid = selectedNodeId ? nextModel.nodes.some(node => node.id === selectedNodeId) : selectedEdgeId ? nextModel.edges.some(edge => edge.id === selectedEdgeId) : nextModel.regions?.some(region => region.id === selectedRegionId);
                setSelectionNotice(valid ? undefined : '選択対象が新しい開始スクリプトの範囲外になったため、選択を解除しました。');
              }
              updateView(view, { entryScriptId: value || undefined });
            };
  const entryControl=fullscreen.isFullscreen&&view==='command'?<CommandEntryControl compact scripts={scripts} entryScriptId={effectiveEntryScriptId} onChange={changeEntry}/>:undefined;
  return (
    <div className="page-stack analyzer-page">
      <AnalyzerProjectHeader onScanned={handleScanned} />

      {!store || !model ? (
        <AnalyzerEmptyState />
      ) : (
        <section className="analyzer-shell" aria-labelledby="analyzer-view-title">
          <AnalyzerViewHeading view={view}>
              <span>{store.files.length} files indexed</span>
              <span>{store.facts.length} facts · {store.evidence.length} evidence</span>
          </AnalyzerViewHeading>

          <AnalyzerToolbar
            view={view}
            search={search}
            onSearchChange={(value) => updateView(view, { search: value })}
            filter={filter}
            onFilterChange={(value) => {
              const includes = (id: string) => value === 'all' || model.nodes.some(node => node.id === id && node.type === value)
                || value === 'stack-scope' && Boolean(model.regions?.some(region => region.id === id));
              const selectedEdge = model.edges.find(edge => edge.id === selectedEdgeId);
              const selectedIds = selectedEdge ? [selectedEdge.sourceId, selectedEdge.targetId] : [selectedNodeId, selectedRegionId].filter((id): id is string => Boolean(id));
              const invalid = selectedIds.some(id => !includes(id));
              setFocusRequest(undefined);
              updateView(view, { filter: value, ...(invalid ? { selectedNodeId: undefined, selectedRegionId: undefined, selectedEdgeId: undefined, detailOpen: false } : {}) });
            }}
            externalExpanded={externalExpanded}
            externalToggleAvailable={!is3D && externalPresentationIds.length > 0}
            onToggleExternal={toggleExternal}
            scripts={scripts}
            entryScriptId={effectiveEntryScriptId}
            onEntryChange={changeEntry}
            counts={nodeCounts}
          />

          <div className="analyzer-render-notices">
            {unavailable3D && <span role="status">3D描画を利用できないため2Dに戻りました。3Dボタンから再試行できます。</span>}
            {selectionNotice && <span role="status">{selectionNotice}</span>}
          </div>

          <SearchResultStrip query={search} selectedId={selectedNodeId ?? selectedRegionId}
            items={searchResults.map(result => ({ id: result.item.id, label: result.item.label,
              subtitle: String(result.item.metadata.modulePath ?? result.item.metadata.scopePath ?? result.item.metadata.packagePath ?? result.item.subtitle ?? ''),
              reason: matchAnalyzerSearch(analyzerEntitySearchDocument(result.item), search)?.reason }))}
            onSelect={id => { const result = searchResults.find(result => result.item.id === id); if (result?.kind === 'region') selectRegion(id, true); else selectNode(id, true); }} />

          <div ref={fullscreen.root} className={`analyzer-workspace${detailOpen ? ' has-detail' : ''}${fullscreen.isFullscreen ? ' is-fullscreen' : ''}`}
            role={fullscreen.isFullscreen ? 'dialog' : undefined} aria-modal={fullscreen.isFullscreen || undefined}
            aria-label={fullscreen.isFullscreen ? `${analyzerViewLabels[view]} 全画面表示` : undefined} onKeyDownCapture={fullscreen.onKeyDownCapture}>
            {is3D ? (
              <AnalyzerRenderBoundary key={`3d-boundary:${view}:${session.scanVersion}`} onUnavailable={() => { setUnavailable3D(true); updateView(view, { graphMode: '2d' }); }}>
              <Suspense fallback={<div className="analyzer-graph-stage"><p role="status">3D表示を読み込み中…</p></div>}>
                <AnalyzerGraph3DStage labelFocusId={detailLabelFocus} controlsExtras={entryControl} onMode={switchMode} key={`3d:${view}:${session.scanVersion}:${model.entryScriptId ?? ''}`} model={model} state={viewState} input={`${session.scanVersion}:${store.scannedAt}:${model.entryScriptId ?? ''}`}
                  onCamera={graph3DCamera => updateView(view, { graph3DCamera })}
                  onUnavailable={() => { setUnavailable3D(true); updateView(view, { graphMode: '2d' }); }}
                  onSelectNode={selectNode} onSelectRegion={selectRegion} onSelectEdge={selectEdge} onClear={clearSelection}
                  onTogglePresentation={id => togglePresentation(id)} focusRequest={activeFocusRequest}
                  autoAggregation={session.autoAggregation ?? true} onAutoAggregation={setAutoAggregation}
                  showGroupBounds={session.showFlowGroupBounds ?? true} onGroupBounds={setFlowGroupBounds}
                  onAggregation={graph3DAggregation => updateView(view, { graph3DAggregation })}
                  onCounts={reportCounts} isFullscreen={fullscreen.isFullscreen} onFullscreen={fullscreen.toggle} />
              </Suspense>
              </AnalyzerRenderBoundary>
            ) : view === 'module-dependency' ? (
              <AnalyzerRenderBoundary key={`2d-boundary:${view}:${session.scanVersion}`}>
              <Suspense fallback={<div className="analyzer-graph-stage analyzer-spatial-graph-stage"><div className="analyzer-graph-empty">Loading spatial renderer…</div></div>}>
                <AnalyzerSpatialGraphStage
                  onMode={switchMode}
                  key={`${view}:${session.scanVersion}`}
                  view={model}
                  autoAggregation={session.autoAggregation ?? true} onAutoAggregation={setAutoAggregation}
                  aggregationState={viewState.aggregation} onAggregationState={aggregation => updateView(view, { aggregation })}
                  showGroupBounds={session.showFlowGroupBounds ?? true} onGroupBounds={setFlowGroupBounds}
                  selectedNodeId={selectedNodeId}
                  selectedRegionId={selectedRegionId}
                  selectedEdgeId={selectedEdgeId}
                  filter={filter}
                  search={search}
                  expandedPresentationIds={expandedPresentationIds}
                  onTogglePresentation={(presentationId) => togglePresentation(presentationId)}
                  onClearSelection={clearSelection}
                  onSelectNode={selectNode}
                  onSelectRegion={selectRegion}
                  onSelectEdge={selectEdge}
                  focusRequest={activeFocusRequest}
                  transform={viewState.camera ?? ANALYZER_DEFAULT_TRANSFORM}
                  hasStoredCamera={isCompatibleSpatialCameraTransform(viewState.camera)}
                  onTransformChange={updateCamera}
                  cameraResetKey={session.scanVersion}
                  onCountsChange={reportCounts}
                  isFullscreen={fullscreen.isFullscreen}
                  onToggleFullscreen={fullscreen.toggle}
                />
              </Suspense>
              </AnalyzerRenderBoundary>
            ) : (
              <AnalyzerGraphStage controlsExtras={entryControl}
                onMode={switchMode}
                view={model}
                isFullscreen={fullscreen.isFullscreen}
                onToggleFullscreen={fullscreen.toggle}
                selectedNodeId={selectedNodeId}
                selectedRegionId={selectedRegionId}
                selectedEdgeId={selectedEdgeId}
                filter={filter}
                search={search}
                expandedPresentationIds={expandedPresentationIds}
                onTogglePresentation={(presentationId) => togglePresentation(presentationId, { select: true })}
                onClearSelection={clearSelection}
                sources={store.sources}
                onSelectNode={selectNode}
                onSelectRegion={selectRegion}
                onSelectEdge={selectEdge}
                focusRequest={activeFocusRequest}
                transform={viewState.camera ?? ANALYZER_DEFAULT_TRANSFORM}
                hasStoredCamera={Boolean(viewState.camera)}
                onTransformChange={updateCamera}
                cameraResetKey={session.scanVersion}
                onCountsChange={reportCounts}
              />
            )}
            {detailOpen && (
              <AnalyzerDetailPanel onLabelFocus={is3D ? setDetailLabelFocus : undefined}
                spatialDetails={is3D}
                store={store}
                view={model}
                selectedNodeId={selectedNodeId}
                selectedRegionId={selectedRegionId}
                selectedEdgeId={selectedEdgeId}
                expandedPresentationIds={expandedPresentationIds}
                onSelectNode={selectNode}
                onSelectRegion={selectRegion}
                onTogglePresentation={(presentationId) => togglePresentation(presentationId, { select: true })}
                onClose={closeDetail}
                onFocusConnection={view === 'module-dependency' ? focusConnection : undefined}
              />
            )}
          </div>

          {model.warnings.length > 0 && (
            <section className="analyzer-warnings" aria-labelledby="analyzer-warnings-title">
              <div>
                <p className="analyzer-panel-kicker">Diagnostics</p>
                <h3 id="analyzer-warnings-title">Warnings ({model.warnings.length})</h3>
              </div>
              <ul>{model.warnings.map((warning) => <li key={warning.id}><strong>{warning.filePath ?? 'Project'}</strong><span>{warning.message}</span></li>)}</ul>
            </section>
          )}
        </section>
      )}
    </div>
  );
}
