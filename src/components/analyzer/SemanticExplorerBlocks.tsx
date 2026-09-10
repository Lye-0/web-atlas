import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { explorerChildren, type ExplorerLocation, type SemanticExplorerModel } from '../../analyzer/semantic/semanticExplorer';
import { kindLabels } from '../../analyzer/semantic/types';
import { isFineDataExpression, semanticNodeDisplays, type SemanticNodeDisplay } from './semanticFlowDisplay';

export function SemanticExplorerBlocks({ explorer, nodeDisplays, location, visibleIds, matchIds, selectedIds, visitId, scrollTop, overlayTop, focusIds, focusNonce, onScroll, onOpenScope, onOpenNode, fineExpandedScopeIds, onFineExpandedScopeIds }: {
  nodeDisplays?: ReadonlyMap<string, SemanticNodeDisplay>;
  explorer: SemanticExplorerModel; location: ExplorerLocation; visibleIds: ReadonlySet<string>; matchIds: ReadonlySet<string>; selectedIds: ReadonlySet<string>;
  visitId: string; scrollTop: number; overlayTop: number; onScroll: (scrollTop: number) => void; onOpenScope: (id: string) => void; onOpenNode: (id: string) => void;
  focusIds?: string[]; focusNonce?: number;
  fineExpandedScopeIds?: readonly string[]; onFineExpandedScopeIds?: (ids: string[]) => void;
}) {
  const root = useRef<HTMLDivElement>(null), saved = useRef(scrollTop); saved.current = scrollTop;
  const children = useMemo(() => explorerChildren(explorer, location, visibleIds), [explorer, location, visibleIds]);
  const displays = useMemo(() => nodeDisplays ?? semanticNodeDisplays(explorer.nodes.values()), [nodeDisplays, explorer]);
  const [localFineOpen, setLocalFineOpen] = useState(false);
  const fineOpen = fineExpandedScopeIds ? fineExpandedScopeIds.includes(location.scopeId) : localFineOpen;
  const setFineOpen = (open: boolean) => {
    if (onFineExpandedScopeIds) onFineExpandedScopeIds([...(fineExpandedScopeIds ?? []).filter(id => id !== location.scopeId), ...(open ? [location.scopeId] : [])]);
    else setLocalFineOpen(open);
  };
  const fine = children.filter(child => explorer.view === 'data-flow' && child.node && isFineDataExpression(child.node)
    && !selectedIds.has(child.id) && !focusIds?.includes(child.id));
  const fineIds = new Set(fine.map(child => child.id));
  const primary = children.filter(child => !fineIds.has(child.id));
  useLayoutEffect(() => { if (root.current) root.current.scrollTop = saved.current; }, [visitId]);
  useLayoutEffect(() => {
    const container = root.current; if (!container || !focusIds?.length) return;
    const target = [...container.querySelectorAll<HTMLButtonElement>('[data-node-open-id]')].find(item => focusIds.includes(item.dataset.nodeOpenId!));
    if (!target) return;
    const box = target.getBoundingClientRect(), viewport = container.getBoundingClientRect();
    if (box.top < viewport.top || box.bottom > viewport.bottom) container.scrollTop += box.top - viewport.top - Math.max(0, (viewport.height - box.height) / 2);
  }, [focusIds, focusNonce]);
  const labels = { project: 'プロジェクト', context: '実行環境・所属', directory: 'ディレクトリ', file: 'ファイル', function: '関数・ファイル直下の処理', group: '所属', node: '対象' };
  return <div ref={root} className="semantic-explorer-blocks" style={{ top: overlayTop }} onScroll={event => onScroll(event.currentTarget.scrollTop)} data-explorer-scope={location.scopeId} data-child-count={children.length}>
    {children.length ? <>{explorer.view === 'data-flow' && fine.length > 0 && <p className="semantic-explorer-value-intro">主要な値・操作 {primary.length}件。細かな式・定数は下から展開できます。</p>}<ul className="semantic-explorer-block-grid">{primary.map(child => {
      const matches = child.memberIds.filter(id => matchIds.has(id)).length, selected = child.memberIds.some(id => selectedIds.has(id));
      const display = child.node ? displays.get(child.node.id) : undefined;
      return <li key={child.id}><button type="button" className={`semantic-explorer-block${matches ? ' is-match' : ''}${selected ? ' has-selection' : ''}`}
        data-explorer-kind={child.kind} data-scope-id={child.kind !== 'node' ? child.id : undefined} data-node-open-id={child.node?.id}
        title={display?.tooltip}
        onClick={() => child.kind === 'node' ? onOpenNode(child.id) : onOpenScope(child.id)}>
        <span className="semantic-explorer-block-type">{display?.dataRole ?? (child.node ? child.node.kind === 'external' ? '呼び出し先の定義を未特定' : kindLabels[child.node.kind] : labels[child.kind])}</span>
        <strong>{display?.title ?? child.label}</strong>{(display?.location ?? child.subtitle) && <small>{child.node?.kind === 'external' ? '呼び出し箇所の一例: ' : ''}{display?.location ?? child.subtitle}</small>}
        <span className="semantic-explorer-block-footer">{child.kind === 'node' ? '関係を開く' : `${child.count.toLocaleString()}対象 · 開く`}{matches > 0 && <span>{matches.toLocaleString()}件一致</span>}</span>
      </button></li>;
    })}</ul>{fine.length > 0 && <details className="semantic-explorer-fine-values" open={fineOpen} onToggle={event => setFineOpen(event.currentTarget.open)}>
      <summary>細かな式・定数 {fine.length.toLocaleString()}件 · {fineOpen ? '閉じる' : '展開する'}{fine.some(child => matchIds.has(child.id)) ? ` · ${fine.filter(child => matchIds.has(child.id)).length}件一致` : ''}</summary>
      {fineOpen && <ul className="semantic-explorer-block-grid">{fine.map(child => {
        const display = displays.get(child.id)!;
        return <li key={child.id}><button type="button" className={`semantic-explorer-block${matchIds.has(child.id) ? ' is-match' : ''}`} data-node-open-id={child.id} data-explorer-kind="node"
          title={display.tooltip} onClick={() => onOpenNode(child.id)}><span className="semantic-explorer-block-type">{display.dataRole}</span><strong>{display.title}</strong><small>{display.location}</small><span className="semantic-explorer-block-footer">関係を開く</span></button></li>;
      })}</ul>}
    </details>}</> : <div className="semantic-explorer-empty"><p>この場所に表示対象がありません。</p><p>パンくずから上の階層へ戻るか、フィルターを変更してください。</p></div>}
  </div>;
}
