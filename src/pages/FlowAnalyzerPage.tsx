import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { filesFromDirectoryHandle, scanProjectFiles, useAnalyzerSession, type AnalyzerProjectStore, type AnalyzerViewSession } from '../analyzer';
import { cancelSemanticAnalysis, getSemanticAnalysis } from '../analyzer/semantic/client';
import { confidenceLabels, kindLabels, semanticQuestions, type SemanticAnalysis, type SemanticGraph, type SemanticViewId } from '../analyzer/semantic/types';
import { projectSemanticView } from '../analyzer/semantic/project';
import { buildSemanticExplorer, explorerChildren } from '../analyzer/semantic/semanticExplorer';
import { recordExplorerCamera, recordExplorerSelection } from '../analyzer/semantic/semanticExplorerState';
import { searchSemanticNodes } from '../analyzer/semantic/search';
import { semanticTraceCache } from '../analyzer/semantic/traceCache';
import { importExecutionTrace } from '../analyzer/semantic/traces';
import { semanticNavigationContext } from '../analyzer/semantic/navigation';
import { AnalyzerProjectHeader, AnalyzerSearchControl, AnalyzerViewHeading } from '../components/analyzer/AnalyzerViewChrome';
import { AnalyzerViewTabs } from '../components/analyzer/AnalyzerToolbar';
import { SearchResultStrip } from '../components/analyzer/SearchResultStrip';
import { SemanticFlowStage } from '../components/analyzer/SemanticFlowStage';
import { SemanticFlowDetail } from '../components/analyzer/SemanticFlowDetail';
import { semanticFlowDirectionLanguage } from '../components/analyzer/semanticFlowLanguage';
import { semanticNodeDisplays } from '../components/analyzer/semanticFlowDisplay';
import { useWorkspaceFullscreen } from '../components/analyzer/useWorkspaceFullscreen';
import { useSemanticExplorerNavigation } from '../components/analyzer/useSemanticExplorerNavigation';
import { analyzerRoutes } from '../utils/routes';
import './semantic-flow.css';

const semanticFlowDefaults: NonNullable<AnalyzerViewSession['semantic']> = { scope: '', kind: '', confidence: '', layer: 'source', depth: 0, direction: 'both', orbit: false, overview: true, page: 0, auxiliary: false, members: undefined };
const defaultFlow: NonNullable<AnalyzerViewSession['flow']> = { mode: '2d', expandedGroupIds: [] };
const defaultOrbitFlow: NonNullable<AnalyzerViewSession['flow']> = { mode: '3d', expandedGroupIds: [] };
const emptyAnalysis: SemanticAnalysis = { nodes: [], edges: [], coverage: [], warnings: [], stats: { files: 0, functions: 0, models: 0, unresolved: 0, elapsedMs: 0 } };

