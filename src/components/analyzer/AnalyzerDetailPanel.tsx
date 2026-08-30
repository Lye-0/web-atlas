import { Link } from 'react-router-dom';
import { displayDictionaryStack, factDictionaryStackId, factForNode, nodeTypeLabels } from '../../analyzer';
import type { AnalyzerProjectStore, AnalyzerViewEdge, AnalyzerViewModel, AnalyzerViewNode } from '../../analyzer';
import { stackPath } from '../../utils/routes';
import { EvidenceCodeBlock } from './EvidenceCodeBlock';

interface AnalyzerDetailPanelProps {
  store: AnalyzerProjectStore;
  view: AnalyzerViewModel;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  onSelectNode: (nodeId: string) => void;
}

function metadataValue(value: AnalyzerViewNode['metadata'][string]): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === undefined) return '';
  return String(value);
}

function EvidenceList({ evidenceIds, view, store }: { evidenceIds: string[]; view: AnalyzerViewModel; store: AnalyzerProjectStore }) {
  const evidence = evidenceIds
    .map((id) => view.evidence.find((candidate) => candidate.id === id))
    .filter((candidate, index, values): candidate is NonNullable<typeof candidate> => Boolean(candidate) && values.indexOf(candidate) === index);
  if (evidence.length === 0) return <p className="analyzer-empty-evidence">直接Evidenceはありません。</p>;
  return <div className="analyzer-evidence-list">{evidence.map((item) => <EvidenceCodeBlock key={item.id} evidence={item} source={store.sources[item.filePath]} />)}</div>;
}

function RelationList({ nodeId, view, onSelectNode }: { nodeId: string; view: AnalyzerViewModel; onSelectNode: (nodeId: string) => void }) {
  const relations = view.edges.filter((edge) => edge.sourceId === nodeId || edge.targetId === nodeId);
  if (relations.length === 0) return <p className="analyzer-muted-copy">このViewで表示している直接関係はありません。</p>;
  return (
    <ul className="analyzer-relation-list">
      {relations.map((relation) => {
        const targetId = relation.sourceId === nodeId ? relation.targetId : relation.sourceId;
        const target = view.nodes.find((node) => node.id === targetId);
        if (!target) return null;
        return (
          <li key={relation.id}>
            <button type="button" onClick={() => onSelectNode(target.id)}>
              <span>{relation.label}</span>
              <strong>{target.label}</strong>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MetadataList({ metadata }: { metadata: AnalyzerViewNode['metadata'] }) {
  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined && value !== '');
  if (entries.length === 0) return null;
  return (
    <dl className="analyzer-metadata-list">
      {entries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{metadataValue(value)}</dd></div>)}
    </dl>
  );
}

function NodeDetails({ node, view, store, onSelectNode }: { node: AnalyzerViewNode; view: AnalyzerViewModel; store: AnalyzerProjectStore; onSelectNode: (nodeId: string) => void }) {
  const fact = factForNode(store, node);
  const dictionary = displayDictionaryStack(factDictionaryStackId(fact ?? node));
  return (
    <>
      <div className="analyzer-detail-heading">
        <span className="analyzer-node-type">{nodeTypeLabels[node.type] ?? node.type}</span>
        <h2>{node.label}</h2>
        {node.subtitle && <p>{node.subtitle}</p>}
      </div>
      <section className="analyzer-detail-section">
        <h3>Overview</h3>
        <p>{fact?.metadata.role ? String(fact.metadata.role) : 'このNodeは選択中のAnalyzer Viewで検出・表示されています。'}</p>
        {dictionary && <Link className="analyzer-dictionary-link" to={stackPath(dictionary.id)}>Dictionaryで見る <span aria-hidden="true">→</span></Link>}
      </section>
      <section className="analyzer-detail-section">
        <h3>Evidence</h3>
        <EvidenceList evidenceIds={node.evidenceIds} view={view} store={store} />
      </section>
      <section className="analyzer-detail-section">
        <h3>Relations</h3>
        <RelationList nodeId={node.id} view={view} onSelectNode={onSelectNode} />
      </section>
      <section className="analyzer-detail-section">
        <h3>Metadata</h3>
        <MetadataList metadata={node.metadata} />
      </section>
    </>
  );
}

function EdgeDetails({ edge, view, store, onSelectNode }: { edge: AnalyzerViewEdge; view: AnalyzerViewModel; store: AnalyzerProjectStore; onSelectNode: (nodeId: string) => void }) {
  const source = view.nodes.find((node) => node.id === edge.sourceId);
  const target = view.nodes.find((node) => node.id === edge.targetId);
  return (
    <>
      <div className="analyzer-detail-heading">
        <span className="analyzer-node-type">Relation</span>
        <h2>{edge.label}</h2>
        <p>{source?.label ?? edge.sourceId} → {target?.label ?? edge.targetId}</p>
      </div>
      <section className="analyzer-detail-section">
        <h3>Relation</h3>
        <p className="analyzer-edge-summary">{source?.label ?? edge.sourceId} <span aria-hidden="true">→</span> {target?.label ?? edge.targetId}</p>
        <div className="analyzer-edge-actions">
          {source && <button type="button" onClick={() => onSelectNode(source.id)}>Sourceを見る</button>}
          {target && <button type="button" onClick={() => onSelectNode(target.id)}>Targetを見る</button>}
        </div>
      </section>
      <section className="analyzer-detail-section">
        <h3>Evidence</h3>
        <EvidenceList evidenceIds={edge.evidenceIds} view={view} store={store} />
      </section>
      <section className="analyzer-detail-section">
        <h3>Metadata</h3>
        <MetadataList metadata={edge.metadata} />
      </section>
    </>
  );
}

export function AnalyzerDetailPanel({ store, view, selectedNodeId, selectedEdgeId, onSelectNode }: AnalyzerDetailPanelProps) {
  const node = selectedNodeId ? view.nodes.find((candidate) => candidate.id === selectedNodeId) : undefined;
  const edge = selectedEdgeId ? view.edges.find((candidate) => candidate.id === selectedEdgeId) : undefined;
  return (
    <aside className="analyzer-detail-panel" aria-label="Analyzer detail panel">
      {!node && !edge ? (
        <div className="analyzer-detail-empty">
          <span className="analyzer-panel-kicker">Selection</span>
          <h2>NodeまたはEdgeを選択</h2>
          <p>Graph上の要素を選ぶと、検出理由・直接Evidence・関係・metadataを表示します。</p>
        </div>
      ) : node ? (
        <NodeDetails node={node} view={view} store={store} onSelectNode={onSelectNode} />
      ) : edge ? (
        <EdgeDetails edge={edge} view={view} store={store} onSelectNode={onSelectNode} />
      ) : null}
    </aside>
  );
}
