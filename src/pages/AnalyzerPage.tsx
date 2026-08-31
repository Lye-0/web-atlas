import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { projectAnalyzerView, viewNodeSearchText, analyzerViewLabels } from '../analyzer';
import type { AnalyzerProjectStore, AnalyzerViewId } from '../analyzer';
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
  const [showExternal, setShowExternal] = useState(true);
  const [entryScriptId, setEntryScriptId] = useState<string>();

  const model = useMemo(() => store ? projectAnalyzerView(store, view, entryScriptId) : undefined, [entryScriptId, store, view]);
  const scripts = useMemo(() => store?.facts.filter((fact) => fact.kind === 'package-script') ?? [], [store]);
  const effectiveEntryScriptId = entryScriptId ?? model?.entryScriptId;
  const searchResults = useMemo(() => {
    if (!model || !search.trim()) return [];
    return model.nodes.filter((node) => viewNodeSearchText(node).includes(search.trim().toLowerCase())).slice(0, 8);
  }, [model, search]);

  useEffect(() => {
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setSearch('');
    setFilter('all');
  }, [view]);

  const handleScanned = (nextStore: AnalyzerProjectStore) => {
    setStore(nextStore);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setEntryScriptId(undefined);
  };

  const selectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
  };

  const selectEdge = (edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(undefined);
  };

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
            onToggleExternal={() => setShowExternal((current) => !current)}
            scripts={scripts}
            entryScriptId={effectiveEntryScriptId}
            onEntryChange={setEntryScriptId}
            nodes={model.nodes}
          />

          {searchResults.length > 0 && (
            <div className="analyzer-search-results" role="listbox" aria-label="Analyzer search results">
              {searchResults.map((node) => (
                <button key={node.id} type="button" onClick={() => selectNode(node.id)}>
                  <span>{node.type}</span>
                  <strong>{node.label}</strong>
                  {node.subtitle && <small>{node.subtitle}</small>}
                </button>
              ))}
            </div>
          )}

          <div className="analyzer-workspace">
            <AnalyzerGraphStage
              view={model}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              filter={filter}
              search={search}
              showExternal={showExternal}
              sources={store.sources}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
            />
            <AnalyzerDetailPanel
              store={store}
              view={model}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onSelectNode={selectNode}
            />
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
