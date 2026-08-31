import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { analyzerViewCounts, presentAnalyzerView, projectAnalyzerView, viewNodeSearchText, analyzerViewLabels } from '../analyzer';
import type { AnalyzerProjectStore, AnalyzerViewCounts, AnalyzerViewId, AnalyzerViewModel } from '../analyzer';
import { AnalyzerDetailPanel } from '../components/analyzer/AnalyzerDetailPanel';
import { AnalyzerEmptyOrbit } from '../components/analyzer/AnalyzerEmptyOrbit';
import { AnalyzerGraphStage } from '../components/analyzer/AnalyzerGraphStage';
import { AnalyzerProjectPicker } from '../components/analyzer/AnalyzerProjectPicker';
import { AnalyzerToolbar, type AnalyzerFilter } from '../components/analyzer/AnalyzerToolbar';

const viewIds = new Set<AnalyzerViewId>(['architecture', 'workspace', 'command', 'dependencies']);

function viewFromPath(pathname: string): AnalyzerViewId {
  const lastSegment = pathname.split('/').filter(Boolean).at(-1);
  return lastSegment && viewIds.has(lastSegment as AnalyzerViewId) ? lastSegment as AnalyzerViewId : 'architecture';
}

export function AnalyzerPage() {
  const location = useLocation();
  const view = viewFromPath(location.pathname);
  const [store, setStore] = useState<AnalyzerProjectStore>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AnalyzerFilter>('all');
  const [showExternal, setShowExternal] = useState(false);
  const [entryScriptId, setEntryScriptId] = useState<string>();
  const [scanVersion, setScanVersion] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{ nodeId: string; nonce: number }>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [reportedCounts, setReportedCounts] = useState<{ model: AnalyzerViewModel; counts: AnalyzerViewCounts }>();

  const model = useMemo(() => store ? projectAnalyzerView(store, view, entryScriptId) : undefined, [entryScriptId, store, view]);
  const scripts = useMemo(() => store?.facts.filter((fact) => fact.kind === 'package-script') ?? [], [store]);
  const effectiveEntryScriptId = entryScriptId ?? model?.entryScriptId;
  const searchResults = useMemo(() => {
    if (!model || !search.trim()) return [];
    return model.nodes.filter((node) => viewNodeSearchText(node).includes(search.trim().toLowerCase())).slice(0, 8);
  }, [model, search]);

  const fallbackCounts = useMemo(() => {
    if (!model) return { visibleNodes: 0, totalNodes: 0, hiddenNodes: 0 };
    const presented = presentAnalyzerView(model, { expandedPresentationIds: new Set(), filter, search, selectedEdgeId, selectedNodeId, showExternal });
    return presented.counts ?? analyzerViewCounts(model);
  }, [filter, model, search, selectedEdgeId, selectedNodeId, showExternal]);
  const nodeCounts = reportedCounts && reportedCounts.model === model ? reportedCounts.counts : fallbackCounts;

  useEffect(() => {
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setSearch('');
    setFilter('all');
    setShowExternal(false);
    setFocusRequest(undefined);
    setDetailOpen(false);
    setReportedCounts(undefined);
  }, [view]);

  const handleScanned = (nextStore: AnalyzerProjectStore) => {
    setStore(nextStore);
    setScanVersion((current) => current + 1);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setEntryScriptId(undefined);
    setSearch('');
    setFilter('all');
    setShowExternal(false);
    setFocusRequest(undefined);
    setDetailOpen(false);
    setReportedCounts(undefined);
  };

  const requestFocus = useCallback((nodeId: string) => {
    setFocusRequest((current) => ({ nodeId, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

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
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    setDetailOpen(true);
    if (focus) requestFocus(nodeId);
  }, [requestFocus]);

  const selectEdge = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(undefined);
    setDetailOpen(true);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setDetailOpen(false);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
  }, []);

  const toggleExternal = useCallback(() => {
    setShowExternal((current) => !current);
    clearSelection();
  }, [clearSelection]);

  const resetPresentation = useCallback(() => {
    setShowExternal(false);
    setSearch('');
    setFilter('all');
    clearSelection();
    setFocusRequest(undefined);
  }, [clearSelection]);

  useEffect(() => {
    if (!search.trim() || searchResults.length !== 1) return;
    const [result] = searchResults;
    if (result) selectNode(result.id, true);
  }, [search, searchResults, selectNode]);

  return (
    <div className="page-stack analyzer-page">
      <section className="page-intro analyzer-intro">
        <div>
          <p className="eyebrow">04 / LOCAL ANALYSIS</p>
          <h1>Analyzer</h1>
          <p className="intro-copy">プロジェクトの構造・workspace・command・依存関係を、直接Evidenceとともにたどります。</p>
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
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
            showExternal={showExternal}
            onToggleExternal={toggleExternal}
            scripts={scripts}
            entryScriptId={effectiveEntryScriptId}
            onEntryChange={setEntryScriptId}
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
              showExternal={showExternal}
              onToggleExternal={toggleExternal}
              onClearSelection={clearSelection}
              onResetPresentation={resetPresentation}
              sources={store.sources}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
              focusRequest={focusRequest}
              cameraResetKey={scanVersion}
              onCountsChange={reportCounts}
            />
            {detailOpen && (
              <AnalyzerDetailPanel
                store={store}
                view={model}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                onSelectNode={selectNode}
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
