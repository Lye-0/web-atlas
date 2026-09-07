import type { SemanticGraph, SemanticNode } from './types';

export interface SemanticNavigationContext { target?: SemanticNode; members?: string[]; search: string }

/** Cross-View context requires identity, ownership or explicit membership, never a name alone. */
export function semanticNavigationContext(graph: SemanticGraph, node: SemanticNode): SemanticNavigationContext {
  if (Array.isArray(node.attributes.members)) {
    const ids = new Set(node.attributes.members), files = new Set(Array.isArray(node.attributes.files) ? node.attributes.files : []);
    const members = graph.nodes.filter(item => ids.has(item.id) || typeof item.attributes.owner === 'string' && ids.has(item.attributes.owner) || item.path && files.has(item.path)).map(item => item.id);
    return members.length ? { members, search: '' } : { search: node.path ?? node.label };
  }
  const direct = graph.nodes.find(item => item.id === node.id) ?? graph.nodes.find(item => item.id === node.attributes.owner);
  if (direct) return { target: direct, search: '' };
  const owned = graph.nodes.filter(item => item.attributes.owner === node.id);
  if (owned.length === 1) return { target: owned[0], search: '' };
  if (owned.length > 1) return { members: owned.map(item => item.id), search: '' };
  const groups = graph.nodes.filter(item => Array.isArray(item.attributes.members) && item.attributes.members.includes(node.id));
  if (groups.length === 1) return { target: groups[0], search: '' };
  return { search: node.path ?? node.label };
}
