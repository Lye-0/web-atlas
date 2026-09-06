import { describe, expect, it } from 'vitest';
import { semanticNavigationContext } from './navigation';
import type { SemanticGraph, SemanticNode } from './types';

const node = (id: string, label = id, attributes: SemanticNode['attributes'] = {}): SemanticNode => ({ id, kind: 'function', label, path: `src/${id}.ts`, group: 'Source', confidence: 'source', evidence: [], attributes });
const graph = (nodes: SemanticNode[]): SemanticGraph => ({ view: 'data-flow', nodes, edges: [] });

describe('semantic View navigation context', () => {
  it('keeps direct identity, ownership and all members when a function owns multiple values', () => {
    const owner = node('owner'), first = node('value1', 'input', { owner: owner.id }), second = node('value2', 'output', { owner: owner.id });
    expect(semanticNavigationContext(graph([owner]), owner).target?.id).toBe('owner');
    expect(semanticNavigationContext(graph([owner]), first).target?.id).toBe('owner');
    expect(semanticNavigationContext(graph([first, second]), owner)).toEqual({ members: ['value1', 'value2'], search: '' });
    const group = node('subsystem', 'API', { members: ['owner'] });
    expect(semanticNavigationContext(graph([group]), owner).target?.id).toBe('subsystem');
    expect(semanticNavigationContext(graph([first, second]), group).members).toEqual(['value1', 'value2']);
    const fileGroup = node('file-group', 'Package', { members: ['different-view-id'], files: ['src/service.ts'] });
    const fileMember = { ...node('file-member'), path: 'src/service.ts' };
    expect(semanticNavigationContext(graph([fileMember, second]), fileGroup).members).toEqual(['file-member']);
  });
  it('opens a path search rather than selecting an unrelated same-name symbol', () => {
    const original = node('original', 'same'), unrelated = node('unrelated', 'same');
    expect(semanticNavigationContext(graph([unrelated]), original)).toEqual({ search: 'src/original.ts' });
  });
});
