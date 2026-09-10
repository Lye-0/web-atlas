import { importExecutionTrace, type TraceImport } from './traces';
import type { SemanticAnalysis, SemanticNode } from './types';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
const presentId = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const sourceWarning = '実行データのソース位置は観測時の記録です。現在のソースとの一致は未検証のため、値や関数への確定した対応には使いません。';
const namesWarning = '実行データには入力・出力の名前を記録した境界だけを表示します。変数・項目の実値や、別の呼び出しとの値の受け渡しは生成しません。';

function validateEnvelope(data: unknown) {
  const root = record(data);
  const warnings: string[] = [];
  const array = (value: unknown, label: string): unknown[] => {
    if (!Array.isArray(value)) throw new Error(`${label}は配列で指定してください。`);
    return value;
  };
  const validateSpan = (value: unknown, requireTrace: boolean) => {
    const span = record(value);
    if (!span || !presentId(span.spanId ?? span.spanID ?? span.span_id)) throw new Error('実行データのspanには空でないspanIdが必要です。');
    if (requireTrace && !presentId(span.traceId ?? span.traceID ?? span.trace_id)) throw new Error('この形式のspanには空でないtraceIdが必要です。');
    for (const key of ['parentSpanId', 'parent_span_id']) if (span[key] !== undefined && typeof span[key] !== 'string') throw new Error('親spanの参照IDは文字列で指定してください。');
    if (span.references !== undefined) for (const entry of array(span.references, 'references')) {
      const ref = record(entry);
      if (!ref || !['CHILD_OF', 'FOLLOWS_FROM'].includes(String(ref.refType)) || !presentId(ref.spanID)) throw new Error('未対応の関係種別、または参照先spanIDがない実行データです。');
      if (ref.refType === 'FOLLOWS_FROM') warnings.push('FOLLOWS_FROMの参照は、入力・出力の値の受け渡しとしては扱いません。');
    }
  };
  if (Array.isArray(data)) {
    for (const entry of data) {
      const item = record(entry);
      if (!item) throw new Error('JSON/JSONLの各レコードはオブジェクトで指定してください。');
      if (item.version !== undefined && item.version !== 1) throw new Error('対応していない実行データversionです。structured形式はversion: 1またはversion省略に対応します。');
      if (!(item.message || item.body || item.severityText) && (item.spanId || item.spanID || item.span_id || item.startTimeUnixNano || item.operationName)) validateSpan(item, false);
    }
    return warnings;
  }
  if (!root) throw new Error('対応する実行データのオブジェクトまたは配列を指定してください。');
  const structured = !['resourceSpans', 'resourceLogs', 'traceEvents', 'data'].some(key => key in root);
  if (structured && root.version !== undefined && root.version !== 1) throw new Error('対応していない実行データversionです。structured形式はversion: 1またはversion省略に対応します。');
  for (const key of ['edges', 'relations']) if (root[key] !== undefined && array(root[key], key).length) throw new Error('独自の関係リストには対応していません。spanの明示的な参照IDを使う形式を選んでください。');
  for (const key of ['spans', 'logs', 'traceEvents', 'data', 'resourceSpans', 'resourceLogs']) if (key in root) array(root[key], key);
  for (const item of (root.spans as unknown[] | undefined) ?? []) validateSpan(item, false);
  for (const item of (root.logs as unknown[] | undefined) ?? []) if (!record(item)) throw new Error('logsの各レコードはオブジェクトで指定してください。');
  for (const item of (root.traceEvents as unknown[] | undefined) ?? []) if (!record(item) || typeof record(item)!.ph !== 'string') throw new Error('Chrome Traceの各イベントにはphaseが必要です。');
  for (const item of (root.data as unknown[] | undefined) ?? []) {
    const trace = record(item);
    if (!trace) throw new Error('Jaegerのdata要素はオブジェクトで指定してください。');
    for (const span of array(trace.spans, 'Jaeger spans')) validateSpan(span, true);
  }
  for (const item of (root.resourceSpans as unknown[] | undefined) ?? []) {
    const resource = record(item);
    if (!resource) throw new Error('OTLP resourceSpans要素が不正です。');
    for (const scope of array(resource.scopeSpans ?? resource.instrumentationLibrarySpans, 'OTLP scopeSpans')) {
      for (const span of array(record(scope)?.spans, 'OTLP spans')) validateSpan(span, true);
    }
  }
  for (const item of (root.resourceLogs as unknown[] | undefined) ?? []) {
    const resource = record(item);
    if (!resource) throw new Error('OTLP resourceLogs要素が不正です。');
    for (const scope of array(resource.scopeLogs ?? resource.instrumentationLibraryLogs, 'OTLP scopeLogs')) {
      for (const log of array(record(scope)?.logRecords, 'OTLP logRecords')) if (!record(log)) throw new Error('OTLP logRecordsの各要素はオブジェクトで指定してください。');
    }
  }
  if (structured && !root.spans && (root.spanId || root.spanID || root.span_id || root.startTimeUnixNano || root.operationName) && !(root.message || root.body || root.severityText)) validateSpan(root, false);
  return warnings;
}

