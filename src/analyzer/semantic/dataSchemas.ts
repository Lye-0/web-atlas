import ts from 'typescript';
import { sourceEvidence, visitSource, type DataCompiler } from './dataCompiler';
import type { DataModelIndex } from './dataModels';
import type { SemanticAnalysis, SemanticField, SemanticModel, SemanticNode, SemanticEvidence } from './types';

const nameOf = (expression: ts.Expression) => ts.isPropertyAccessExpression(expression) ? expression.name.text : ts.isIdentifier(expression) ? expression.text : '';
type SchemaCall = ts.CallExpression | ts.NewExpression;
function callsOf(expression: ts.Expression): SchemaCall[] {
  if (!ts.isCallExpression(expression) && !ts.isNewExpression(expression)) return [];
  return [expression, ...(ts.isPropertyAccessExpression(expression.expression) ? callsOf(expression.expression.expression) : [])];
}
function literal(expression?: ts.Expression) { return expression && (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)) ? expression.text : undefined; }
function importOrigin(compiler: DataCompiler, expression: ts.Expression, depth = 0): { module: string; name: string } | undefined {
  if (depth > 6) return undefined;
  let root = expression;
  while (ts.isPropertyAccessExpression(root)) root = root.expression;
  if (!ts.isIdentifier(root)) return undefined;
  // Read import declarations directly: external modules intentionally do not load into the compiler host.
  for (const statement of root.getSourceFile().statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    const clause = statement.importClause;
    if (clause?.isTypeOnly) continue;
    const sameBinding = (binding: ts.Identifier) => compiler.checker.getSymbolAtLocation(root) === compiler.checker.getSymbolAtLocation(binding);
    if (clause?.name?.text === root.text && sameBinding(clause.name)) return { module: statement.moduleSpecifier.text, name: 'default' };
    if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings) && clause.namedBindings.name.text === root.text && sameBinding(clause.namedBindings.name)) return { module: statement.moduleSpecifier.text, name: '*' };
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) if (!item.isTypeOnly && item.name.text === root.text) {
      // A local declaration with the same spelling must not acquire the import's authority.
      const symbol = compiler.checker.getSymbolAtLocation(root), imported = compiler.checker.getSymbolAtLocation(item.name);
      if (symbol && imported && symbol !== imported) return undefined;
      return { module: statement.moduleSpecifier.text, name: item.propertyName?.text ?? item.name.text };
    }
  }
  const declaration = compiler.symbol(root)?.declarations?.find(ts.isVariableDeclaration);
  if (declaration?.initializer && ts.isNewExpression(declaration.initializer)) return importOrigin(compiler, declaration.initializer.expression, depth + 1);
  return undefined;
}

