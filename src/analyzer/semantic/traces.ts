import type { SemanticAnalysis, SemanticEdge, SemanticNode, SemanticViewId } from './types';

export interface TraceImport { nodes: SemanticNode[]; edges: SemanticEdge[]; warnings: string[]; name: string; spans: number; logs: number }
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown) => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
const traceViews: SemanticViewId[] = ['runtime-flow', 'function-call-flow', 'architecture-map'];
const forbiddenKeys = /authorization|cookie|password|secret|token|credential|api[_.-]?key/i;
function attributeValue(value: unknown): string | number | boolean {
  if (typeof value === 'string') return value.slice(0, 1000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const item = record(value);
  return attributeValue(item.stringValue ?? item.intValue ?? item.doubleValue ?? item.boolValue ?? '');
}
function attributes(value: unknown): SemanticNode['attributes'] {
  const result: SemanticNode['attributes'] = {};
  const entries = Array.isArray(value) ? value.map(item => [string(record(item).key), record(item).value] as const) : Object.entries(record(value));
  for (const [key, item] of entries.slice(0, 150)) if (key && !['__proto__', 'constructor', 'prototype'].includes(key)) result[key] = forbiddenKeys.test(key) ? '••••' : attributeValue(item);
  return result;
}
function duration(start: unknown, end: unknown): number | undefined {
  if (!string(start) || !string(end)) return undefined;
  try { const delta = BigInt(string(end)) - BigInt(string(start)); return delta >= 0 ? Number(delta / 1000n) / 1000 : undefined; } catch { return undefined; }
}

/** Import records only; no instrumentation, execution, uploads or inferred chronological parentage. */
export function importExecutionTrace(text: string, name: string, analysis?: SemanticAnalysis): TraceImport {
  if (text.length > 20 * 1024 * 1024) throw new Error('実行データは20 MB以下のファイルを選んでください。');
  let data: unknown;
  try { data = JSON.parse(text); } catch {
    try { data = text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)); }
    catch { throw new Error('JSONまたはJSON Lines形式の実行データを読み込めませんでした。'); }
  }
  const nodes = new Map<string, SemanticNode>(); const edges: SemanticEdge[] = []; const warnings: string[] = [];
  const parentIds = new Map<string, string>();
  let count = 0; let spans = 0; let logs = 0;
  const add = (raw: RecordValue, service: string, kind: 'span' | 'log', inherited: SemanticNode['attributes'] = {}) => {
    if (++count > 20000) throw new Error('実行データは20,000レコード以下に分割してください。');
    const attr = { ...inherited, ...attributes(raw.attributes ?? raw.tags) };
    const traceId = string(raw.traceId ?? raw.traceID ?? raw.trace_id);
    const spanId = string(raw.spanId ?? raw.spanID ?? raw.span_id);
    const parent = string(raw.parentSpanId ?? raw.parent_span_id) || string(record(list(raw.references).find(ref => record(ref).refType === 'CHILD_OF')).spanID);
    const id = kind === 'span' ? `span:${traceId}:${spanId || count}` : `log:${traceId}:${spanId}:${count}`;
    const body = raw.name ?? raw.operationName ?? raw.message ?? attributeValue(raw.body) ?? kind;
    const ms = duration(raw.startTimeUnixNano, raw.endTimeUnixNano) ?? (typeof raw.duration === 'number' ? raw.duration / 1000 : undefined);
    const path = string(attr['code.file.path'] ?? attr['code.filepath'] ?? raw.filePath).replaceAll('\\', '/');
    const line = Number(attr['code.line.number'] ?? attr['code.lineno'] ?? raw.line) || undefined;
    const node: SemanticNode = { id, kind, label: (string(body) || `${kind} ${count}`).slice(0, 180),
      path: path || undefined, line, group: service || string(raw.service) || '実行データ', confidence: 'observed', evidence: [],
      attributes: { ...attr, traceId, spanId, sourceFile: name, ...(ms !== undefined ? { durationMs: ms } : {}),
        ...(raw.severityText ? { severity: string(raw.severityText) } : {}),
        ...(raw.timeUnixNano ? { timestamp: string(raw.timeUnixNano) } : {}),
      } };
    if (nodes.has(id)) { warnings.push(`重複したspanを統合しました: ${spanId}`); return; }
    nodes.set(id, node); if (kind === 'span') spans++; else logs++;
    if (parent || kind === 'log' && spanId) parentIds.set(id, `span:${traceId}:${kind === 'log' ? spanId : parent}`);
  };
  const root = record(data);
  for (const resource of list(root.resourceSpans)) {
    const item = record(resource); const attrs = attributes(record(item.resource).attributes); const service = string(attrs['service.name']);
    for (const scope of list(item.scopeSpans ?? item.instrumentationLibrarySpans)) for (const span of list(record(scope).spans)) add(record(span), service, 'span', attrs);
  }
  for (const resource of list(root.resourceLogs)) {
    const item = record(resource); const attrs = attributes(record(item.resource).attributes); const service = string(attrs['service.name']);
    for (const scope of list(item.scopeLogs ?? item.instrumentationLibraryLogs)) for (const log of list(record(scope).logRecords)) add(record(log), service, 'log', attrs);
  }
  for (const trace of list(root.data)) {
    const item = record(trace); const processes = record(item.processes);
    for (const span of list(item.spans)) {
      const raw = record(span); const service = string(record(processes[string(raw.processID)]).serviceName); add(raw, service, 'span');
      for (const log of list(raw.logs)) { const event = record(log); const attr = attributes(event.fields); add({ traceID: raw.traceID, spanID: raw.spanID, body: attr.event ?? attr.message ?? 'span event', attributes: attr }, service, 'log'); }
    }
  }
  const chromeStacks = new Map<string, RecordValue[]>(); let chromeId = 0; let omitted = 0;
  for (const event of list(root.traceEvents)) {
    const item = record(event); const service = string(item.cat) || `process ${string(item.pid)}`;
    const thread = `${string(item.pid)}:${string(item.tid)}`;
    if (item.ph === 'X') add({ ...item, spanId: `chrome-${chromeId++}`, attributes: record(item.args), duration: item.dur }, service, 'span');
    else if (item.ph === 'B') {
      const stack = chromeStacks.get(thread) ?? [];
      stack.push({ ...item, traceId: `chrome:${thread}`, spanId: `chrome-${chromeId++}`, parentSpanId: stack.at(-1)?.spanId, attributes: record(item.args) }); chromeStacks.set(thread, stack);
    } else if (item.ph === 'E') {
      const start = chromeStacks.get(thread)?.pop();
      if (start) add({ ...start, duration: Number(item.ts) - Number(start.ts) }, string(start.cat) || service, 'span');
      else warnings.push('開始イベントのないChrome Trace終了イベントがあります');
    } else if (['i', 'I'].includes(string(item.ph))) add({ ...item, traceId: `chrome:${thread}`, spanId: chromeStacks.get(thread)?.at(-1)?.spanId, body: item.name, attributes: record(item.args) }, service, 'log');
    else if (item.ph !== 'M') omitted++;
  }
  for (const stack of chromeStacks.values()) for (const start of stack) { add({ ...start, attributes: { ...record(start.attributes), incomplete: true } }, string(start.cat), 'span'); warnings.push('終了イベントのないChrome Trace spanがあります'); }
  if (omitted) warnings.push(`${omitted}件のChrome Traceイベントは対応するphaseではないため省略しました`);
  const records = Array.isArray(data) ? data : [...list(root.spans), ...list(root.logs), ...(root.message || root.name ? [root] : [])];
  for (const item of records) {
    const raw = record(item);
    if (!raw.name && !raw.message && !raw.body && !raw.operationName) continue;
    add(raw, string(raw.service), raw.message || raw.body || raw.severityText ? 'log' : raw.spanId || raw.spanID || raw.startTimeUnixNano || raw.operationName ? 'span' : 'log');
  }
  for (const [child, parent] of parentIds) {
    if (nodes.has(parent) && child !== parent) edges.push({ id: `observed:${parent}:${child}`, source: parent, target: child, kind: nodes.get(child)!.kind === 'log' ? 'log-event' : 'observed-child', label: nodes.get(child)!.kind === 'log' ? 'event' : 'parent → child', views: traceViews, confidence: 'observed', evidence: [] });
    else warnings.push(`親spanが含まれていません: ${nodes.get(child)!.label}`);
  }
  if (analysis) for (const node of nodes.values()) {
    const name = string(node.attributes['code.function.name'] ?? node.attributes['code.function']);
    if (!node.path && !name) continue;
    const candidates = analysis.nodes.filter(candidate => candidate.kind === 'function' && !candidate.attributes.initializer
      && (!node.path || candidate.path === node.path || node.path.endsWith(`/${candidate.path}`))
      && (!name || candidate.label === name || candidate.attributes.name === name)
      && (!node.line || (candidate.line ?? 0) <= node.line && (candidate.endLine ?? candidate.line ?? 0) >= node.line));
    if (candidates.length === 1) {
      node.evidence = [...candidates[0]!.evidence]; node.attributes.sourceFunction = candidates[0]!.id;
      node.attributes.sourceBinding = node.path ? 'file / line' : 'unique name (inferred)';
      edges.push({ id: `observed-at:${node.id}`, source: node.id, target: candidates[0]!.id, kind: 'observed-at', label: 'ソース位置', views: traceViews, confidence: node.path ? 'observed' : 'inferred', evidence: candidates[0]!.evidence });
    }
  }
  for (const node of [...nodes.values()].filter(node => node.kind === 'span')) for (const side of ['input', 'output'] as const) {
    const label = string(node.attributes[`data.${side}.name`]); if (!label) continue;
    const id = `trace-data:${node.id}:${side}`;
    nodes.set(id, { id, kind: 'value', label, group: node.group, confidence: 'observed', evidence: [], attributes: { traceId: node.attributes.traceId!, owner: node.id, direction: side } });
    edges.push({ id: `observed-data:${id}`, source: side === 'input' ? id : node.id, target: side === 'input' ? node.id : id, kind: 'observed-data', label: side, views: ['data-flow'], confidence: 'observed', evidence: [] });
  }
  if (!nodes.size) throw new Error('対応する実行レコードがありません。OTLP、Jaeger、Chrome Trace、またはname/message付きのJSON/JSONLを選んでください。');
  return { nodes: [...nodes.values()], edges, warnings: [...new Set(warnings)], name, spans, logs };
}
