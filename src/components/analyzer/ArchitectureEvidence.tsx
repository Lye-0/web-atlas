import { useMemo, useState } from 'react';
import type { SemanticEvidence } from '../../analyzer/semantic/types';

import { architectureEvidencePaths } from './architectureEvidencePaths';

export function ArchitectureEvidenceHeading({ item, path, description }: { item: SemanticEvidence; path?: { filename: string; parent: string }; description?: string }) {
  const location = item.line > 0 ? item.endLine > item.line ? `L${item.line}–${item.endLine}` : `L${item.line}` : '位置未確認';
  const shown = path ?? architectureEvidencePaths([item]).get(item.path)!;
  return <span className="architecture-evidence-heading"><strong>{shown.filename} · {location}</strong><small>{shown.parent}</small><span>{description ?? item.description}</span></span>;
}

function EvidenceEntry({ item, path, sources }: { item: SemanticEvidence; path: { filename: string; parent: string }; sources: Record<string, string> }) {
  const [open, setOpen] = useState(false), [copyState, setCopyState] = useState('');
  const copy = async () => { try { await navigator.clipboard.writeText(item.path); setCopyState('コピーしました'); } catch { setCopyState('コピーできませんでした。完全なパスを選択してコピーできます。'); } };
  return <details className="analyzer-detail-accordion architecture-evidence-entry" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><ArchitectureEvidenceHeading item={item} path={path} /></summary>
    {open && <div className="analyzer-detail-accordion-body"><p className="architecture-evidence-full-path"><span>完全なパス</span><code tabIndex={0}>{item.path}</code><button type="button" onClick={() => void copy()}>パスをコピー</button><span role="status">{copyState}</span></p>
      <p>ソース範囲：{item.start}–{item.end}（開始位置を含み、終了位置を含まない）</p>
      <pre>{sources[item.path]?.split('\n').slice(Math.max(0, item.line - 2), Math.min(item.endLine + 2, item.line + 15)).map((line, i) => `${Math.max(1, item.line - 1) + i}  ${line}`).join('\n') ?? '読み込まれたソースがありません'}</pre>
    </div>}
  </details>;
}

export function ArchitectureEvidenceList({ evidence, sources }: { evidence: SemanticEvidence[]; sources: Record<string, string> }) {
  const [limit, setLimit] = useState(5), paths = useMemo(() => architectureEvidencePaths(evidence), [evidence]);
  return <>{evidence.slice(0, limit).map(item => <EvidenceEntry key={JSON.stringify([item.path, item.start, item.end, item.description])} item={item} path={paths.get(item.path)!} sources={sources} />)}{evidence.length > limit && <button onClick={() => setLimit(limit + 15)}>根拠をさらに表示</button>}</>;
}
