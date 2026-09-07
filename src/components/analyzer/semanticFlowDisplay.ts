import { kindLabels, type SemanticNode } from '../../analyzer/semantic/types';

export interface SemanticNodeDisplay {
  title: string;
  location: string;
  tooltip: string;
  disambiguation?: string;
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
  const names = new Map<string, SemanticNode[]>();
  for (const node of items) {
    const name = displays.get(node.id)!.title, named = names.get(name) ?? [];
    named.push(node); names.set(name, named);
  }
  for (const named of names.values()) {
    if (named.length < 2) continue;
    const paths = new Map(named.map(node => [node.id, (node.path ?? node.evidence[0]?.path)?.replaceAll('\\', '/')]).filter((item): item is [string, string] => Boolean(item[1])));
    const suffixCounts = new Map<string, number>();
    for (const path of new Set(paths.values())) {
      const parts = path.split('/');
      for (let length = 1; length <= parts.length; length++) { const suffix = parts.slice(-length).join('/'); suffixCounts.set(suffix, (suffixCounts.get(suffix) ?? 0) + 1); }
    }
    const rows = new Map<string, string>();
    for (const node of named) {
      const path = paths.get(node.id), line = node.line ?? node.evidence[0]?.line;
      if (path) {
        const parts = path.split('/'); let suffix = path;
        for (let length = 1; length <= parts.length; length++) { const candidate = parts.slice(-length).join('/'); if (suffixCounts.get(candidate) === 1) { suffix = candidate; break; } }
        rows.set(node.id, `${suffix}${line ? `:${line}` : ''}`);
      } else rows.set(node.id, `${kindLabels[node.kind]}${node.group ? ` · ${node.group}` : ''}`);
      const display = displays.get(node.id)!;
      if (!display.tooltip.includes(`ID: ${node.id}`)) display.tooltip += `\nID: ${node.id}`;
    }
    const groupRows = () => {
      const grouped = new Map<string, SemanticNode[]>();
      for (const node of named) { const row = rows.get(node.id)!; const members = grouped.get(row) ?? []; members.push(node); grouped.set(row, members); }
      return grouped;
    };
    const duplicateRows = groupRows();
    for (const same of duplicateRows.values()) if (same.length > 1) for (const node of same) {
      const evidence = node.evidence[0];
      // Put the distinguishing range first, where a narrow label cannot ellipsize it away.
      if (evidence) rows.set(node.id, `範囲 ${evidence.start}–${evidence.end} · ${rows.get(node.id)}`);
    }
    const remaining = groupRows();
    for (const same of remaining.values()) if (same.length > 1) for (const node of same) {
      let length = 8;
      while (length < node.id.length && same.some(other => other.id !== node.id && other.id.slice(-length) === node.id.slice(-length))) length++;
      const id = node.id.length > length ? `…${node.id.slice(-length)}` : node.id;
      rows.set(node.id, `ID ${id} · ${rows.get(node.id)}`);
    }
    for (const node of named) displays.get(node.id)!.disambiguation = rows.get(node.id);
  }
  return displays;
}
