import { Link } from 'react-router-dom';
import { useState } from 'react';
import { evidenceRangeLabel, analyzerRegionParentId, analyzerSummaryExpanded, analyzerSummarySubtitle, displayDictionaryStack, factDictionaryStackId, factForNode, moduleIdForPath, nodeTypeLabels, relationLabelForNode } from '../../analyzer';
import type { AnalyzerProjectStore, AnalyzerSemanticRegion, AnalyzerViewEdge, AnalyzerViewModel, AnalyzerViewNode } from '../../analyzer';
import { stackPath } from '../../utils/routes';
import { EvidenceCodeBlock } from './EvidenceCodeBlock';
import { ModuleDependencyDetails } from './ModuleDependencyDetails';
import { dependencyDetailRelations } from '../../analyzer/dependencyDetailRelations';

interface AnalyzerDetailPanelProps { onLabelFocus?: (id?: string) => void;
  spatialDetails?: boolean;
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
  onFocusConnection?: (sourceId: string, targetId: string) => void;
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

function RelationList({ nodeId, view, onSelectNode, onSelectRegion, onFocusConnection }: { nodeId: string; view: AnalyzerViewModel; onSelectNode: (nodeId: string, focus?: boolean) => void; onSelectRegion?: (regionId: string, focus?: boolean) => void; onFocusConnection?: (sourceId: string, targetId: string) => void }) {
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
            <button type="button" data-analyzer-entity-id={targetId} onClick={() => targetRegion ? onSelectRegion?.(targetRegion.id, true) : target && onSelectNode(target.id, true)}>
              <span>{relation.sourceId === nodeId ? '出る関係 → ' : '入る関係 ← '}{relationLabelForNode(relation, nodeId)}</span>
              <strong>{target?.label ?? targetRegion?.label}</strong>
            </button>
            {onFocusConnection && <button type="button" className="analyzer-connection-fit" onClick={() => onFocusConnection(relation.sourceId, relation.targetId)} aria-label={`${target?.label ?? targetRegion?.label}との両端を表示`}>両端を表示</button>}
          </li>
        );
      })}
    </ul>
  );
}

function DependencyDeclaration({edge,view,store,onFocusConnection}:{edge:AnalyzerViewEdge;view:AnalyzerViewModel;store:AnalyzerProjectStore;onFocusConnection?:(source:string,target:string)=>void}) {
  const [open,setOpen]=useState(false);
  return <details className="analyzer-dependency-declaration" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>{[edge.metadata.packageName,edge.metadata.dependencyType,edge.metadata.versionRange].filter(Boolean).join(' · ')||'依存宣言とEvidence'}</summary>
    {open&&<><EvidenceList evidenceIds={edge.evidenceIds} view={view} store={store}/>{onFocusConnection&&<button type="button" onClick={()=>onFocusConnection(edge.sourceId,edge.targetId)}>両端を表示</button>}</>}
  </details>;
}

