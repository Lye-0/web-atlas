import type { SemanticNode } from '../../analyzer/semantic/types';

export function modelChoiceId(node: SemanticNode, index: number): string {
  const choice = node.model?.choices?.[index];
  return `model-choice:${JSON.stringify([node.id, index, choice?.evidence.map(item => [item.path, item.start, item.end]) ?? []])}`;
}

export function modelChoiceLabel(choice: NonNullable<NonNullable<SemanticNode['model']>['choices']>[number], index: number): string {
  const discriminants = choice.fields?.filter(field => /^(?:["'][^"']*["']|true|false|-?\d+(?:\.\d+)?)$/.test(field.type.trim()));
  if (discriminants?.length) return discriminants.map(field => `${field.name}: ${field.type}`).join(' · ');
  if (choice.fields?.length && /^\s*\{/.test(choice.label)) return `候補 ${index + 1} · ${choice.fields.map(field => field.name).slice(0, 3).join(' / ')}${choice.fields.length > 3 ? ' / …' : ''}`;
  const text = choice.label.replace(/\s+/g, ' ').trim();
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}
