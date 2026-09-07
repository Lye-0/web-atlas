import { compareAnalyzerSearchResults, matchAnalyzerSearch, type AnalyzerSearchDocument } from '../search';
import type { SemanticNode } from './types';

/** Only recognizable source names, explicit aliases, paths and ownership are searchable. */
export function semanticSearchDocument(node: SemanticNode): AnalyzerSearchDocument {
  const values = (keys: string[]) => keys.flatMap(key => {
    const value = node.attributes[key]; return typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  });
  return {
    names: [node.label, ...values(['name', 'qualifiedName', 'className', 'callee', 'event', 'command', 'serviceName', 'binding', 'aliases'])],
    paths: [node.path ?? '', ...values(['entryPath'])], groups: [node.group, ...values(['ownerName', 'runtimeName'])],
    fields: node.fields?.flatMap(field => [field.name, field.type]),
  };
}

export function searchSemanticNodes(nodes: readonly SemanticNode[], query: string) {
  return nodes.flatMap(node => {
    const match = matchAnalyzerSearch(semanticSearchDocument(node), query);
    return match ? [{ node, id: node.id, label: node.label, path: node.path, match }] : [];
  }).sort(compareAnalyzerSearchResults);
}