/** Static, import-grounded schema declarations. No project module or configuration is executed. */
export function refineDataSchemas(analysis: SemanticAnalysis, compiler: DataCompiler): DataModelIndex {
  const declarations = new Map<ts.Declaration, SemanticNode>(), symbols = new Map<ts.Symbol, SemanticNode>();
  const records: { ast: ts.VariableDeclaration; model: SemanticNode; call: SchemaCall; family: 'drizzle' | 'zod' | 'mongoose' | 'sequelize' }[] = [];
  const old = analysis.nodes.filter(node => node.kind === 'model' && node.path && compiler.files.has(node.path) && ['table', 'schema'].includes(String(node.attributes.modelKind)));
  const oldAttributes = new Map(old.map(node => [node.id, { ...node.attributes }]));
  const replaced = new Set(old.map(node => node.id));
  // Unsupported same-spelling factories must not remain as confirmed schemas.
  for (const node of old) node.attributes.dataModelExcluded = true;
  analysis.edges = analysis.edges.flatMap(edge => replaced.has(edge.source) || replaced.has(edge.target)
    ? edge.views.some(view => view !== 'data-flow' && view !== 'data-model') ? [{ ...edge, views: edge.views.filter(view => view !== 'data-flow' && view !== 'data-model') }] : [] : [edge]);
  for (const file of compiler.files.values()) visitSource(file, ast => {
    if (!ts.isVariableDeclaration(ast) || !ts.isIdentifier(ast.name) || !ast.initializer) return;
    const chain = callsOf(ast.initializer);
    const call = chain.find(item => {
      const origin = importOrigin(compiler, item.expression), name = nameOf(item.expression);
      return origin && (origin.module.startsWith('drizzle-orm/') && /^(sqliteTable|pgTable|mysqlTable|sqliteView|pgView)$/.test(origin.name === '*' ? name : origin.name)
        || origin.module === 'zod' && name === 'object' || origin.module === 'mongoose' && ['Schema', 'model'].includes(name)
        || origin.module === 'sequelize' && name === 'define');
    });
    if (!call) return;
    const origin = importOrigin(compiler, call.expression)!, family = origin.module === 'zod' ? 'zod' : origin.module === 'mongoose' ? 'mongoose' : origin.module === 'sequelize' ? 'sequelize' : 'drizzle';
    const ev = sourceEvidence(ast, `${ast.name.text}の${family === 'zod' ? '検証スキーマ' : '保存用定義'}`);
    const previous = old.find(node => node.path === file.fileName && node.label === ast.name.getText() && node.evidence.some(item => item.start === ast.getStart()));
    const model: SemanticNode = { ...(previous ?? { id: `model:${file.fileName}:${ast.getStart()}:${ast.name.text}`, kind: 'model', label: ast.name.text, group: 'Data', confidence: 'source' }),
      path: file.fileName, line: previous?.line ?? ev.line, endLine: previous?.endLine ?? ev.endLine, language: previous?.language ?? 'typescript', evidence: previous?.evidence ?? [ev], fields: [],
      attributes: previous ? oldAttributes.get(previous.id)! : { modelKind: family === 'zod' || family === 'mongoose' ? 'schema' : 'table', schemaLibrary: origin.module, storageName: family !== 'zod' ? literal(call.arguments?.[0]) ?? ast.name.text : ast.name.text },
      model: { domain: family === 'zod' ? 'validation' : 'storage', kind: family === 'zod' || family === 'mongoose' ? 'schema' : 'table', definition: ast.initializer.getText(), expansion: 'expanded', reasons: [], constraints: [] } };
    if (previous) analysis.nodes.splice(analysis.nodes.indexOf(previous), 1, model); else analysis.nodes.push(model);
    declarations.set(ast, model);
    const symbol = compiler.symbol(ast.name); if (symbol) symbols.set(symbol, model);
    records.push({ ast, model, call, family });
  });
  const resolveVariable = (expression: ts.Expression): ts.VariableDeclaration | undefined => compiler.symbol(expression)?.declarations?.find(ts.isVariableDeclaration);
  const spreadOrigins = new Map<string, Map<ts.PropertyAssignment, SemanticEvidence[]>>();
  const objectMembers = (expression: ts.Expression | undefined, model: SemanticNode, visited = new Set<ts.Node>()): ts.PropertyAssignment[] => {
    if (!expression || visited.has(expression) || visited.size >= 24) { model.model!.reasons.push('共有項目の展開が循環または上限に到達しました。'); model.model!.expansion = 'partial'; return []; }
    const next = new Set(visited).add(expression);
    if (ts.isIdentifier(expression)) return objectMembers(resolveVariable(expression)?.initializer, model, next);
    if (!ts.isObjectLiteralExpression(expression)) { model.model!.reasons.push(`未展開の項目定義: ${expression.getText()}`); model.model!.expansion = 'partial'; return []; }
    const members = new Map<string, ts.PropertyAssignment>();
    for (const member of expression.properties) {
      if (ts.isPropertyAssignment(member)) members.set(member.name.getText(), member);
      else if (ts.isSpreadAssignment(member)) for (const shared of objectMembers(member.expression, model, next)) {
        members.set(shared.name.getText(), shared);
        const origins = spreadOrigins.get(model.id) ?? new Map<ts.PropertyAssignment, SemanticEvidence[]>();
        origins.set(shared, [...(origins.get(shared) ?? []), sourceEvidence(member, `${member.expression.getText()}の共有項目をこの定義へ展開`)]); spreadOrigins.set(model.id, origins);
      }
      else { model.model!.reasons.push(`未展開の項目: ${member.getText()}`); model.model!.expansion = 'partial'; }
    }
    return [...members.values()];
  };
  const modelAt = (expression: ts.Expression) => { const symbol = compiler.symbol(expression); return symbol ? symbols.get(symbol) : undefined; };
  const constraint = (model: SemanticNode, kind: NonNullable<SemanticModel['constraints']>[number]['kind'], columns: string[], ast: ts.Node, target?: SemanticNode, targetColumns?: string[]) => {
    const ev = sourceEvidence(ast, `${kind}の宣言`), id = `${model.id}:constraint:${kind}:${ev.start}`;
    model.model!.constraints!.push({ id, kind, columns, targetModelId: target?.id, targetColumns, expression: ast.getText(), evidence: [ev, ...(target?.evidence ?? [])] });
    if (target) analysis.edges.push({ id, source: model.id, target: target.id, kind, label: kind === 'foreign-key' ? `外部キー: ${columns.join(', ')} → ${target.label}.${targetColumns?.join(', ')}` : `ORMの関係宣言: ${columns.join(', ')}`,
      views: ['data-model'], confidence: 'source', evidence: [ev, ...target.evidence], details: { reason: ast.getText(), fieldId: model.fields?.find(field => field.name === columns[0])?.id } });
  };
  for (const { model, call, family } of records) {
    const object = call.arguments?.[family === 'zod' || family === 'mongoose' && nameOf(call.expression) === 'Schema' ? 0 : 1];
    if (family === 'mongoose' && nameOf(call.expression) === 'model' && object && ts.isIdentifier(object)) {
      const schema = modelAt(object);
      if (schema) {
        model.fields = (schema.fields ?? []).map(field => ({ ...field, evidence: [...(field.evidence ?? []), sourceEvidence(call, 'このスキーマからモデルを作る')] }));
        model.model!.expansion = schema.model?.expansion ?? 'unexpanded'; model.model!.reasons = [...(schema.model?.reasons ?? [])];
        analysis.edges.push({ id: `derived-from:${model.id}:${schema.id}`, source: model.id, target: schema.id, kind: 'derived-from', label: `保存モデルの元スキーマ: ${schema.label}`, views: ['data-model'], confidence: 'source', evidence: [sourceEvidence(call, '明示したスキーマからモデルを定義'), ...schema.evidence] });
        continue;
      }
    }
    model.fields = objectMembers(object, model).map(member => {
      const name = member.name.getText().replace(/^['"]|['"]$/g, ''), chain = callsOf(member.initializer), root = chain.at(-1), names = chain.map(item => nameOf(item.expression));
      const ev = sourceEvidence(member, `${name}の${family === 'zod' ? '検証' : 'カラム'}定義`);
      const basicType = root ? nameOf(root.expression) : '';
      const defaultCall = chain.find(item => nameOf(item.expression) === 'default');
      const origins = spreadOrigins.get(model.id)?.get(member) ?? [];
      const field: SemanticField = { id: `${model.id}:field:${ev.start}:${name}`, name, type: member.initializer.getText(), optional: family === 'zod' && (names.includes('optional') || names.includes('nullish') || names.includes('default')),
        nullable: family === 'zod' ? names.includes('nullable') || names.includes('nullish') : !names.includes('notNull') && !names.includes('primaryKey'),
        allowsUndefined: family === 'zod' ? names.includes('optional') || names.includes('nullish') : undefined,
        array: names.includes('array'), evidence: [ev, ...origins], sourceModelId: origins.length ? undefined : model.id, origin: origins.length ? origins.map(item => item.description).join(' / ') : undefined, constraints: [],
        ...(defaultCall?.arguments?.[0] ? { default: defaultCall.arguments[0].getText(), defaultSource: family === 'zod' ? 'validation' as const : 'database' as const } : {}) };
      if (family === 'mongoose' || family === 'sequelize') {
        const config = ts.isObjectLiteralExpression(member.initializer) ? member.initializer : undefined;
        const get = (key: string) => config?.properties.find((item): item is ts.PropertyAssignment => ts.isPropertyAssignment(item) && item.name.getText() === key)?.initializer;
        const type = get('type'); if (type) field.type = type.getText();
        field.optional = family === 'mongoose' && get('required')?.kind !== ts.SyntaxKind.TrueKeyword;
        field.nullable = family === 'sequelize' ? get('allowNull')?.kind !== ts.SyntaxKind.FalseKeyword : undefined;
        field.allowsUndefined = undefined;
        const defaultValue = get(family === 'mongoose' ? 'default' : 'defaultValue');
        if (defaultValue) { field.default = defaultValue.getText(); field.defaultSource = family === 'mongoose' ? 'code' : 'database'; }
        if (get('primaryKey')?.kind === ts.SyntaxKind.TrueKeyword) { field.key = 'primary'; field.nullable = false; constraint(model, 'primary-key', [name], member); }
        if (get('unique')?.kind === ts.SyntaxKind.TrueKeyword) constraint(model, 'unique', [name], member);
        for (const key of ['min', 'max', 'minlength', 'maxlength', 'enum', 'match']) if (get(key)) field.constraints!.push(`${key}: ${get(key)!.getText()}`);
        const reference = get('ref');
        if (family === 'mongoose' && reference) {
          const lexicalOwner = (node: ts.Node): ts.Node => { let parent = node.parent; while (parent && !ts.isSourceFile(parent) && !ts.isFunctionLike(parent)) parent = parent.parent; return parent; };
          const targets = ts.isStringLiteralLike(reference) ? records.filter(record => record.family === 'mongoose' && nameOf(record.call.expression) === 'model' && literal(record.call.arguments?.[0]) === reference.text && record.ast.getSourceFile() === member.getSourceFile() && lexicalOwner(record.ast) === lexicalOwner(member)) : [];
          if (targets.length === 1) { field.referenceIds = [targets[0]!.model.id]; field.target = targets[0]!.model.label; constraint(model, 'orm-relation', [name], reference, targets[0]!.model); }
          else { model.model!.expansion = 'partial'; model.model!.reasons.push(`refの登録先を一意に特定できません: ${reference.getText()}`); }
        }
        model.model!.reasons = ['静的な明示項目を表示しています。フック、プラグイン、動的な定義追加やライブDBへの適用は評価していません。'];
        return field;
      }
      if (family === 'zod') {
        const known = ['string', 'number', 'boolean', 'date', 'literal', 'enum', 'array', 'object', 'unknown', 'any'];
        if (!known.includes(basicType)) { model.model!.expansion = 'partial'; model.model!.reasons.push(`項目 ${name}: 検証型は未展開（${member.initializer.getText()}）`); }
        for (const item of chain) if (['min', 'max', 'length', 'email', 'url', 'regex', 'int', 'positive', 'nonnegative', 'uuid'].includes(nameOf(item.expression))) field.constraints!.push(`${nameOf(item.expression)}(${(item.arguments ?? []).map(argument => argument.getText()).join(', ')})`);
        if (names.some(name => ['transform', 'preprocess', 'pipe', 'refine', 'superRefine'].includes(name))) { model.model!.expansion = 'partial'; model.model!.reasons.push(`項目 ${name}: 入力と出力の変換・追加検証は定義式のみ確認しています。`); }
      } else {
        if (!['text', 'integer', 'real', 'blob', 'numeric', 'varchar', 'serial', 'boolean', 'timestamp', 'int'].includes(basicType)) { model.model!.expansion = 'partial'; model.model!.reasons.push(`項目 ${name}: カラム定義の一部は未展開です。`); }
        if (names.includes('primaryKey')) { field.key = 'primary'; constraint(model, 'primary-key', [name], chain.find(item => nameOf(item.expression) === 'primaryKey')!); }
        if (names.includes('unique')) constraint(model, 'unique', [name], chain.find(item => nameOf(item.expression) === 'unique')!);
        const foreign = chain.find(item => nameOf(item.expression) === 'references'), callback = foreign?.arguments?.[0];
        if (foreign && callback && ts.isArrowFunction(callback) && ts.isPropertyAccessExpression(callback.body)) {
          const target = modelAt(callback.body.expression);
          if (target) { field.key = 'foreign'; field.target = target.label; field.referenceIds = [target.id]; constraint(model, 'foreign-key', [name], foreign, target, [callback.body.name.text]); }
          else { model.model!.expansion = 'partial'; model.model!.reasons.push(`参照先未解決: ${callback.body.getText()}`); }
        }
      }
      return field;
    });
    const extra = call.arguments?.[2];
    if (family === 'drizzle' && extra && ts.isArrowFunction(extra)) visitSource(extra.body, node => {
      if (!ts.isCallExpression(node)) return;
      const name = nameOf(node.expression), all = callsOf(node);
      if (name === 'primaryKey' || name === 'foreignKey') {
        const config = node.arguments[0]; if (!config || !ts.isObjectLiteralExpression(config)) return;
        const get = (key: string) => config.properties.find((item): item is ts.PropertyAssignment => ts.isPropertyAssignment(item) && item.name.getText() === key)?.initializer;
        const columns = get('columns'), foreignColumns = get('foreignColumns');
        const names = columns && ts.isArrayLiteralExpression(columns) ? columns.elements.filter(ts.isPropertyAccessExpression).map(item => item.name.text) : [];
        if (!names.length) { model.model!.expansion = 'partial'; model.model!.reasons.push(`未展開の制約: ${node.getText()}`); return; }
        const refs = foreignColumns && ts.isArrayLiteralExpression(foreignColumns) ? foreignColumns.elements.filter(ts.isPropertyAccessExpression) : [];
        const target = refs[0] ? modelAt(refs[0].expression) : undefined;
        if (name === 'foreignKey' && (!target || refs.length !== names.length)) { model.model!.reasons.push(`参照先未解決: ${node.getText()}`); model.model!.expansion = 'partial'; return; }
        constraint(model, name === 'primaryKey' ? 'primary-key' : 'foreign-key', names, node, target, refs.map(item => item.name.text));
      } else if (name === 'on' && all.some(item => ['uniqueIndex', 'index'].includes(nameOf(item.expression)))) {
        const names = node.arguments.filter(ts.isPropertyAccessExpression).map(item => item.name.text);
        constraint(model, all.some(item => nameOf(item.expression) === 'uniqueIndex') ? 'unique' : 'index', names, node);
      }
    });
  }
  // ORM relation declarations are separate from database foreign-key constraints.
  for (const file of compiler.files.values()) visitSource(file, ast => {
    if (!ts.isCallExpression(ast)) return;
    const origin = importOrigin(compiler, ast.expression);
    if (origin?.module !== 'drizzle-orm' || (origin.name !== 'relations' && nameOf(ast.expression) !== 'relations')) return;
    const source = ast.arguments[0] && modelAt(ast.arguments[0]), callback = ast.arguments[1];
    if (!source || !callback || !ts.isArrowFunction(callback)) return;
    visitSource(callback.body, node => {
      if (!ts.isPropertyAssignment(node) || !ts.isCallExpression(node.initializer) || !['one', 'many'].includes(nameOf(node.initializer.expression))) return;
      const target = node.initializer.arguments[0] && modelAt(node.initializer.arguments[0]);
      if (target) constraint(source, 'orm-relation', [node.name.getText()], node, target);
    });
  });
  return { declarations, symbols };
}