/** A view-specific projection. Never mutates the shared 6/7 trace cache or confirms old source locations. */
export function adaptDataExecutionTrace(trace: TraceImport): TraceImport {
  const warnings = [...trace.warnings, namesWarning];
  const originals = new Map(trace.nodes.map(node => [node.id, node]));
  const edges = trace.edges.filter(edge => {
    if (!edge.views.includes('data-flow')) return false;
    const source = originals.get(edge.source), target = originals.get(edge.target);
    const valid = edge.kind === 'observed-data' && source && target &&
      (source.kind === 'value' && target.kind === 'span' || source.kind === 'span' && target.kind === 'value');
    if (!valid) warnings.push('対応しない関係、または参照先がない実行データの線を省略しました。');
    return valid;
  }).map(edge => ({ ...edge, views: ['data-flow'] as ['data-flow'], evidence: [], confidence: 'observed' as const }));
  const used = new Set(edges.flatMap(edge => [edge.source, edge.target]));
  const allowedAttribute = /^(?:recordFormat|traceId|spanId|sourceFile|recordedSourcePath|recordedSourceLine|durationMs|durationRaw|durationUnit|timeUnit|timeOrigin|startTimeUnixNano|endTimeUnixNano|timeUnixNano|observedTimeUnixNano|startTime|endTime|timestamp|time|ts|endTs|code\.(?:file\.path|filepath|line\.number|lineno|function\.name|function|source\.sha256)|data\.(?:input|output)\.name|owner|direction)$/;
  const nodes = trace.nodes.filter(node => used.has(node.id)).map(node => {
    const attributes: SemanticNode['attributes'] = Object.fromEntries(Object.entries(node.attributes).filter(([key]) => allowedAttribute.test(key)));
    if (node.path || attributes.recordedSourcePath || node.attributes.sourceFunction || Object.keys(attributes).some(key => key.startsWith('code.'))) {
      attributes.sourceBinding = '観測時の位置候補・現在のソースとの一致は未検証';
      if (node.path) attributes.recordedSourcePath = node.path;
      if (node.line) attributes.recordedSourceLine = node.line;
      warnings.push(sourceWarning);
    }
    if (node.kind === 'value') { attributes.recordedData = '入力・出力の名前'; attributes.valueRecorded = false; }
    return { ...node, path: undefined, line: undefined, endLine: undefined, evidence: [], attributes };
  });
  if (!edges.length) warnings.push('この実行データにはdata.input.name / data.output.nameを持つspanがないため、Data Flowに表示できる観測境界はありません。');
  return { ...trace, nodes, edges, warnings: [...new Set(warnings)] };
}

/** Existing formats, with a validated structured v1 envelope; input is parsed as data only. */
export function importDataExecutionTrace(text: string, name: string, analysis?: SemanticAnalysis): TraceImport {
  if (text.length > 20 * 1024 * 1024) throw new Error('実行データは20 MB以下のファイルを選んでください。');
  let data: unknown;
  try { data = JSON.parse(text); } catch {
    try { data = text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)); }
    catch { throw new Error('JSONまたはJSON Lines形式の実行データを読み込めませんでした。'); }
  }
  const warnings = validateEnvelope(data);
  // Keep the complete import in the shared cache; only the Data Flow projection removes source correspondence.
  const trace = importExecutionTrace(text, name, analysis);
  return warnings.length ? { ...trace, warnings: [...new Set([...trace.warnings, ...warnings])] } : trace;
}
