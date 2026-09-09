import ts from 'typescript';
import type { SemanticEvidence } from './types';

export interface ArchitectureCall { callee: string; args: string[]; literals: (string | undefined)[]; defaultArgument?: { value: string; evidence: SemanticEvidence }; start: number; end: number; assigned?: string; lexicalScope: number; ownerScope: number; evidence: SemanticEvidence }
export interface ArchitectureSyntax { calls: ArchitectureCall[]; accesses: { expression: string; evidence: SemanticEvidence }[]; config?: Record<string, unknown>; imports: Set<string>; exportedFunctions: Set<string> }
function literalValue(node: ts.Expression): unknown {
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return node.kind === ts.SyntaxKind.TrueKeyword;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(item => ts.isExpression(item) ? literalValue(item) : undefined);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.flatMap(prop => ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)) ? [[prop.name.text, literalValue(prop.initializer)]] : []));
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return literalValue(node.expression);
  return undefined;
}

/** Reads AST syntax only; no import, require or evaluation of project code. */
export function architectureSyntax(path: string, source: string): ArchitectureSyntax {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const calls: ArchitectureCall[] = [], accesses: ArchitectureSyntax['accesses'] = [], imports = new Set<string>(), exportedFunctions = new Set<string>(); let config: Record<string, unknown> | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) exportedFunctions.add(node.name.text);
    if (ts.isPropertyAccessExpression(node)) {
      const start = node.getStart(file), end = node.end;
      accesses.push({ expression: node.getText(file), evidence: { path, start, end, line: file.getLineAndCharacterOfPosition(start).line + 1, endLine: file.getLineAndCharacterOfPosition(end).line + 1, description: `${node.getText(file)}へのアクセス式` } });
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) imports.add(node.moduleSpecifier.text);
    if (ts.isExportAssignment(node)) {
      const expression = node.expression;
      const value = literalValue(ts.isCallExpression(expression) && expression.expression.getText(file) === 'defineConfig' && expression.arguments[0] ? expression.arguments[0] : expression);
      if (value && typeof value === 'object' && !Array.isArray(value)) config = value as Record<string, unknown>;
    }
    if (ts.isCallExpression(node)) {
      const start = node.getStart(file), end = node.end;
      const assigned = ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(file) : ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken ? node.parent.left.getText(file) : undefined;
      let scope: ts.Node = node.parent;
      while (scope.parent && !ts.isFunctionLike(scope) && !ts.isBlock(scope)) scope = scope.parent;
      let owner: ts.Node = node; while (owner.parent && !ts.isClassLike(owner)) owner = owner.parent;
      const first = node.arguments[0], memberName = first && ts.isPropertyAccessExpression(first) && first.expression.kind === ts.SyntaxKind.ThisKeyword ? first.name.text : undefined;
      const parameter = memberName && ts.isClassLike(owner) ? owner.members.filter(ts.isConstructorDeclaration).flatMap(c => [...c.parameters]).find(p => p.name.getText(file) === memberName && p.initializer && ts.isStringLiteralLike(p.initializer)) : undefined;
      const defaultArgument = parameter?.initializer && ts.isStringLiteralLike(parameter.initializer) ? { value: parameter.initializer.text, evidence: { path, start: parameter.getStart(file), end: parameter.end, line: file.getLineAndCharacterOfPosition(parameter.getStart(file)).line + 1, endLine: file.getLineAndCharacterOfPosition(parameter.end).line + 1, description: '同じクラスのコンストラクター引数の既定値。呼び出し側で変更可能' } } : undefined;
      calls.push({ callee: node.expression.getText(file), args: node.arguments.map(arg => arg.getText(file)), literals: node.arguments.map(arg => ts.isStringLiteralLike(arg) ? arg.text : undefined), defaultArgument, start, end, assigned, lexicalScope: scope.pos, ownerScope: ts.isClassLike(owner) ? owner.pos : scope.pos,
        evidence: { path, start, end, line: file.getLineAndCharacterOfPosition(start).line + 1, endLine: file.getLineAndCharacterOfPosition(end).line + 1, description: `${node.expression.getText(file)}の呼び出し式` } });
    }
    ts.forEachChild(node, visit);
  };
  visit(file); return { calls, accesses, config, imports, exportedFunctions };
}
