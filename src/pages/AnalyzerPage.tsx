import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ANALYZER_DEFAULT_TRANSFORM, ANALYZER_EXTERNAL_SUMMARY_ID, analyzerViewCounts, analyzerViewLabels, isCompatibleSpatialCameraTransform, presentationOwnsNode, presentAnalyzerView, projectAnalyzerView, regionMatchesSearch, restoreAnalyzerViewSession, useAnalyzerSession, viewNodeSearchText } from '../analyzer';
import type { AnalyzerGraphTransform, AnalyzerProjectStore, AnalyzerSemanticRegion, AnalyzerViewCounts, AnalyzerViewId, AnalyzerViewModel, AnalyzerViewNode, AnalyzerViewSession, DirectoryHandleLike } from '../analyzer';
import { AnalyzerDetailPanel } from '../components/analyzer/AnalyzerDetailPanel';
import { AnalyzerEmptyOrbit } from '../components/analyzer/AnalyzerEmptyOrbit';
import { AnalyzerGraphStage } from '../components/analyzer/AnalyzerGraphStage';
import { AnalyzerProjectPicker } from '../components/analyzer/AnalyzerProjectPicker';
import { AnalyzerToolbar } from '../components/analyzer/AnalyzerToolbar';
import { useWorkspaceFullscreen } from '../components/analyzer/useWorkspaceFullscreen';

const viewIds = new Set<AnalyzerViewId>(['architecture', 'workspace', 'command', 'dependencies', 'module-dependency']);
const AnalyzerSpatialGraphStage = lazy(async () => {
  const module = await import('../components/analyzer/AnalyzerSpatialGraphStage');
  return { default: module.AnalyzerSpatialGraphStage };
});

type AnalyzerSearchResult =
  | { kind: 'node'; item: AnalyzerViewNode }
  | { kind: 'region'; item: AnalyzerSemanticRegion };

function viewFromPath(pathname: string): AnalyzerViewId {
  const lastSegment = pathname.split('/').filter(Boolean).at(-1);
  return lastSegment && viewIds.has(lastSegment as AnalyzerViewId) ? lastSegment as AnalyzerViewId : 'architecture';
}

