import ts from 'typescript';
import { sourceEvidence, visitSource, type DataCompiler } from './dataCompiler';
import type { DataModelIndex } from './dataModels';
import type { SemanticAnalysis, SemanticData, SemanticEdge, SemanticNode } from './types';

type FunctionAst = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration | ts.ConstructorDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration;
type Environment = Map<ts.Symbol, { declarationId: string; values: string[] }>;
interface Invocation { ast: ts.CallExpression | ts.NewExpression; operation: SemanticNode; result: SemanticNode; arguments: SemanticNode[]; target?: FunctionAst }
interface Template { ast: ts.SourceFile | FunctionAst; owner: string; name: string; nodes: SemanticNode[]; edges: SemanticEdge[]; parameters: SemanticNode[]; returns: SemanticNode[]; calls: Invocation[]; }
const isFunction = (node: ts.Node): node is FunctionAst => (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && Boolean(node.body);
const isAssignment = (operator: ts.SyntaxKind) => operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment;
const cloneEnvironment = (environment: Environment): Environment => new Map([...environment].map(([key, value]) => [key, { ...value, values: [...value.values] }]));

/** Occurrence graph with bounded per-call instantiation. A call never reuses another call's formal/result nodes. */
export function refineDataFlow(analysis: SemanticAnalysis, compiler: DataCompiler, models: DataModelIndex) {
  const paths = new Set(compiler.files.keys()), oldNodes = new Map(analysis.nodes.map(node => [node.id, node]));
  for (const node of analysis.nodes) if (node.path && paths.has(node.path) && node.kind === 'value') node.attributes.dataFlowExcluded = true;
  analysis.edges = analysis.edges.flatMap(edge => edge.views.includes('data-flow') && [oldNodes.get(edge.source)?.path, oldNodes.get(edge.target)?.path, edge.evidence[0]?.path].some(path => path && paths.has(path))
    ? edge.views.length > 1 ? [{ ...edge, views: edge.views.filter(view => view !== 'data-flow') }] : [] : [edge]);
  const templates = new Map<ts.SourceFile | FunctionAst, Template>(), globals: Environment = new Map();
  const capturedEnvironments = new Map<FunctionAst, Environment>();
  const location = (node: SemanticNode) => {
    const ev = node.evidence[0], source = node.path ? compiler.files.get(node.path)?.text : undefined;
    const column = ev && source !== undefined ? ev.start - source.lastIndexOf('\n', ev.start - 1) : undefined;
    return `${node.path}:${node.line}${column ? `:${column}` : ''}`;
  };
  const fnForSymbol = (node: ts.Node): FunctionAst | undefined => {
    for (const declaration of compiler.symbol(node)?.declarations ?? []) {
      if (isFunction(declaration)) return declaration;
      if (ts.isVariableDeclaration(declaration) && declaration.initializer && isFunction(declaration.initializer)) return declaration.initializer;
    }
    return undefined;
  };
  const linkType = (node: SemanticNode, type?: ts.TypeNode) => {
    if (!type) return;
    visitSource(type, item => {
      if (!ts.isTypeReferenceNode(item)) return;
      const symbol = compiler.symbol(item.typeName), model = symbol && models.symbols.get(symbol); if (!model) return;
      const evidence = [sourceEvidence(type, '値の型注釈'), ...model.evidence];
      node.links ??= []; model.links ??= [];
      if (!node.links.some(link => link.targetId === model.id && !link.fieldId)) node.links.push({ targetId: model.id, view: 'data-model', reason: `型注釈: ${type.getText()}`, evidence });
      if (!model.links.some(link => link.targetId === node.id && !link.fieldId)) model.links.push({ targetId: node.id, view: 'data-flow', reason: `${location(node)} の ${node.label}`, evidence });
    });
  };
  for (const file of compiler.files.values()) {
    const all: (ts.SourceFile | FunctionAst)[] = [file]; visitSource(file, ast => { if (isFunction(ast)) all.push(ast); });
    for (const ast of all) {
      const start = ast.getStart(), name = ts.isSourceFile(ast) ? `ファイル直下の処理 · ${file.fileName.split('/').at(-1)}` : ast.name?.getText() ?? (ts.isVariableDeclaration(ast.parent) ? ast.parent.name.getText() : `callback L${sourceEvidence(ast, '').line}`);
      const owner = analysis.nodes.find(node => node.kind === 'function' && node.path === file.fileName && (ts.isSourceFile(ast) ? node.attributes.initializer : node.evidence.some(ev => ev.start >= start && ev.start <= (ast.name?.end ?? start))))?.id
        ?? `function:${file.fileName}:${start}:${name}`;
      templates.set(ast, { ast, owner, name, nodes: [], edges: [], parameters: [], returns: [], calls: [] });
    }
  }
  const processTemplate = (template: Template) => {
    const { ast, owner } = template, file = ast.getSourceFile();
    let environment = cloneEnvironment(globals), conditional = false;
    if (!ts.isSourceFile(ast)) for (const [symbol, binding] of capturedEnvironments.get(ast) ?? []) environment.set(symbol, { ...binding, values: [...binding.values] });
    const propertyValues = new Map<string, { id: string; conditional: boolean }[]>();
    const made = new Map<string, SemanticNode>();
    const node = (source: ts.Node, role: SemanticData['role'], label: string, extra: Partial<SemanticData> = {}, suffix = '') => {
      const ev = sourceEvidence(source, `${label}（${role}）`), id = `data:${file.fileName}:${ev.start}-${ev.end}:${role}${suffix}`;
      const existing = made.get(id); if (existing) return existing;
      const value: SemanticNode = { id, kind: ['operation', 'termination'].includes(role) ? 'operation' : 'value', label, path: file.fileName, line: ev.line, endLine: ev.endLine,
        language: /x$/.test(file.fileName) ? 'tsx' : 'typescript', group: oldNodes.get(owner)?.group ?? 'Data', confidence: 'source', evidence: [ev],
        attributes: { owner, ownerName: template.name, dataFlow: true, ...(oldNodes.get(owner)?.attributes.generated ? { generated: true } : {}) }, data: { role, expression: source.getText(), conditional, ...extra } };
      made.set(id, value); template.nodes.push(value); return value;
    };
    const edge = (source: string, target: string, kind: string, label: string, ast: ts.Node, inferred = conditional) => {
      const ev = sourceEvidence(ast, label), id = `${kind}:${source}:${target}:${ev.start}-${ev.end}`;
      if (!template.edges.some(item => item.id === id)) template.edges.push({ id, source, target, kind, label, views: ['data-flow'], confidence: inferred ? 'inferred' : 'source', evidence: [ev], details: { reason: label, conditional: inferred } });
    };
    const readSymbol = (identifier: ts.Identifier): SemanticNode => {
      const symbol = compiler.symbol(identifier), binding = symbol && environment.get(symbol);
      const value = node(identifier, binding ? 'use' : 'unknown', identifier.text, { declarationId: binding?.declarationId, resolution: binding ? 'resolved' : 'unresolved',
        ...(!binding ? { reasons: ['読み込んだソース内で、この利用箇所の値の由来を特定できません。'] } : {}) });
      for (const previous of binding?.values ?? []) edge(previous, value.id, 'origin', 'この利用箇所の由来', identifier, conditional || (binding?.values.length ?? 0) > 1);
      const declaration = symbol?.declarations?.find(item => ts.isVariableDeclaration(item) || ts.isParameter(item) || ts.isPropertyDeclaration(item));
      if (declaration && 'type' in declaration) linkType(value, declaration.type as ts.TypeNode | undefined);
      return value;
    };
    const property = (expression: ts.PropertyAccessExpression | ts.ElementAccessExpression, write: boolean, input?: SemanticNode) => {
      const object = evaluate(expression.expression);
      const key = ts.isPropertyAccessExpression(expression) ? expression.name.text : expression.argumentExpression && (ts.isStringLiteralLike(expression.argumentExpression) || ts.isNumericLiteral(expression.argumentExpression)) ? expression.argumentExpression.text : undefined;
      const objectId = object.data?.objectId ?? object.data?.declarationId ?? object.id, propertyPath = key ? [...(object.data?.propertyPath ?? []), key] : undefined;
      const value = node(expression, write ? 'property-write' : 'property-read', expression.getText(), { objectId, propertyPath,
        resolution: key ? 'resolved' : 'unresolved', ...(!key ? { reasons: ['計算で決まる項目名は未解決です。別の項目への対応は作成していません。'] } : {}) });
      edge(object.id, value.id, key ? 'property-read' : 'property-access', key ? `${key}項目${write ? 'の設定対象' : 'を取り出す'}` : '項目へのアクセス（キー未解決）', expression);
      if (input) edge(input.id, value.id, 'property-write', key ? `${key}項目へ設定` : '動的な項目へ設定（キー未解決）', expression);
      if (propertyPath) {
        const identity = `${objectId}:${JSON.stringify(propertyPath)}`, preceding = propertyValues.get(identity) ?? [];
        if (write) propertyValues.set(identity, [...(conditional ? preceding : []), { id: value.id, conditional }]);
        else for (const assigned of preceding) edge(assigned.id, value.id, 'origin', `${propertyPath.join('.')}項目への先行する設定`, expression, conditional || assigned.conditional || preceding.length > 1);
      }
      const symbol = compiler.symbol(ts.isPropertyAccessExpression(expression) ? expression.name : expression), definition = symbol?.declarations?.[0];
      if (definition) for (const model of models.declarations.values()) {
        const field = model.fields?.find(field => field.sourceModelId === model.id && field.evidence?.some(ev => ev.path === definition.getSourceFile().fileName && ev.start === definition.getStart()));
        if (!field) continue;
        value.links = [{ targetId: model.id, view: 'data-model', reason: `項目 ${field.name} の定義`, fieldId: field.id, evidence: [...value.evidence, ...(field.evidence ?? [])] }];
        model.links ??= []; if (!model.links.some(link => link.targetId === value.id && link.fieldId === field.id)) model.links.push({ targetId: value.id, view: 'data-flow', fieldId: field.id, reason: `${value.label} · ${location(value)}`, evidence: [...value.evidence, ...(field.evidence ?? [])] });
      }
      return value;
    };
    const bind = (name: ts.BindingName, input: SemanticNode | undefined, source: ts.Node, type?: ts.TypeNode, declaration = true) => {
      if (ts.isIdentifier(name)) {
        const symbol = compiler.symbol(name), previous = symbol && environment.get(symbol);
        const value = node(source, declaration ? 'declaration' : 'assignment', name.text, { declarationId: previous?.declarationId });
        if (ts.isBindingElement(source)) value.attributes.destructured = true;
        if (input) value.data!.objectId = input.data?.objectId ?? input.data?.declarationId ?? input.id;
        value.data!.declarationId ??= value.id;
        if (input) edge(input.id, value.id, 'assign', declaration ? '初期値として代入' : '再代入', source);
        else { value.data!.resolution = 'unresolved'; value.data!.reasons = ['初期値が指定されていません。']; }
        if (symbol) environment.set(symbol, { declarationId: declaration ? value.id : previous?.declarationId ?? value.id, values: [value.id] });
        linkType(value, type); return value;
      }
      for (const element of name.elements) if (ts.isBindingElement(element)) {
        const key = element.propertyName?.getText() ?? (ts.isArrayBindingPattern(name) ? String(name.elements.indexOf(element)) : element.name.getText());
        const picked = node(element, 'property-read', `${input?.label ?? name.getText()}.${key}`, { objectId: input?.id, propertyPath: [key], resolution: element.dotDotDotToken ? 'partial' : 'resolved', ...(element.dotDotDotToken ? { reasons: ['残余の項目集合は未展開です。'] } : {}) });
        if (input) edge(input.id, picked.id, 'property-read', `分割代入で ${key} を取り出す`, element);
        bind(element.name, picked, element, undefined, declaration);
      }
      return input;
    };
    const evaluate = (expression: ts.Expression): SemanticNode => {
      if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression)) {
        const value = evaluate(expression.expression); if ('type' in expression) linkType(value, expression.type as ts.TypeNode); return value;
      }
      if (ts.isIdentifier(expression)) return readSymbol(expression);
      if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) return property(expression, false);
      if (ts.isCallExpression(expression) || ts.isNewExpression(expression)) {
        const operation = node(expression, 'operation', `${expression.expression.getText().split(/\?\.|\./).at(-1)}()`, { resolution: 'unresolved' });
        operation.attributes.callee = expression.expression.getText();
        const target = fnForSymbol(ts.isPropertyAccessExpression(expression.expression) ? expression.expression.name : expression.expression);
        operation.data!.resolution = target ? 'resolved' : 'unresolved';
        if (!target) operation.data!.reasons = ['呼び出し式は確認済みですが、この先の引数・戻り値の受け渡しは特定できません。'];
        if (ts.isPropertyAccessExpression(expression.expression) || ts.isElementAccessExpression(expression.expression)) {
          const receiver = evaluate(expression.expression.expression); edge(receiver.id, operation.id, receiver.data?.role === 'call-result' ? 'receiver-result' : 'receiver', 'この処理のreceiver・入力', expression.expression);
        }
        const args = (expression.arguments ?? []).map((argument, index) => {
          const input = evaluate(argument), actual = node(argument, 'argument', `第${index + 1}引数 · ${operation.label}`, { callSiteId: operation.id, argumentIndex: index }, `:${operation.id}:${index}`);
          edge(input.id, actual.id, 'argument', `第${index + 1}引数へ渡す`, argument); edge(actual.id, operation.id, 'argument', `第${index + 1}引数を受け取る操作`, argument);
          return actual;
        });
        const result = node(expression, 'call-result', `${operation.label} の結果`, { callSiteId: operation.id, resolution: target ? 'resolved' : 'unresolved', ...(!target ? { reasons: operation.data!.reasons } : {}) });
        edge(operation.id, result.id, 'produces', 'この呼び出しの結果', expression);
        if (ts.isPropertyAccessExpression(expression.expression) && ['parse', 'safeParse', 'parseAsync', 'safeParseAsync'].includes(expression.expression.name.text)) {
          const symbol = compiler.symbol(expression.expression.expression), schema = symbol && models.symbols.get(symbol);
          if (schema?.model?.domain === 'validation') {
            template.edges.push({ id: `validated-by:${operation.id}:${schema.id}`, source: operation.id, target: schema.id, kind: 'validated-by', label: `検証に使用: ${schema.label}.${expression.expression.name.text}`, views: ['data-flow'], confidence: 'source', evidence: [...operation.evidence, ...schema.evidence], details: { callSiteId: operation.id, reason: '解決した検証スキーマのメソッド呼び出し。検証成功やすべての経路での実行は保証しません。' } });
            operation.links = [{ targetId: schema.id, view: 'data-model', reason: 'この呼び出しで使う検証スキーマ', evidence: [...operation.evidence, ...schema.evidence] }];
            schema.links ??= []; schema.links.push({ targetId: operation.id, view: 'data-flow', reason: `検証に使用: ${operation.path}:${operation.line}`, evidence: [...operation.evidence, ...schema.evidence] });
          }
        }
        template.calls.push({ ast: expression, operation, result, arguments: args, target }); return result;
      }
      if (ts.isBinaryExpression(expression) && isAssignment(expression.operatorToken.kind)) {
        let input = evaluate(expression.right);
        if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
          const before = evaluate(expression.left), operation = node(expression, 'operation', expression.getText()); edge(before.id, operation.id, 'transform', '加工の入力', expression.left); edge(input.id, operation.id, 'transform', '加工の入力', expression.right); input = operation;
        }
        if (ts.isIdentifier(expression.left)) return bind(expression.left, input, expression, undefined, false)!;
        if (ts.isPropertyAccessExpression(expression.left) || ts.isElementAccessExpression(expression.left)) return property(expression.left, true, input);
        const unknown = node(expression, 'unknown', expression.getText(), { resolution: 'partial', reasons: ['この代入パターンの設定先は未解決です。'] }); edge(input.id, unknown.id, 'assign', '設定先未解決の代入', expression); return unknown;
      }
      if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
        capturedEnvironments.set(expression, cloneEnvironment(environment));
        return node(expression, 'literal', 'コールバック関数の値', { reasons: ['関数を渡すことを確認しています。実行や返却値の伝播は、この事実だけでは確定しません。'] });
      }
      if (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(expression.kind)) return node(expression, 'literal', expression.getText().slice(0, 100));
      const operation = node(expression, 'operation', ts.isArrayLiteralExpression(expression) ? '配列を作る' : ts.isObjectLiteralExpression(expression) ? 'オブジェクトを作る' : expression.getText().slice(0, 100));
      const operands: ts.Expression[] = [];
      if (ts.isArrayLiteralExpression(expression)) operands.push(...expression.elements.filter(ts.isExpression));
      else if (ts.isObjectLiteralExpression(expression)) for (const member of expression.properties) {
        if (ts.isPropertyAssignment(member)) operands.push(member.initializer);
        else if (ts.isShorthandPropertyAssignment(member)) operands.push(member.name);
        else if (ts.isSpreadAssignment(member)) operands.push(member.expression);
      }
      else expression.forEachChild(child => { if (ts.isExpression(child)) operands.push(child); });
      for (const operand of operands) { const input = evaluate(operand); edge(input.id, operation.id, 'transform', ts.isArrayLiteralExpression(expression) ? '配列要素として使う' : ts.isObjectLiteralExpression(expression) ? 'オブジェクトの項目として使う' : '加工・式の入力', operand); }
      return operation;
    };
    const merge = (before: Environment, alternatives: Environment[]) => {
      environment = cloneEnvironment(before);
      for (const branch of alternatives) for (const [symbol, binding] of branch) {
        const initial = before.get(symbol); if (!initial) continue;
        const current = environment.get(symbol)!; current.values = [...new Set([...current.values, ...binding.values])];
      }
    };
    const process = (statement: ts.Node) => {
      if (isFunction(statement)) { capturedEnvironments.set(statement, cloneEnvironment(environment)); return; }
      if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) return;
      if (ts.isVariableDeclaration(statement)) { const input = statement.initializer ? evaluate(statement.initializer) : undefined; bind(statement.name, input, statement, statement.type); return; }
      if (ts.isReturnStatement(statement)) {
        const input = statement.expression && evaluate(statement.expression), returned = node(statement, input ? 'return' : 'termination', input ? `return ${statement.expression!.getText().slice(0, 80)}` : '値を指定せずに終了');
        if (input) { edge(input.id, returned.id, 'returns', '戻り値として返す', statement); template.returns.push(returned); } return;
      }
      if (ts.isExpressionStatement(statement)) { evaluate(statement.expression); return; }
      if (ts.isIfStatement(statement)) {
        evaluate(statement.expression); const before = cloneEnvironment(environment), oldConditional = conditional; conditional = true;
        process(statement.thenStatement); const yes = cloneEnvironment(environment); environment = cloneEnvironment(before);
        if (statement.elseStatement) process(statement.elseStatement); const no = cloneEnvironment(environment);
        merge(before, [yes, no]); conditional = oldConditional; return;
      }
      if (ts.isForStatement(statement) || ts.isForOfStatement(statement) || ts.isForInStatement(statement) || ts.isWhileStatement(statement) || ts.isDoStatement(statement) || ts.isSwitchStatement(statement) || ts.isTryStatement(statement)) {
        const before = cloneEnvironment(environment), oldConditional = conditional; conditional = true; statement.forEachChild(process); merge(before, [environment]); conditional = oldConditional; return;
      }
      if (ts.isExpression(statement)) { evaluate(statement); return; }
      statement.forEachChild(process);
    };
    if (!ts.isSourceFile(ast)) ast.parameters.forEach((parameter, index) => {
      const raw = node(parameter, 'parameter', parameter.name.getText(), { argumentIndex: index, resolution: 'resolved' }); template.parameters.push(raw); linkType(raw, parameter.type);
      if (ts.isIdentifier(parameter.name)) { const symbol = compiler.symbol(parameter.name); if (symbol) environment.set(symbol, { declarationId: raw.id, values: [raw.id] }); }
      else bind(parameter.name, raw, parameter);
      if (parameter.initializer) { const fallback = evaluate(parameter.initializer); edge(fallback.id, raw.id, 'parameter-default', '引数省略時の既定値', parameter.initializer, true); }
      if (parameter.dotDotDotToken) raw.attributes.restParameter = true;
    });
    if (ts.isSourceFile(ast)) { ast.statements.forEach(process); for (const [symbol, value] of environment) globals.set(symbol, value); }
    else if (ast.body && ts.isBlock(ast.body)) ast.body.statements.forEach(process);
    else if (ast.body && ts.isExpression(ast.body)) { const input = evaluate(ast.body), returned = node(ast.body, 'return', `暗黙のreturn · ${template.name}`); edge(input.id, returned.id, 'returns', '式を戻り値として返す', ast.body); template.returns.push(returned); }
  };
  for (const template of templates.values()) if (ts.isSourceFile(template.ast)) processTemplate(template);
  for (const template of templates.values()) if (!ts.isSourceFile(template.ast)) processTemplate(template);
  const nodes: SemanticNode[] = [...templates.values()].flatMap(item => item.nodes), edges = [...templates.values()].flatMap(item => item.edges);
  const connect = (invocation: Invocation, ancestors = new Set<FunctionAst>(), depth = 0) => {
    const target = invocation.target && templates.get(invocation.target); if (!target) return;
    if (ancestors.has(invocation.target!) || depth >= 3) {
      invocation.result.data!.resolution = 'partial'; invocation.result.data!.reasons = ['再帰・多段呼び出しまたは大きい処理の展開上限です。この呼び出しの入力と結果の境界は保持しています。']; return;
    }
    const localIds = new Set(target.nodes.map(node => node.id)), needed = new Set(target.returns.map(node => node.id));
    const incoming = new Map<string, string[]>();
    for (const edge of target.edges) { const list = incoming.get(edge.target) ?? []; list.push(edge.source); incoming.set(edge.target, list); }
    const queue = [...needed];
    for (let index = 0; index < queue.length; index++) for (const id of incoming.get(queue[index]!) ?? []) if (localIds.has(id) && !needed.has(id)) { needed.add(id); queue.push(id); }
    const returnDependencies = new Set(needed);
    for (const parameter of target.parameters) needed.add(parameter.id);
    const contextId = invocation.operation.id;
    // Large callee bodies use an explicit contextual summary, while the complete definition graph remains intact.
    // Only parameters with a recorded path to each return become summary inputs.
    if (needed.size > 12 || depth > 0) {
      const parameterCopies: SemanticNode[] = target.parameters.map(parameter => ({ ...parameter, id: `${parameter.id}:context:${contextId}`, data: { ...parameter.data!, contextId, callSiteId: contextId }, attributes: { ...parameter.attributes, callContext: contextId } }));
      nodes.push(...parameterCopies);
      parameterCopies.forEach((parameter, index) => {
        const actuals = parameter.attributes.restParameter ? invocation.arguments.slice(index) : invocation.arguments.slice(index, index + 1);
        for (const actual of actuals) edges.push({ id: `passes-to:${actual.id}:${parameter.id}`, source: actual.id, target: parameter.id, kind: 'passes-to', label: `第${index + 1}引数 → 仮引数 ${parameter.label}`, views: ['data-flow'], confidence: 'source', evidence: [...actual.evidence, ...parameter.evidence], details: { callSiteId: contextId, argumentIndex: index, contextId } });
      });
      if (target.returns.length) {
        const returned = target.returns[0]!, sourceEdges = target.edges.filter(edge => returnDependencies.has(edge.source) && returnDependencies.has(edge.target));
        const returnedEvidence = target.returns.flatMap(item => item.evidence);
        const summary: SemanticNode = { ...returned, id: `context-operation:${contextId}`, kind: 'operation', label: `${target.name} 内の戻り値の計算`,
          data: { role: 'operation', expression: `${target.name} 内の ${target.returns.length} 箇所の戻り値候補`, contextId, callSiteId: contextId, resolution: 'partial', reasons: ['関数内の式と戻り値候補を表示上で集約しています。元の関係と各return箇所は定義の経路に保持しています。'] },
          attributes: { ...returned.attributes, callContext: contextId, contextualSummary: true, sourceOwner: target.owner, sourceMembers: [...returnDependencies] }, evidence: [...returnedEvidence, ...invocation.operation.evidence] };
        const result: SemanticNode = { ...returned, id: `context-return:${contextId}`, label: `${target.name} の戻り口`, evidence: returnedEvidence, data: { role: 'return', expression: `${target.returns.length}箇所のreturn候補`, contextId, callSiteId: contextId, conditional: target.returns.length > 1 || target.returns.some(item => item.data?.conditional) } };
        nodes.push(summary, result);
        for (let index = 0; index < target.parameters.length; index++) if (returnDependencies.has(target.parameters[index]!.id)) edges.push({ id: `transform:${parameterCopies[index]!.id}:${summary.id}`, source: parameterCopies[index]!.id, target: summary.id, kind: 'transform', label: '戻り値の式に使う仮引数（静的な可能経路）', views: ['data-flow'], confidence: 'inferred', evidence: target.parameters[index]!.evidence, details: { contextId, callSiteId: contextId, sourceEdgeIds: sourceEdges.map(edge => edge.id) } });
        edges.push({ id: `returns:${summary.id}:${result.id}`, source: summary.id, target: result.id, kind: 'returns', label: '関数内の式を返す（候補の集約）', views: ['data-flow'], confidence: result.data?.conditional ? 'inferred' : 'source', evidence: returnedEvidence, details: { sourceEdgeIds: sourceEdges.map(edge => edge.id) } });
        edges.push({ id: `returns:${result.id}:${invocation.result.id}`, source: result.id, target: invocation.result.id, kind: 'returns', label: 'この呼び出しの戻り値を受け取る', views: ['data-flow'], confidence: result.data?.conditional ? 'inferred' : 'source', evidence: [...returnedEvidence, ...invocation.operation.evidence], details: { contextId, callSiteId: contextId } });
      }
      return;
    }
    const selectedNodes = target.nodes.filter(node => needed.has(node.id)), ids = new Map(selectedNodes.map(node => [node.id, `${node.id}:context:${contextId}`]));
    const copies = new Map<string, SemanticNode>();
    for (const original of selectedNodes) {
      const copy: SemanticNode = { ...original, id: ids.get(original.id)!, attributes: { ...original.attributes, callContext: contextId, ownerName: `${target.name} · 呼び出し ${invocation.operation.path}:${invocation.operation.line}` },
        evidence: [...original.evidence, ...invocation.operation.evidence], data: { ...original.data!, contextId, declarationId: original.data?.declarationId ? ids.get(original.data.declarationId) ?? original.data.declarationId : undefined,
          objectId: original.data?.objectId ? ids.get(original.data.objectId) ?? original.data.objectId : undefined,
          callSiteId: original.data?.callSiteId ? ids.get(original.data.callSiteId) ?? original.data.callSiteId : contextId } };
      copies.set(original.id, copy); nodes.push(copy);
    }
    for (const edge of target.edges) {
      if (!needed.has(edge.target) || localIds.has(edge.source) && !needed.has(edge.source)) continue;
      if (edge.kind === 'parameter-default') { const index = target.parameters.findIndex(parameter => parameter.id === edge.target); if (invocation.arguments[index]) continue; }
      edges.push({ ...edge, id: `${edge.id}:context:${contextId}`, source: ids.get(edge.source) ?? edge.source, target: ids.get(edge.target) ?? edge.target, details: { ...edge.details, contextId, callSiteId: contextId } });
    }
    target.parameters.forEach((parameter, index) => {
      const actuals = parameter.attributes.restParameter ? invocation.arguments.slice(index) : invocation.arguments.slice(index, index + 1);
      for (const actual of actuals) edges.push({ id: `passes-to:${actual.id}:${ids.get(parameter.id)}`, source: actual.id, target: ids.get(parameter.id)!, kind: 'passes-to',
        label: parameter.attributes.restParameter ? `第${(actual.data?.argumentIndex ?? index) + 1}引数をrest仮引数の要素として受け取る` : `第${index + 1}引数 → 仮引数 ${parameter.label}`, views: ['data-flow'], confidence: 'source',
        evidence: [...actual.evidence, ...parameter.evidence], details: { argumentIndex: actual.data?.argumentIndex ?? index, callSiteId: contextId, contextId } });
    });
    for (const returned of target.returns) edges.push({ id: `returns:${ids.get(returned.id)}:${invocation.result.id}`, source: ids.get(returned.id)!, target: invocation.result.id, kind: 'returns', label: 'この呼び出しの戻り値を受け取る',
      views: ['data-flow'], confidence: returned.data?.conditional ? 'inferred' : 'source', evidence: [...returned.evidence, ...invocation.operation.evidence], details: { callSiteId: contextId, contextId, conditional: returned.data?.conditional } });
    for (const nested of target.calls) if (copies.has(nested.operation.id) && copies.has(nested.result.id)) connect({ ...nested, operation: copies.get(nested.operation.id)!, result: copies.get(nested.result.id)!, arguments: nested.arguments.map(argument => copies.get(argument.id)!).filter(Boolean) }, new Set(ancestors).add(invocation.target!), depth + 1);
  };
  for (const template of templates.values()) for (const invocation of template.calls) connect(invocation);
  analysis.nodes = analysis.nodes.concat(nodes); analysis.edges = analysis.edges.concat(edges);
}
