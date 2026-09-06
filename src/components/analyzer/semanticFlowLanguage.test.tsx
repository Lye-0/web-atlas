import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SemanticNode, SemanticRelationSource } from '../../analyzer/semantic/types';
import { SemanticFlowLegend } from './SemanticFlowLegend';
import { semanticFlowDirectionLanguage, semanticNodeConfidence, semanticNodeExplanation, semanticRelationConfidence, semanticRelationExplanation } from './semanticFlowLanguage';

describe('Semantic direction and uncertainty language', () => {
  it.each([
    ['module-dependency', 'import元', 'import先'], ['function-call-flow', '呼び出し元', '呼び出し先'], ['runtime-flow', '関係元', '関係先'],
  ] as const)('anchors %s directions on the selection with the existing palette', (view, incoming, outgoing) => {
    const host = document.createElement('div'); host.innerHTML = renderToStaticMarkup(<SemanticFlowLegend view={view} />);
    expect(host.querySelector('[data-direction="incoming"]')?.textContent).toBe(`${incoming} →`);
    expect(host.querySelector('[data-direction="outgoing"]')?.textContent).toBe(`→ ${outgoing}`);
    expect(host.querySelector('.semantic-flow-direction-row > strong')?.textContent).toBe('選択対象');
    expect(host.querySelector<HTMLElement>('[data-direction="incoming"]')?.style.color).toBe('rgb(223, 183, 133)');
    expect(host.querySelector<HTMLElement>('[data-direction="outgoing"]')?.style.color).toBe('rgb(130, 198, 226)');
    expect(semanticFlowDirectionLanguage(view).help).toContain('実行順');
    expect(semanticFlowDirectionLanguage(view).help).toContain('表しません');
  });

  it('separates missing call definitions from missing request URLs and never claims absent source evidence', () => {
    const target: SemanticNode = { id: 'unknown', kind: 'external', label: 'client.run', group: 'API', confidence: 'unresolved', evidence: [], attributes: { candidates: ['first', 'second'] } };
    const call: SemanticRelationSource = { id: 'call', kind: 'calls', label: 'client.run', source: 'owner', target: target.id, confidence: 'unresolved', evidence: [] };
    expect(semanticNodeConfidence(target)).toBe('呼び出し先の定義を未特定');
    expect(semanticNodeExplanation(target)).toContain('定義の候補が複数');
    expect(semanticNodeExplanation(target)).not.toContain('呼び出し式はソースにあります');
    expect(semanticRelationConfidence(call)).toBe('呼び出し先の定義を未特定');
    expect(semanticRelationExplanation(call, target)).not.toContain('ソースで確認できています');
    const request: SemanticNode = { ...target, kind: 'request' };
    expect(semanticNodeConfidence(request)).toBe('送信先URLを未特定');
    expect(semanticNodeExplanation(request)).toContain('送信先URL');
    expect(semanticNodeExplanation(request)).not.toContain('関数の定義');
    expect(semanticRelationConfidence({ ...call, confidence: 'observed' })).toBe('実測');
  });
});