function DependencyRelations({nodeId,view,store,onSelectNode,onFocusConnection}:{nodeId:string;view:AnalyzerViewModel;store:AnalyzerProjectStore;onSelectNode:(id:string,focus?:boolean)=>void;onFocusConnection?:(source:string,target:string)=>void}) {
  const {declarations,summaries,outgoingTargets,incomingSources}=dependencyDetailRelations(view,nodeId);
  return <><section className="analyzer-detail-section" data-dependency-declarations><h3>依存先・利用元</h3>
    <p className="analyzer-muted-copy">依存先 {outgoingTargets}対象 · 利用元 {incomingSources}対象 · 依存宣言 {declarations.length}件</p>
    <ul className="analyzer-relation-list">{declarations.map(edge=>{const outgoing=edge.sourceId===nodeId,targetId=outgoing?edge.targetId:edge.sourceId,target=view.nodes.find(n=>n.id===targetId);return <li key={edge.id} data-relation-id={edge.id}>
      <button type="button" data-analyzer-entity-id={targetId} onClick={()=>onSelectNode(targetId,true)}><span>{outgoing?'依存先':'利用元'}</span><strong>{target?.label??targetId}</strong></button>
      <DependencyDeclaration edge={edge} view={view} store={store} onFocusConnection={onFocusConnection}/>
    </li>;})}</ul>
  </section>{summaries.length>0&&<section className="analyzer-detail-section" data-dependency-summaries><h3>表示上のまとめ</h3><ul className="analyzer-relation-list">{summaries.map(({node})=><li key={node.id}><button type="button" onClick={()=>onSelectNode(node.id)}><span>表示集合 · メンバー {node.presentation?.childNodeIds?.length??0}対象</span><strong>{node.label}の内訳を開く</strong></button></li>)}</ul></section>}</>;
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
            <button type="button" data-analyzer-entity-id={targetId} onClick={() => targetRegion ? onSelectRegion?.(targetRegion.id, true) : target && onSelectNode(target.id, true)}>
              <span>{relation.sourceId === region.id ? '出る関係 → ' : '入る関係 ← '}{relationLabelForNode(relation, region.id)}</span>
              <strong>{target?.label ?? targetRegion?.label}</strong>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RegionDetails({ region, view, store, onSelectNode, onSelectRegion }: { region: AnalyzerSemanticRegion; view: AnalyzerViewModel; store: AnalyzerProjectStore; onSelectNode: (nodeId: string, focus?: boolean) => void; onSelectRegion?: (regionId: string, focus?: boolean) => void }) {
  if (region.regionKind === 'directory' || region.regionKind === 'workspace-package') {
    return (
      <ModuleRegionDetails
        region={region}
        view={view}
        store={store}
        onSelectNode={onSelectNode}
        onSelectRegion={onSelectRegion}
      />
    );
  }
  const scopePath = typeof region.metadata.scopePath === 'string' ? region.metadata.scopePath : region.subtitle ?? '.';
  const scopeKind = typeof region.metadata.scopeKind === 'string' ? region.metadata.scopeKind : region.scopeKind ?? 'physical';
  const scopeType = typeof region.metadata.scopeType === 'string' ? region.metadata.scopeType : 'scope';
  const parentRegionId = analyzerRegionParentId(view, region.id);
  const parentRegion = parentRegionId
    ? view.regions?.find((candidate) => candidate.id === parentRegionId)
    : undefined;
  return (
    <>
      <div className="analyzer-detail-heading">
        <div className="analyzer-detail-heading-top">
          <span className="analyzer-node-type">REGION / SCOPE</span>
          <button type="button" className="analyzer-focus-selected" onClick={() => onSelectRegion?.(region.id, true)}>選択へ移動</button>
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
          <div><dt>Parent Scope</dt><dd>{parentRegion
            ? <button type="button" className="analyzer-detail-parent-link" onClick={() => onSelectRegion?.(parentRegion.id, true)}>{parentRegion.label}{parentRegion.subtitle ? ` · ${parentRegion.subtitle}` : ''}</button>
            : 'Project'}</dd></div>
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
        <details><summary>補助情報</summary><MetadataList metadata={region.metadata} /></details>
      </section>
    </>
  );
}

function ModuleRegionDetails({ region, view, store, onSelectNode, onSelectRegion }: { region: AnalyzerSemanticRegion; view: AnalyzerViewModel; store: AnalyzerProjectStore; onSelectNode: (nodeId: string, focus?: boolean) => void; onSelectRegion?: (regionId: string, focus?: boolean) => void }) {
  const descendants: AnalyzerSemanticRegion[] = [];
  const directDescendants = (view.regions ?? []).filter((candidate) => candidate.parentRegionId === region.id);
  const pending = [region.id];
  while (pending.length > 0) {
    const parentId = pending.shift();
    if (!parentId) continue;
    const children = (view.regions ?? []).filter((candidate) => candidate.parentRegionId === parentId);
    descendants.push(...children);
    pending.push(...children.map((child) => child.id));
  }
  const moduleIds = new Set([region, ...descendants].flatMap((candidate) => candidate.childIds));
  const containedModules = view.nodes.filter((node) => moduleIds.has(node.id) && node.type === 'module');
  const internal = view.edges.filter((edge) => moduleIds.has(edge.sourceId) && moduleIds.has(edge.targetId));
  const outgoing = view.edges.filter((edge) => moduleIds.has(edge.sourceId) && !moduleIds.has(edge.targetId));
  const incoming = view.edges.filter((edge) => !moduleIds.has(edge.sourceId) && moduleIds.has(edge.targetId));
  const boundaryTargets = [...new Map(outgoing.map((edge) => [edge.targetId, edge])).values()];
  const boundarySources = [...new Map(incoming.map((edge) => [edge.sourceId, edge])).values()];
  const path = typeof region.metadata.directoryPath === 'string' ? region.metadata.directoryPath : region.subtitle ?? '.';
  return (
    <>
      <div className="analyzer-detail-heading">
        <div className="analyzer-detail-heading-top">
          <span className="analyzer-node-type">{region.regionKind === 'directory' ? 'DIRECTORY' : 'PACKAGE / AREA'}</span>
          <button type="button" className="analyzer-focus-selected" onClick={() => onSelectRegion?.(region.id, true)}>選択へ移動</button>
        </div>
        <h2>{region.label}</h2>
        <p>{path}</p>
      </div>
      <section className="analyzer-detail-section">
        <h3>Overview</h3>
        <p>{region.regionKind === 'directory' ? 'Filesystem directory rendered as a selectable Semantic Region. Directory hierarchy is containment, not a dependency edge.' : 'Workspace package or project area containing source modules and directory Regions.'}</p>
      </section>
      <section className="analyzer-detail-section">
        <h3>Module Map</h3>
        <dl className="analyzer-metadata-list analyzer-stack-usage-list">
          <div><dt>Path</dt><dd>{path}</dd></div>
          <div><dt>Modules</dt><dd>{region.metadata.moduleCount ?? containedModules.length}</dd></div>
          <div><dt>Subdirectories</dt><dd>{region.metadata.directoryCount ?? directDescendants.length}</dd></div>
          <div><dt>Internal dependencies</dt><dd>{internal.length}</dd></div>
          <div><dt>Outgoing dependencies</dt><dd>{outgoing.length}</dd></div>
          <div><dt>Incoming dependencies</dt><dd>{incoming.length}</dd></div>
        </dl>
      </section>
      {(boundaryTargets.length > 0 || boundarySources.length > 0) && (
        <section className="analyzer-detail-section">
          <h3>Boundary Dependencies</h3>
          {boundaryTargets.length > 0 && (
            <>
              <p>Outgoing To</p>
              <ul className="analyzer-relation-list">{boundaryTargets.slice(0, 24).map((edge) => {
                const target = view.nodes.find((node) => node.id === edge.targetId);
                return target ? <li key={`out:${target.id}`}><button type="button" onClick={() => onSelectNode(target.id, true)}><span>→</span><strong>{target.label}</strong></button></li> : null;
              })}</ul>
            </>
          )}
          {boundarySources.length > 0 && (
            <>
              <p>Incoming From</p>
              <ul className="analyzer-relation-list">{boundarySources.slice(0, 24).map((edge) => {
                const source = view.nodes.find((node) => node.id === edge.sourceId);
                return source ? <li key={`in:${source.id}`}><button type="button" onClick={() => onSelectNode(source.id, true)}><span>←</span><strong>{source.label}</strong></button></li> : null;
              })}</ul>
            </>
          )}
        </section>
      )}
      <section className="analyzer-detail-section">
        <h3>Contained Modules</h3>
        {containedModules.length === 0
          ? <p className="analyzer-muted-copy">このRegionに直接含まれるModuleはありません。</p>
          : <ul className="analyzer-presentation-list analyzer-region-children-list">{containedModules.map((node) => (
            <li key={node.id}>
              <button type="button" onClick={() => onSelectNode(node.id, true)}>
                <span>{node.subtitle ?? 'Module'}</span>
                <strong>{node.label}</strong>
              </button>
            </li>
          ))}</ul>}
      </section>
      <section className="analyzer-detail-section">
        <h3>Evidence</h3>
        <EvidenceList evidenceIds={region.evidenceIds} view={view} store={store} />
      </section>
      <section className="analyzer-detail-section">
        <details><summary>補助情報</summary><MetadataList metadata={region.metadata} /></details>
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
    case 'module':
      return `${fact.path}を${fact.language}のSource Moduleとして検出しました。静的なlocal module importだけをDependency Edgeへ投影します。`;
    case 'module-dependency':
      return `${fact.sourcePath}から${fact.targetPath}への${fact.dependencyKind}を検出しました。`;
    case 'module-directory':
      return `${fact.path}をFilesystem hierarchyのDirectory Factとして検出しました。`;
    default:
      return `${nodeTypeLabels[node.type] ?? node.type}として検出しました。`;
  }
}

function NodeDetails({ node, view, store, expandedPresentationIds, onSelectNode, onSelectRegion, onTogglePresentation, onFocusConnection }: { node: AnalyzerViewNode; view: AnalyzerViewModel; store: AnalyzerProjectStore; expandedPresentationIds: ReadonlySet<string>; onSelectNode: (nodeId: string, focus?: boolean) => void; onSelectRegion?: (regionId: string, focus?: boolean) => void; onTogglePresentation: (presentationId: string) => void; onFocusConnection?: (sourceId: string, targetId: string) => void }) {
  const fact = factForNode(store, node);
  const moduleFact = fact?.kind === 'module' ? fact : undefined;
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
          <button type="button" className="analyzer-focus-selected" onClick={() => onSelectNode(node.id, true)}>選択へ移動</button>
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
      {node.type === 'module' && (
        <section className="analyzer-detail-section">
          <h3>Module</h3>
          <dl className="analyzer-metadata-list analyzer-stack-usage-list">
            <div><dt>Path</dt><dd>{metadataString(node, 'modulePath') ?? node.label}</dd></div>
            <div><dt>Language</dt><dd>{metadataString(node, 'language') ?? node.subtitle ?? 'Unknown'}</dd></div>
            <div><dt>Package</dt><dd>{metadataString(node, 'packageName') ?? metadataString(node, 'packagePath') ?? 'Project'}</dd></div>
            <div><dt>Directory</dt><dd>{metadataString(node, 'directoryPath') ?? '.'}</dd></div>
            <div><dt>Outgoing</dt><dd>{node.metadata.outgoingCount ?? 0}</dd></div>
            <div><dt>Incoming</dt><dd>{node.metadata.incomingCount ?? 0}</dd></div>
          </dl>
          {metadataStrings(node, 'unresolvedImportDetails').length > 0 && (
            <>
              <h3>Unresolved Imports</h3>
              <ul className="analyzer-detail-bullet-list">{metadataStrings(node, 'unresolvedImportDetails').map((specifier) => <li key={specifier}>{specifier}</li>)}</ul>
            </>
          )}
          {moduleFact && moduleFact.imports.length > 0 && (
            <>
              <h3>Imports</h3>
              <ul className="analyzer-relation-list">{moduleFact.imports.slice(0, 40).map((reference) => {
                const targetId = reference.resolvedPath ? moduleIdForPath(reference.resolvedPath) : undefined;
                const target = targetId ? view.nodes.find((candidate) => candidate.id === targetId) : undefined;
                const edge = targetId
                  ? view.edges.find((candidate) => candidate.sourceId === node.id && candidate.targetId === targetId && candidate.metadata.specifier === reference.specifier)
                  : undefined;
                const evidence = view.evidence.find((candidate) => candidate.id === `evidence:module-import:${moduleFact.path}:${reference.start}:${reference.end}`);
                return (
                  <li key={`${reference.kind}:${reference.start}:${reference.specifier}`}>
                    {target ? (
                      <button type="button" onClick={() => onSelectNode(target.id, true)}>
                        <span>{reference.kind}</span>
                        <strong>{target.label} · {reference.specifier}{evidence ? ` · ${evidenceRangeLabel(evidence)}` : ''}</strong>
                      </button>
                    ) : (
                      <div className="analyzer-detail-import-row"><span>{reference.kind}</span><strong>{reference.specifier}</strong></div>
                    )}
                    {edge && <small className="analyzer-detail-import-resolved">resolved</small>}
                  </li>
                );
              })}</ul>
            </>
          )}
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
      {view.view !== 'dependencies' && <section className="analyzer-detail-section"><h3>Relations</h3>
        <RelationList onFocusConnection={onFocusConnection} nodeId={node.id} view={view} onSelectNode={onSelectNode} onSelectRegion={onSelectRegion} />
      </section>}
      {view.view === 'dependencies' && <DependencyRelations nodeId={node.id} view={view} store={store} onSelectNode={onSelectNode} onFocusConnection={onFocusConnection}/>}
      <section className="analyzer-detail-section">
        <details><summary>補助情報</summary><MetadataList metadata={node.metadata} /></details>
      </section>
    </>
  );
}

function EdgeDetails({ edge, view, store, onSelectNode, onSelectRegion, onFocusConnection }: { edge: AnalyzerViewEdge; view: AnalyzerViewModel; store: AnalyzerProjectStore; onSelectNode: (nodeId: string, focus?: boolean) => void; onSelectRegion?: (regionId: string, focus?: boolean) => void; onFocusConnection?: (sourceId: string, targetId: string) => void }) {
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
        <p>{source?.label ?? sourceRegion?.label ?? edge.sourceId} → {target?.label ?? targetRegion?.label ?? edge.targetId}</p>
      </div>
      <section className="analyzer-detail-section">
        <h3>Relation</h3>
        <p className="analyzer-edge-summary">{source?.label ?? sourceRegion?.label ?? edge.sourceId} <span aria-hidden="true">→</span> {target?.label ?? targetRegion?.label ?? edge.targetId}</p>
        <div className="analyzer-edge-actions">
          {onFocusConnection && <button type="button" onClick={() => onFocusConnection(edge.sourceId, edge.targetId)}>両端を表示</button>}
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
      {edge.kind === 'imports' && (
        <section className="analyzer-detail-section">
          <h3>Module Dependency</h3>
          <dl className="analyzer-metadata-list analyzer-stack-usage-list">
            <div><dt>Kind</dt><dd>{metadataStringFromEdge(edge, 'dependencyKind') ?? edge.kind}</dd></div>
            <div><dt>Specifier</dt><dd>{metadataStringFromEdge(edge, 'specifier') ?? '—'}</dd></div>
            <div><dt>Resolved To</dt><dd>{metadataStringFromEdge(edge, 'targetPath') ?? target?.subtitle ?? target?.label ?? targetRegion?.label ?? edge.targetId}</dd></div>
          </dl>
        </section>
      )}
      <section className="analyzer-detail-section">
        <details><summary>補助情報</summary><MetadataList metadata={edge.metadata} /></details>
      </section>
    </>
  );
}

function metadataStringFromEdge(edge: AnalyzerViewEdge, key: string): string | undefined {
  const value = edge.metadata[key];
  return typeof value === 'string' ? value : undefined;
}

function CommandOriginal({ node, store }: { node: AnalyzerViewNode; store: AnalyzerProjectStore }) {
  const fact = factForNode(store, node), [status, setStatus] = useState('');
  const command = fact && (fact.kind === 'command' || fact.kind === 'package-script') ? fact.command : typeof node.metadata.command === 'string' ? node.metadata.command : node.label;
  return <section className="analyzer-detail-section"><h3>Command 原文</h3><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{command}</pre><button type="button" onClick={() => { navigator.clipboard.writeText(command).then(() => setStatus('コピーしました'), () => setStatus('コピーできませんでした。原文を選択してコピーできます。')); }}>コマンドをコピー</button><span role="status">{status}</span></section>;
}

export function AnalyzerDetailPanel({ onLabelFocus, store, view, selectedNodeId, selectedRegionId, selectedEdgeId, expandedPresentationIds, onSelectNode, onSelectRegion, onTogglePresentation, onClose, onFocusConnection, spatialDetails }: AnalyzerDetailPanelProps) {
  const node = selectedNodeId ? view.nodes.find((candidate) => candidate.id === selectedNodeId) : undefined;
  const region = selectedRegionId ? view.regions?.find((candidate) => candidate.id === selectedRegionId) : undefined;
  const edge = selectedEdgeId ? view.edges.find((candidate) => candidate.id === selectedEdgeId) : undefined;
  if (view.view === 'module-dependency' && (node || region || edge)) {
    return <aside key={node?.id ?? region?.id ?? edge?.id} className="analyzer-detail-panel is-module-detail" aria-label="Analyzer detail panel" onFocusCapture={event=>onLabelFocus?.((event.target as HTMLElement).closest<HTMLElement>('[data-analyzer-entity-id]')?.dataset.analyzerEntityId)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))onLabelFocus?.(undefined);}}>
      <ModuleDependencyDetails key={node?.id ?? region?.id ?? edge?.id} node={node} region={region} edge={edge} view={view} store={store}
        showDirectoryChain={spatialDetails}
        onSelectNode={onSelectNode} onSelectRegion={onSelectRegion} onFocusConnection={onFocusConnection} onClose={onClose}/>
    </aside>;
  }
  return (
    <aside className="analyzer-detail-panel" aria-label="Analyzer detail panel" onFocusCapture={event=>onLabelFocus?.((event.target as HTMLElement).closest<HTMLElement>('[data-analyzer-entity-id]')?.dataset.analyzerEntityId)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))onLabelFocus?.(undefined);}}>
      {!node && !region && !edge ? (
        <div className="analyzer-detail-empty">
          <div className="analyzer-detail-heading-top">
            <span className="analyzer-panel-kicker">Selection</span>
            <button type="button" className="analyzer-detail-close" onClick={onClose} aria-label="詳細を閉じる">閉じる</button>
          </div>
          <h2>Node、RegionまたはEdgeを選択</h2>
          <p>Graph上の要素を選ぶと、検出理由・直接Evidence・関係・metadataを表示します。</p>
        </div>
      ) : node ? (
        <>
          <div className="analyzer-detail-panel-close-row">
            <button type="button" className="analyzer-detail-close" onClick={onClose} aria-label="詳細を閉じる">閉じる</button>
          </div>
          <NodeDetails onFocusConnection={onFocusConnection} node={node} view={view} store={store} expandedPresentationIds={expandedPresentationIds} onSelectNode={onSelectNode} onSelectRegion={onSelectRegion} onTogglePresentation={onTogglePresentation} />
          {spatialDetails && view.view === 'command' && node.presentation?.role !== 'summary' && (node.type === 'command' || node.type === 'package-script') && <CommandOriginal key={node.id} node={node} store={store} />}
        </>
      ) : region ? (
        <>
          <div className="analyzer-detail-panel-close-row">
            <button type="button" className="analyzer-detail-close" onClick={onClose} aria-label="詳細を閉じる">閉じる</button>
          </div>
          <RegionDetails region={region} view={view} store={store} onSelectNode={onSelectNode} onSelectRegion={onSelectRegion} />
        </>
      ) : edge ? (
        <>
          <div className="analyzer-detail-panel-close-row">
            <button type="button" className="analyzer-detail-close" onClick={onClose} aria-label="詳細を閉じる">閉じる</button>
          </div>
          <EdgeDetails onFocusConnection={onFocusConnection} edge={edge} view={view} store={store} onSelectNode={onSelectNode} onSelectRegion={onSelectRegion} />
        </>
      ) : null}
    </aside>
  );
}
