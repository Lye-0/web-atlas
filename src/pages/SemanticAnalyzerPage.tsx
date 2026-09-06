import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzerViewLabels, useAnalyzerSession, filesFromDirectoryHandle, scanProjectFiles } from '../analyzer';
import type { AnalyzerProjectStore, AnalyzerViewSession } from '../analyzer';
import { getSemanticAnalysis, cancelSemanticAnalysis } from '../analyzer/semantic/client';
import { confidenceLabels, kindLabels, semanticQuestions, semanticViewIds } from '../analyzer/semantic/types';
import type { SemanticAnalysis, SemanticEvidence, SemanticGraph, SemanticNode, SemanticViewId } from '../analyzer/semantic/types';
import { projectSemanticView, semanticNeighbours } from '../analyzer/semantic/project';
import { semanticPageSize, summarizeSemanticGraph } from '../analyzer/semantic/presentation';
import { importExecutionTrace } from '../analyzer/semantic/traces';
import { languageLabels } from '../analyzer/semantic/languages';
import { AnalyzerViewTabs } from '../components/analyzer/AnalyzerToolbar';
import { AnalyzerProjectPicker } from '../components/analyzer/AnalyzerProjectPicker';
import { AnalyzerEmptyOrbit } from '../components/analyzer/AnalyzerEmptyOrbit';
import { useWorkspaceFullscreen } from '../components/analyzer/useWorkspaceFullscreen';
import { analyzerRoutes } from '../utils/routes';
import { semanticTraceCache as traceCache } from '../analyzer/semantic/traceCache';
import FlowAnalyzerPage from './FlowAnalyzerPage';
import './semantic-analyzer.css';

const SemanticGraphCanvas = lazy(() => import('../components/analyzer/SemanticGraphCanvas').then(module => ({ default: module.SemanticGraphCanvas })));
const defaults: NonNullable<AnalyzerViewSession['semantic']> = { scope: '', kind: '', confidence: '', layer: 'source', depth: 0, direction: 'both', orbit: false, overview: true, page: 0 };
const emptyAnalysis: SemanticAnalysis = { nodes: [], edges: [], coverage: [], warnings: [], stats: { files: 0, functions: 0, models: 0, unresolved: 0, elapsedMs: 0 } };

function Evidence({ items, sources }: { items: SemanticEvidence[]; sources: Record<string, string> }) {
  const [limit, setLimit] = useState(4);
  const unique = [...new Map(items.map(item => [`${item.path}:${item.start}`, item])).values()];
  return <div className="semantic-evidence">{unique.slice(0, limit).map(item => <details key={`${item.path}:${item.start}`} open={unique.length === 1}>
    <summary>{item.path}:{item.line} <span>{item.description}</span></summary>
    <pre>{sources[item.path]?.split('\n').slice(Math.max(0, item.line - 3), item.line + 5).map((line, index) => <span key={index} className={Math.max(1, item.line - 2) + index === item.line ? 'is-highlighted' : ''}>{String(Math.max(1, item.line - 2) + index).padStart(4)}  {line}{'\n'}</span>) ?? 'このプロジェクトにソースがありません'}</pre>
  </details>)}{unique.length > limit && <button onClick={() => setLimit(limit + 10)}>根拠をさらに表示（残り{unique.length - limit}）</button>}</div>;
}

export default function SemanticAnalyzerPage({ view }: { view: SemanticViewId }) {
  return view === 'runtime-flow' || view === 'function-call-flow' ? <FlowAnalyzerPage view={view} /> : <LegacySemanticAnalyzerPage view={view} />;
}

