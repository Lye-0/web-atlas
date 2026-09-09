import type { SemanticEvidence } from './types';
export const uniqueArchitectureEvidence = (items: SemanticEvidence[]) => [...new Map(items.map(ev => [JSON.stringify([ev.path, ev.start, ev.end, ev.description]), ev])).values()];