export default function FlowAnalyzerPage({ view }: { view: 'runtime-flow' | 'function-call-flow' }) {
  const { state, updateView, setActiveView, replaceProject } = useAnalyzerSession(), navigate = useNavigate();
  const store = state.store, session = state.views[view], options = session.semantic ?? semanticFlowDefaults;
  const flow = session.flow ?? (options.orbit ? defaultOrbitFlow : defaultFlow);
  const [loaded, setLoaded] = useState<{ store: AnalyzerProjectStore; analysis: SemanticAnalysis }>();
  const [progress, setProgress] = useState({ done: 0, total: 0 }), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [settings, setSettings] = useState(false), [rescanning, setRescanning] = useState(false), [traceError, setTraceError] = useState('');
  const [, setTraceVersion] = useState(0), [notice, setNotice] = useState(''), [unavailable3D, setUnavailable3D] = useState(false);
  const traceInput = useRef<HTMLInputElement>(null), focusNonce = useRef(0);
  const [focus, setFocus] = useState<{ nonce: number; ids: string[]; mode?: '2d' | '3d' }>();
  const requestFocus = useCallback((mode: '2d' | '3d', ids: string[]) => setFocus({ nonce: ++focusNonce.current, ids, mode }), []);
  const fullscreen = useWorkspaceFullscreen(Boolean(store));
  const analysis = loaded?.store === store ? loaded?.analysis : undefined;
  const traces = store ? semanticTraceCache.get(store) : undefined;
  useEffect(() => { setActiveView(view); setNotice(''); }, [view, state.scanVersion, setActiveView]);
  useEffect(() => {
    setError(''); if (!store) return;
    let active = true;
    const job = getSemanticAnalysis(store, next => { if (active) setProgress({ ...next }); });
    job.promise.then(result => { if (active) setLoaded({ store, analysis: result }); }, reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; job.unsubscribe(); };
  }, [store, retry]);
  const graph = useMemo(() => projectSemanticView(analysis ?? emptyAnalysis, view, traces, options.layer), [analysis, view, traces, options.layer]);
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const allNodes = useMemo(() => new Map([...(analysis?.nodes ?? []), ...graph.nodes].map(node => [node.id, node])), [analysis, graph.nodes]);
  const selected = session.selectedNodeId ? byId.get(session.selectedNodeId) : undefined;
  const selectedEdge = graph.edges.find(edge => edge.id === session.selectedEdgeId);
  const filtered = useMemo<SemanticGraph>(() => {
    const members = options.members ? new Set(options.members) : undefined;
    const nodes = graph.nodes.filter(node => (!options.scope || node.group === options.scope || node.path?.startsWith(options.scope))
      && (!options.kind || node.kind === options.kind) && (!options.confidence || node.confidence === options.confidence)
      && (options.auxiliary || !(node.group === 'Tests' || node.attributes.generated || node.attributes.auxiliary))
      && (!members || members.has(node.id)));
    const ids = new Set(nodes.map(node => node.id)); return { view, nodes, edges: graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
  }, [graph, view, options.scope, options.kind, options.confidence, options.auxiliary, options.members]);
  const results = useMemo(() => searchSemanticNodes(filtered.nodes, session.search), [filtered.nodes, session.search]);
  const searchDisplays = useMemo(() => flow.mode === '2d' ? semanticNodeDisplays(graph.nodes) : undefined, [graph.nodes, flow.mode]);
  const matchIds = useMemo(() => new Set(results.map(result => result.id)), [results]);
  const knownFiles = useMemo(() => new Set([...(store?.files.map(file => file.relativePath) ?? []), ...Object.keys(store?.sources ?? {}), ...Object.keys(store?.semanticSources ?? {})]), [store]);
  const explorer = useMemo(() => buildSemanticExplorer(graph, knownFiles), [graph, knownFiles]);
  const navigation = useSemanticExplorerNavigation({ view, scanVersion: state.scanVersion, session, explorer, edges: graph.edges, ready: Boolean(analysis), updateView, onFocus: requestFocus });
  const explorerLocation = useMemo(() => ({ ...navigation.location, direction: options.direction }), [navigation.location, options.direction]);
  const selectedIds = useMemo(() => new Set(selected ? [selected.id] : []), [selected]);
  const filteredIds = useMemo(() => new Set(filtered.nodes.map(node => node.id)), [filtered.nodes]);
  const currentChildren = useMemo(() => explorerChildren(explorer, explorerLocation, filteredIds), [explorer, explorerLocation, filteredIds]);
  const hiddenSelection = Boolean(selected && !filteredIds.has(selected.id) || selectedEdge && (!filteredIds.has(selectedEdge.source) || !filteredIds.has(selectedEdge.target)));
  const clearSelection = useCallback(() => updateView(view, current => recordExplorerSelection(current, { selectedNodeId: undefined, selectedEdgeId: undefined, detailOpen: false })), [updateView, view]);
  useEffect(() => {
    if (!analysis) return;
    if (session.selectedNodeId && !byId.has(session.selectedNodeId) || session.selectedEdgeId && !graph.edges.some(edge => edge.id === session.selectedEdgeId)) {
      clearSelection(); setNotice('現在の表示データに存在しない選択を解除しました。');
    }
  }, [analysis, byId, graph.edges, session.selectedNodeId, session.selectedEdgeId, clearSelection]);
  const changeOptions = (patch: Partial<typeof options>) => updateView(view, { semantic: { ...options, page: 0, ...patch } });
  const changeMode = (mode: '2d' | '3d') => { if (mode === '3d') setUnavailable3D(false); navigation.changeMode(mode); };
  const saveCamera = useCallback((mode: '2d' | '3d', camera: NonNullable<AnalyzerViewSession['flowCameras']>['2d' | '3d']) => {
    if (camera) updateView(view, current => recordExplorerCamera(current, mode, camera));
  }, [updateView, view]);
  const selectNode = (id: string) => {
    if (!byId.has(id)) {
      if (allNodes.has(id)) {
        updateView('function-call-flow', { selectedNodeId: id, selectedEdgeId: undefined, detailOpen: true, search: '', semantic: { ...semanticFlowDefaults, auxiliary: options.auxiliary } });
        navigate(analyzerRoutes['function-call-flow'], { state: { semanticExplorerJump: { targetId: id } } });
      }
      return;
    }
    updateView(view, current => recordExplorerSelection(current, { selectedNodeId: id, selectedEdgeId: undefined, detailOpen: true }));
  };
  const selectEdge = (id: string) => {
    const edge = graph.edges.find(item => item.id === id); if (!edge) return;
    updateView(view, current => recordExplorerSelection(current, { selectedNodeId: undefined, selectedEdgeId: id, detailOpen: true }));
  };
  const revealSelection = () => {
    const id = selected?.id ?? selectedEdge?.source; if (!id) return;
    if (flow.mode === '2d') navigation.revealNode(id); else requestFocus('3d', selectedEdge ? [selectedEdge.source, selectedEdge.target] : [id]);
  };
  const restoreSelection = () => {
    changeOptions({ scope: '', kind: '', confidence: '', depth: 0, members: undefined, auxiliary: true });
    revealSelection();
  };
  const jump = (id: string, targetView: SemanticViewId) => {
    const node = allNodes.get(id); if (!node) return;
    const layer = targetView === 'data-model' ? 'source' : options.layer;
    const context = semanticNavigationContext(projectSemanticView(analysis ?? emptyAnalysis, targetView, traces, layer), node);
    updateView(targetView, current => ({ ...current, selectedNodeId: context.target?.id, selectedEdgeId: undefined, detailOpen: Boolean(context.target), search: context.search,
      semantic: { ...semanticFlowDefaults, layer, auxiliary: options.auxiliary, members: context.members, overview: !context.target, depth: context.target ? 1 : 0 },
      ...(targetView === 'runtime-flow' || targetView === 'function-call-flow' ? {} : { semanticCamera: undefined, flowCameras: undefined }),
      flow: { ...(current.flow ?? defaultFlow), expandedGroupIds: [] } }));
    navigate(analyzerRoutes[targetView], targetView === 'runtime-flow' || targetView === 'function-call-flow' ? { state: { semanticExplorerJump: { targetId: context.target?.id } } } : undefined);
  };
  const importTrace = async (file?: File) => {
    if (!file || !store) return; setTraceError('');
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('実行データは20 MB以下に分割してください。');
      semanticTraceCache.set(store, importExecutionTrace(await file.text(), file.name, analysis)); setTraceVersion(value => value + 1); changeOptions({ layer: 'combined' });
    } catch (reason) { setTraceError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const rescan = async () => {
    if (!state.folderHandle) return; setRescanning(true); setError('');
    try { if (store) cancelSemanticAnalysis(store); replaceProject(await scanProjectFiles(await filesFromDirectoryHandle(state.folderHandle)), state.folderHandle); }
    catch { setError('再解析できませんでした。フォルダを選び直してください。'); } finally { setRescanning(false); }
  };
  const activeFilters = [options.scope, options.kind, options.confidence, options.layer !== 'source', options.direction !== 'both', options.auxiliary, options.members?.length].filter(Boolean).length;
  return <div className="page-stack analyzer-page semantic-flow-page">
    <AnalyzerProjectHeader onScanned={replaceProject} />
    <section className="analyzer-shell" aria-labelledby="analyzer-view-title">
      <AnalyzerViewHeading view={view}><span>{store?.files.length ?? 0} files indexed</span><span title={semanticQuestions[view]}>{analysis ? `解析全体 ${graph.nodes.length.toLocaleString()}対象 · 絞り込み後 ${filtered.nodes.length.toLocaleString()}対象 / ${filtered.edges.length.toLocaleString()}関係 · ${flow.mode === '3d' ? '3Dは全体を表示' : explorerLocation.centerId ? '中心からの局所関係' : `この階層 ${currentChildren.length.toLocaleString()}項目`}` : store ? 'ソースを解析中' : 'プロジェクト未選択'}</span></AnalyzerViewHeading>
      <div className="analyzer-toolbar"><AnalyzerViewTabs /><div className="analyzer-control-row">
        <AnalyzerSearchControl value={session.search} onChange={search => updateView(view, { search })} label="関数・データ・モデルを検索" placeholder="名前・パス・所属（複数語はAND）" />
        <label className="analyzer-filter-control"><span>責務</span><select value={options.scope} onChange={event => changeOptions({ scope: event.target.value, members: undefined })}><option value="">すべて</option>{[...new Set(graph.nodes.map(node => node.group))].sort().map(group => <option key={group}>{group}</option>)}</select></label>
        <label className="analyzer-filter-control"><span>種類</span><select value={options.kind} onChange={event => changeOptions({ kind: event.target.value })}><option value="">すべて</option>{[...new Set(graph.nodes.map(node => node.kind))].sort().map(kind => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}</select></label>
        <button type="button" className="analyzer-quiet-button" aria-expanded={settings} aria-controls="semantic-flow-settings" onClick={() => setSettings(!settings)}>詳細設定{activeFilters ? ` (${activeFilters})` : ''}</button>
      </div></div>
      {settings && <div id="semantic-flow-settings" className="semantic-flow-settings">
        <label>確度<select value={options.confidence} onChange={event => changeOptions({ confidence: event.target.value })}><option value="">すべて</option>{Object.entries(confidenceLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>表示データ<select value={options.layer} onChange={event => changeOptions({ layer: event.target.value as typeof options.layer })}><option value="source">ソース解析</option><option value="observed">実行ログ・Trace</option><option value="combined">ソース ＋ 実測</option></select></label>
        <label>線の方向（選択対象）<select value={options.direction} onChange={event => changeOptions({ direction: event.target.value as typeof options.direction })}><option value="both">入る・出る関係</option><option value="incoming">{semanticFlowDirectionLanguage(view).incoming}から</option><option value="outgoing">{semanticFlowDirectionLanguage(view).outgoing}へ</option></select></label>
        <label className="semantic-flow-checkbox"><input type="checkbox" checked={Boolean(options.auxiliary)} onChange={event => changeOptions({ auxiliary: event.target.checked })} />Test・生成定義を含む</label>
        <button type="button" className="analyzer-quiet-button" disabled={!analysis} onClick={() => traceInput.current?.click()}>実行データを読み込む</button>
        <button type="button" className="analyzer-quiet-button" disabled={!state.folderHandle || rescanning} onClick={() => void rescan()}>{rescanning ? '再解析中…' : '再解析'}</button>
        <button type="button" className="analyzer-quiet-button" onClick={() => updateView(view, { semantic: { ...semanticFlowDefaults } })}>フィルターを解除</button>
      </div>}
      <input ref={traceInput} type="file" hidden accept=".json,.jsonl,.ndjson,.log" aria-label="実行ログ・Traceファイル" onChange={event => { void importTrace(event.target.files?.[0]); event.target.value = ''; }} />
      {traceError && <p className="semantic-error" role="alert">{traceError}</p>}
      {traces && <p className="semantic-trace-info">{traces.name} · {traces.spans} spans · {traces.logs} logs <button type="button" onClick={() => { if (store) semanticTraceCache.delete(store); setTraceVersion(value => value + 1); changeOptions({ layer: 'source' }); }}>実行データを解除</button></p>}
      {error && <p className="semantic-error" role="alert">{error} <button type="button" onClick={() => { if (store) cancelSemanticAnalysis(store); setRetry(value => value + 1); }}>再実行</button></p>}
      {!analysis && store && !error && <div className="semantic-flow-progress" role="status"><progress value={progress.done} max={Math.max(1, progress.total)} /><span>ソースを解析中… {progress.done} / {progress.total}</span><button type="button" onClick={() => cancelSemanticAnalysis(store)}>解析を中止</button></div>}
      {notice && <p className="semantic-flow-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')}>閉じる</button></p>}
      {unavailable3D && <p className="semantic-flow-notice" role="status">この環境では3D描画を継続できません。検索・選択を保持して2Dエクスプローラーを表示しています。<button type="button" onClick={() => changeMode('3d')}>3Dを再試行</button></p>}
      {hiddenSelection && <p className="semantic-flow-notice" role="status">選択中の「{selected?.label ?? selectedEdge?.label}」は現在のフィルターで非表示です。<button type="button" onClick={restoreSelection}>フィルターを解除して表示</button><button type="button" onClick={clearSelection}>選択解除</button></p>}
      <SearchResultStrip query={session.search} items={results.map(result => {
        const display = searchDisplays?.get(result.id);
        const location = display?.location ?? `${result.path ?? result.node.group}${result.node.line ? `:${result.node.line}` : ''}`;
        return { id: result.id, label: display?.title ?? result.label, subtitle: `${result.node.kind === 'external' ? '呼び出し箇所: ' : ''}${location}`, reason: result.match.reason };
      })} selectedId={selected?.id} onSelect={id => navigation.jumpMode(flow.mode, id)} loading={Boolean(store && !analysis && !error)} />
      <div ref={fullscreen.root} className={`analyzer-workspace semantic-flow-workspace${session.detailOpen && (selected || selectedEdge) ? ' has-detail' : ''}${fullscreen.isFullscreen ? ' is-fullscreen' : ''}`}
        role={fullscreen.isFullscreen ? 'dialog' : undefined} aria-modal={fullscreen.isFullscreen || undefined} aria-label={fullscreen.isFullscreen ? `${view} 全画面表示` : undefined} onKeyDownCapture={fullscreen.onKeyDownCapture}>
        {store ? <SemanticFlowStage key={`${view}:${state.scanVersion}`} graph={filtered} explorer={explorer} mode={flow.mode} direction={options.direction} selectedIds={selectedIds} selectedEdgeId={selectedEdge?.id} matchIds={matchIds} focus={focus}
          navigation={{ location: explorerLocation, visitId: navigation.visitId, scrollTop: navigation.scrollTop, canBack: navigation.canBack,
            onBack: navigation.back, onParent: navigation.parent, onProject: navigation.project, onOpenScope: navigation.openScope, onOpenNode: navigation.openNode,
            onCenter: navigation.openNode, onDefinition: navigation.openDefinition, onJumpMode: navigation.jumpMode, onDepth: depth => navigation.changeLocal({ depth, direction: options.direction }),
            onScroll: navigation.saveScroll, onRevealSelection: revealSelection }}
          cameras={session.flowCameras ?? (options.orbit && session.semanticCamera ? { '3d': session.semanticCamera } : undefined)} onCamera={saveCamera} onMode={changeMode}
          particleMode={flow.particleMode} onParticleMode={particleMode => updateView(view, { flow: { ...flow, particleMode } })}
          onSelect={selectNode} onSelectEdge={selectEdge} onClear={clearSelection} isFullscreen={fullscreen.isFullscreen} onFullscreen={() => void fullscreen.toggle()}
          onUnavailable={() => { setUnavailable3D(true); navigation.changeMode('2d'); }} />
          : <div className="semantic-empty"><p>プロジェクトフォルダを選択すると、構造と関係を解析します。</p><p>ソースはブラウザ内で読み取り、外部へ送信しません。</p></div>}
        {store && session.detailOpen && (selected || selectedEdge) && <SemanticFlowDetail key={selected?.id ?? selectedEdge?.id} node={selected} edge={selectedEdge} nodes={allNodes} edges={graph.edges} sources={store.semanticSources ?? store.sources} view={view}
          onSelect={selectNode} onSelectEdge={selectEdge} onClose={() => updateView(view, current => recordExplorerSelection(current, { selectedNodeId: current.selectedNodeId, selectedEdgeId: current.selectedEdgeId, detailOpen: false }))} onJump={jump} />}
      </div>
      {analysis && <details className="semantic-coverage"><summary>解析範囲 · {analysis.stats.files.toLocaleString()} files · 解析全体で定義先が未特定の呼び出し {analysis.stats.unresolved.toLocaleString()}箇所 · {(analysis.stats.elapsedMs / 1000).toFixed(1)}秒</summary>
        <p>ソースで確認＝構文上の宣言・関係。推定＝名前・設定・callback契約からの対応付け。実測＝読み込んだ実行記録。未解決＝静的に呼び出し先を確定できない関係。イベント登録と実際の実行は区別されます。</p>
        <p>検索は名前・パス・所属・明示的な識別名を対象に、複数語のすべてを含む候補を返します。入力で配置や選択は変わりません。2Dの関係図と粒子は、実測された実行順序を示すものではありません。</p>
        {[...analysis.warnings, ...(store?.warnings.map(item => item.message) ?? []), ...(traces?.warnings ?? [])].map((warning, index) => <p key={index}>{warning}</p>)}
        <details><summary>ファイルごとの解析結果</summary><ul>{analysis.coverage.map((file, index) => <li key={`${file.path}:${index}`}><code>{file.path}</code> · {file.language} · {file.status}{file.message ? ` · ${file.message}` : ''}</li>)}</ul></details>
      </details>}
    </section>
  </div>;
}
