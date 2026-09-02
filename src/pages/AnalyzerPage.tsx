import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ANALYZER_DEFAULT_TRANSFORM, ANALYZER_EXTERNAL_SUMMARY_ID, analyzerViewCounts, analyzerViewLabels, presentationOwnsNode, presentAnalyzerView, projectAnalyzerView, restoreAnalyzerViewSession, useAnalyzerSession, viewNodeSearchText } from '../analyzer';
import type { AnalyzerGraphTransform, AnalyzerProjectStore, AnalyzerViewCounts, AnalyzerViewId, AnalyzerViewModel, AnalyzerViewSession, DirectoryHandleLike } from '../analyzer';
import { AnalyzerDetailPanel } from '../components/analyzer/AnalyzerDetailPanel';
import { AnalyzerEmptyOrbit } from '../components/analyzer/AnalyzerEmptyOrbit';
import { AnalyzerGraphStage } from '../components/analyzer/AnalyzerGraphStage';
import { AnalyzerProjectPicker } from '../components/analyzer/AnalyzerProjectPicker';
import { AnalyzerToolbar } from '../components/analyzer/AnalyzerToolbar';

const viewIds = new Set<AnalyzerViewId>(['architecture', 'workspace', 'command', 'dependencies']);

function viewFromPath(pathname: string): AnalyzerViewId {
  const lastSegment = pathname.split('/').filter(Boolean).at(-1);
  return lastSegment && viewIds.has(lastSegment as AnalyzerViewId) ? lastSegment as AnalyzerViewId : 'architecture';
}

export function AnalyzerPage() {
  const location = useLocation();
  const view = viewFromPath(location.pathname);
  const { state: session, replaceProject, setActiveView, updateView } = useAnalyzerSession();
  const store = session.store;
  const storedViewState = session.views[view];
  const [focusRequest, setFocusRequest] = useState<{ view: AnalyzerViewId; nodeId: string; nonce: number }>();
  const [reportedCounts, setReportedCounts] = useState<{ model: AnalyzerViewModel; counts: AnalyzerViewCounts }>();

  const model = useMemo(() => store ? projectAnalyzerView(store, view, storedViewState.entryScriptId) : undefined, [store, storedViewState.entryScriptId, view]);
  const viewState = useMemo(() => model ? restoreAnalyzerViewSession(storedViewState, model) : storedViewState, [model, storedViewState]);
  const { selectedNodeId, selectedEdgeId, search, filter, expandedPresentationIds, entryScriptId, detailOpen } = viewState;
  const scripts = useMemo(() => store?.facts.filter((fact) => fact.kind === 'package-script') ?? [], [store]);
  const effectiveEntryScriptId = entryScriptId ?? model?.entryScriptId;
  const searchResults = useMemo(() => {
    if (!model || !search.trim()) return [];
    return model.nodes.filter((node) => viewNodeSearchText(node).includes(search.trim().toLowerCase())).slice(0, 8);
  }, [model, search]);

  const fallbackCounts = useMemo(() => {
    if (!model) return { visibleNodes: 0, totalNodes: 0, hiddenNodes: 0 };
    const presented = presentAnalyzerView(model, { expandedPresentationIds, filter, search, selectedEdgeId, selectedNodeId });
    return presented.counts ?? analyzerViewCounts(model);
  }, [expandedPresentationIds, filter, model, search, selectedEdgeId, selectedNodeId]);
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

  const requestFocus = useCallback((nodeId: string) => {
    setFocusRequest((current) => ({ view, nodeId, nonce: (current?.nonce ?? 0) + 1 }));
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
    updateView(view, { selectedNodeId: nodeId, selectedEdgeId: undefined, detailOpen: true });
    if (focus) requestFocus(nodeId);
  }, [requestFocus, updateView, view]);

  const selectEdge = useCallback((edgeId: string) => {
    updateView(view, { selectedEdgeId: edgeId, selectedNodeId: undefined, detailOpen: true });
  }, [updateView, view]);

  const clearSelection = useCallback(() => {
    updateView(view, { selectedNodeId: undefined, selectedEdgeId: undefined, detailOpen: false });
  }, [updateView, view]);

  const closeDetail = useCallback(() => {
    updateView(view, { detailOpen: false });
  }, [updateView, view]);

  const togglePresentation = useCallback((presentationId: string, options: { select?: boolean } = {}) => {
    if (!model) return;
    const currentlyExpanded = expandedPresentationIds.has(presentationId);
    const next = new Set(expandedPresentationIds);

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
        ? { selectedNodeId: presentationId, selectedEdgeId: undefined, detailOpen: true }
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
      selectedEdgeId: undefined,
      detailOpen: false,
    });
    setFocusRequest(undefined);
  }, [updateView, view]);

  useEffect(() => {
    if (!search.trim() || searchResults.length !== 1 || selectedNodeId || selectedEdgeId) return;
    const [result] = searchResults;
    if (result) selectNode(result.id, true);
  }, [search, searchResults, selectedEdgeId, selectedNodeId, selectNode]);

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
              {searchResults.map((node) => (
                <button key={node.id} type="button" onClick={() => selectNode(node.id, true)}>
                  <span>{node.type}</span>
                  <strong>{node.label}</strong>
                  {node.subtitle && <small>{node.subtitle}</small>}
                </button>
              ))}
            </div>
          )}

          <div className={`analyzer-workspace${detailOpen ? ' has-detail' : ''}`}>
            <AnalyzerGraphStage
              view={model}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              filter={filter}
              search={search}
              expandedPresentationIds={expandedPresentationIds}
              onTogglePresentation={(presentationId) => togglePresentation(presentationId, { select: true })}
              onClearSelection={clearSelection}
              onResetPresentation={resetPresentation}
              sources={store.sources}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
              focusRequest={activeFocusRequest}
              transform={viewState.camera ?? ANALYZER_DEFAULT_TRANSFORM}
              hasStoredCamera={Boolean(viewState.camera)}
              onTransformChange={updateCamera}
              cameraResetKey={session.scanVersion}
              onCountsChange={reportCounts}
            />
            {detailOpen && (
              <AnalyzerDetailPanel
                store={store}
                view={model}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                expandedPresentationIds={expandedPresentationIds}
                onSelectNode={selectNode}
                onTogglePresentation={(presentationId) => togglePresentation(presentationId, { select: true })}
                onClose={closeDetail}
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
