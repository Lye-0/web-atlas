import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { semanticViewIds, type SemanticEdge, type SemanticEvidence, type SemanticNode } from '../../analyzer/semantic/types';
import { SemanticFlowDetail } from './SemanticFlowDetail';
import { semanticRelationConfidence, semanticRelationLabel } from './semanticFlowLanguage';

const evidence = (description: string, line = 2, endLine = line): SemanticEvidence => ({ path: 'src/service.ts', start: line * 10, end: endLine * 10 + 9, line, endLine, description });
const node = (id: string): SemanticNode => ({ id, kind: 'function', label: id, path: `src/${id}.ts`, line: 2, endLine: 8, group: 'Services', confidence: 'source', evidence: [evidence(`${id} declaration`)], attributes: {} });
const relation = (id: string, source = 'run', target = 'save'): SemanticEdge => ({ id, source, target, label: id, kind: 'calls', views: ['runtime-flow', 'function-call-flow'], confidence: 'source', evidence: [evidence(`${id} evidence`)] });

describe('Semantic flow detail exploration', () => {
  let host: HTMLDivElement, root: Root;
  const onSelect = vi.fn(), onSelectEdge = vi.fn(), onClose = vi.fn(), onJump = vi.fn(), onHoverTarget = vi.fn();
  const nodes = new Map(['run', 'save', 'caller', ...Array.from({ length: 8 }, (_, index) => `peer-${index}`)].map(id => [id, node(id)]));
  const render = async (props: Partial<ComponentProps<typeof SemanticFlowDetail>>) => act(async () => root.render(
    <SemanticFlowDetail key={props.node?.id ?? props.edge?.id ?? 'empty'} nodes={nodes} edges={[]} sources={{ 'src/service.ts': Array.from({ length: 90 }, (_, index) => `source row ${index + 1}`).join('\n') }} view="function-call-flow"
      onSelect={onSelect} onSelectEdge={onSelectEdge} onClose={onClose} onJump={onJump} onHoverTarget={onHoverTarget} {...props} />,
  ));
  const section = (name: string) => [...host.querySelectorAll<HTMLDetailsElement>('.analyzer-detail-accordion')].find(item => item.querySelector(':scope > summary > span')?.textContent === name)!;
  const open = async (item: HTMLDetailsElement) => act(async () => { item.open = true; item.dispatchEvent(new Event('toggle')); });
  const click = async (button: HTMLButtonElement) => act(async () => button.click());

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it('groups by direction and counterpart while keeping every canonical relation selectable', async () => {
    const parallel = Array.from({ length: 8 }, (_, index): SemanticEdge => ({ ...relation(`parallel-${index}`, 'run', 'peer-0'), kind: index % 2 ? 'callback' : 'calls', confidence: index % 2 ? 'inferred' : 'source' }));
    const outgoing = [...parallel, ...Array.from({ length: 7 }, (_, index) => relation(`out-${index + 1}`, 'run', `peer-${index + 1}`))];
    const incoming = relation('inbound', 'caller', 'run'), self = relation('recursive', 'run', 'run');
    await render({ node: nodes.get('run'), edges: [...outgoing, incoming, self] });
    const out = section('呼び出し先');
    expect(out.querySelector('summary small')?.textContent).toBe('15');
    expect(section('呼び出し元').querySelector('summary small')?.textContent).toBe('1');
    expect(section('自己参照').querySelector('summary small')?.textContent).toBe('1');
    expect(out.querySelectorAll('.semantic-flow-connection-row')).toHaveLength(6);
    await click(out.querySelector<HTMLButtonElement>('.analyzer-detail-show-more')!);
    expect(out.querySelectorAll('.semantic-flow-connection-row')).toHaveLength(8);
    expect([...out.querySelectorAll('.analyzer-module-connection-name strong')].filter(item => item.textContent === 'peer-0')).toHaveLength(1);
    const group = out.querySelector<HTMLDetailsElement>('.semantic-flow-relation-group')!;
    expect(group.open).toBe(false);
    await open(group);
    expect(group.querySelectorAll('.semantic-flow-relation-link')).toHaveLength(6);
    await click(group.querySelector<HTMLButtonElement>('.analyzer-detail-show-more')!);
    expect(group.querySelectorAll('.semantic-flow-relation-link')).toHaveLength(8);
    for (const [index, edge] of [...outgoing, incoming, self].entries()) {
      const button = host.querySelectorAll<HTMLButtonElement>('.semantic-flow-relation-link > button')[index]!;
      expect(button.textContent).toBe(`${semanticRelationLabel(edge)} · ${semanticRelationConfidence(edge)}`);
      expect(button.parentElement?.querySelector('code')).toBeNull();
      await click(button);
      expect(onSelectEdge).toHaveBeenLastCalledWith(edge.id);
    }
    await click(out.querySelector<HTMLButtonElement>('.analyzer-module-connection-name')!);
    expect(onSelect).toHaveBeenLastCalledWith('peer-0');
    for (const edge of [...outgoing, incoming, self]) {
      await render({ edge });
      await open(section('関係情報').querySelector<HTMLDetailsElement>('.semantic-flow-source-info')!);
      const entries = [...section('関係情報').querySelectorAll('dl > div')].map(item => [item.querySelector('dt')?.textContent, item.querySelector('dd')?.textContent]);
      expect(entries).toContainEqual(['関係ID', edge.id]);
      expect(entries).toContainEqual(['Kind', edge.kind]);
      expect(entries).toContainEqual(['Confidence', edge.confidence]);
      expect(entries).toContainEqual(['元の表示名', edge.label]);
    }
  });

  it('uses counterpart IDs for grouped hover and individual IDs for relation focus, releasing unmounted rows', async () => {
    const edges = [relation('one'), relation('two'), relation('three', 'run', 'caller')];
    await render({ node: nodes.get('run'), edges });
    const peer = host.querySelector<HTMLButtonElement>('[data-flow-detail-node-id="save"]')!;
    await act(async () => { peer.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); peer.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 0 })); });
    expect(onHoverTarget).toHaveBeenLastCalledWith({ kind: 'node', id: 'save' }, { source: expect.stringContaining('detail-node:save'), modality: 'pointer' });
    const group = host.querySelector<HTMLElement>('[data-flow-detail-group-id="save"]')!;
    await act(async () => group.focus());
    expect(onHoverTarget).toHaveBeenLastCalledWith({ kind: 'node', id: 'save' }, { source: expect.stringContaining('detail-group:save'), modality: 'focus' });
    await open(group.parentElement as HTMLDetailsElement);
    const individual = host.querySelector<HTMLButtonElement>('[data-flow-detail-edge-id="two"]')!;
    await act(async () => individual.focus());
    expect(onHoverTarget).toHaveBeenLastCalledWith({ kind: 'edge', id: 'two' }, { source: expect.stringContaining('detail-edge:two'), modality: 'focus' });
    const owner = onHoverTarget.mock.calls.at(-1)![1];
    onHoverTarget.mockClear();
    await act(async () => { const details = group.parentElement as HTMLDetailsElement; details.open = false; details.dispatchEvent(new Event('toggle')); });
    expect(onHoverTarget).toHaveBeenCalledWith(undefined, owner);
    expect(onSelect).not.toHaveBeenCalled(); expect(onSelectEdge).not.toHaveBeenCalled(); expect(onJump).not.toHaveBeenCalled();
  });

  it('does not replace a keyboard-focused counterpart when scrolling only generates pointer entry on another row', async () => {
    await render({ node: nodes.get('run'), edges: [relation('one'), relation('two', 'run', 'caller')] });
    const focused = host.querySelector<HTMLButtonElement>('[data-flow-detail-node-id="save"]')!, underPointer = host.querySelector<HTMLButtonElement>('[data-flow-detail-node-id="caller"]')!;
    await act(async () => focused.focus());
    expect(onHoverTarget).toHaveBeenLastCalledWith({ kind: 'node', id: 'save' }, { source: expect.stringContaining('detail-node:save'), modality: 'focus' });
    onHoverTarget.mockClear();
    await act(async () => underPointer.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
    expect(onHoverTarget).not.toHaveBeenCalled(); expect(document.activeElement).toBe(focused);
    await act(async () => underPointer.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 0 })));
    expect(onHoverTarget).toHaveBeenCalledExactlyOnceWith({ kind: 'node', id: 'caller' }, { source: expect.stringContaining('detail-node:caller'), modality: 'pointer' });
    expect(onSelect).not.toHaveBeenCalled(); expect(document.activeElement).toBe(focused);
  });

  it('distinguishes same-file same-line counterparts with acquired ranges and retains their exact selection', async () => {
    const first = { ...node('first'), label: 'callback L163', path: 'src/GraphSvg.tsx', line: 163, endLine: 163, evidence: [{ ...evidence('callback first', 163), path: 'src/GraphSvg.tsx', start: 12419, end: 12454 }] };
    const second = { ...first, id: 'second', evidence: [{ ...first.evidence[0]!, description: 'callback second', start: 12457, end: 12501 }] };
    const localNodes = new Map(nodes); localNodes.set(first.id, first); localNodes.set(second.id, second);
    const edges = [relation('callback-1', 'run', 'first'), relation('callback-2', 'run', 'second')];
    const before = JSON.stringify([...localNodes]);
    await render({ node: nodes.get('run'), nodes: localNodes, edges });
    const firstButton = host.querySelector<HTMLButtonElement>('[data-flow-detail-node-id="first"]')!;
    const secondButton = host.querySelector<HTMLButtonElement>('[data-flow-detail-node-id="second"]')!;
    expect(firstButton.querySelector('strong')?.textContent).toBe('callback L163'); expect(secondButton.querySelector('strong')?.textContent).toBe('callback L163');
    expect(firstButton.querySelector('small')?.textContent).toMatch(/^範囲 12419–12454/);
    expect(secondButton.querySelector('small')?.textContent).toMatch(/^範囲 12457–12501/);
    expect(secondButton.title).toContain('ID: second');
    await click(secondButton); expect(onSelect).toHaveBeenLastCalledWith('second');
    await render({ node: second, nodes: localNodes, edges }); await open(section('基本情報'));
    expect(section('基本情報').textContent).toContain('src/GraphSvg.tsx: 12457–12501');
    expect(JSON.stringify([...localNodes])).toBe(before);
  });

  it('defers auxiliary content and restores the compact state when selection changes', async () => {
    await render({ node: { ...nodes.get('run')!, signature: 'function run(input: string): void', attributes: { timestampRaw: '1725000000000000001', status: 'active' } } });
    for (const title of ['基本情報', 'Evidence', 'Metadata', '関連するView']) expect(section(title).open).toBe(false);
    expect(host.querySelector('.semantic-signature')).toBeNull();
    expect(host.querySelector('.semantic-evidence')).toBeNull();
    expect(host.querySelector('.semantic-crosslinks')).toBeNull();
    await open(section('基本情報'));
    expect(host.querySelector('.semantic-signature')?.textContent).toBe('function run(input: string): void');
    expect(section('基本情報').textContent).toContain('Services');
    await open(section('Metadata'));
    expect(section('Metadata').textContent).toContain('1725000000000000001');
    await open(section('Evidence'));
    expect(section('Evidence').textContent).toContain('run declaration');
    expect(section('Evidence').querySelector('pre')?.textContent).toContain('source row 2');
    await render({ node: nodes.get('save') });
    expect(host.querySelector('h3')?.textContent).toBe('save');
    expect(section('Evidence').open).toBe(false);
    expect(host.querySelector('.semantic-evidence')).toBeNull();
    await click(host.querySelector<HTMLButtonElement>('[aria-label="詳細を閉じる"]')!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps model fields visible and all cross-view destinations reachable by the model identity', async () => {
    const model: SemanticNode = { ...node('Order'), kind: 'model', fields: [
      { name: 'id', type: 'string', optional: false, key: 'primary' }, { name: 'customerId', type: 'string', optional: true, key: 'foreign' },
    ], attributes: { unresolvedSpreads: ['sharedColumns'] } };
    await render({ node: model, view: 'runtime-flow' });
    expect(section('Fields').open).toBe(true);
    const fields = host.querySelector('.semantic-fields')!;
    expect(fields.textContent).toContain('idPKstring');
    expect(fields.textContent).toContain('customerId?FKstring');
    expect(section('Fields').textContent).toContain('未展開のフィールド: sharedColumns');
    await open(section('関連するView'));
    const links = [...host.querySelectorAll<HTMLButtonElement>('.semantic-crosslinks button')];
    expect(links).toHaveLength(4);
    for (const [index, destination] of semanticViewIds.filter(id => id !== 'runtime-flow').entries()) {
      await click(links[index]!); expect(onJump).toHaveBeenLastCalledWith('Order', destination);
    }
  });

  it('preserves edge endpoints, kinds, confidence, all provenance and the full evidence range', async () => {
    const provenance = Array.from({ length: 8 }, (_, index) => ({ ...relation(`original-${index}`, `peer-${index}`, 'save'), kind: index % 2 ? 'callback' : 'calls', confidence: index % 2 ? 'inferred' as const : 'source' as const }));
    const edge: SemanticEdge = { ...relation('summary'), kind: 'calls', confidence: 'inferred', evidence: [evidence('whole declaration', 2, 80), evidence('whole declaration', 2, 80)], provenance: { edges: provenance } };
    await render({ edge });
    const endpoints = [...host.querySelectorAll<HTMLButtonElement>('.analyzer-module-edge-endpoints button')];
    expect(endpoints[0]?.querySelector('strong')?.textContent).toBe('run');
    expect(endpoints[1]?.querySelector('strong')?.textContent).toBe('save');
    expect(endpoints[1]?.querySelector('small')?.textContent).toBe('src/save.ts:2–8');
    await click(endpoints[0]!); expect(onSelect).toHaveBeenLastCalledWith('run');
    await click(endpoints[1]!); expect(onSelect).toHaveBeenLastCalledWith('save');
    expect(section('関係情報').textContent).toContain('推定');
    await open(section('関係情報').querySelector<HTMLDetailsElement>('.semantic-flow-source-info')!);
    expect(section('関係情報').textContent).toContain('calls');
    expect(section('関係情報').textContent).toContain('inferred');
    expect(section('Evidence').open).toBe(true);
    expect(section('Evidence').querySelector('summary small')?.textContent).toBe('1');
    expect(section('Evidence').textContent).toContain('src/service.ts:2–80');
    expect(section('Evidence').querySelectorAll('pre > span')).toHaveLength(24);
    await click(section('Evidence').querySelector<HTMLButtonElement>('.analyzer-detail-show-more')!);
    expect(section('Evidence').querySelectorAll('pre > span')).toHaveLength(82);
    expect(section('Evidence').querySelector('pre')?.textContent).toContain('source row 80');
    const originals = section('元の関係');
    expect(originals.open).toBe(false);
    await open(originals);
    expect(originals.querySelectorAll('.semantic-flow-original-relation')).toHaveLength(6);
    await click(originals.querySelector<HTMLButtonElement>(':scope > .analyzer-detail-accordion-body > .analyzer-detail-show-more')!);
    const rows = [...originals.querySelectorAll('.semantic-flow-original-relation')];
    expect(rows).toHaveLength(8);
    for (const [index, original] of provenance.entries()) {
      expect(rows[index]?.textContent).toContain(`${semanticRelationLabel(original)} · ${semanticRelationConfidence(original)}`);
      await open(rows[index]!.querySelector<HTMLDetailsElement>('.semantic-flow-source-info')!);
      expect(rows[index]?.textContent).toContain(original.label);
      expect(rows[index]?.textContent).toContain(original.kind);
      expect(rows[index]?.textContent).toContain(original.confidence);
      expect(rows[index]?.textContent).toContain(original.id);
      expect(rows[index]?.textContent).toContain(`${original.id} evidence`);
    }
    expect(originals.querySelector('pre')).toBeNull();
    await open(rows[7]!.querySelector<HTMLDetailsElement>('.semantic-evidence > details')!);
    expect(rows[7]?.querySelector('pre')?.textContent).toContain('source row 2');
  });

  it('distinguishes confirmed calls from unknown definitions without merging same-named targets or call sites', async () => {
    const first = { ...evidence('first call', 10), start: 100, end: 109 }, second = { ...evidence('second call on the same line', 10), start: 120, end: 129 }, third = evidence('another caller', 25);
    const unresolved: SemanticNode = { ...node('external:service:client.save'), label: 'client.save', kind: 'external', path: 'src/service.ts', line: 10, endLine: 10, confidence: 'unresolved', evidence: [first], attributes: { callee: 'client.save', reason: '呼び出し先を静的に解決できません', candidates: [] } };
    const other: SemanticNode = { ...unresolved, id: 'external:other:client.save', path: 'src/other.ts', evidence: [{ ...first, path: 'src/other.ts' }] };
    const scopedNodes = new Map(nodes); scopedNodes.set(unresolved.id, unresolved); scopedNodes.set(other.id, other);
    const calls: SemanticEdge[] = [first, second, third].map((item, index) => ({ ...relation(`unknown-call-${index}`, index === 2 ? 'save' : 'run', unresolved.id), label: 'client.save', confidence: 'unresolved', evidence: [item] }));
    const unrelated = { ...relation('other-call', 'caller', other.id), evidence: other.evidence, confidence: 'unresolved' as const };
    await render({ node: unresolved, nodes: scopedNodes, edges: [...calls, unrelated] });
    const note = host.querySelector('.semantic-flow-resolution-note')!;
    expect(note.textContent).toContain('呼び出し式はソースにあります');
    expect(note.textContent).toContain('関数の定義を特定できていません');
    expect(note.textContent).toContain('3箇所の呼び出し');
    expect(host.querySelector('.analyzer-module-detail-path')?.textContent).toBe('呼び出し箇所の一例: src/service.ts:10');
    expect(host.querySelector('.analyzer-node-type')?.textContent).toBe('呼び出し先');
    const group = section('呼び出し元').querySelector<HTMLDetailsElement>('.semantic-flow-relation-group')!;
    await open(group);
    const buttons = [...section('呼び出し元').querySelectorAll<HTMLButtonElement>('.semantic-flow-relation-link > button')];
    expect(buttons).toHaveLength(3);
    for (const [index, button] of buttons.entries()) { await click(button); expect(onSelectEdge).toHaveBeenLastCalledWith(calls[index]!.id); }
    await open(section('Evidence'));
    expect(section('Evidence').querySelector('summary small')?.textContent).toBe('3');
    expect(section('Evidence').textContent).toContain('first call');
    expect(section('Evidence').textContent).toContain('second call on the same line');
    expect(section('Evidence').textContent).toContain('another caller');
    expect(section('Evidence').textContent).not.toContain('src/other.ts');
    await render({ edge: calls[1], nodes: scopedNodes });
    expect(host.querySelector('.semantic-flow-resolution-note')?.textContent).toContain('この呼び出し式はソースで確認できています');
    expect(section('Evidence').textContent).toContain('second call on the same line');
    expect(section('Evidence').textContent).not.toContain('first call');
    await open(section('関係情報').querySelector<HTMLDetailsElement>('.semantic-flow-source-info')!);
    expect(section('関係情報').textContent).toContain('unknown-call-1');
    expect(section('関係情報').textContent).toContain('calls');
    expect(section('関係情報').textContent).toContain('unresolved');
  });
});
