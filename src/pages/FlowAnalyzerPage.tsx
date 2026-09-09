import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { filesFromDirectoryHandle, scanProjectFiles, useAnalyzerSession, type AnalyzerProjectStore, type AnalyzerViewSession } from '../analyzer';
import { cancelSemanticAnalysis, getSemanticAnalysis } from '../analyzer/semantic/client';
import { confidenceLabels, kindLabels, semanticQuestions, type SemanticAnalysis, type SemanticGraph, type SemanticViewId, type SemanticExplorerViewId } from '../analyzer/semantic/types';
import { projectSemanticView } from '../analyzer/semantic/project';
import { prepareArchitectureScope, projectArchitectureScope } from '../analyzer/semantic/architectureProjection';
import { architectureKindLabels } from '../analyzer/semantic/architectureMetadata';
import { ArchitectureDetail } from '../components/analyzer/ArchitectureDetail';
import { ArchitectureRequestInspection } from '../components/analyzer/ArchitectureRequestInspection';
import { buildSemanticExplorer, explorerChildren } from '../analyzer/semantic/semanticExplorer';
import { recordExplorerCamera, recordExplorerSelection } from '../analyzer/semantic/semanticExplorerState';
import { matchingSemanticFields, searchSemanticNodes } from '../analyzer/semantic/search';
import { semanticTraceCache } from '../analyzer/semantic/traceCache';
import { importExecutionTrace } from '../analyzer/semantic/traces';
import { adaptDataExecutionTrace, importDataExecutionTrace } from '../analyzer/semantic/dataTrace';
import { semanticNavigationContext } from '../analyzer/semantic/navigation';
import { AnalyzerProjectHeader, AnalyzerSearchControl, AnalyzerViewHeading } from '../components/analyzer/AnalyzerViewChrome';
import { AnalyzerViewTabs } from '../components/analyzer/AnalyzerToolbar';
import { SearchResultStrip } from '../components/analyzer/SearchResultStrip';
import { SemanticFlowStage } from '../components/analyzer/SemanticFlowStage';
import { SemanticFlowDetail } from '../components/analyzer/SemanticFlowDetail';
import { semanticFlowDirectionLanguage } from '../components/analyzer/semanticFlowLanguage';
import { semanticNodeDisplays } from '../components/analyzer/semanticFlowDisplay';
import { modelChoiceId } from '../components/analyzer/modelChoiceDisplay';
import { useSemanticFlowHover } from '../components/analyzer/useSemanticFlowHover';
import { useWorkspaceFullscreen } from '../components/analyzer/useWorkspaceFullscreen';
import { useSemanticExplorerNavigation } from '../components/analyzer/useSemanticExplorerNavigation';
import { analyzerRoutes } from '../utils/routes';
import './semantic-flow.css';

const semanticFlowDefaults: NonNullable<AnalyzerViewSession['semantic']> = { scope: '', kind: '', confidence: '', layer: 'source', depth: 0, direction: 'both', orbit: false, overview: true, page: 0, auxiliary: false, members: undefined };
const defaultFlow: NonNullable<AnalyzerViewSession['flow']> = { mode: '2d', expandedGroupIds: [] };
const defaultOrbitFlow: NonNullable<AnalyzerViewSession['flow']> = { mode: '3d', expandedGroupIds: [] };
const emptyAnalysis: SemanticAnalysis = { nodes: [], edges: [], coverage: [], warnings: [], stats: { files: 0, functions: 0, models: 0, unresolved: 0, elapsedMs: 0 } };