function LegacySemanticAnalyzerPage({ view }: { view: SemanticViewId }) {
  const { state, replaceProject, updateView, setActiveView } = useAnalyzerSession(); const navigate = useNavigate();
  const store = state.store; const session = state.views[view]; const options = session.semantic ?? defaults;
  const [loaded, setLoaded] = useState<{ store: AnalyzerProjectStore; analysis: SemanticAnalysis }>();
  const [progress, setProgress] = useState({ done: 0, total: 0 }); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [, setTraceVersion] = useState(0); const [traceError, setTraceError] = useState(''); const traceInput = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState(0); const [fit, setFit] = useState(0); const [listPage, setListPage] = useState(0); const [connectionLimit, setConnectionLimit] = useState(30);
  const drill = options.members; const [rescanning, setRescanning] = useState(false);
  const fullscreen = useWorkspaceFullscreen(Boolean(store));
  const analysis = loaded && loaded.store === store ? loaded.analysis : undefined;
  const traces = store ? traceCache.get(store) : undefined;
  useEffect(() => { setActiveView(view); setListPage(0); setFocus(0); setFit(0); }, [view, setActiveView, state.scanVersion]);
  useEffect(() => {
    setError(''); if (!store) return;
    let active = true;
    const job = getSemanticAnalysis(store, value => { if (active) setProgress({ ...value }); });
    job.promise.then(result => { if (active) setLoaded({ store, analysis: result }); }, reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; job.unsubscribe(); };
  }, [store, retry]);
  const changeOptions = (patch: Partial<typeof options>) => { updateView(view, { semantic: { ...options, page: 0, ...patch } }); if (Object.keys(patch).some(key => key !== 'page')) setListPage(0); };
  const graph = useMemo(() => projectSemanticView(analysis ?? emptyAnalysis, view, traces, options.layer), [analysis, view, traces, options.layer]);
  const selected = graph.nodes.find(node => node.id === session.selectedNodeId);
  const selectedEdge = graph.edges.find(edge => edge.id === session.selectedEdgeId);
  const neighbourhoodId = options.depth ? selected?.id : undefined;
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const filtered = useMemo<SemanticGraph>(() => {
    const query = session.search.trim().toLowerCase();
    const neighbourhood = neighbourhoodId ? semanticNeighbours(graph, neighbourhoodId, options.depth, options.direction) : undefined;
    const drillIds = drill ? new Set(drill) : undefined;
    const nodes = graph.nodes.filter(node => (!options.scope || node.group === options.scope || node.path?.startsWith(options.scope)) && (!options.kind || node.kind === options.kind)
      && (options.auxiliary || !(node.group === 'Tests' || node.attributes.generated || node.attributes.auxiliary))
      && (!options.confidence || node.confidence === options.confidence) && (!neighbourhood || neighbourhood.has(node.id)) && (!drillIds || drillIds.has(node.id))
      && (!query || [node.label, node.path, node.signature, node.group, ...(node.fields ?? []).map(field => `${field.name} ${field.type}`)].join(' ').toLowerCase().includes(query)));
    const ids = new Set(nodes.map(node => node.id)); return { view, nodes, edges: graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
  }, [graph, options.scope, options.kind, options.confidence, options.depth, options.direction, options.auxiliary, neighbourhoodId, session.search, drill, view]);
  const overview = options.overview && filtered.nodes.length > 120 && !drill && !options.depth;
  const presented = useMemo(() => overview ? summarizeSemanticGraph(filtered) : filtered, [overview, filtered]);
  const pageCount = Math.max(1, Math.ceil(presented.nodes.length / semanticPageSize)); const page = Math.min(options.page, pageCount - 1);
  const visible = useMemo(() => {
    const nodes = presented.nodes.slice(page * semanticPageSize, (page + 1) * semanticPageSize); const ids = new Set(nodes.map(node => node.id));
    return { ...presented, nodes, edges: presented.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
  }, [presented, page]);
  const select = useCallback((id: string) => {
    const summary = presented.nodes.find(node => node.id === id && node.attributes.overview);
    if (summary) { setListPage(0); updateView(view, { semantic: { ...options, members: summary.attributes.members as string[], page: 0 } }); setFit(value => value + 1); return; }
    const at = presented.nodes.findIndex(node => node.id === id);
    if (at < 0) setListPage(0);
    updateView(view, { selectedNodeId: id, selectedEdgeId: undefined, detailOpen: true,
      semantic: at < 0 ? { ...options, members: undefined, scope: '', kind: '', confidence: '', overview: false, depth: 1, page: 0 } : { ...options, page: Math.floor(at / semanticPageSize) },
      ...(at < 0 ? { search: '' } : {}),
    }); setConnectionLimit(30);
  }, [presented.nodes, updateView, view, options]);
  const onCamera = useCallback((camera: NonNullable<AnalyzerViewSession['semanticCamera']>) => updateView(view, { semanticCamera: camera }), [updateView, view]);
  const jump = (targetView: SemanticViewId, node: SemanticNode) => {
    const layer = targetView === 'data-model' ? 'source' : options.layer;
    const targetGraph = projectSemanticView(analysis ?? emptyAnalysis, targetView, traces, layer);
    if (Array.isArray(node.attributes.members)) {
      const ids = new Set(node.attributes.members); const files = new Set(Array.isArray(node.attributes.files) ? node.attributes.files : []);
      const members = targetGraph.nodes.filter(item => ids.has(item.id) || typeof item.attributes.owner === 'string' && ids.has(item.attributes.owner) || item.path && files.has(item.path)).map(item => item.id);
      updateView(targetView, { selectedNodeId: undefined, selectedEdgeId: undefined, detailOpen: false, search: '', semanticCamera: undefined, semantic: { ...defaults, layer, members, auxiliary: options.auxiliary } }); navigate(analyzerRoutes[targetView]); return;
    }
    const named = targetGraph.nodes.filter(item => item.label === node.label);
    const target = targetGraph.nodes.find(item => item.id === node.id) ?? targetGraph.nodes.find(item => item.id === node.attributes.owner) ?? targetGraph.nodes.find(item => item.attributes.owner === node.id) ?? targetGraph.nodes.find(item => Array.isArray(item.attributes.members) && item.attributes.members.includes(node.id)) ?? (named.length === 1 ? named[0] : undefined);
    updateView(targetView, { selectedNodeId: target?.id, selectedEdgeId: undefined, detailOpen: Boolean(target), search: target ? '' : node.path ?? node.label, semantic: { ...defaults, layer, overview: !target, depth: target ? 1 : 0 } });
    navigate(analyzerRoutes[targetView]);
  };
  const connections = selected ? graph.edges.filter(edge => edge.source === selected.id || edge.target === selected.id) : [];
  const evidence = selectedEdge?.evidence ?? selected?.evidence ?? [];
  const importTrace = async (file?: File) => {
    if (!file || !store) return; setTraceError('');
    try { if (file.size > 20 * 1024 * 1024) throw new Error('実行データは20 MB以下に分割してください。'); traceCache.set(store, importExecutionTrace(await file.text(), file.name, analysis)); setTraceVersion(value => value + 1); changeOptions({ layer: 'combined' }); }
    catch (reason) { setTraceError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const rescan = async () => {
    if (!state.folderHandle) return; setRescanning(true); setError('');
    try { if (store) cancelSemanticAnalysis(store); replaceProject(await scanProjectFiles(await filesFromDirectoryHandle(state.folderHandle)), state.folderHandle); }
    catch { setError('再解析できませんでした。フォルダを選び直してください。'); } finally { setRescanning(false); }
  };
  return <div className="page-stack analyzer-page semantic-page">
    <section className="page-intro analyzer-intro"><div><span className="eyebrow">LOCAL PROJECT ANALYZER</span><h1>Analyzer</h1><p className="intro-copy">コードの処理・データ・責務を、根拠とともにたどります。</p></div><AnalyzerProjectPicker onScanned={replaceProject} /></section>
    <div ref={fullscreen.root} onKeyDownCapture={fullscreen.onKeyDownCapture} role={fullscreen.isFullscreen ? 'dialog' : undefined} aria-modal={fullscreen.isFullscreen || undefined} aria-label={fullscreen.isFullscreen ? `${analyzerViewLabels[view]} 全画面` : undefined} className={`semantic-workspace${fullscreen.isFullscreen ? ' is-fullscreen' : ''}`}>
      <AnalyzerViewTabs />
      <header className="semantic-heading"><div><p className="eyebrow">VIEW {semanticViewIds.indexOf(view) + 6} / 10</p><h2>{analyzerViewLabels[view]}</h2><p>{semanticQuestions[view]}</p></div>{store && <div className="semantic-actions"><button onClick={() => void rescan()} disabled={!state.folderHandle || rescanning}>{rescanning ? '再解析中…' : '再解析'}</button><button onClick={() => void fullscreen.toggle()}>{fullscreen.isFullscreen ? '全画面を終了' : '全画面'}</button></div>}</header>
      {!store ? <div className="semantic-empty"><AnalyzerEmptyOrbit /><p>プロジェクトフォルダを選択すると、このViewを解析します。</p></div> : <>
        <div className="semantic-controls">
          <label>検索<input aria-label="関数・データ・モデルを検索" type="search" value={session.search} onChange={event => { updateView(view, { search: event.target.value, semantic: { ...options, page: 0 } }); setListPage(0); }} placeholder="名前・パス・フィールド" /></label>
          <label>責務<select value={options.scope} onChange={event => changeOptions({ scope: event.target.value, members: undefined })}><option value="">すべて</option>{[...new Set(graph.nodes.map(node => node.group))].sort().map(group => <option key={group}>{group}</option>)}</select></label>
          <label>種類<select value={options.kind} onChange={event => changeOptions({ kind: event.target.value })}><option value="">すべて</option>{[...new Set(graph.nodes.map(node => node.kind))].sort().map(kind => <option value={kind} key={kind}>{kindLabels[kind]}</option>)}</select></label>
          <label>確度<select value={options.confidence} onChange={event => changeOptions({ confidence: event.target.value })}><option value="">すべて</option>{Object.entries(confidenceLabels).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
          <label>表示データ<select value={options.layer} onChange={event => changeOptions({ layer: event.target.value as typeof options.layer })}><option value="source">ソース解析</option><option value="observed">実行ログ・Trace</option><option value="combined">ソース ＋ 実測</option></select></label>
          <label className="semantic-auxiliary"><input type="checkbox" checked={Boolean(options.auxiliary)} onChange={event => changeOptions({ auxiliary: event.target.checked })} />Test・生成定義を含む</label>
          <button onClick={() => traceInput.current?.click()} disabled={!analysis}>実行データを読み込む</button><input ref={traceInput} type="file" hidden accept=".json,.jsonl,.ndjson,.log" aria-label="実行ログ・Traceファイル" onChange={event => { void importTrace(event.target.files?.[0]); event.target.value = ''; }} />
        </div>
        {traceError && <p className="semantic-error" role="alert">{traceError}</p>}
        {traces && <p className="semantic-trace-info">{traces.name} · {traces.spans} spans · {traces.logs} logs <button onClick={() => { traceCache.delete(store); setTraceVersion(value => value + 1); changeOptions({ layer: 'source' }); }}>実行データを解除</button></p>}
        {!analysis && !error && <div className="semantic-loading" role="status"><progress max={Math.max(1, progress.total)} value={progress.done} /><p>ソースを解析中… {progress.done} / {progress.total}</p><button onClick={() => cancelSemanticAnalysis(store)}>解析を中止</button></div>}
        {error && <p className="semantic-error" role="alert">{error} <button onClick={() => { cancelSemanticAnalysis(store); setRetry(value => value + 1); }}>再実行</button></p>}
        {analysis && <>
          <div className="semantic-graph-toolbar"><span>{filtered.nodes.length.toLocaleString()} / {graph.nodes.length.toLocaleString()} objects · {filtered.edges.length.toLocaleString()} relations</span>
            {drill && <button onClick={() => changeOptions({ page: 0, members: undefined })}>← グループ一覧</button>}
            <button aria-pressed={options.overview} onClick={() => changeOptions({ overview: !options.overview })}>自動グループ {options.overview ? 'ON' : 'OFF'}</button>
            {['function-call-flow', 'data-flow', 'data-model'].includes(view) && <button aria-pressed={options.orbit} onClick={() => { updateView(view, { semanticCamera: undefined }); changeOptions({ orbit: !options.orbit }); setFit(value => value + 1); }}>{options.orbit ? '2Dに切替' : '3D Orbitに切替'}</button>}
            <button onClick={() => setFit(value => value + 1)}>全体を表示</button><button disabled={!selected || !visible.nodes.some(node => node.id === selected.id)} onClick={() => setFocus(value => value + 1)}>選択へ移動</button>
            <label>選択の周辺<select value={options.depth} onChange={event => changeOptions({ depth: Number(event.target.value), overview: false })}><option value={0}>全体</option>{[1, 2, 3, 5].map(depth => <option value={depth} key={depth}>{depth} hops</option>)}</select></label>
            <label>方向<select value={options.direction} onChange={event => changeOptions({ direction: event.target.value as typeof options.direction })}><option value="both">入出力</option><option value="incoming">入力・呼び出し元</option><option value="outgoing">出力・呼び出し先</option></select></label>
          </div>
          <div className={`semantic-body${session.detailOpen && (selected || selectedEdge) ? ' has-detail' : ''}`}>
            <aside className="semantic-object-list" aria-label="解析オブジェクト一覧"><div className="semantic-list-title">{overview ? 'GROUPS' : 'OBJECTS'} <span>{presented.nodes.length}</span></div>
              {presented.nodes.slice(listPage * 50, (listPage + 1) * 50).map(node => <button key={node.id} aria-pressed={node.id === selected?.id} onClick={() => { const at = presented.nodes.indexOf(node); changeOptions({ page: Math.floor(at / semanticPageSize) }); select(node.id); }}><span className={`semantic-dot kind-${node.kind}`} /><span><strong>{node.label}</strong><small>{node.path ?? node.group}{node.line ? `:${node.line}` : ''}{Array.isArray(node.attributes.members) ? ` · ${node.attributes.members.length} objects` : ''}</small></span></button>)}
              {presented.nodes.length > 50 && <div className="semantic-pagination"><button disabled={!listPage} onClick={() => setListPage(listPage - 1)}>前</button><span>{listPage + 1}/{Math.ceil(presented.nodes.length / 50)}</span><button disabled={(listPage + 1) * 50 >= presented.nodes.length} onClick={() => setListPage(listPage + 1)}>次</button></div>}
            </aside>
            <main className="semantic-graph-area">
              {visible.nodes.length ? <Suspense fallback={<p role="status">グラフを準備中…</p>}><SemanticGraphCanvas key={`${view}:${state.scanVersion}`} graph={visible} selected={selected?.id} orbit={options.orbit && ['function-call-flow', 'data-flow', 'data-model'].includes(view)} focus={focus} fit={fit} camera={session.semanticCamera} onCamera={onCamera} onSelect={select} /></Suspense> : <div className="semantic-empty-result"><h3>表示する要素がありません</h3><p>{options.layer !== 'source' && !traces ? '実行ログまたはTraceを読み込んでください。' : view === 'data-model' && options.layer === 'observed' ? '構造定義はソース解析で確認できます。' : view === 'data-flow' && options.layer === 'observed' ? 'data.input.name / data.output.name が記録されたspanから、観測されたデータの入出力を表示します。' : '検索・絞り込みを変更するか、解析範囲を確認してください。'}</p><button onClick={() => updateView(view, { search: '', semantic: defaults })}>表示条件をリセット</button></div>}
              <div className="semantic-map-caption">{options.orbit ? 'ドラッグで回転 · 右ドラッグで移動' : 'ドラッグで移動'} · ホイールで拡大 · 矢印は関係の方向{overview ? ' · グループを選択して展開' : ''}</div>
              {pageCount > 1 && <div className="semantic-map-pages"><button disabled={!page} onClick={() => changeOptions({ page: page - 1 })}>前の範囲</button><span>{page + 1} / {pageCount} · この範囲 {visible.nodes.length} objects</span><button disabled={page === pageCount - 1} onClick={() => changeOptions({ page: page + 1 })}>次の範囲</button></div>}
            </main>
            {session.detailOpen && (selected || selectedEdge) && <aside className="semantic-detail" aria-label="選択した要素の詳細"><header><span>{selected ? kindLabels[selected.kind] : 'RELATION'}</span><button aria-label="詳細を閉じる" onClick={() => updateView(view, { detailOpen: false })}>×</button></header>
              <h3>{selected?.label ?? selectedEdge?.label}</h3><span className="semantic-confidence">{confidenceLabels[(selected ?? selectedEdge)!.confidence]}</span>
              {selected?.path && <p className="semantic-path">{selected.path}{selected.line ? `:${selected.line}` : ''}</p>}
              {selected?.signature && <pre className="semantic-signature">{selected.signature}</pre>}
              {selected?.fields && <table className="semantic-fields"><caption>Fields ({selected.fields.length})</caption><thead><tr><th>Field</th><th>Type</th></tr></thead><tbody>{selected.fields.map(field => <tr key={field.name}><td>{field.name}{field.optional ? '?' : ''}{field.key ? <small>{field.key === 'primary' ? 'PK' : 'FK'}</small> : null}</td><td>{field.type}</td></tr>)}</tbody></table>}
              {Array.isArray(selected?.attributes.unresolvedSpreads) && <p>未展開のフィールド: {selected.attributes.unresolvedSpreads.join(', ')}。共有定義のソースを確認してください。</p>}
              {selected && <><details><summary>属性</summary><dl>{Object.entries(selected.attributes).filter(([key]) => !['members', 'files', 'typeReferences'].includes(key)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(', ') : String(value)}</dd></div>)}</dl></details>
                {Array.isArray(selected.attributes.members) && <p>{selected.attributes.members.length}構成要素 · {Array.isArray(selected.attributes.files) ? selected.attributes.files.length : '—'} files</p>}
                {Array.isArray(selected.attributes.files) && <details><summary>構成ファイル（{selected.attributes.files.length}）</summary><ul className="semantic-member-files">{selected.attributes.files.map(path => <li key={path}><button onClick={() => { updateView('function-call-flow', { search: path, selectedNodeId: undefined, selectedEdgeId: undefined, detailOpen: false, semanticCamera: undefined, semantic: defaults }); navigate(analyzerRoutes['function-call-flow']); }}>{path}</button></li>)}</ul></details>}
                <div className="semantic-crosslinks">{semanticViewIds.filter(id => id !== view).map(id => <button key={id} onClick={() => jump(id, selected)}>{analyzerViewLabels[id]} ↗</button>)}</div>
                <h4>関係 ({connections.length})</h4><div className="semantic-connections">{connections.slice(0, connectionLimit).map(edge => <div key={edge.id}><button onClick={() => select(edge.source === selected.id ? edge.target : edge.source)}>{edge.target === selected.id ? '← ' : '→ '}{byId.get(edge.source === selected.id ? edge.target : edge.source)?.label}</button><button onClick={() => updateView(view, { selectedEdgeId: edge.id, selectedNodeId: undefined, detailOpen: true })}>{edge.label} · {confidenceLabels[edge.confidence]}</button></div>)}{connections.length > connectionLimit && <button onClick={() => setConnectionLimit(connectionLimit + 50)}>関係をさらに表示</button>}</div></>}
              {selectedEdge && <p><button onClick={() => select(selectedEdge.source)}>{byId.get(selectedEdge.source)?.label}</button> → <button onClick={() => select(selectedEdge.target)}>{byId.get(selectedEdge.target)?.label}</button></p>}
              <h4>ソースの根拠</h4>{evidence.length ? <Evidence key={selected?.id ?? selectedEdge?.id} items={evidence} sources={store.semanticSources ?? store.sources} /> : <p>実行データの属性、または構成要素の根拠を確認してください。</p>}
            </aside>}
          </div>
          <details className="semantic-coverage"><summary>解析範囲 · {analysis.stats.files} files · {analysis.stats.functions} functions · {analysis.stats.models} models · {analysis.stats.unresolved}未解決 calls · {(analysis.stats.elapsedMs / 1000).toFixed(1)}秒</summary>
            <p>ソースで確認＝構文上の宣言・関係。推定＝名前・配置・設定からの対応付け。実測＝読み込んだ実行記録。未解決＝静的に呼び出し先を確定できない関係。実行順序やすべての動的経路を保証するものではありません。</p>
            <p>対応言語: {Object.values(languageLabels).join(' / ')}。Vue・Svelteはscript部分を解析します。TraceはOTLP JSON、Jaeger、Chrome Trace、構造化JSON / JSONLに対応し、記録された親子関係を表示します。</p>
            {[...analysis.warnings, ...store.warnings.map(item => item.message), ...(traces?.warnings ?? [])].map((warning, index) => <p key={index}>{warning}</p>)}
            <details><summary>ファイルごとの解析結果</summary><ul>{analysis.coverage.map((file, index) => <li key={`${file.path}:${index}`}><code>{file.path}</code> · {file.language} · {file.status}{file.message ? ` · ${file.message}` : ''}</li>)}</ul></details>
          </details>
        </>}
      </>}
    </div>
  </div>;
}
