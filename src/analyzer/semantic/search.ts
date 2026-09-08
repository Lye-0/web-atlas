import { compareAnalyzerSearchResults, matchAnalyzerSearch, normalizeAnalyzerQuery, type AnalyzerSearchDocument } from '../search';
import type { SemanticNode } from './types';

/** Only recognizable source names, explicit aliases, paths and ownership are searchable. */
export function semanticSearchDocument(node: SemanticNode): AnalyzerSearchDocument {
  const values = (keys: string[]) => keys.flatMap(key => {
    const value = node.attributes[key]; return typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  });
  return {
    names: [node.label, ...(node.data ? [node.data.expression] : []), ...values(['name', 'qualifiedName', 'className', 'callee', 'event', 'command', 'serviceName', 'binding', 'aliases'])],
    paths: [node.path ?? '', ...values(['entryPath'])], groups: [node.group, ...values(['ownerName', 'runtimeName'])],
    fields: [...(node.fields ?? []), ...(node.model?.choices?.flatMap(choice => choice.fields ?? []) ?? [])].flatMap(field => [field.name, field.type]),
  };
}

export function searchSemanticNodes(nodes: readonly SemanticNode[], query: string) {
  return nodes.flatMap(node => {
    const match = matchAnalyzerSearch(semanticSearchDocument(node), query);
    return match ? [{ node, id: node.id, label: node.label, path: node.path, match }] : [];
  }).sort(compareAnalyzerSearchResults);
}

/** Field tokens select recorded fields; a model-name-only query doesn't open every choice. */
export function matchingSemanticFields(node: SemanticNode, query: string) {
  const document = semanticSearchDocument(node);
  const context = [...document.names, ...document.paths ?? [], ...document.groups ?? []].map(normalizeAnalyzerQuery);
  const tokens = normalizeAnalyzerQuery(query).split(' ').filter(token => token && !context.some(value => value.includes(token)));
  if (!tokens.length) return [];
  return [...node.fields ?? [], ...node.model?.choices?.flatMap(choice => choice.fields ?? []) ?? []]
    .filter(field => tokens.some(token => normalizeAnalyzerQuery(`${field.name} ${field.type}`).includes(token)));
}