export default function FlowAnalyzerPage({ view }: { view: SemanticExplorerViewId }) {
  const { state, updateView, setActiveView, setFlowGroupBounds, setAutoAggregation, replaceProject } = useAnalyzerSession(), navigate = useNavigate();
  const store = state.store, session = state.views[view], options = session.semantic ?? semanticFlowDefaults;
  const flow = session.flow ?? (options.orbit ? defaultOrbitFlow : defaultFlow);
  const [loaded, setLoaded] = useState<{ store: AnalyzerProjectStore; analysis: SemanticAnalysis }>();
  const [progress, setProgress] = useState({ done: 0, total: 0 }), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [settings, setSettings] = useState(false), [rescanning, setRescanning] = useState(false), [traceError, setTraceError] = useState('');
  const [, setTraceVersion] = useState(0), [notice, setNotice] = useState(''), [unavailable3D, setUnavailable3D] = useState(false);
  const traceInput = useRef<HTMLInputElement>(null), focusNonce = useRef(0);
  const traceRequest = useRef(0), rescanRequest = useRef(0), traceContext = useRef({ store, view, folder: state.folderHandle });
  traceContext.current = { store, view, folder: state.folderHandle };
  useEffect(() => { const traceToken = traceRequest, rescanToken = rescanRequest; setRescanning(false); return () => { traceToken.current++; rescanToken.current++; }; }, [store, view, state.folderHandle]);
  const [focus, setFocus] = useState<{ nonce: number; ids: string[]; mode?: '2d' | '3d' }>();
  const [requestInspection, setRequestInspection] = useState<{ context: string; id: string }>();
  const requestFocus = useCallback((mode: '2d' | '3d', ids: string[]) => setFocus({ nonce: ++focusNonce.current, ids, mode }), []);
  const fullscreen = useWorkspaceFullscreen(Boolean(store));
  const analysis = loaded?.store === store ? loaded?.analysis : undefined;
  const rawTraces = store ? semanticTraceCache.get(store) : undefined;
  const traces = useMemo(() => view === 'architecture-map' ? undefined : view === 'data-flow' && rawTraces ? adaptDataExecutionTrace(rawTraces) : view === 'data-model' ? undefined : rawTraces, [rawTraces, view]);
  useEffect(() => { setActiveView(view); setNotice(''); }, [view, state.scanVersion, setActiveView]);
  useEffect(() => {
    setError(''); if (!store) return;
    let active = true;
    const job = getSemanticAnalysis(store, next => { if (active) setProgress({ ...next }); });
    job.promise.then(result => { if (active) setLoaded({ store, analysis: result }); }, reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; job.unsubscribe(); };
  }, [store, retry]);
  const graph = useMemo(() => projectSemanticView(analysis ?? emptyAnalysis, view, traces, view === 'data-model' ? 'source' : options.layer), [analysis, view, traces, options.layer]);
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const allNodes = useMemo(() => new Map([...(analysis?.nodes ?? []), ...graph.nodes].map(node => [node.id, node])), [analysis, graph.nodes]);
  const selected = session.selectedNodeId ? byId.get(session.selectedNodeId) : undefined;
  const architectureLocation = session.explorer?.twoD.location;
  const filtered = useMemo<SemanticGraph>(() => {
    const members = options.members ? new Set(options.members) : undefined;
    const nodes = graph.nodes.filter(node => (!options.scope || node.group === options.scope || node.path?.startsWith(options.scope))
      && (!options.kind || (view === 'architecture-map' ? node.architecture?.kind : node.kind) === options.kind) && (!options.confidence || node.confidence === options.confidence)
      && (options.auxiliary || !(node.group === 'Tests' || node.attributes.generated || node.attributes.auxiliary))
      && (!members || members.has(node.id)));
    const ids = new Set(nodes.map(node => node.id)); return { view, nodes, edges: graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
  }, [graph, view, options.scope, options.kind, options.confidence, options.auxiliary, options.members]);
  const filteredIds = useMemo(() => new Set(filtered.nodes.map(node => node.id)), [filtered.nodes]);
  const architectureBase = useMemo(() => view === 'architecture-map' ? prepareArchitectureScope(graph, architectureLocation?.scopeId === 'project' ? undefined : architectureLocation?.scopeId, options.environment, options.auxiliary, filteredIds) : undefined,
    [graph, view, architectureLocation?.scopeId, options.environment, options.auxiliary, filteredIds]);
  const architectureVisible = useMemo(() => architectureBase ? projectArchitectureScope(architectureBase, { mode: flow.mode, surroundings: session.architecture?.surroundings ?? true,
    selectedNodeId: session.selectedNodeId, selectedEdgeId: session.selectedEdgeId, expandedRequestGroupIds: session.architecture?.expandedRequestGroupIds }) : filtered,
    [architectureBase, filtered, flow.mode, session.architecture?.surroundings, session.architecture?.expandedRequestGroupIds, session.selectedNodeId, session.selectedEdgeId]);
  const stageGraph = view === 'architecture-map' ? architectureVisible : filtered;
  const selectedEdge = architectureVisible.edges.find(edge => edge.id === session.selectedEdgeId)
    ?? architectureVisible.architectureView?.internalRelations.find(edge => edge.id === session.selectedEdgeId)
    ?? architectureVisible.architectureView?.boundaryRelations.find(edge => edge.id === session.selectedEdgeId)
    ?? graph.edges.find(edge => edge.id === session.selectedEdgeId);
  const results = useMemo(() => searchSemanticNodes(architectureBase?.allowed ?? filtered.nodes, session.search), [architectureBase, filtered.nodes, session.search]);
  const searchDisplays = useMemo(() => semanticNodeDisplays(graph.nodes), [graph.nodes]);
  const stageDisplays = useMemo(() => view === 'architecture-map' ? semanticNodeDisplays(stageGraph.nodes, byId) : searchDisplays, [view, stageGraph.nodes, searchDisplays, byId]);
  const matchIds = useMemo(() => new Set(results.map(result => result.id)), [results]);
  const knownFiles = useMemo(() => new Set([...(store?.files.map(file => file.relativePath) ?? []), ...Object.keys(store?.sources ?? {}), ...Object.keys(store?.semanticSources ?? {})]), [store]);
  const explorer = useMemo(() => buildSemanticExplorer(graph, knownFiles), [graph, knownFiles]);
  const navigation = useSemanticExplorerNavigation({ view, scanVersion: state.scanVersion, session, explorer, edges: graph.edges, ready: Boolean(analysis), updateView, onFocus: requestFocus });
  const explorerLocation = useMemo(() => ({ ...navigation.location, direction: options.direction }), [navigation.location, options.direction]);
  const selectedIds = useMemo(() => new Set(selected ? [selected.id] : []), [selected]);
  const hoverContext = useMemo(() => ({ view, scanVersion: state.scanVersion, mode: flow.mode, visitId: navigation.visitId, selectedId: selected?.id, selectedEdgeId: selectedEdge?.id, graph: stageGraph, direction: options.direction }), [view, state.scanVersion, flow.mode, navigation.visitId, selected?.id, selectedEdge?.id, stageGraph, options.direction]);
  const { hoverTarget, onHoverTarget, clearHover } = useSemanticFlowHover(hoverContext);
  const currentChildren = useMemo(() => explorerChildren(explorer, explorerLocation, filteredIds), [explorer, explorerLocation, filteredIds]);
  const allowedIds = useMemo(() => architectureBase ? new Set(architectureBase.allowed.map(node => node.id)) : filteredIds, [architectureBase, filteredIds]);
  const hiddenSelection = Boolean(selected && !allowedIds.has(selected.id) || selectedEdge && (!allowedIds.has(selectedEdge.source) || !allowedIds.has(selectedEdge.target)));
  const inspectionContext = `${state.scanVersion}:${view}:${flow.mode}:${architectureLocation?.scopeId}:${options.environment}:${options.scope}:${options.kind}:${options.confidence}:${options.auxiliary}`;
  const inspectedRequests = requestInspection?.context === inspectionContext ? architectureVisible.architectureView?.requestGroups.find(group => group.id === requestInspection.id) : undefined;
  const clearSelection = useCallback(() => { setRequestInspection(undefined); updateView(view, current => recordExplorerSelection(current, { selectedNodeId: undefined, selectedEdgeId: undefined, detailOpen: false })); }, [updateView, view]);
  useEffect(() => {
    if (!analysis) return;
    if (session.selectedNodeId && !byId.has(session.selectedNodeId) || session.selectedEdgeId && !selectedEdge) {
      clearSelection(); setNotice('現在の表示データに存在しない選択を解除しました。');
    }
  }, [analysis, byId, selectedEdge, session.selectedNodeId, session.selectedEdgeId, clearSelection]);
  const changeOptions = (patch: Partial<typeof options>) => updateView(view, { semantic: { ...options, page: 0, ...patch } });
  const changeMode = (mode: '2d' | '3d') => { if (mode === '3d') setUnavailable3D(false); navigation.changeMode(mode); };
  const saveCamera = useCallback((mode: '2d' | '3d', camera: NonNullable<AnalyzerViewSession['flowCameras']>['2d' | '3d']) => {
    if (camera) updateView(view, current => recordExplorerCamera(current, mode, camera));
  }, [updateView, view]);
  const selectNode = (id: string) => {
    if (stageGraph.architectureView?.requestGroups.some(group => group.id === id)) { setRequestInspection({ context: inspectionContext, id }); return; }
    setRequestInspection(undefined);
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
    const edge = stageGraph.edges.find(item => item.id === id) ?? stageGraph.architectureView?.internalRelations.find(item => item.id === id)
      ?? stageGraph.architectureView?.boundaryRelations.find(item => item.id === id) ?? graph.edges.find(item => item.id === id); if (!edge) return;
    setRequestInspection(undefined);
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
  const jump = (id: string, targetView: SemanticViewId, fieldId?: string) => {
    const node = allNodes.get(id); if (!node) return;
    const layer = targetView === 'data-model' ? 'source' : options.layer;
    const context = semanticNavigationContext(projectSemanticView(analysis ?? emptyAnalysis, targetView, traces, layer), node);
    if ((view === 'data-flow' || view === 'data-model') && targetView !== 'architecture-map' && context.target) {
      updateView(targetView, current => ({ ...current, selectedNodeId: context.target!.id, selectedEdgeId: undefined, semanticFieldId: fieldId, detailOpen: true,
        semantic: { ...(current.semantic ?? semanticFlowDefaults), layer, scope: '', kind: '', confidence: '', members: undefined, auxiliary: true } }));
      navigate(analyzerRoutes[targetView], { state: { semanticExplorerJump: { targetId: context.target.id } } }); return;
    }
    updateView(targetView, current => ({ ...current, selectedNodeId: context.target?.id, selectedEdgeId: undefined, detailOpen: Boolean(context.target), search: context.search,
      semantic: { ...semanticFlowDefaults, layer, auxiliary: options.auxiliary, members: context.members, overview: !context.target, depth: context.target ? 1 : 0 },
      ...(targetView === 'runtime-flow' || targetView === 'function-call-flow' ? {} : { semanticCamera: undefined, flowCameras: undefined }),
      flow: { ...(current.flow ?? defaultFlow), expandedGroupIds: [] } }));
    navigate(analyzerRoutes[targetView], targetView !== 'architecture-map' ? { state: { semanticExplorerJump: { targetId: context.target?.id } } } : undefined);
  };
  const importTrace = async (file?: File) => {
    if (!file || !store) return; setTraceError('');
    const request = ++traceRequest.current, contextStore = store, contextView = view;
    const current = () => request === traceRequest.current && traceContext.current.store === contextStore && traceContext.current.view === contextView;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('実行データは20 MB以下に分割してください。');
      const text = await file.text();
      if (!current()) return;
      semanticTraceCache.set(store, view === 'data-flow' ? importDataExecutionTrace(text, file.name, analysis) : importExecutionTrace(text, file.name, analysis)); setTraceVersion(value => value + 1); changeOptions({ layer: 'combined' });
    } catch (reason) { if (current()) setTraceError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const rescan = async () => {
    if (!state.folderHandle) return; setRescanning(true); setError('');
    const request = ++rescanRequest.current, folder = state.folderHandle, contextStore = store, contextView = view;
    const current = () => request === rescanRequest.current && traceContext.current.store === contextStore && traceContext.current.view === contextView && traceContext.current.folder === folder;
    try {
      if (store) cancelSemanticAnalysis(store);
      const files = await filesFromDirectoryHandle(folder); if (!current()) return;
      const nextStore = await scanProjectFiles(files); if (!current()) return;
      replaceProject(nextStore, folder);
    } catch { if (current()) setError('再解析できませんでした。フォルダを選び直してください。'); }
    finally { if (current()) setRescanning(false); }
  };
  const activeFilters = [options.scope, options.kind, options.confidence, options.layer !== 'source', options.direction !== 'both', options.auxiliary, options.members?.length].filter(Boolean).length;
  return <div className="page-stack analyzer-page semantic-flow-page">
    <AnalyzerProjectHeader onScanned={replaceProject} />
    <section className="analyzer-shell" aria-labelledby="analyzer-view-title">
      <AnalyzerViewHeading view={view}><span>{store?.files.length ?? 0} files indexed</span><span title={semanticQuestions[view]}>{analysis ? view === 'architecture-map' ? `表示中 ${(stageGraph.architectureView?.detailEntityCount ?? 0) + (stageGraph.architectureView?.contextEntityCount ?? 0)}構成要素 / 未特定要求 ${stageGraph.architectureView?.requestCount ?? 0}対象 · 線 ${stageGraph.edges.length}本` : `解析全体 ${graph.nodes.length.toLocaleString()}対象 · 絞り込み後 ${filtered.nodes.length.toLocaleString()}対象 / ${filtered.edges.length.toLocaleString()}関係 · ${flow.mode === '3d' ? '3Dは全体を表示' : explorerLocation.centerId ? '中心からの局所関係' : `この階層 ${currentChildren.length.toLocaleString()}項目`}` : store ? 'ソースを解析中' : 'プロジェクト未選択'}</span></AnalyzerViewHeading>
      <div className="analyzer-toolbar"><AnalyzerViewTabs /><div className="analyzer-control-row">
        <AnalyzerSearchControl value={session.search} onChange={search => updateView(view, { search })} label={view === 'architecture-map' ? '構成要素を検索' : '関数・データ・モデルを検索'} placeholder="名前・パス・所属（複数語はAND）" />
        {view === 'architecture-map' && Boolean(analysis?.architecture?.environments.length) && <label className="analyzer-filter-control"><span>環境</span><select aria-label="構成の環境" value={options.environment ?? ''} onChange={event => { clearSelection(); changeOptions({ environment: event.target.value }); }}><option value="">論理構成・全設定</option>{analysis?.architecture?.environments.map(name => <option key={name}>{name}</option>)}</select></label>}
        <label className="analyzer-filter-control"><span>責務</span><select value={options.scope} onChange={event => changeOptions({ scope: event.target.value, members: undefined })}><option value="">すべて</option>{[...new Set(graph.nodes.map(node => node.group))].sort().map(group => <option key={group}>{group}</option>)}</select></label>
        <label className="analyzer-filter-control"><span>種類</span><select value={options.kind} onChange={event => changeOptions({ kind: event.target.value })}><option value="">すべて</option>{[...new Set(graph.nodes.map(node => view === 'architecture-map' ? node.architecture?.kind ?? node.kind : node.kind))].sort().map(kind => <option key={kind} value={kind}>{view === 'architecture-map' ? architectureKindLabels[kind as keyof typeof architectureKindLabels] : kindLabels[kind as keyof typeof kindLabels]}</option>)}</select></label>
        <button type="button" className="analyzer-quiet-button" aria-expanded={settings} aria-controls="semantic-flow-settings" onClick={() => setSettings(!settings)}>詳細設定{activeFilters ? ` (${activeFilters})` : ''}</button>
      </div></div>
      {settings && <div id="semantic-flow-settings" className="semantic-flow-settings">
        <label>確度<select value={options.confidence} onChange={event => changeOptions({ confidence: event.target.value })}><option value="">すべて</option>{Object.entries(confidenceLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        {view === 'architecture-map' ? <p>構成図はソースと配置設定から作成します。現在の稼働・通信は観測していません。</p> : view !== 'data-model' ? <label>表示データ<select value={options.layer} onChange={event => changeOptions({ layer: event.target.value as typeof options.layer })}><option value="source">ソース解析</option><option value="observed">実行ログ・Trace</option><option value="combined">ソース ＋ 実測</option></select></label> : <p>データ構造はソースの定義を表示します。現在のTrace形式にはモデル定義との比較用サンプルがありません。</p>}
        <label>線の方向（選択対象）<select value={options.direction} onChange={event => changeOptions({ direction: event.target.value as typeof options.direction })}><option value="both">入る・出る関係</option><option value="incoming">{semanticFlowDirectionLanguage(view).incoming}から</option><option value="outgoing">{semanticFlowDirectionLanguage(view).outgoing}へ</option></select></label>
        <label className="semantic-flow-checkbox"><input type="checkbox" checked={Boolean(options.auxiliary)} onChange={event => changeOptions({ auxiliary: event.target.checked })} />Test・生成定義を含む</label>
        {view !== 'data-model' && view !== 'architecture-map' && <button type="button" className="analyzer-quiet-button" disabled={!analysis} onClick={() => traceInput.current?.click()}>実行データを読み込む</button>}
        <button type="button" className="analyzer-quiet-button" disabled={!state.folderHandle || rescanning} onClick={() => void rescan()}>{rescanning ? '再解析中…' : '再解析'}</button>
        <button type="button" className="analyzer-quiet-button" onClick={() => updateView(view, { semantic: { ...semanticFlowDefaults } })}>フィルターを解除</button>
      </div>}
      <input ref={traceInput} type="file" hidden accept=".json,.jsonl,.ndjson,.log" aria-label="実行ログ・Traceファイル" onChange={event => { void importTrace(event.target.files?.[0]); event.target.value = ''; }} />
      {traceError && <p className="semantic-error" role="alert">{traceError}</p>}
      {traces && <p className="semantic-trace-info">{traces.name} · {traces.spans} spans · {traces.logs} logs <button type="button" onClick={() => { traceRequest.current++; if (store) semanticTraceCache.delete(store); setTraceVersion(value => value + 1); changeOptions({ layer: 'source' }); }}>実行データを解除</button></p>}
      {error && <p className="semantic-error" role="alert">{error} <button type="button" onClick={() => { if (store) cancelSemanticAnalysis(store); setRetry(value => value + 1); }}>再実行</button></p>}
      {!analysis && store && !error && <div className="semantic-flow-progress" role="status"><progress value={progress.done} max={Math.max(1, progress.total)} /><span>ソースを解析中… {progress.done} / {progress.total}</span><button type="button" onClick={() => cancelSemanticAnalysis(store)}>解析を中止</button></div>}
      {notice && <p className="semantic-flow-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')}>閉じる</button></p>}
      {unavailable3D && <p className="semantic-flow-notice" role="status">この環境では3D描画を継続できません。検索・選択を保持して2Dエクスプローラーを表示しています。<button type="button" onClick={() => changeMode('3d')}>3Dを再試行</button></p>}
      {hiddenSelection && <p className="semantic-flow-notice" role="status">選択中の「{selected?.label ?? selectedEdge?.label}」は現在のフィルターで非表示です。<button type="button" onClick={restoreSelection}>フィルターを解除して表示</button><button type="button" onClick={clearSelection}>選択解除</button></p>}
      {analysis && view === 'architecture-map' && !stageGraph.nodes.length && <p className="semantic-flow-notice" role="status">{!graph.nodes.length ? '読み込んだファイルから構成要素を確認できませんでした。解析範囲で対象ファイルと対応形式を確認できます。' : !architectureVisible.nodes.length && architectureLocation?.scopeId && architectureLocation.scopeId !== 'project' ? 'この範囲に表示できる内部構成がありません。親へ戻り、詳細の元ファイルや専門Viewを確認できます。' : '現在の環境・フィルターに表示対象がありません。構成が存在しないことを意味しません。'}</p>}
      {analysis && (view === 'data-flow' || view === 'data-model') && !filtered.nodes.length && <p className="semantic-flow-notice" role="status">{graph.nodes.length ? '適用中のフィルターですべての対象が除外されています。詳細設定から条件を確認できます。'
        : view === 'data-flow' && options.layer === 'observed' ? 'この実行記録には表示できる入出力の名前がありません。data.input.name / data.output.name を持つspanを対象とし、未記録の値や因果関係は生成しません。'
          : view === 'data-model' ? '読み込んだソースに、表示対象のモデル定義がありません。解析範囲で未対応・部分解析・失敗の有無を確認できます。'
            : '読み込んだソースに、表示対象の値・操作がありません。解析範囲で対象ファイルと解析状態を確認できます。'}</p>}
      <SearchResultStrip query={session.search} items={results.map(result => {
        const display = searchDisplays.get(result.id);
        const location = display?.location ?? `${result.path ?? result.node.group}${result.node.line ? `:${result.node.line}` : ''}`;
        return { id: result.id, label: flow.mode === '2d' || view === 'data-flow' ? display?.title ?? result.label : result.label, subtitle: `${display?.dataRole ? `${display.dataRole} · ` : ''}${result.node.kind === 'external' && !result.node.architecture ? '呼び出し箇所: ' : ''}${display?.disambiguation ?? location}`, reason: result.match.reason };
      })} selectedId={selected?.id} onSelect={id => {
        const node = byId.get(id), fields = node?.model ? matchingSemanticFields(node, session.search) : [];
        if (node?.model?.choices && fields.length) {
          const matching = new Set(fields.map(field => field.id));
          const choiceIds = node.model.choices.flatMap((choice, index) => choice.fields?.some(field => matching.has(field.id)) ? [modelChoiceId(node, index)] : []);
          updateView(view, current => ({ ...current, modelOpenChoiceIds: [...new Set([...current.modelOpenChoiceIds ?? [], ...choiceIds])] }));
        }
        navigation.jumpMode(flow.mode, id, fields.length === 1 ? fields[0]!.id : undefined);
      }} loading={Boolean(store && !analysis && !error)} />
      <div ref={fullscreen.root} className={`analyzer-workspace semantic-flow-workspace${session.detailOpen && (selected || selectedEdge) ? ' has-detail' : ''}${fullscreen.isFullscreen ? ' is-fullscreen' : ''}`}
        role={fullscreen.isFullscreen ? 'dialog' : undefined} aria-modal={fullscreen.isFullscreen || undefined} aria-label={fullscreen.isFullscreen ? `${view} 全画面表示` : undefined} onKeyDownCapture={fullscreen.onKeyDownCapture}>
        {store ? <SemanticFlowStage key={`${view}:${state.scanVersion}`} graph={stageGraph} explorer={explorer} nodeDisplays={stageDisplays} mode={flow.mode} direction={options.direction} selectedIds={selectedIds} selectedEdgeId={selectedEdge?.id} matchIds={matchIds} focus={focus}
          architectureControls={view === 'architecture-map' && flow.mode === '3d' && architectureBase?.scopeId ? <button type="button" aria-label="周辺構成" aria-pressed={session.architecture?.surroundings !== false} title="直接の接続先は残します" onClick={() => updateView(view, { architecture: { ...session.architecture, surroundings: session.architecture?.surroundings === false } })}>周辺構成：{session.architecture?.surroundings !== false ? '表示' : '非表示'}</button> : undefined}
          architectureOverlay={inspectedRequests && <ArchitectureRequestInspection group={inspectedRequests} nodes={byId} onSelect={selectNode} onClose={() => setRequestInspection(undefined)} expanded={session.architecture?.expandedRequestGroupIds?.includes(inspectedRequests.id) ?? false}
            onExpanded={expanded => updateView(view, { architecture: { ...session.architecture, expandedRequestGroupIds: [...session.architecture?.expandedRequestGroupIds?.filter(id => id !== inspectedRequests.id) ?? [], ...(expanded ? [inspectedRequests.id] : [])] } })} />}
          navigation={{ location: explorerLocation, activePath: navigation.activePath, visitId: navigation.visitId, scrollTop: navigation.scrollTop, canBack: navigation.canBack,
            onBack: navigation.back, onParent: navigation.parent, onProject: navigation.project, onOpenScope: navigation.openScope, onOpenNode: navigation.openNode,
            onCenter: navigation.openNode, onDefinition: navigation.openDefinition, onJumpMode: navigation.jumpMode, onDepth: depth => navigation.changeLocal({ depth, direction: options.direction }),
            onScroll: navigation.saveScroll, onRevealSelection: revealSelection }}
          cameras={session.flowCameras ?? (options.orbit && session.semanticCamera ? { '3d': session.semanticCamera } : undefined)} onCamera={saveCamera} onMode={changeMode}
          particleMode={flow.particleMode} onParticleMode={particleMode => updateView(view, { flow: { ...flow, particleMode } })}
          showGroupBounds={state.showFlowGroupBounds ?? true} onGroupBounds={setFlowGroupBounds}
          autoAggregation={state.autoAggregation ?? true} onAutoAggregation={setAutoAggregation} aggregationState={session.aggregation} onAggregationState={aggregation => updateView(view, { aggregation })} totalNodeCount={view === 'architecture-map' ? architectureVisible.nodes.length : graph.nodes.length}
          fineExpandedScopeIds={session.dataFineExpandedScopeIds ?? []} onFineExpandedScopeIds={dataFineExpandedScopeIds => updateView(view, { dataFineExpandedScopeIds })}
          hoverTarget={hoverTarget} onHoverTarget={onHoverTarget}
          onSelect={selectNode} onSelectEdge={selectEdge} onClear={clearSelection} isFullscreen={fullscreen.isFullscreen} onFullscreen={() => void fullscreen.toggle()}
          onUnavailable={() => { setUnavailable3D(true); navigation.changeMode('2d'); }} />
          : <div className="semantic-empty"><p>プロジェクトフォルダを選択すると、構造と関係を解析します。</p><p>ソースはブラウザ内で読み取り、外部へ送信しません。</p></div>}
        {store && view === 'architecture-map' && session.detailOpen && (selected || selectedEdge) && <ArchitectureDetail key={selected?.id ?? selectedEdge?.id} node={stageGraph.nodes.find(n => n.id === selected?.id) ?? selected} edge={selectedEdge} graph={graph} visible={stageGraph} sources={store.semanticSources ?? store.sources} store={store} analysis={analysis!} onOpen={navigation.openScope} onReveal={id => navigation.jumpMode(flow.mode, id)} onSelect={selectNode} onSelectEdge={selectEdge} onJump={jump} onHoverTarget={onHoverTarget} onClose={() => { clearHover(); updateView(view, current => recordExplorerSelection(current, { selectedNodeId: current.selectedNodeId, selectedEdgeId: current.selectedEdgeId, detailOpen: false })); }} />}
        {store && view !== 'architecture-map' && session.detailOpen && (selected || selectedEdge) && <SemanticFlowDetail key={selected?.id ?? selectedEdge?.id} node={selected} edge={selectedEdge} nodes={allNodes} edges={graph.edges} sources={store.semanticSources ?? store.sources} view={view}
          openChoiceIds={session.modelOpenChoiceIds} onOpenChoiceIds={modelOpenChoiceIds => updateView(view, { modelOpenChoiceIds })}
          fieldId={session.semanticFieldId} onField={semanticFieldId => updateView(view, current => recordExplorerSelection(current, { selectedNodeId: current.selectedNodeId, selectedEdgeId: current.selectedEdgeId, detailOpen: current.detailOpen, semanticFieldId }))}
          hoverTarget={hoverTarget} onHoverTarget={onHoverTarget}
          onSelect={selectNode} onSelectEdge={selectEdge} onClose={() => { clearHover(); updateView(view, current => recordExplorerSelection(current, { selectedNodeId: current.selectedNodeId, selectedEdgeId: current.selectedEdgeId, detailOpen: false })); }} onJump={jump} />}
      </div>
      {analysis && <details className="semantic-coverage"><summary>解析範囲 · {analysis.stats.files.toLocaleString()} files · 解析全体で定義先が未特定の呼び出し {analysis.stats.unresolved.toLocaleString()}箇所 · {(analysis.stats.elapsedMs / 1000).toFixed(1)}秒</summary>
        <p>ソースで確認＝構文上の宣言・関係。推定＝名前・設定・callback契約からの対応付け。実測＝読み込んだ実行記録。未解決＝静的に呼び出し先を確定できない関係。イベント登録と実際の実行は区別されます。</p>
        <p>検索は名前・パス・所属・明示的な識別名を対象に、複数語のすべてを含む候補を返します。入力で配置や選択は変わりません。2Dの関係図と粒子は、実測された実行順序を示すものではありません。</p>
        {[...analysis.warnings, ...(view === 'architecture-map' ? analysis.architecture?.limitations ?? [] : []), ...(store?.warnings.map(item => item.message) ?? []), ...(traces?.warnings ?? [])].map((warning, index) => <p key={index}>{warning}</p>)}
        <details><summary>ファイルごとの解析結果</summary><ul>{analysis.coverage.map((file, index) => <li key={`${file.path}:${index}`}><code>{file.path}</code> · {file.language} · {file.status}{file.message ? ` · ${file.message}` : ''}</li>)}</ul></details>
      </details>}
    </section>
  </div>;
}
