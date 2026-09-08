import type { SemanticAnalysis, SemanticEvidence, SemanticInput, SemanticModel, SemanticNode } from './types';

/** SQL item boundaries respect nested parentheses and quoted strings; offsets remain in the original file. */
function segments(source: string, from: number, to: number) {
  const items: { text: string; start: number; end: number }[] = []; let start = from, depth = 0, quote = '';
  for (let index = from; index < to; index++) {
    const character = source[index]!;
    if (quote) { if (character === quote) { if (source[index + 1] === quote) index++; else quote = ''; } continue; }
    if (['"', "'", '`'].includes(character)) { quote = character; continue; }
    if (character === '(') depth++; else if (character === ')') depth--;
    if (character === ',' && depth === 0) { items.push({ text: source.slice(start, index).trim(), start, end: index }); start = index + 1; }
  }
  items.push({ text: source.slice(start, to).trim(), start, end: to }); return items.filter(item => item.text);
}
const columns = (text: string) => text.split(',').map(item => item.trim().replace(/^["`[]|["`\]]$/g, ''));

export function refineSchemaFiles(analysis: SemanticAnalysis, input: SemanticInput) {
  for (const [path, source] of Object.entries(input.sources)) if (/\.sql$/i.test(path) && /(?:^|;)\s*ALTER\s+TABLE\b/im.test(source.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ' '))) {
    const coverage = analysis.coverage.find(item => item.path === path);
    if (coverage) { coverage.status = 'partial'; coverage.message = 'ALTER TABLEによる変更宣言は未展開です。CREATE TABLEの各定義を読み取り、migrationを合成した現在のDB構造は推定しません。'; }
  }
  const models = analysis.nodes.filter(node => node.kind === 'model' && ['sql', 'prisma', 'graphql'].includes(String(node.attributes.modelKind)));
  const ids = new Set(models.map(node => node.id));
  analysis.edges = analysis.edges.flatMap(edge => ids.has(edge.source) && edge.views.includes('data-model') ? edge.views.length > 1 ? [{ ...edge, views: edge.views.filter(view => view !== 'data-model') }] : [] : [edge]);
  const evAt = (path: string, start: number, end: number, description: string): SemanticEvidence => { const source = input.sources[path]!; return { path, start, end, line: source.slice(0, start).split('\n').length, endLine: source.slice(0, end).split('\n').length, description }; };
  const addConstraint = (model: SemanticNode, kind: NonNullable<SemanticModel['constraints']>[number]['kind'], fields: string[], expression: string, evidence: SemanticEvidence, target?: SemanticNode, targetColumns?: string[]) => {
    const id = `${model.id}:constraint:${kind}:${evidence.start}`;
    model.model!.constraints!.push({ id, kind, columns: fields, expression, evidence: [evidence], targetModelId: target?.id, targetColumns });
    if (target) analysis.edges.push({ id, source: model.id, target: target.id, kind, label: `${kind === 'foreign-key' ? '外部キー' : '構造の参照'}: ${fields.join(', ')} → ${target.label}.${targetColumns?.join(', ')}`, views: ['data-model'], confidence: 'source', evidence: [evidence, ...target.evidence], details: { reason: expression } });
  };
  for (const model of models) {
    const source = input.sources[model.path!]!, ev = model.evidence[0]!, declaration = source.slice(ev.start, ev.end), language = String(model.attributes.modelKind);
    model.model = { domain: language === 'graphql' ? 'code' : 'storage', kind: /\benum\b/.test(declaration.slice(0, 20)) ? 'enum' : language === 'graphql' ? 'object' : 'table', definition: declaration,
      expansion: 'expanded', reasons: language === 'sql' ? ['ソースに記載されたDB定義です。migrationの適用状態・ライブDBの状態は観測していません。'] : language === 'prisma' ? ['Prismaソースの定義です。DBへの適用状態は観測していません。'] : [], constraints: [] };
    if (language !== 'sql') {
      if (model.model.kind === 'enum') {
        const open = source.indexOf('{', ev.start), close = source.indexOf('}', open), body = source.slice(open + 1, close).replace(/(?:#|\/\/)[^\n]*/g, text => ' '.repeat(text.length));
        model.model.choices = [...body.matchAll(/\b[A-Za-z_]\w*/g)].map(match => ({ label: match[0], evidence: [evAt(model.path!, open + 1 + match.index!, open + 1 + match.index! + match[0].length, 'enumの候補')] }));
        model.fields = []; continue;
      }
      for (const field of model.fields ?? []) {
        const start = source.indexOf(field.name, source.indexOf('{', ev.start) + 1);
        field.id = `${model.id}:field:${start}:${field.name}`; field.evidence = [evAt(model.path!, Math.max(ev.start, start), start < 0 ? ev.end : Math.min(ev.end, source.indexOf('\n', start) < 0 ? ev.end : source.indexOf('\n', start)), `${field.name}の定義`)];
        field.sourceModelId = model.id; field.nullable = language === 'graphql' ? !field.type.endsWith('!') : /\?/.test(field.type); field.array = field.type.includes('[]') || field.type.startsWith('[');
        const target = models.find(item => item.path === model.path && item.label === field.type.match(/\b[A-Za-z_]\w*/)?.[0]);
        if (target) { field.referenceIds = [target.id]; analysis.edges.push({ id: `field-type:${model.id}:${field.id}:${target.id}`, source: model.id, target: target.id, kind: 'field-type', label: `項目 ${field.name} の型: ${target.label}`, views: ['data-model'], confidence: 'source', evidence: [...field.evidence, ...target.evidence], details: { fieldId: field.id } }); }
        if (language === 'prisma') {
          if (/@id\b/.test(field.type)) addConstraint(model, 'primary-key', [field.name], field.type, field.evidence[0]!);
          if (/@unique\b/.test(field.type)) addConstraint(model, 'unique', [field.name], field.type, field.evidence[0]!);
          const relation = field.type.match(/@relation\([^)]*fields\s*:\s*\[([^\]]+)\][^)]*references\s*:\s*\[([^\]]+)\]/);
          if (relation) addConstraint(model, 'orm-relation', columns(relation[1]!), field.type, field.evidence[0]!, target, columns(relation[2]!));
        }
      }
      continue;
    }
    const open = source.indexOf('(', ev.start), close = source.lastIndexOf(')', ev.end);
    if (open < 0 || close <= open) { model.model.expansion = 'failed'; model.model.reasons.push('テーブルのカラム範囲を読み取れませんでした。'); continue; }
    const items = segments(source, open + 1, close);
    model.fields = items.flatMap(item => {
      if (/^(?:CONSTRAINT\b|PRIMARY\b|FOREIGN\b|UNIQUE\b|CHECK\b)/i.test(item.text)) return [];
      const match = item.text.match(/^["`[]?([\w]+)["`\]]?\s+([^\s,(]+(?:\s*\([^)]*\))?)/); if (!match) { model.model!.expansion = 'partial'; model.model!.reasons.push(`未展開のカラム宣言: ${item.text}`); return []; }
      const name = match[1]!, at = source.indexOf(item.text, item.start), fieldEv = evAt(model.path!, at, item.end, `${name}のカラム定義`), primary = /\bPRIMARY\s+KEY\b/i.test(item.text);
      const defaultValue = item.text.match(/\bDEFAULT\s+((?:'[^']*'|"[^"]*"|\([^)]*\)|[^\s,]+))/i)?.[1];
      return [{ id: `${model.id}:field:${at}:${name}`, name, type: match[2]!, optional: false, nullable: !/\bNOT\s+NULL\b/i.test(item.text) && !primary, evidence: [fieldEv], sourceModelId: model.id,
        ...(primary ? { key: 'primary' as const } : {}), ...(defaultValue ? { default: defaultValue, defaultSource: 'database' as const } : {}) }];
    });
    for (const item of items) {
      const at = source.indexOf(item.text, item.start), itemEv = evAt(model.path!, at, item.end, 'SQL制約の宣言');
      const prefix = item.text.replace(/^CONSTRAINT\s+["`[]?\w+["`\]]?\s+/i, '');
      const primary = prefix.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i), unique = prefix.match(/^UNIQUE\s*\(([^)]+)\)/i);
      if (primary) addConstraint(model, 'primary-key', columns(primary[1]!), item.text, itemEv);
      else if (unique) addConstraint(model, 'unique', columns(unique[1]!), item.text, itemEv);
      else if (/^CHECK\b/i.test(prefix)) addConstraint(model, 'check', [], item.text, itemEv);
      const foreign = prefix.match(/^FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+["`[]?([\w.]+)["`\]]?\s*\(([^)]+)\)/i);
      const inline = prefix.match(/^["`[]?(\w+)["`\]]?[\s\S]*?\bREFERENCES\s+["`[]?([\w.]+)["`\]]?\s*\(([^)]+)\)/i);
      const reference = foreign ?? inline;
      if (reference) {
        const sourceColumns = foreign ? columns(reference[1]!) : [reference[1]!], targetColumns = columns(reference[3]!);
        const target = models.find(candidate => candidate.path === model.path && candidate.label.toLowerCase() === reference[2]!.toLowerCase());
        addConstraint(model, 'foreign-key', sourceColumns, item.text, itemEv, target, targetColumns);
        if (!target) { model.model.expansion = 'partial'; model.model.reasons.push(`参照先未解決: ${reference[2]}（この定義ファイル内に参照先がありません）`); }
        for (const field of model.fields) if (sourceColumns.includes(field.name)) { field.key = 'foreign'; field.target = reference[2]; field.referenceIds = target ? [target.id] : undefined; }
      }
      if (!primary && /\bPRIMARY\s+KEY\b/i.test(prefix)) { const field = model.fields.find(field => prefix.replace(/^["`[]/, '').startsWith(field.name)); if (field) addConstraint(model, 'primary-key', [field.name], item.text, itemEv); }
    }
  }
}
