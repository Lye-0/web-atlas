import type { SemanticNode } from '../../analyzer/semantic/types';

export interface SemanticNodeDisplay {
  title: string;
  location: string;
  tooltip: string;
}

/** Elide nested arguments/bodies without assigning a meaning or a definition to the callee. */
function compactCallee(callee: string) {
  const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack: string[] = [];
  let result = '', quote = '', escaped = false, comment: 'line' | 'block' | undefined;
  for (let index = 0; index < callee.length; index++) {
    const char = callee[index]!, next = callee[index + 1];
    if (comment) {
      if (comment === 'line' && char === '\n') comment = undefined;
      else if (comment === 'block' && char === '*' && next === '/') { comment = undefined; index++; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && (next === '/' || next === '*')) { comment = next === '/' ? 'line' : 'block'; index++; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; if (!stack.length) result += `${char}...${char}`; continue; }
    if (closing[char]) {
      if (!stack.length) result += `${char}...${closing[char]}`;
      stack.push(closing[char]!);
    } else if (stack.length) { if (char === stack.at(-1)) stack.pop(); }
    else result += char;
  }
  // Analyzer may have recorded only a prefix of a long callee. Do not guess its terminal member.
  if (stack.length || quote || comment) return '呼び出し式 (...)';
  const compact = result.replace(/\s+/g, ' ').replace(/\s*([.])\s*/g, '$1').trim();
  return `${compact.length > 54 ? `${compact.slice(0, 51)}…` : compact}(...)`;
}

/** Display strings only: the canonical node, label, expression, range and ID stay untouched. */
export function semanticNodeDisplay(node: SemanticNode): SemanticNodeDisplay {
  const initializer = node.kind === 'function' && node.attributes.initializer === true;
  const callee = (node.kind === 'external' || node.kind === 'operation') && typeof node.attributes.callee === 'string' ? node.attributes.callee : undefined;
  const title = initializer ? 'ファイル直下の処理' : callee ? compactCallee(callee) : node.label;
  const path = node.path ?? node.evidence[0]?.path ?? node.group;
  const line = node.line ?? node.evidence[0]?.line;
  const location = `${path}${line ? `:${line}` : ''}`;
  return { title, location, tooltip: `${title}\n${node.kind === 'external' ? '呼び出し箇所の一例: ' : ''}${location}\n元の表示名: ${node.label}${callee && callee !== node.label ? `\n呼び出し式: ${callee}` : ''}` };
}

/** Distinct objects can share a shortened title and even a source line; expose their recorded ranges. */
export function semanticNodeDisplays(nodes: Iterable<SemanticNode>): ReadonlyMap<string, SemanticNodeDisplay> {
  const items = [...nodes], displays = new Map(items.map(node => [node.id, semanticNodeDisplay(node)]));
  const repeated = new Map<string, number>();
  for (const display of displays.values()) {
    const key = `${display.title}\n${display.location}`;
    repeated.set(key, (repeated.get(key) ?? 0) + 1);
  }
  const collisions = new Map<string, SemanticNode[]>();
  for (const node of items) {
    const display = displays.get(node.id)!;
    if ((repeated.get(`${display.title}\n${display.location}`) ?? 0) < 2) continue;
    const range = node.evidence[0];
    if (range) display.location += ` · 範囲 ${range.start}–${range.end}`;
    display.tooltip += `\n${range ? `ソース範囲: ${range.start}–${range.end}\n` : ''}ID: ${node.id}`;
    const key = `${display.title}\n${display.location}`;
    const members = collisions.get(key) ?? []; members.push(node); collisions.set(key, members);
  }
  for (const members of collisions.values()) if (members.length > 1) [...members].sort((a, b) => a.id.localeCompare(b.id)).forEach((node, index) => {
    displays.get(node.id)!.location += ` · 対象 ${index + 1}`;
  });
  return displays;
}
