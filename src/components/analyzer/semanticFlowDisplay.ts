import { kindLabels, type SemanticNode } from '../../analyzer/semantic/types';
import { architectureEnvironmentLabel, architectureKindLabels } from '../../analyzer/semantic/architectureMetadata';
import { architectureRequestSources } from './architectureSummary';

export interface SemanticNodeDisplay {
  title: string;
  location: string;
  tooltip: string;
  disambiguation?: string;
  dataRole?: string;
  scopeRole?: 'inside' | 'direct' | 'surrounding';
}

/** Source syntax only; the complete expression remains on the canonical node. */
export function compactDataExpression(expression: string): string {
  const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack: string[] = [];
  let result = '', quote = '', escaped = false, comment: 'line' | 'block' | undefined;
  const source = expression.trim();
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!, next = source[index + 1];
    if (comment) {
      if (comment === 'line' && char === '\n') { comment = undefined; if (!stack.length) result += ' '; }
      else if (comment === 'block' && char === '*' && next === '/') { comment = undefined; index++; if (!stack.length) result += ' '; }
      continue;
    }
    if (quote) {
      if (!stack.length) result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && (next === '/' || next === '*')) { comment = next === '/' ? 'line' : 'block'; index++; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; if (!stack.length) result += char; continue; }
    if (closing[char]) { if (!stack.length) result += `${char}…${closing[char]}`; stack.push(closing[char]!); }
    else if (stack.length) { if (char === stack.at(-1)) stack.pop(); }
    else result += char;
  }
  const text = result.replace(/\s+/g, ' ').trim();
  return text.length > 76 ? `${text.slice(0, 73)}…` : text;
}

export function semanticDataRole(node: SemanticNode): string | undefined {
  const data = node.data; if (!data) return undefined;
  const owner = typeof node.attributes.ownerName === 'string' ? node.attributes.ownerName : undefined;
  const argument = data.argumentIndex === undefined ? '' : `・第${data.argumentIndex + 1}引数`;
  if (data.role === 'parameter') return `${owner ? `${owner}の` : ''}仮引数${argument}`;
  if (data.role === 'argument') return `実引数${argument}`;
  if (data.role === 'use') return `${node.line ? `${node.line}行目の` : ''}使用箇所`;
  return ({ declaration: '宣言した値', assignment: '代入した値', 'property-read': '項目の取得', 'property-write': '項目への設定',
    return: node.id.startsWith('context-return:') ? '関数の戻り口' : '値を返す', termination: '値を指定せず終了',
    'call-result': '処理結果', operation: '操作', literal: '式中の定数・値', unknown: '未解決の値' } as const)[data.role];
}

/** Named declarations/results stay at the entrance; source occurrences remain searchable. */
export function isFineDataExpression(node: SemanticNode): boolean {
  const role = node.data?.role;
  return role === 'literal' || role === 'use' || role === 'argument' || role === 'property-read' || role === 'unknown'
    || role === 'operation' && typeof node.attributes.callee !== 'string' && !/^await\b/.test(node.data?.expression.trim() ?? '')
      && node.attributes.contextualSummary !== true;
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
  if (node.architecture) {
    const arch = node.architecture;
    const identity = arch.identity;
    const binding = identity?.configurations[0]?.binding;
    const scopeRole = node.attributes.architectureScopeRole;
    const scope = scopeRole === 'inside' || scopeRole === 'direct' || scopeRole === 'surrounding' ? scopeRole : undefined;
    const location = [node.attributes.architectureContext ? '表示範囲外・周辺概要' : '',
      identity || ['resource', 'external-service'].includes(arch.kind) ? architectureEnvironmentLabel(arch.environments) : arch.context.join(' / '),
      binding ? `${binding}${identity?.identifier ? ` · ID:${identity.identifier.slice(0, 8)}` : ' · 同一性未確認'}` : arch.request || node.attributes.architectureRequestGroup ? '' : arch.parentId ? node.group : arch.ownerPath,
      Number(node.attributes.architectureInternalCount) > 0 ? `内部関係 ${node.attributes.architectureInternalCount}件` : '',
    ].filter(Boolean).join(' · ') || node.path || '構成要素';
    const kind = node.attributes.architectureRequestGroup ? '表示上の集合' : arch.request ? '相手は未特定' : architectureKindLabels[arch.kind];
    const dataRole = scope ? `${({ inside: '内部', direct: '接続先', surrounding: '周辺' })[scope]} · ${arch.kind === 'component' ? 'コンポーネント' : kind}` : node.attributes.architectureContext ? `表示範囲外 · ${kind}` : kind;
    const disambiguation = identity ? `${architectureEnvironmentLabel(arch.environments)}${binding ? ` · ${binding}` : ''}${identity.identifier ? ` · ID:${identity.identifier.length > 10 ? `${identity.identifier.slice(0, 4)}…${identity.identifier.slice(-4)}` : identity.identifier}` : ' · 同一性未確認'}`
      : arch.request ? node.evidence[0] ? `${node.evidence[0].path}:${node.evidence[0].line}` : node.path ?? 'ソース箇所未確認'
        : Number(node.attributes.architectureInternalCount) > 0 ? `内部関係 ${node.attributes.architectureInternalCount}件` : undefined;
    return { title: node.label, location, dataRole, disambiguation, scopeRole: scope, tooltip: `${node.label}\n${dataRole}\n${location}\n${identity?.identifier ? `識別子: ${identity.identifier}\n` : ''}${arch.request?.expression ?? node.evidence[0]?.description ?? ''}` };
  }
  const initializer = node.kind === 'function' && node.attributes.initializer === true;
  const callee = (node.kind === 'external' || node.kind === 'operation') && typeof node.attributes.callee === 'string' ? node.attributes.callee : undefined;
  const data = node.data;
  const dataTitle = data && (data.role === 'operation' || data.role === 'call-result' || data.role === 'return' || data.role === 'property-read' || data.role === 'property-write')
    ? data.role === 'call-result' ? `${compactDataExpression(data.expression)} の結果`
      : node.id.startsWith('context-return:') || node.attributes.contextualSummary === true ? node.label
        : compactDataExpression(data.expression) : undefined;
  const title = initializer ? 'ファイル直下の処理' : callee ? compactCallee(callee) : dataTitle ?? node.label;
  const path = node.path ?? node.evidence[0]?.path ?? node.group;
  const line = node.line ?? node.evidence[0]?.line;
  const location = `${path}${line ? `:${line}` : ''}`;
  const dataRole = semanticDataRole(node);
  return { title, location, dataRole, tooltip: `${title}${dataRole ? `\n${dataRole}` : ''}\n${node.kind === 'external' ? '呼び出し箇所の一例: ' : ''}${location}\n元の表示名: ${node.label}${callee && callee !== node.label ? `\n呼び出し式: ${callee}` : ''}${data ? `\n完全な式: ${data.expression}\n所属: ${String(node.attributes.ownerName ?? node.group)}` : ''}` };
}

