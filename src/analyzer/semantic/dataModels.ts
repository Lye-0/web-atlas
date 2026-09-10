import ts from 'typescript';
import { modifier, sourceEvidence, visitSource, type DataCompiler } from './dataCompiler';
import type { SemanticAnalysis, SemanticEdge, SemanticField, SemanticModel, SemanticNode } from './types';

type Declaration = ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.ClassDeclaration | ts.EnumDeclaration;
export interface DataModelIndex { declarations: Map<ts.Declaration, SemanticNode>; symbols: Map<ts.Symbol, SemanticNode>; }
const declarationKind = (ast: Declaration): SemanticModel['kind'] => ts.isInterfaceDeclaration(ast) ? 'interface' : ts.isClassDeclaration(ast) ? 'class' : ts.isEnumDeclaration(ast) ? 'enum'
  : ts.isTypeLiteralNode(ast.type) ? 'object' : ts.isUnionTypeNode(ast.type) ? ast.type.types.every(ts.isLiteralTypeNode) ? 'literal-union' : 'union'
    : ts.isTypeReferenceNode(ast.type) && !ast.type.typeArguments?.length || ts.isLiteralTypeNode(ast.type) || [ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.BooleanKeyword].includes(ast.type.kind) ? 'alias' : 'derived';

/** Direct type members and import-bound symbols, never arbitrary descendant properties or global name matches. */
export function refineDataModels(analysis: SemanticAnalysis, compiler: DataCompiler, schemas?: DataModelIndex): DataModelIndex {
  const declarations = new Map<ts.Declaration, SemanticNode>(schemas?.declarations), symbols = new Map<ts.Symbol, SemanticNode>(schemas?.symbols);
  const asts = new Map<string, Declaration>();
  const touched = new Set<string>();
  for (const file of compiler.files.values()) visitSource(file, ast => {
    if (!(ts.isInterfaceDeclaration(ast) || ts.isTypeAliasDeclaration(ast) || ts.isClassDeclaration(ast) || ts.isEnumDeclaration(ast)) || !ast.name) return;
    const name = ast.name.text, ev = sourceEvidence(ast, `${name}の構造定義`);
    let node = analysis.nodes.find(item => item.kind === 'model' && item.path === file.fileName && item.label === name && item.evidence.some(item => item.start >= ast.getStart() && item.start < ast.name!.end));
    if (!node) {
      node = { id: `model:${file.fileName}:${ast.getStart()}:${name}`, kind: 'model', label: name, path: file.fileName, line: ev.line, endLine: ev.endLine,
        language: 'typescript', group: 'Data', confidence: 'source', evidence: [ev], attributes: {} };
      analysis.nodes.push(node);
    }
    node.model = { domain: 'code', kind: declarationKind(ast), definition: ts.isTypeAliasDeclaration(ast) ? ast.type.getText() : ast.getText(), expansion: 'expanded', reasons: [] };
    node.fields = [];
    declarations.set(ast, node); asts.set(node.id, ast); touched.add(node.id);
    const symbol = compiler.symbol(ast.name); if (symbol) symbols.set(symbol, node);
  });
  analysis.edges = analysis.edges.flatMap(edge => touched.has(edge.source) && edge.views.includes('data-model') ? edge.views.length > 1 ? [{ ...edge, views: edge.views.filter(view => view !== 'data-model') }] : [] : [edge]);
  const edge = (source: SemanticNode, target: SemanticNode, kind: string, label: string, ast: ts.Node, fieldId?: string) => {
    const ev = sourceEvidence(ast, label);
    const item: SemanticEdge = { id: `${kind}:${source.id}:${target.id}:${ev.start}:${fieldId ?? ''}`, source: source.id, target: target.id, kind, label, views: ['data-model'], confidence: 'source', evidence: [ev, ...target.evidence], details: { reason: label, fieldId } };
    if (!analysis.edges.some(existing => existing.id === item.id)) analysis.edges.push(item);
  };
  const targetAt = (ast: ts.Node) => { const symbol = compiler.symbol(ast); return symbol ? symbols.get(symbol) : undefined; };
  const unresolved = (model: SemanticNode, reason: string) => { if (!model.model!.reasons.includes(reason)) model.model!.reasons.push(reason); };
  const references = (model: SemanticNode, ast: ts.Node, kind: string, prefix: string, member?: SemanticField) => {
    visitSource(ast, item => {
      const ref = ts.isTypeReferenceNode(item) ? item.typeName : ts.isExpressionWithTypeArguments(item) ? item.expression : ts.isTypeQueryNode(item) ? item.exprName : undefined;
      if (!ref) return;
      const target = targetAt(ref);
      if (target) {
        edge(model, target, kind, `${prefix}${ref.getText()}`, item, member?.id);
        if (member) member.referenceIds = [...new Set([...(member.referenceIds ?? []), target.id])];
      } else if (!/^(?:Array|ReadonlyArray|Promise|Map|Set|Record|Partial|Required|Readonly|Pick|Omit|Extract|Exclude|NonNullable|ReturnType|Parameters|InstanceType|Awaited)$/.test(ref.getText())) unresolved(model, `参照先未解決: ${ref.getText()}（${sourceEvidence(ref, '').path}:${sourceEvidence(ref, '').line}）`);
    });
  };
  const makeField = (member: ts.PropertySignature | ts.PropertyDeclaration | ts.ParameterDeclaration, owner: SemanticNode): SemanticField => {
    const initializer = 'initializer' in member ? member.initializer : undefined;
    const type = member.type?.getText() ?? (initializer ? `型注釈なし（初期化: ${initializer.getText()}）` : '型注釈なし');
    const ev = sourceEvidence(member, `${member.name.getText()}の項目定義`);
    const tokens = member.type && ts.isUnionTypeNode(member.type) ? member.type.types : member.type ? [member.type] : [];
    const result: SemanticField = { id: `${owner.id}:field:${ev.start}:${member.name.getText()}`, name: member.name.getText().replace(/^['"]|['"]$/g, ''), type,
      optional: Boolean(member.questionToken), nullable: tokens.some(item => item.kind === ts.SyntaxKind.NullKeyword || ts.isLiteralTypeNode(item) && item.literal.kind === ts.SyntaxKind.NullKeyword),
      allowsUndefined: tokens.some(item => item.kind === ts.SyntaxKind.UndefinedKeyword), array: Boolean(member.type && (ts.isArrayTypeNode(member.type) || ts.isTypeReferenceNode(member.type) && /^(?:Array|ReadonlyArray)$/.test(member.type.typeName.getText()))),
      readonly: modifier(member, ts.SyntaxKind.ReadonlyKeyword), access: modifier(member, ts.SyntaxKind.PrivateKeyword) || member.name.getText().startsWith('#') ? 'private' : modifier(member, ts.SyntaxKind.ProtectedKeyword) ? 'protected' : 'public',
      static: modifier(member, ts.SyntaxKind.StaticKeyword), evidence: [ev], sourceModelId: owner.id,
      ...(initializer ? { default: initializer.getText(), defaultSource: 'code' as const } : {}) };
    if (member.type) references(owner, member.type, 'field-type', `項目 ${result.name} の型: `, result);
    return result;
  };
  const expanded = new Set<string>();
  const expand = (model: SemanticNode, visited = new Set<string>()): SemanticField[] => {
    if (!asts.has(model.id)) return model.fields ?? [];
    if (expanded.has(model.id)) return model.fields ?? [];
    if (visited.has(model.id) || visited.size >= 16) { unresolved(model, '循環する型の展開、または展開上限に到達しました。参照関係は保持しています。'); model.model!.expansion = 'unexpanded'; return []; }
    const next = new Set(visited).add(model.id), ast = asts.get(model.id)!;
    const fieldsOf = (type: ts.TypeNode): { fields: SemanticField[]; complete: boolean } => {
      if (ts.isParenthesizedTypeNode(type)) return fieldsOf(type.type);
      if (ts.isTypeLiteralNode(type)) return { fields: type.members.filter(ts.isPropertySignature).map(member => makeField(member, model)), complete: true };
      if (ts.isTypeReferenceNode(type) && !type.typeArguments?.length) {
        const target = targetAt(type.typeName);
        if (target) {
          const fields = expand(target, next); if (target.model?.expansion !== 'expanded') unresolved(model, `参照元 ${target.label} の構造が未展開です。${target.model?.reasons.join(' ') ?? ''}`);
          return { fields: fields.map(item => ({ ...item, evidence: [...(item.evidence ?? []), sourceEvidence(type, '別名から元の項目を参照')] })), complete: target.model?.expansion === 'expanded' };
        }
        unresolved(model, `参照先未解決: ${type.typeName.getText()}`); return { fields: [], complete: false };
      }
      if (ts.isLiteralTypeNode(type) || [ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.BooleanKeyword, ts.SyntaxKind.NullKeyword, ts.SyntaxKind.UndefinedKeyword, ts.SyntaxKind.NeverKeyword, ts.SyntaxKind.VoidKeyword].includes(type.kind)) return { fields: [], complete: true };
      unresolved(model, `未展開: ${type.getText()}。この型演算の最終構造は評価していません。`);
      return { fields: [], complete: false };
    };
    let complete = true;
    if (ts.isInterfaceDeclaration(ast) || ts.isClassDeclaration(ast)) {
      const own = ast.members.filter((member): member is ts.PropertySignature | ts.PropertyDeclaration => ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)).map(member => makeField(member, model));
      if (ts.isClassDeclaration(ast)) for (const ctor of ast.members.filter(ts.isConstructorDeclaration)) for (const param of ctor.parameters) {
        if ([ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ReadonlyKeyword].some(kind => modifier(param, kind))) own.push(makeField(param, model));
      }
      model.model!.methods = ast.members.filter((member): member is ts.MethodDeclaration | ts.MethodSignature | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration => ts.isMethodDeclaration(member) || ts.isMethodSignature(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)).map(member => ({ name: member.name.getText(), signature: member.getText().split('{')[0]!.trim(), evidence: [sourceEvidence(member, 'メソッド定義')] }));
      const inherited: SemanticField[] = [];
      for (const clause of ast.heritageClauses ?? []) for (const type of clause.types) {
        const target = targetAt(type.expression);
        if (target) {
          edge(model, target, clause.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements', `${clause.token === ts.SyntaxKind.ExtendsKeyword ? '拡張元' : '実装する型'}: ${type.getText()}`, type);
          if (clause.token === ts.SyntaxKind.ExtendsKeyword) { inherited.push(...expand(target, next)); complete &&= target.model?.expansion === 'expanded'; }
        } else { unresolved(model, `参照先未解決: ${type.getText()}`); complete = false; }
      }
      model.fields = [...inherited.filter(item => !own.some(field => field.name === item.name)), ...own];
    } else if (ts.isEnumDeclaration(ast)) {
      model.model!.choices = ast.members.map(member => ({ label: member.initializer ? `${member.name.getText()} = ${member.initializer.getText()}` : member.name.getText(), evidence: [sourceEvidence(member, '列挙型の候補')] }));
    } else if (ts.isUnionTypeNode(ast.type)) {
      model.model!.choices = ast.type.types.map(type => {
        if (ts.isTypeReferenceNode(type)) {
          const target = targetAt(type.typeName); if (target) edge(model, target, 'union-member', `unionの候補: ${type.getText()}`, type);
        }
        if (ts.isLiteralTypeNode(type)) return { label: type.getText(), evidence: [sourceEvidence(type, '取り得る値')] };
        const structure = fieldsOf(type); complete &&= structure.complete;
        return { label: type.getText(), fields: structure.fields, evidence: [sourceEvidence(type, 'unionの構造候補')] };
      });
    } else {
      references(model, ast.type, 'derived-from', '定義式で参照: ');
      const structure = fieldsOf(ast.type); model.fields = structure.fields; complete = structure.complete;
      const target = ts.isTypeReferenceNode(ast.type) ? targetAt(ast.type.typeName) : undefined;
      if (target?.model?.choices) model.model!.choices = target.model.choices;
    }
    model.model!.expansion = complete ? 'expanded' : model.fields?.length || model.model!.choices?.some(choice => choice.fields?.length) ? 'partial' : 'unexpanded';
    expanded.add(model.id); return model.fields ?? [];
  };
  for (const node of declarations.values()) expand(node);
  for (const ast of asts.values()) {
    const errors = compiler.syntacticDiagnostics(ast.getSourceFile()).filter(error => (error.start ?? 0) >= ast.getStart() && (error.start ?? 0) <= ast.end);
    if (errors.length) {
      const node = declarations.get(ast)!; node.model!.expansion = 'failed';
      unresolved(node, `解析失敗: この定義には ${errors.length} 箇所の構文エラーがあります。抽出できた項目のみ表示しています。`);
    }
  }
  return { declarations, symbols };
}