export function AnalyzerPage() {
  const location = useLocation();
  const view = viewFromPath(location.pathname);
  const { state: session, replaceProject, setActiveView, updateView } = useAnalyzerSession();
  const store = session.store;
  const fullscreen = useWorkspaceFullscreen(view === 'module-dependency' && Boolean(store));
  const storedViewState = session.views[view];
  const [focusRequest, setFocusRequest] = useState<{ view: AnalyzerViewId; entityId: string; nonce: number; entityIds?: string[] }>();
  const [reportedCounts, setReportedCounts] = useState<{ model: AnalyzerViewModel; counts: AnalyzerViewCounts }>();

  const model = useMemo(() => store ? projectAnalyzerView(store, view, storedViewState.entryScriptId) : undefined, [store, storedViewState.entryScriptId, view]);
  const viewState = useMemo(() => model ? restoreAnalyzerViewSession(storedViewState, model) : storedViewState, [model, storedViewState]);
  const { selectedNodeId, selectedRegionId, selectedEdgeId, search, filter, expandedPresentationIds, entryScriptId, detailOpen } = viewState;
  const scripts = useMemo(() => store?.facts.filter((fact) => fact.kind === 'package-script') ?? [], [store]);
  const effectiveEntryScriptId = entryScriptId ?? model?.entryScriptId;
  const searchResults = useMemo<AnalyzerSearchResult[]>(() => {
    if (!model || !search.trim()) return [];
    const nodes: AnalyzerSearchResult[] = model.nodes
      .filter((node) => viewNodeSearchText(node).includes(search.trim().toLowerCase()))
      .map((item) => ({ kind: 'node', item }));
    const regions: AnalyzerSearchResult[] = (model.regions ?? [])
      .filter((region) => regionMatchesSearch(region, search))
      .map((item) => ({ kind: 'region', item }));
    return [...nodes, ...regions].slice(0, 8);
  }, [model, search]);

  const fallbackCounts = useMemo(() => {
    if (!model) return { visibleNodes: 0, totalNodes: 0, hiddenNodes: 0 };
    if (view === 'module-dependency') {
      const totalNodes = model.nodes.filter((node) => node.type === 'module').length;
      return { visibleNodes: 0, totalNodes, hiddenNodes: totalNodes };
    }
    const presented = presentAnalyzerView(model, { expandedPresentationIds, filter, search, selectedEdgeId, selectedNodeId, selectedRegionId });
    return presented.counts ?? analyzerViewCounts(model);
  }, [expandedPresentationIds, filter, model, search, selectedEdgeId, selectedNodeId, selectedRegionId, view]);
  const nodeCounts = reportedCounts && reportedCounts.model === model ? reportedCounts.counts : fallbackCounts;

  useEffect(() => {
    setActiveView(view);
    if (viewState !== storedViewState) updateView(view, viewState);
  }, [setActiveView, storedViewState, updateView, view, viewState]);

  useEffect(() => {
    setFocusRequest(undefined);
    setReportedCounts(undefined);
  }, [view]);

  const handleScanned = (nextStore: AnalyzerProjectStore, folderHandle?: DirectoryHandleLike) => {
    replaceProject(nextStore, folderHandle);
    setFocusRequest(undefined);
    setReportedCounts(undefined);
  };

  const requestFocus = useCallback((entityId: string) => {
    setFocusRequest((current) => ({ view, entityId, nonce: (current?.nonce ?? 0) + 1 }));
  }, [view]);

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
    const node = model?.nodes.find((candidate) => candidate.id === nodeId);
    const expanded = new Set(expandedPresentationIds);
    if (view === 'module-dependency' && expanded.size === 0) {
      model?.regions?.filter((region) => region.regionKind === 'directory').forEach((region) => expanded.add(region.id));
    }
    if (view === 'module-dependency' && node) {
      const regionPath = node.metadata.regionPath;
      if (Array.isArray(regionPath)) regionPath.forEach((regionId) => expanded.add(regionId));
    }
    updateView(view, {
      selectedNodeId: nodeId,
      selectedRegionId: undefined,
      selectedEdgeId: undefined,
      detailOpen: true,
      ...(expanded.size !== expandedPresentationIds.size ? { expandedPresentationIds: expanded } : {}),
    });
    if (focus) requestFocus(nodeId);
  }, [expandedPresentationIds, model, requestFocus, updateView, view]);

  const selectRegion = useCallback((regionId: string, focus = false) => {
    const expanded = new Set(expandedPresentationIds);
    if (view === 'module-dependency') {
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
    if (focus) requestFocus(regionId);
  }, [expandedPresentationIds, model, requestFocus, updateView, view]);

  const selectEdge = useCallback((edgeId: string) => {
    const expanded = new Set(expandedPresentationIds);
    if (view === 'module-dependency') {
      if (expanded.size === 0) {
        model?.regions?.filter((region) => region.regionKind === 'directory').forEach((region) => expanded.add(region.id));
      }
      const edge = model?.edges.find((candidate) => candidate.id === edgeId);
      const regionById = new Map((model?.regions ?? []).map((region) => [region.id, region]));
      [edge?.sourceId, edge?.targetId].forEach((nodeId) => {
        const node = model?.nodes.find((candidate) => candidate.id === nodeId);
        const path = node ? node.metadata.regionPath : [];
        if (!Array.isArray(path)) return;
        path.forEach((regionId) => {
          const region = regionById.get(regionId);
          if (region?.regionKind === 'directory') expanded.add(regionId);
        });
      });
    }
    updateView(view, {
      selectedEdgeId: edgeId,
      selectedNodeId: undefined,
      selectedRegionId: undefined,
      detailOpen: true,
      ...(expanded.size !== expandedPresentationIds.size ? { expandedPresentationIds: expanded } : {}),
    });
  }, [expandedPresentationIds, model, updateView, view]);

  const clearSelection = useCallback(() => {
    updateView(view, { selectedNodeId: undefined, selectedRegionId: undefined, selectedEdgeId: undefined, detailOpen: false });
  }, [updateView, view]);

  const focusConnection = useCallback((sourceId: string, targetId: string) => {
    if (view !== 'module-dependency' || !model) return;
    const expanded = new Set(expandedPresentationIds);
    if (expanded.size === 0) model.regions?.forEach(region => expanded.add(region.id));
    for (const id of [sourceId, targetId]) {
      const path = model.nodes.find(node => node.id === id)?.metadata.regionPath;
      if (Array.isArray(path)) path.forEach(regionId => expanded.add(regionId));
    }
    const relation = model.edges.find(edge => edge.sourceId === sourceId && edge.targetId === targetId);
    updateView(view, { expandedPresentationIds: expanded, ...(relation ? { selectedEdgeId: relation.id, selectedNodeId: undefined, selectedRegionId: undefined, detailOpen: true } : {}) });
    setFocusRequest(current => ({ view, entityId: sourceId, entityIds: [sourceId, targetId], nonce: (current?.nonce ?? 0) + 1 }));
  }, [expandedPresentationIds, model, updateView, view]);

  const closeDetail = useCallback(() => {
    updateView(view, { detailOpen: false });
  }, [updateView, view]);

  const togglePresentation = useCallback((presentationId: string, options: { select?: boolean } = {}) => {
    if (!model) return;
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
  }, [expandedPresentationIds, model, selectedEdgeId, selectedNodeId, updateView, view]);

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

  const resetPresentation = useCallback(() => {
    updateView(view, {
      expandedPresentationIds: new Set(),
      search: '',
      filter: 'all',
      selectedNodeId: undefined,
      selectedRegionId: undefined,
      selectedEdgeId: undefined,
      detailOpen: false,
    });
    setFocusRequest(undefined);
  }, [updateView, view]);

  useEffect(() => {
    // Tab 5 search highlights candidates; only an explicit choice selects one.
    // Otherwise clearing selection while a unique search is active reselects it.
    if (view === 'module-dependency') return;
    if (!search.trim() || searchResults.length !== 1 || selectedNodeId || selectedRegionId || selectedEdgeId) return;
    const [result] = searchResults;
    if (!result) return;
    if (result.kind === 'region') selectRegion(result.item.id, true);
    else selectNode(result.item.id, true);
  }, [search, searchResults, selectedEdgeId, selectedNodeId, selectedRegionId, selectNode, selectRegion, view]);

  const activeFocusRequest = focusRequest?.view === view ? focusRequest : undefined;

  return (
    <div className="page-stack analyzer-page">
      <section className="page-intro analyzer-intro">
        <div>
          <p className="eyebrow">04 / LOCAL ANALYSIS</p>
          <h1>Analyzer</h1>
          <p className="intro-copy">プロジェクトをScopeごとに分け、どのCanonical Stackを使っているかを直接Evidenceとともにたどります。</p>
        </div>
        <AnalyzerProjectPicker onScanned={handleScanned} />
      </section>

      {!store || !model ? (
        <section className="analyzer-empty-state" aria-labelledby="analyzer-empty-title">
          <AnalyzerEmptyOrbit />
          <div>
            <p className="analyzer-panel-kicker">Private by default</p>
            <h2 id="analyzer-empty-title">解析するProject Folderを選択してください</h2>
            <p>選択したsourceはこのBrowser内だけで読み取ります。Cloudflareや外部APIへアップロードせず、Reloadすると再選択が必要です。</p>
            <ul>
              <li>package.json / pnpm-workspace.yaml</li>
              <li>Wrangler / Firebase / .NET project configuration</li>
              <li>直接のsource rangeを持つEvidence</li>
            </ul>
          </div>
        </section>
      ) : (
        <section className="analyzer-shell" aria-labelledby="analyzer-view-title">
          <div className="analyzer-shell-heading">
            <div>
              <p className="section-kicker">Evidence Graph</p>
              <h2 id="analyzer-view-title">{analyzerViewLabels[view]}</h2>
            </div>
            <div className="analyzer-scan-meta">
              <span>{store.files.length} files indexed</span>
              <span>{store.facts.length} facts · {store.evidence.length} evidence</span>
            </div>
          </div>

          <AnalyzerToolbar
            view={view}
            search={search}
            onSearchChange={(value) => updateView(view, { search: value })}
            filter={filter}
            onFilterChange={(value) => updateView(view, { filter: value })}
            externalExpanded={externalExpanded}
            onToggleExternal={toggleExternal}
            scripts={scripts}
            entryScriptId={effectiveEntryScriptId}
            onEntryChange={(value) => updateView(view, { entryScriptId: value || undefined })}
            counts={nodeCounts}
          />

          {searchResults.length > 0 && (
            <div className="analyzer-search-results" role="listbox" aria-label="Analyzer search results">
              {searchResults.map((result) => (
                <button key={`${result.kind}:${result.item.id}`} type="button" onClick={() => result.kind === 'region' ? selectRegion(result.item.id, true) : selectNode(result.item.id, true)}>
                  <span>{result.kind === 'region' ? 'REGION / SCOPE' : result.item.type}</span>
                  <strong>{result.item.label}</strong>
                  {result.item.subtitle && <small>{result.item.subtitle}</small>}
                </button>
              ))}
            </div>
          )}

          <div ref={fullscreen.root} className={`analyzer-workspace${detailOpen ? ' has-detail' : ''}${fullscreen.isFullscreen ? ' is-fullscreen' : ''}`}
            role={fullscreen.isFullscreen ? 'dialog' : undefined} aria-modal={fullscreen.isFullscreen || undefined}
            aria-label={fullscreen.isFullscreen ? 'Module Dependency 全画面表示' : undefined} onKeyDownCapture={fullscreen.onKeyDownCapture}>
            {view === 'module-dependency' ? (
              <Suspense fallback={<div className="analyzer-graph-stage analyzer-spatial-graph-stage"><div className="analyzer-graph-empty">Loading spatial renderer…</div></div>}>
                <AnalyzerSpatialGraphStage
                  view={model}
                  selectedNodeId={selectedNodeId}
                  selectedRegionId={selectedRegionId}
                  selectedEdgeId={selectedEdgeId}
                  filter={filter}
                  search={search}
                  expandedPresentationIds={expandedPresentationIds}
                  onTogglePresentation={(presentationId) => togglePresentation(presentationId)}
                  onClearSelection={clearSelection}
                  onResetPresentation={resetPresentation}
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
            ) : (
              <AnalyzerGraphStage
                view={model}
                selectedNodeId={selectedNodeId}
                selectedRegionId={selectedRegionId}
                selectedEdgeId={selectedEdgeId}
                filter={filter}
                search={search}
                expandedPresentationIds={expandedPresentationIds}
                onTogglePresentation={(presentationId) => togglePresentation(presentationId, { select: true })}
                onClearSelection={clearSelection}
                onResetPresentation={resetPresentation}
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
              <AnalyzerDetailPanel
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
