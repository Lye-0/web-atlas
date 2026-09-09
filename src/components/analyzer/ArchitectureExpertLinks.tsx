import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectAnalyzerView, useAnalyzerSession, type AnalyzerProjectStore } from '../../analyzer';
import type { SemanticNode } from '../../analyzer/semantic/types';
import { analyzerRoutes } from '../../utils/routes';

export function ArchitectureExpertLinks({ node, store }: { node: SemanticNode; store: AnalyzerProjectStore }) {
  const navigate = useNavigate(), { state, updateView } = useAnalyzerSession();
  const views = useMemo(() => {
    const paths = new Set([...node.architecture!.files, ...node.evidence.map(e => e.path)]);
    const evidence = new Map(store.evidence.map(e => [e.id, e.filePath]));
    return (['workspace', 'command', 'dependencies', 'module-dependency'] as const).map(view => {
      const model = projectAnalyzerView(store, view);
      const candidates = model.nodes.filter(item => !item.presentation?.childNodeIds?.length &&
        (typeof item.metadata.modulePath === 'string' ? paths.has(item.metadata.modulePath) : item.evidenceIds.some(id => paths.has(evidence.get(id) ?? ''))));
      return { view, model, candidates };
    });
  }, [node, store]);
  return <>{views.map(({ view, model, candidates }) => <details key={view}><summary>{({ workspace: 'Workspace', command: 'Command', dependencies: 'Dependencies', 'module-dependency': 'Module Dependency' })[view]} · {candidates.length}候補</summary>
    {candidates.length ? candidates.map(candidate => <p key={candidate.id}><button onClick={() => {
      const expanded = new Set<string>(); let parent = candidate.presentation?.parentId;
      while (parent && !expanded.has(parent)) { expanded.add(parent); parent = model.nodes.find(n => n.id === parent)?.presentation?.parentId; }
      updateView(view, { selectedNodeId: candidate.id, selectedEdgeId: undefined, selectedRegionId: undefined, detailOpen: true, search: '', filter: 'all', expandedPresentationIds: expanded });
      navigate(analyzerRoutes[view], { state: { analyzerFocus: { view, id: candidate.id, scanVersion: state.scanVersion } } });
    }}>{candidate.label}{candidate.subtitle ? ` · ${candidate.subtitle}` : ''}</button></p>) : <p>読み込まれたfactに対応する対象がありません。</p>}
  </details>)}</>;
}
