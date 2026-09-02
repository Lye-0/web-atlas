import { Link } from 'react-router-dom';
import { analyzerSummaryExpanded, analyzerSummarySubtitle, displayDictionaryStack, factDictionaryStackId, factForNode, nodeTypeLabels, relationLabelForNode } from '../../analyzer';
import type { AnalyzerProjectStore, AnalyzerSemanticRegion, AnalyzerViewEdge, AnalyzerViewModel, AnalyzerViewNode } from '../../analyzer';
import { stackPath } from '../../utils/routes';
import { EvidenceCodeBlock } from './EvidenceCodeBlock';

interface AnalyzerDetailPanelProps {
  store: AnalyzerProjectStore;
  view: AnalyzerViewModel;
  selectedNodeId?: string;
  selectedRegionId?: string;
  selectedEdgeId?: string;
  expandedPresentationIds: ReadonlySet<string>;
  onSelectNode: (nodeId: string, focus?: boolean) => void;
  onSelectRegion?: (regionId: string, focus?: boolean) => void;
  onTogglePresentation: (presentationId: string) => void;
  onClose: () => void;
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

function RelationList({ nodeId, view, onSelectNode, onSelectRegion }: { nodeId: string; view: AnalyzerViewModel; onSelectNode: (nodeId: string, focus?: boolean) => void; onSelectRegion?: (regionId: string, focus?: boolean) => void }) {
  const relations = view.edges.filter((edge) => edge.sourceId === nodeId || edge.targetId === nodeId);
  if (relations.length === 0) return <p className="analyzer-muted-copy">このViewで表示している直接関係はありません。</p>;
  return (
    <ul className="analyzer-relation-list">
      {relations.map((relation) => {
        const targetId = relation.sourceId === nodeId ? relation.targetId : relation.sourceId;
        const target = view.nodes.find((node) => node.id === targetId);
        const targetRegion = view.regions?.find((region) => region.id === targetId);
        if (!target && !targetRegion) return null;
        return (
          <li key={relation.id}>
            <button type="button" onClick={() => targetRegion ? onSelectRegion?.(targetRegion.id, true) : target && onSelectNode(target.id, true)}>
              <span>{relationLabelForNode(relation, nodeId)}</span>
              <strong>{target?.label ?? targetRegion?.label}</strong>
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

function displayNodeType(node: AnalyzerViewNode): string {
  const displayRole = node.metadata.displayRole;
  return typeof displayRole === 'string' ? displayRole : nodeTypeLabels[node.type] ?? node.type;
}

function PresentationChildren({ node, view, onSelectNode }: { node: AnalyzerViewNode; view: AnalyzerViewModel; onSelectNode: (nodeId: string, focus?: boolean) => void }) {
  const childNodes = (node.presentation?.childNodeIds ?? [])
    .map((childId) => view.nodes.find((candidate) => candidate.id === childId))
    .filter((candidate): candidate is AnalyzerViewNode => Boolean(candidate));
  if (childNodes.length === 0) return <p className="analyzer-muted-copy">展開対象の詳細Nodeはありません。</p>;
  return (
    <ul className="analyzer-presentation-list">
      {childNodes.map((child) => (
        <li key={child.id}>
          <button type="button" onClick={() => onSelectNode(child.id, true)}>
            <span>{displayNodeType(child)}</span>
            <strong>{child.label}</strong>
          </button>
        </li>
      ))}
    </ul>
  );
}

function evidenceFiles(node: AnalyzerViewNode, view: AnalyzerViewModel): string[] {
  return [...new Set(node.evidenceIds
    .map((evidenceId) => view.evidence.find((evidence) => evidence.id === evidenceId)?.filePath)
    .filter((filePath): filePath is string => Boolean(filePath)))];
}

function metadataString(node: AnalyzerViewNode, key: string): string | undefined {
  const value = node.metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function RegionChildren({ region, view, onSelectNode }: { region: AnalyzerSemanticRegion; view: AnalyzerViewModel; onSelectNode: (nodeId: string, focus?: boolean) => void }) {
  const childNodes = region.childIds
    .map((childId) => view.nodes.find((candidate) => candidate.id === childId))
    .filter((candidate): candidate is AnalyzerViewNode => Boolean(candidate));
  if (childNodes.length === 0) return <p className="analyzer-muted-copy">このRegionに表示するStack Nodeはありません。</p>;
  return (
    <ul className="analyzer-presentation-list analyzer-region-children-list">
      {childNodes.map((child) => (
        <li key={child.id}>
          <button type="button" onClick={() => onSelectNode(child.id, true)}>
            <span>{displayNodeType(child)}</span>
            <strong>{child.label}</strong>
            {child.subtitle && <small>{child.subtitle}</small>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function RegionRelationList({ region, view, onSelectNode, onSelectRegion }: { region: AnalyzerSemanticRegion; view: AnalyzerViewModel; onSelectNode: (nodeId: string, focus?: boolean) => void; onSelectRegion?: (regionId: string, focus?: boolean) => void }) {
  const relations = view.edges.filter((edge) => edge.sourceId === region.id || edge.targetId === region.id);
  if (relations.length === 0) return <p className="analyzer-muted-copy">このViewで表示している直接関係はありません。</p>;
  return (
    <ul className="analyzer-relation-list">
      {relations.map((relation) => {
        const targetId = relation.sourceId === region.id ? relation.targetId : relation.sourceId;
        const target = view.nodes.find((node) => node.id === targetId);
        const targetRegion = view.regions?.find((candidate) => candidate.id === targetId);
        if (!target && !targetRegion) return null;
        return (
          <li key={relation.id}>
            <button type="button" onClick={() => targetRegion ? onSelectRegion?.(targetRegion.id, true) : target && onSelectNode(target.id, true)}>
              <span>{relationLabelForNode(relation, region.id)}</span>
              <strong>{target?.label ?? targetRegion?.label}</strong>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RegionDetails({ region, view, store, onSelectNode, onSelectRegion }: { region: AnalyzerSemanticRegion; view: AnalyzerViewModel; store: AnalyzerProjectStore; onSelectNode: (nodeId: string, focus?: boolean) => void; onSelectRegion?: (regionId: string, focus?: boolean) => void }) {
  const scopePath = typeof region.metadata.scopePath === 'string' ? region.metadata.scopePath : region.subtitle ?? '.';
  const scopeKind = typeof region.metadata.scopeKind === 'string' ? region.metadata.scopeKind : region.scopeKind ?? 'physical';
  const scopeType = typeof region.metadata.scopeType === 'string' ? region.metadata.scopeType : 'scope';
  return (
    <>
      <div className="analyzer-detail-heading">
        <div className="analyzer-detail-heading-top">
          <span className="analyzer-node-type">REGION / SCOPE</span>
          <button type="button" className="analyzer-focus-selected" onClick={() => onSelectRegion?.(region.id, true)}>Focus Selected</button>
        </div>
        <h2>{region.label}</h2>
        {region.subtitle && <p>{region.subtitle}</p>}
      </div>
      <section className="analyzer-detail-section">
        <h3>Overview</h3>
        <p>Stack Map上の意味的なScope Regionです。個々のStack Nodeを内部に含み、Region境界のPortを介してProjectと接続します。</p>
      </section>
      <section className="analyzer-detail-section">
        <h3>Scope Region</h3>
        <dl className="analyzer-metadata-list analyzer-stack-usage-list">
          <div><dt>Kind</dt><dd>{scopeKind}</dd></div>
          <div><dt>Scope type</dt><dd>{scopeType}</dd></div>
          <div><dt>Path</dt><dd>{scopePath}</dd></div>
          <div><dt>Stacks</dt><dd>{region.childIds.length}</dd></div>
        </dl>
      </section>
      <section className="analyzer-detail-section">
        <h3>Contained Stack Nodes</h3>
        <RegionChildren region={region} view={view} onSelectNode={onSelectNode} />
      </section>
      <section className="analyzer-detail-section">
        <h3>Evidence</h3>
        <EvidenceList evidenceIds={region.evidenceIds} view={view} store={store} />
      </section>
      <section className="analyzer-detail-section">
        <h3>Relations</h3>
        <RegionRelationList region={region} view={view} onSelectNode={onSelectNode} onSelectRegion={onSelectRegion} />
      </section>
      <section className="analyzer-detail-section">
        <h3>Metadata</h3>
        <MetadataList metadata={region.metadata} />
      </section>
    </>
  );
}

function metadataStrings(node: AnalyzerViewNode, key: string): string[] {
  const value = node.metadata[key];
  return Array.isArray(value) ? value : value === undefined ? [] : [String(value)];
}

function detectionReason(node: AnalyzerViewNode, fact: ReturnType<typeof factForNode>, view: AnalyzerViewModel): string {
  if (node.presentation?.role === 'summary') {
    const childCount = typeof node.metadata.childCount === 'number' ? node.metadata.childCount : node.presentation.childNodeIds?.length ?? 0;
    return `${childCount}件の詳細Factをまとめた表示上のSummary Nodeです。展開して元のNodeとEvidenceを確認できます。`;
  }

  if (node.metadata.stackUsage === true) {
    const scopeLabel = metadataString(node, 'scopeLabel') ?? 'Project Root / Tooling';
    const scopePath = metadataString(node, 'scopePath');
    const evidenceRoles = [...new Set(node.evidenceIds
      .map((evidenceId) => view.evidence.find((evidence) => evidence.id === evidenceId)?.role)
      .filter((role): role is NonNullable<typeof role> => Boolean(role)))];
    const roleHint = evidenceRoles.length > 0 ? ` Evidence: ${evidenceRoles.join(' / ')}。` : '';
    return `${scopeLabel}${scopePath ? `（${scopePath}）` : ''}で使用されているDictionaryのCanonical Stackです。${roleHint}`;
  }

  if (node.metadata.stackMapScope === true) {
    const scopeLabel = metadataString(node, 'scopeLabel') ?? node.label;
    const scopePath = metadataString(node, 'scopePath');
    return `${scopeLabel}${scopePath ? `（${scopePath}）` : ''}の既存Project Fact / Evidenceを基準にしたStack MapのScopeです。`;
  }

  if (!fact) {
    if (node.type === 'command') {
      const commandType = typeof node.metadata.commandType === 'string' ? node.metadata.commandType : 'command';
      return commandType === 'user-command'
        ? `選択したEntry scriptを起点に、${node.label}を実行入口として展開しました。`
        : `package scriptのcommand fragment「${node.label}」として展開しました。`;
    }
    return `${nodeTypeLabels[node.type] ?? node.type}として、このViewの検出結果に追加しました。`;
  }

  const files = evidenceFiles(node, view);
  const source = files[0] ?? fact.filePath;
  switch (fact.kind) {
    case 'project':
      return source ? `${source}のproject metadataからProjectを検出しました。` : '選択したローカルFolderをProjectとして検出しました。';
    case 'workspace-config':
      return `${source ?? fact.filePath ?? 'workspace設定'}のpackages設定からpnpm workspaceを検出しました。`;
    case 'workspace-pattern':
      return `${source ?? fact.filePath ?? 'workspace設定'}のpackages pattern「${fact.pattern}」を検出しました。`;
    case 'workspace-package':
      return `${fact.manifestPath}のpackage manifestを${fact.isRoot ? 'root package' : 'workspace package'}として検出しました。`;
    case 'package-manifest':
      return `${fact.filePath ?? fact.packagePath}のpackage.json manifestとして検出しました。`;
    case 'package-script':
      return `${fact.sourcePath}のscripts.${fact.scriptName}からpackage scriptを検出しました。`;
    case 'external-package':
      return `${fact.packageName}が直接dependency declarationに含まれているためExternal Packageとして検出しました。`;
    case 'technology':
      return fact.explicit
        ? `${source ?? '設定ファイル'}の明示的な設定から${fact.label}を検出しました。`
        : `package.jsonのdependency declaration（${fact.packageNames.join('、') || fact.label}）から${fact.label}を検出しました。`;
    case 'runtime':
      return `${fact.configPath ?? source ?? 'runtime設定'}のname / mainから${fact.label} runtimeを検出しました。`;
    case 'resource':
      return `${source ?? fact.filePath ?? '設定ファイル'}の${fact.binding ? `binding「${fact.binding}」` : fact.resourceType}からResourceを検出しました。`;
    case 'dotnet-project':
      return `${fact.projectPath}の.csproj propertyから${fact.useWpf ? '.NET / WPF Application' : '.NET Application'}を検出しました。`;
    case 'command':
      return `package scriptのcommand fragment「${fact.command}」として展開しました。`;
    default:
      return `${nodeTypeLabels[node.type] ?? node.type}として検出しました。`;
  }
}

function NodeDetails({ node, view, store, expandedPresentationIds, onSelectNode, onSelectRegion, onTogglePresentation }: { node: AnalyzerViewNode; view: AnalyzerViewModel; store: AnalyzerProjectStore; expandedPresentationIds: ReadonlySet<string>; onSelectNode: (nodeId: string, focus?: boolean) => void; onSelectRegion?: (regionId: string, focus?: boolean) => void; onTogglePresentation: (presentationId: string) => void }) {
  const fact = factForNode(store, node);
  const dictionary = displayDictionaryStack(factDictionaryStackId(fact ?? node));
  const stackUsage = node.metadata.stackUsage === true;
  const usageScopeLabel = metadataString(node, 'scopeLabel') ?? 'Project Root / Tooling';
  const usageScopePath = metadataString(node, 'scopePath') ?? '.';
  const usageCategory = metadataString(node, 'categoryLabel') ?? node.subtitle;
  const usageRoles = metadataStrings(node, 'roles');
  const usageEvidenceFiles = evidenceFiles(node, view);
  const summary = node.presentation?.role === 'summary';
  const summaryExpanded = summary && analyzerSummaryExpanded(node.id, expandedPresentationIds);
  const displayedSubtitle = summary ? analyzerSummarySubtitle(node, summaryExpanded) : node.subtitle;
  const presentationParent = node.presentation?.parentId
    ? view.nodes.find((candidate) => candidate.id === node.presentation?.parentId)
    : undefined;
  const parentExpanded = Boolean(presentationParent && expandedPresentationIds.has(presentationParent.id));
  return (
    <>
      <div className="analyzer-detail-heading">
        <div className="analyzer-detail-heading-top">
          <span className="analyzer-node-type">{displayNodeType(node)}</span>
          <button type="button" className="analyzer-focus-selected" onClick={() => onSelectNode(node.id, true)}>Focus Selected</button>
        </div>
        <h2>
          {dictionary
            ? <Link className="analyzer-detail-title-link" to={stackPath(dictionary.id)}>{node.label}</Link>
            : node.label}
        </h2>
        {displayedSubtitle && <p>{displayedSubtitle}</p>}
        {summary && (
          <div className="analyzer-presentation-actions">
            <button type="button" className="analyzer-presentation-toggle" onClick={() => onTogglePresentation(node.id)} aria-expanded={summaryExpanded}>
              {summaryExpanded ? 'Collapse' : 'Expand'}
            </button>
            <span>{summaryExpanded ? 'Graphの詳細Nodeを表示中' : 'GraphではSummaryとして表示中'}</span>
          </div>
        )}
      </div>
      <section className="analyzer-detail-section">
        <h3>Overview</h3>
        <p>{detectionReason(node, fact, view)}</p>
      </section>
      {stackUsage && (
        <section className="analyzer-detail-section">
          <h3>Stack Usage</h3>
          <dl className="analyzer-metadata-list analyzer-stack-usage-list">
            <div><dt>Stack</dt><dd>{dictionary?.name ?? node.label}</dd></div>
            <div><dt>Used in</dt><dd>{usageScopeLabel} · {usageScopePath}</dd></div>
            {usageCategory && <div><dt>Category</dt><dd>{usageCategory}</dd></div>}
            {usageRoles.length > 0 && <div><dt>Role</dt><dd>{usageRoles.join(', ')}</dd></div>}
            {usageEvidenceFiles.length > 0 && <div><dt>Evidence files</dt><dd>{usageEvidenceFiles.join(', ')}</dd></div>}
          </dl>
        </section>
      )}
      {summary ? (
        <section className="analyzer-detail-section">
          <h3>Contained Nodes</h3>
          <PresentationChildren node={node} view={view} onSelectNode={onSelectNode} />
        </section>
      ) : (
        <section className="analyzer-detail-section">
          <h3>Evidence</h3>
          <EvidenceList evidenceIds={node.evidenceIds} view={view} store={store} />
        </section>
      )}
      {presentationParent && (
        <section className="analyzer-detail-section">
          <h3>Presentation Group</h3>
          <p>このDetail Nodeは {presentationParent.label} の表示グループに属しています。</p>
          <button type="button" className="analyzer-presentation-parent-toggle" onClick={() => onTogglePresentation(presentationParent.id)} aria-expanded={parentExpanded}>
            {parentExpanded ? `Collapse ${presentationParent.label}` : `Expand ${presentationParent.label}`}
          </button>
        </section>
      )}
      <section className="analyzer-detail-section">
        <h3>Relations</h3>
      <RelationList nodeId={node.id} view={view} onSelectNode={onSelectNode} onSelectRegion={onSelectRegion} />
      </section>
      <section className="analyzer-detail-section">
        <h3>Metadata</h3>
        <MetadataList metadata={node.metadata} />
      </section>
    </>
  );
}

function EdgeDetails({ edge, view, store, onSelectNode, onSelectRegion }: { edge: AnalyzerViewEdge; view: AnalyzerViewModel; store: AnalyzerProjectStore; onSelectNode: (nodeId: string, focus?: boolean) => void; onSelectRegion?: (regionId: string, focus?: boolean) => void }) {
  const source = view.nodes.find((node) => node.id === edge.sourceId);
  const target = view.nodes.find((node) => node.id === edge.targetId);
  const sourceRegion = view.regions?.find((region) => region.id === edge.sourceId);
  const targetRegion = view.regions?.find((region) => region.id === edge.targetId);
  return (
    <>
      <div className="analyzer-detail-heading">
        <div className="analyzer-detail-heading-top">
          <span className="analyzer-node-type">Relation</span>
        </div>
        <h2>{edge.label}</h2>
        <p>{source?.label ?? edge.sourceId} → {target?.label ?? edge.targetId}</p>
      </div>
      <section className="analyzer-detail-section">
        <h3>Relation</h3>
        <p className="analyzer-edge-summary">{source?.label ?? edge.sourceId} <span aria-hidden="true">→</span> {target?.label ?? edge.targetId}</p>
        <div className="analyzer-edge-actions">
          {source && <button type="button" onClick={() => onSelectNode(source.id, true)}>Sourceを見る</button>}
          {sourceRegion && <button type="button" onClick={() => onSelectRegion?.(sourceRegion.id, true)}>Sourceを見る</button>}
          {target && <button type="button" onClick={() => onSelectNode(target.id, true)}>Targetを見る</button>}
          {targetRegion && <button type="button" onClick={() => onSelectRegion?.(targetRegion.id, true)}>Targetを見る</button>}
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

export function AnalyzerDetailPanel({ store, view, selectedNodeId, selectedRegionId, selectedEdgeId, expandedPresentationIds, onSelectNode, onSelectRegion, onTogglePresentation, onClose }: AnalyzerDetailPanelProps) {
  const node = selectedNodeId ? view.nodes.find((candidate) => candidate.id === selectedNodeId) : undefined;
  const region = selectedRegionId ? view.regions?.find((candidate) => candidate.id === selectedRegionId) : undefined;
  const edge = selectedEdgeId ? view.edges.find((candidate) => candidate.id === selectedEdgeId) : undefined;
  return (
    <aside className="analyzer-detail-panel" aria-label="Analyzer detail panel">
      {!node && !region && !edge ? (
        <div className="analyzer-detail-empty">
          <div className="analyzer-detail-heading-top">
            <span className="analyzer-panel-kicker">Selection</span>
            <button type="button" className="analyzer-detail-close" onClick={onClose} aria-label="Close detail panel">Close</button>
          </div>
          <h2>Node、RegionまたはEdgeを選択</h2>
          <p>Graph上の要素を選ぶと、検出理由・直接Evidence・関係・metadataを表示します。</p>
        </div>
      ) : node ? (
        <>
          <div className="analyzer-detail-panel-close-row">
            <button type="button" className="analyzer-detail-close" onClick={onClose} aria-label="Close detail panel">Close</button>
          </div>
          <NodeDetails node={node} view={view} store={store} expandedPresentationIds={expandedPresentationIds} onSelectNode={onSelectNode} onSelectRegion={onSelectRegion} onTogglePresentation={onTogglePresentation} />
        </>
      ) : region ? (
        <>
          <div className="analyzer-detail-panel-close-row">
            <button type="button" className="analyzer-detail-close" onClick={onClose} aria-label="Close detail panel">Close</button>
          </div>
          <RegionDetails region={region} view={view} store={store} onSelectNode={onSelectNode} onSelectRegion={onSelectRegion} />
        </>
      ) : edge ? (
        <>
          <div className="analyzer-detail-panel-close-row">
            <button type="button" className="analyzer-detail-close" onClick={onClose} aria-label="Close detail panel">Close</button>
          </div>
          <EdgeDetails edge={edge} view={view} store={store} onSelectNode={onSelectNode} onSelectRegion={onSelectRegion} />
        </>
      ) : null}
    </aside>
  );
}
