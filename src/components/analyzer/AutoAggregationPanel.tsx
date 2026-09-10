import { useMemo, useState } from 'react';
import type { AggregationCounts, AggregationGroup, DisplayAggregation, DisplayAggregationRelation } from '../../analyzer/autoAggregation';
import './auto-aggregation.css';

export type AggregationInspection = { kind: 'group' | 'relation'; id: string } | undefined;
export type AggregationGroupMode = 'expanded' | 'collapsed' | 'auto';

export function AutoAggregationToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return <button type="button" className="analyzer-auto-aggregation-toggle" aria-label="自動省略" aria-pressed={enabled}
    title="密集した対象をまとめて表示します。解析結果は変更しません。OFFでは手動で閉じた範囲を除き個別の点に戻します。"
    onClick={() => onChange(!enabled)}>自動省略：{enabled ? 'ON' : 'OFF'}</button>;
}

function PageButtons({ page, count, size, onPage, label }: { page: number; count: number; size: number; onPage: (page: number) => void; label: string }) {
  const last = Math.max(0, Math.ceil(count / size) - 1), current = Math.min(page, last);
  return count > size ? <div className="auto-aggregation-pages" aria-label={label}><button type="button" disabled={!current} onClick={() => onPage(current - 1)}>前へ</button><span>{current * size + 1}–{Math.min(count, (current + 1) * size)} / {count.toLocaleString()}件</span><button type="button" disabled={current === last} onClick={() => onPage(current + 1)}>次へ</button></div> : null;
}