/** Distinct objects can share a shortened title and even a source line; expose their recorded ranges. */
export function semanticNodeDisplays(nodes: Iterable<SemanticNode>, contextNodes?: ReadonlyMap<string, SemanticNode>): ReadonlyMap<string, SemanticNodeDisplay> {
  const items = [...nodes], displays = new Map(items.map(node => [node.id, semanticNodeDisplay(node)]));
  const byId = new Map(items.map(node => [node.id, node]));
  const architectureNodes = contextNodes ? new Map([...contextNodes, ...byId]) : byId;
  for (const node of items) if (node.architecture?.request || node.attributes.architectureRequestGroup) {
    const requests = Array.isArray(node.attributes.requestIds) ? node.attributes.requestIds.map(id => architectureNodes.get(id)) : [node];
    const origin = architectureRequestSources(requests, architectureNodes), display = displays.get(node.id)!;
    display.location = `${origin.label} · ${display.location}`;
    display.disambiguation = node.attributes.architectureRequestGroup ? `${origin.label}${node.architecture?.environments.length ? ` · ${architectureEnvironmentLabel(node.architecture.environments)}` : ''}` : `${origin.label} · ${display.disambiguation ?? ''}`;
    display.tooltip += `\n${origin.label}${origin.sources.length > 1 ? `\n${origin.sources.map(source => source.label).join('\n')}` : ''}\n要求元は接続先の所属ではありません。`;
  }
  const contexts = new Map<string, string>();
  for (const node of items) {
    const contextId = node.data?.contextId;
    const call = contextId ? contextNodes?.get(contextId) ?? byId.get(contextId) : undefined;
    if (!call) continue;
    const source = call.evidence[0], path = call.path ?? source?.path;
    if (!path) continue;
    const context = `呼び出し ${path}:${call.line ?? source?.line ?? '?'}${source ? ` · 箇所 ${source.start}–${source.end}` : ''}`;
    contexts.set(node.id, `呼び出し L${call.line ?? source?.line ?? '?'}${source ? ` (${source.start}–${source.end})` : ''} · ${path.split('/').at(-1)}`);
    const display = displays.get(node.id)!;
    display.location += ` · ${context}`;
    display.tooltip += `\n${context}`;
  }
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
    if (named.every(node => node.architecture)) {
      const identifiers = new Map<string | undefined, number>();
      for (const node of named) { const value = displays.get(node.id)?.disambiguation; identifiers.set(value, (identifiers.get(value) ?? 0) + 1); }
      for (const node of named) {
        const display = displays.get(node.id)!;
        const source = node.evidence[0];
        if (node.architecture?.identity && display.disambiguation && identifiers.get(display.disambiguation) === 1) continue;
        const sourceLocation = source ? `${source.path}:${source.line}` : node.path;
        display.disambiguation = node.architecture?.request && source ? `${architectureRequestSources([node], architectureNodes).label} · 箇所 ${source.start}–${source.end} · ${source.path}:${source.line}`
          : `${display.disambiguation ?? display.location}${sourceLocation ? ` · ${sourceLocation}` : ''}`;
      }
      continue;
    }
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
      const context = contexts.get(node.id);
      if (context) { rows.set(node.id, `${context} · ${rows.get(node.id)}`); continue; }
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
