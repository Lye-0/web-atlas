import { useState, type ReactNode } from 'react';
import { evidenceRangeLabel, factForNode, moduleIdForPath } from '../../analyzer';
import type { AnalyzerProjectStore, AnalyzerSemanticRegion, AnalyzerViewEdge, AnalyzerViewModel, AnalyzerViewNode } from '../../analyzer';
import { EvidenceCodeBlock } from './EvidenceCodeBlock';

interface Props {
  store: AnalyzerProjectStore;
  view: AnalyzerViewModel;
  node?: AnalyzerViewNode;
  region?: AnalyzerSemanticRegion;
  edge?: AnalyzerViewEdge;
  onSelectNode: (id: string, focus?: boolean) => void;
  onSelectRegion?: (id: string, focus?: boolean) => void;
  onFocusConnection?: (source: string, target: string) => void;
  onClose: () => void;
}

function Section({ title, count, initiallyOpen = false, children }: {
  title: string; count?: number; initiallyOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details className="analyzer-detail-accordion" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span>{title}</span>{count !== undefined && <small>{count}</small>}</summary>
    {open && <div className="analyzer-detail-accordion-body">{children}</div>}
  </details>;
}

function ExpandableList<T>({ items, render }: { items: readonly T[]; render: (item: T) => ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <>
    <ul className="analyzer-module-detail-list">{(expanded ? items : items.slice(0, 6)).map(render)}</ul>
    {!expanded && items.length > 6 && <button type="button" className="analyzer-detail-show-more" onClick={() => setExpanded(true)}>残り{items.length - 6}件を表示</button>}
  </>;
}

function Info({ entries }: { entries: [string, unknown][] }) {
  return <dl className="analyzer-metadata-list">{entries.filter(([,value]) => value !== undefined && value !== '').map(([key,value]) =>
    <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(', ') : String(value)}</dd></div>)}</dl>;
}

function Evidence({ ids, view, store }: { ids: string[]; view: AnalyzerViewModel; store: AnalyzerProjectStore }) {
  const evidence = [...new Set(ids)].flatMap(id => view.evidence.find(item => item.id === id) ?? []);
  return evidence.length ? <ExpandableList items={evidence} render={item => <li key={item.id}><EvidenceCodeBlock evidence={item} source={store.sources[item.filePath]}/></li>}/>
    : <p className="analyzer-muted-copy">直接Evidenceはありません。</p>;
}

function Connections({ edges, incoming, view, onSelectNode, onFocusConnection }: {
  edges: AnalyzerViewEdge[]; incoming: boolean;
  view: AnalyzerViewModel; onSelectNode: Props['onSelectNode']; onFocusConnection?: Props['onFocusConnection'];
}) {
  const grouped = new Map<string, AnalyzerViewEdge[]>();
  for (const edge of edges) {
    const id = incoming ? edge.sourceId : edge.targetId;
    const items = grouped.get(id) ?? []; items.push(edge); grouped.set(id, items);
  }
  const items = [...grouped].sort(([a],[b]) => a.localeCompare(b));
  if (!items.length) return <p className="analyzer-muted-copy">該当する依存はありません。</p>;
  return <ExpandableList items={items} render={([id, relations]) => {
    const node = view.nodes.find(item => item.id === id);
    const relation = relations[0]!;
    return node && <li key={id} className="analyzer-module-connection-row">
      <button type="button" className="analyzer-module-connection-name" onClick={() => onSelectNode(id, true)} title={String(node.metadata.modulePath ?? node.label)}>
        <strong>{node.label}</strong><small>{String(node.metadata.directoryPath ?? node.metadata.modulePath ?? '')}{relations.length > 1 ? ` · ${relations.length}件` : ''}</small>
      </button>
      {onFocusConnection && <button type="button" className="analyzer-module-connection-fit" onClick={() => onFocusConnection(relation.sourceId, relation.targetId)} aria-label={`${node.label}との両端を表示`} title="この依存の両端を表示">↔</button>}
    </li>;
  }}/>;
}

function Auxiliary({ metadata, ids, view, store }: { metadata: AnalyzerViewNode['metadata']; ids: string[]; view: AnalyzerViewModel; store: AnalyzerProjectStore }) {
  return <>
    <Section title="Evidence" count={ids.length}><Evidence ids={ids} view={view} store={store}/></Section>
    <Section title="Metadata"><Info entries={Object.entries(metadata)}/></Section>
  </>;
}

export function ModuleDependencyDetails({ node, region, edge, view, store, onSelectNode, onSelectRegion, onFocusConnection, onClose }: Props) {
  const title = node?.label ?? region?.label ?? 'Module dependency';
  const path = node?.metadata.modulePath ?? region?.metadata.directoryPath ?? region?.subtitle;
  const focus = node ? () => onSelectNode(node.id, true) : region ? () => onSelectRegion?.(region.id, true) : undefined;
  const members = new Set<string>();
  if (node) members.add(node.id);
  if (region) {
    const pending = [region.id];
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      view.regions?.find(item => item.id === id)?.childIds.forEach(id => members.add(id));
      view.regions?.filter(item => item.parentRegionId === id).forEach(item => pending.push(item.id));
    }
  }
  const outgoing = view.edges.filter(item => members.has(item.sourceId) && (Boolean(node) || !members.has(item.targetId)));
  const incoming = view.edges.filter(item => members.has(item.targetId) && (Boolean(node) || !members.has(item.sourceId)));
  const internal = view.edges.filter(item => members.has(item.sourceId) && members.has(item.targetId));
  const contained = region ? view.nodes.filter(item => members.has(item.id)) : [];
  const directories = region ? view.regions?.filter(item => item.parentRegionId === region.id) ?? [] : [];
  const fact = node ? factForNode(store, node) : undefined;
  const imports = fact?.kind === 'module' ? fact.imports : [];
  const source = edge ? view.nodes.find(item => item.id === edge.sourceId) : undefined;
  const target = edge ? view.nodes.find(item => item.id === edge.targetId) : undefined;
  return <>
    <header className="analyzer-module-detail-header">
      <div className="analyzer-detail-heading-top"><span className="analyzer-node-type">{node ? 'FILE / MODULE' : region ? region.regionKind === 'directory' ? 'DIRECTORY' : 'PACKAGE' : 'DEPENDENCY'}</span>
        <button type="button" className="analyzer-detail-close" onClick={onClose} aria-label="Close detail panel">閉じる</button></div>
      <h2>{title}</h2>
      {path && <p className="analyzer-module-detail-path">{String(path)}</p>}
      <div className="analyzer-module-detail-meta">
        {node && <span>{String(node.metadata.language ?? node.subtitle ?? 'Module')}</span>}
        {region && <span>{contained.length} files · {directories.length} directories</span>}
        {focus && <button type="button" className="analyzer-focus-selected" onClick={focus}>選択位置を表示</button>}
      </div>
    </header>
    {(node || region) && <>
      <Section title="→ import先" count={outgoing.length} initiallyOpen={outgoing.length > 0}>
        <Connections edges={outgoing} incoming={false} view={view} onSelectNode={onSelectNode} onFocusConnection={node ? onFocusConnection : undefined}/>
      </Section>
      <Section title="← import元" count={incoming.length} initiallyOpen={incoming.length > 0 && (outgoing.length === 0 || incoming.length <= 4)}>
        <Connections edges={incoming} incoming view={view} onSelectNode={onSelectNode} onFocusConnection={node ? onFocusConnection : undefined}/>
      </Section>
      {region && <>
        <Section title="領域内の依存" count={internal.length}><p className="analyzer-muted-copy">この領域内のファイル同士に{internal.length}件の依存があります。</p></Section>
        <Section title="含まれるファイル" count={contained.length}><ExpandableList items={contained} render={item => <li key={item.id}><button type="button" className="analyzer-module-connection-name" onClick={() => onSelectNode(item.id,true)}><strong>{item.label}</strong><small>{String(item.metadata.modulePath ?? '')}</small></button></li>}/></Section>
        {directories.length > 0 && <Section title="子Directory" count={directories.length}><ExpandableList items={directories} render={item => <li key={item.id}><button type="button" className="analyzer-module-connection-name" onClick={() => onSelectRegion?.(item.id,true)}>{item.label}</button></li>}/></Section>}
      </>}
      <Section title="基本情報"><Info entries={node ? [
        ['Path',path],['Language',node.metadata.language],['Package',node.metadata.packageName ?? node.metadata.packagePath],['Directory',node.metadata.directoryPath],
      ] : [['Path',path],['Files',contained.length],['Directories',directories.length],['Internal dependencies',internal.length]]}/></Section>
      {node && imports.length > 0 && <Section title="Import宣言" count={imports.length}>
        <ExpandableList items={imports} render={reference => {
          const resolved = reference.resolvedPath ? view.nodes.find(item => item.id === moduleIdForPath(reference.resolvedPath!)) : undefined;
          const evidence = fact?.kind === 'module' ? view.evidence.find(item => item.id === `evidence:module-import:${fact.path}:${reference.start}:${reference.end}`) : undefined;
          return <li key={`${reference.kind}:${reference.start}:${reference.specifier}`} className="analyzer-module-import-declaration">
            <small>{reference.kind}{evidence ? ` · ${evidenceRangeLabel(evidence)}` : ''}</small><code>{reference.specifier}</code>
            {resolved ? <button type="button" className="analyzer-module-connection-name" onClick={() => onSelectNode(resolved.id,true)}>{reference.resolvedPath}</button> : <span>{reference.reason ?? 'unresolved'}</span>}
          </li>;
        }}/>
      </Section>}
      <Auxiliary metadata={(node ?? region)!.metadata} ids={(node ?? region)!.evidenceIds} view={view} store={store}/>
    </>}
    {edge && <>
      <section className="analyzer-module-edge-endpoints">
        <small>importする側</small><button type="button" className="analyzer-module-connection-name" onClick={() => onSelectNode(edge.sourceId,true)}>{source?.label ?? edge.sourceId}</button>
        <span aria-hidden="true">↓</span><small>読み込まれる側</small><button type="button" className="analyzer-module-connection-name" onClick={() => onSelectNode(edge.targetId,true)}>{target?.label ?? edge.targetId}</button>
        {onFocusConnection && <button type="button" className="analyzer-focus-selected" onClick={() => onFocusConnection(edge.sourceId,edge.targetId)}>両端を表示</button>}
      </section>
      <Section title="依存情報" initiallyOpen><Info entries={[
        ['Kind',edge.metadata.dependencyKind ?? edge.kind],['Specifier',edge.metadata.specifier],['Resolved to',edge.metadata.targetPath],
      ]}/></Section>
      <Section title="Evidence" count={edge.evidenceIds.length} initiallyOpen><Evidence ids={edge.evidenceIds} view={view} store={store}/></Section>
      <Section title="Metadata"><Info entries={Object.entries(edge.metadata)}/></Section>
    </>}
  </>;
}