interface RelationItem { id: string; source: string; target: string; kind: string; confidence: string; label: string; evidenceCount: number; siteCount?: number }
export function AutoAggregationPanel({ enabled, counts, groups, aggregates, expandedIds, collapsedIds, inspection, onInspection, onGroupMode, relations, originalRelations, nodeLabel, onSelectNode, onSelectRelation, totalCount, ownerById }: {
  enabled: boolean; counts: AggregationCounts; groups: readonly AggregationGroup[]; aggregates: readonly DisplayAggregation[];
  expandedIds: ReadonlySet<string>; collapsedIds: ReadonlySet<string>; inspection: AggregationInspection; onInspection: (value: AggregationInspection) => void;
  onGroupMode: (id: string, mode: AggregationGroupMode) => void;
  relations: readonly DisplayAggregationRelation<{ id: string }>[]; originalRelations: readonly RelationItem[];
  nodeLabel: (id: string) => { title: string; subtitle?: string }; onSelectNode: (id: string) => void; onSelectRelation: (id: string) => void;
  totalCount?: number;
  ownerById?: ReadonlyMap<string, string>;
}) {
  const [open, setOpen] = useState(false), [groupPage, setGroupPage] = useState(0);
  const [wholeScope, setWholeScope] = useState<{ groupId: string; visible: boolean }>();
  const available = useMemo(() => {
    const active = new Set(aggregates.map(group => group.groupId));
    return groups.filter(group => active.has(group.id) || expandedIds.has(group.id) || collapsedIds.has(group.id));
  }, [groups, aggregates, expandedIds, collapsedIds]);
  const group = inspection?.kind === 'group' ? groups.find(group => group.id === inspection.id) : undefined;
  const activeAggregate = group ? aggregates.find(item => item.groupId === group.id) : undefined;
  const showWholeScope = Boolean(group && !activeAggregate) || group?.id === wholeScope?.groupId && wholeScope?.visible;
  const inspectedMemberIds = showWholeScope ? group?.memberIds : activeAggregate?.memberIds ?? group?.memberIds;
  const aggregateById = useMemo(() => new Map(aggregates.map(item => [item.id, item])), [aggregates]);
  const membershipCounts = useMemo(() => {
    const values = { current: 0, individual: 0, otherAuto: 0, otherManual: 0 };
    if (!group || !ownerById) return undefined;
    for (const id of group.memberIds) {
      const owner = ownerById.get(id);
      if (owner === id) values.individual++;
      else if (owner === activeAggregate?.id) values.current++;
      else if (owner && aggregateById.get(owner)?.mode === 'manual') values.otherManual++;
      else values.otherAuto++;
    }
    return values;
  }, [group, ownerById, activeAggregate, aggregateById]);
  const memberStatus = (id: string) => {
    const owner = ownerById?.get(id);
    if (!owner) return activeAggregate ? 'この集合のメンバー' : '所属範囲のメンバー';
    if (owner === id) return '個別表示';
    if (owner === activeAggregate?.id) return activeAggregate.mode === 'manual' ? 'この集合に手動で折りたたみ' : 'この集合に自動集約';
    return aggregateById.get(owner)?.mode === 'manual' ? '別の集合に手動で折りたたみ' : '別の集合に自動集約';
  };
  const relation = inspection?.kind === 'relation' ? relations.find(relation => relation.id === inspection.id) : undefined;
  const members = useMemo(() => inspectedMemberIds ? new Set(inspectedMemberIds) : undefined, [inspectedMemberIds]);
  const selectedRelations = useMemo(() => {
    if (relation) { const ids = new Set(relation.originals.map(edge => edge.id)); return originalRelations.filter(edge => ids.has(edge.id)); }
    return members ? originalRelations.filter(edge => members.has(edge.source) || members.has(edge.target)) : [];
  }, [relation, originalRelations, members]);
  const currentPage = Math.min(groupPage, Math.max(0, Math.ceil(available.length / 12) - 1));
  const inspect = (value: AggregationInspection) => { onInspection(value); setOpen(true); };
  return <details className="auto-aggregation-panel" open={open || Boolean(inspection)} onToggle={event => {
    setOpen(event.currentTarget.open); if (!event.currentTarget.open && inspection) onInspection(undefined);
  }} data-auto-aggregation={enabled ? 'on' : 'off'} data-scope-count={counts.scope} data-individual-count={counts.individual} data-auto-member-count={counts.automaticMembers} data-auto-group-count={counts.automaticGroups} data-manual-member-count={counts.manualMembers}>
    <summary>対象 {counts.scope.toLocaleString()} · 個別 {counts.individual.toLocaleString()}{counts.automaticGroups ? ` · 自動 ${counts.automaticGroups.toLocaleString()}組` : ''}{counts.manualMembers ? ` · 手動 ${counts.manualMembers.toLocaleString()}対象` : ''}<span>表示の内訳</span></summary>
    {(open || inspection) && <div className="auto-aggregation-body"><p>自動省略 {enabled ? 'ON' : 'OFF'}。解析結果と検索対象は変わりません。</p>
      {inspection && !group && !relation && <p role="status">表示の更新により、選択していた集合または集約線は現在の対象範囲から外れました。<button type="button" onClick={() => inspect(undefined)}>現在の集約一覧へ戻る</button></p>}
      <dl className="auto-aggregation-counts"><div><dt>解析全体</dt><dd>{(totalCount ?? counts.scope).toLocaleString()}対象</dd></div><div><dt>現在の対象範囲</dt><dd>{counts.scope.toLocaleString()}対象</dd></div><div><dt>個別表示</dt><dd>{counts.individual.toLocaleString()}対象</dd></div><div><dt>自動集約</dt><dd>{counts.automaticGroups.toLocaleString()}組 · {counts.automaticMembers.toLocaleString()}対象</dd></div><div><dt>手動折りたたみ</dt><dd>{counts.manualGroups.toLocaleString()}組 · {counts.manualMembers.toLocaleString()}対象</dd></div></dl>
      <p className="auto-aggregation-note">個別表示は世界内の点の数です。画面外の点・優先ラベル・選択中心の線は別に描画を調整しています。</p>
      {!group && !relation && <><ul className="auto-aggregation-group-list">{available.slice(currentPage * 12, (currentPage + 1) * 12).map(group => {
        const aggregate = aggregates.find(item => item.groupId === group.id);
        return <li key={group.id}><button type="button" onClick={() => inspect({ kind: 'group', id: group.id })}><strong>{group.label}</strong><small>{aggregate ? `${aggregate.mode === 'automatic' ? '自動集約' : '手動折りたたみ'} ${aggregate.memberIds.length}対象${aggregate.matchingCount ? ` · 内部に${aggregate.matchingCount}件一致` : ''}` : `明示展開 ${group.memberIds.length}対象`}</small></button></li>;
      })}</ul><PageButtons page={groupPage} count={available.length} size={12} onPage={setGroupPage} label="集約の一覧" />{!available.length && <p>現在、自動集約・手動折りたたみはありません。</p>}</>}
      {(group || relation) && <><button type="button" className="auto-aggregation-back" onClick={() => inspect(undefined)}>集約の一覧へ</button>
        {group && <><h4>{group.label}</h4><p>{activeAggregate ? `現在の表示集合 ${activeAggregate.memberIds.length.toLocaleString()}対象。` : '表示の更新により、所属全体を表示しています。現在、この所属を代表する表示集合はありません。'}展開・折りたたみは、この所属範囲全体 {group.memberIds.length.toLocaleString()}対象に適用します。</p>
          {membershipCounts && <p className="auto-aggregation-membership-counts">所属全体の内訳：この集合 {membershipCounts.current} · 個別表示 {membershipCounts.individual} · 別の自動集約 {membershipCounts.otherAuto} · 別の手動折りたたみ {membershipCounts.otherManual}対象</p>}
          {activeAggregate?.breakdown && <dl className="auto-aggregation-counts" aria-label="表示集合の内訳">{Object.entries(activeAggregate.breakdown).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count.toLocaleString()}対象</dd></div>)}</dl>}
          <div className="auto-aggregation-actions"><button type="button" aria-pressed={expandedIds.has(group.id)} onClick={() => onGroupMode(group.id, 'expanded')}>この所属の{group.memberIds.length.toLocaleString()}対象を個別表示</button><button type="button" aria-pressed={collapsedIds.has(group.id)} onClick={() => onGroupMode(group.id, 'collapsed')}>この所属を手動で折りたたむ</button><button type="button" onClick={() => onGroupMode(group.id, 'auto')}>この所属を自動表示に戻す</button></div></>}
        {relation && <><h4>表示上の集約線 · {relation.originals.length.toLocaleString()}関係</h4><p>方向・種類・確度を分けてまとめています。各行から元の関係を選択できます。</p></>}
        {group && activeAggregate && activeAggregate.memberIds.length !== group.memberIds.length && <button type="button" className="auto-aggregation-back" aria-pressed={Boolean(showWholeScope)} onClick={() => setWholeScope({ groupId: group.id, visible: !showWholeScope })}>{showWholeScope ? 'この集合のメンバーだけを見る' : '所属範囲全体の一覧を見る'}</button>}
        <AggregationContents key={`${inspection?.kind}:${inspection?.id}:${Boolean(showWholeScope)}`} memberIds={inspectedMemberIds} relations={selectedRelations} nodeLabel={nodeLabel} memberStatus={memberStatus} onSelectNode={onSelectNode} onSelectRelation={onSelectRelation} />
      </>}
    </div>}
  </details>;
}

