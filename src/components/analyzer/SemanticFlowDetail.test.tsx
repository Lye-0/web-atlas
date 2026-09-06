import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confidenceLabels, semanticViewIds, type SemanticEdge, type SemanticEvidence, type SemanticNode } from '../../analyzer/semantic/types';
import { SemanticFlowDetail } from './SemanticFlowDetail';

const evidence = (description: string, line = 2, endLine = line): SemanticEvidence => ({ path: 'src/service.ts', start: line * 10, end: endLine * 10 + 9, line, endLine, description });
const node = (id: string): SemanticNode => ({ id, kind: 'function', label: id, path: `src/${id}.ts`, line: 2, endLine: 8, group: 'Services', confidence: 'source', evidence: [evidence(`${id} declaration`)], attributes: {} });
const relation = (id: string, source = 'run', target = 'save'): SemanticEdge => ({ id, source, target, label: id, kind: 'calls', views: ['runtime-flow', 'function-call-flow'], confidence: 'source', evidence: [evidence(`${id} evidence`)] });

describe('Semantic flow detail exploration', () => {
  let host: HTMLDivElement, root: Root;
  const onSelect = vi.fn(), onSelectEdge = vi.fn(), onClose = vi.fn(), onJump = vi.fn();
  const nodes = new Map(['run', 'save', 'caller', ...Array.from({ length: 8 }, (_, index) => `peer-${index}`)].map(id => [id, node(id)]));
  const render = async (props: Partial<ComponentProps<typeof SemanticFlowDetail>>) => act(async () => root.render(
    <SemanticFlowDetail key={props.node?.id ?? props.edge?.id ?? 'empty'} nodes={nodes} edges={[]} sources={{ 'src/service.ts': Array.from({ length: 90 }, (_, index) => `source row ${index + 1}`).join('\n') }} view="function-call-flow"
      onSelect={onSelect} onSelectEdge={onSelectEdge} onClose={onClose} onJump={onJump} {...props} />,
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
    const out = section('出る関係・呼び出し先');
    expect(out.querySelector('summary small')?.textContent).toBe('15');
    expect(section('入る関係・呼び出し元').querySelector('summary small')?.textContent).toBe('1');
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
    for (const edge of [...outgoing, incoming, self]) {
      const button = [...host.querySelectorAll<HTMLButtonElement>('.semantic-flow-relation-link > button')].find(item => item.textContent === `${edge.label} · ${confidenceLabels[edge.confidence]}`)!;
      expect(button.parentElement?.querySelector('code')?.textContent).toBe(edge.kind);
      await click(button);
      expect(onSelectEdge).toHaveBeenLastCalledWith(edge.id);
    }
    await click(out.querySelector<HTMLButtonElement>('.analyzer-module-connection-name')!);
    expect(onSelect).toHaveBeenLastCalledWith('peer-0');
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
    expect(section('関係情報').textContent).toContain('calls');
    expect(section('関係情報').textContent).toContain('推定');
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
      expect(rows[index]?.textContent).toContain(`${original.label} · ${original.kind} · ${confidenceLabels[original.confidence]}`);
      expect(rows[index]?.textContent).toContain(`${original.id} evidence`);
    }
    expect(originals.querySelector('pre')).toBeNull();
    await open(rows[7]!.querySelector<HTMLDetailsElement>('.semantic-evidence > details')!);
    expect(rows[7]?.querySelector('pre')?.textContent).toContain('source row 2');
  });
});