function AggregationContents({ memberIds, relations, nodeLabel, memberStatus, onSelectNode, onSelectRelation }: {
  memberIds?: readonly string[]; relations: readonly RelationItem[]; nodeLabel: (id: string) => { title: string; subtitle?: string };
  onSelectNode: (id: string) => void; onSelectRelation: (id: string) => void;
  memberStatus: (id: string) => string;
}) {
  const [page, setPage] = useState(0), [relationPage, setRelationPage] = useState(0), [showRelations, setShowRelations] = useState(!memberIds);
  const currentPage = Math.min(page, Math.max(0, Math.ceil((memberIds?.length ?? 0) / 20) - 1));
  const currentRelationPage = Math.min(relationPage, Math.max(0, Math.ceil(relations.length / 20) - 1));
  return <>{memberIds && <><h4>全メンバー {memberIds.length.toLocaleString()}対象</h4><ul className="auto-aggregation-members">{memberIds.slice(currentPage * 20, (currentPage + 1) * 20).map(id => {
    const label = nodeLabel(id); return <li key={id}><button type="button" data-aggregation-member-id={id} onClick={() => onSelectNode(id)}><strong>{label.title}</strong><small>{memberStatus(id)}</small>{label.subtitle && <small>{label.subtitle}</small>}</button></li>;
  })}</ul><PageButtons page={page} count={memberIds.length} size={20} onPage={setPage} label="全メンバー" /></>}
    <details open={showRelations} onToggle={event => setShowRelations(event.currentTarget.open)}><summary>元の関係 {relations.length.toLocaleString()}件（集合内部を含む）</summary>{showRelations && <><ul className="auto-aggregation-relations">{relations.slice(currentRelationPage * 20, (currentRelationPage + 1) * 20).map(edge => <li key={edge.id}><button type="button" data-aggregation-relation-id={edge.id} onClick={() => onSelectRelation(edge.id)}><strong>{nodeLabel(edge.source).title} → {nodeLabel(edge.target).title}</strong><span>{edge.label} · {edge.confidence}</span><small>1関係 · {edge.siteCount === undefined ? '根拠の箇所数は未取得' : `根拠 ${edge.siteCount}箇所`} · Evidence {edge.evidenceCount}件</small></button></li>)}</ul><PageButtons page={relationPage} count={relations.length} size={20} onPage={setRelationPage} label="元の関係" /></>}</details>
  </>;
}
