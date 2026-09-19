import ts from 'typescript';
/** Read literal exports only. Unknown spreads, functions and mutations stay unresolved. */
export function staticExportConfig(path:string,source:string):Record<string,unknown>|undefined{
 const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true),values=new Map<string,ts.Expression>();
 for(const statement of file.statements)if(ts.isVariableStatement(statement)&&(statement.declarationList.flags&ts.NodeFlags.Const))for(const d of statement.declarationList.declarations)if(ts.isIdentifier(d.name)&&d.initializer)values.set(d.name.text,d.initializer);
 const invalid=new Set<string>();const writes=(n:ts.Node)=>{if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment){let lhs=n.left;while(ts.isPropertyAccessExpression(lhs)||ts.isElementAccessExpression(lhs))lhs=lhs.expression;if(ts.isIdentifier(lhs))invalid.add(lhs.text);}ts.forEachChild(n,writes);};writes(file);
 const read=(n:ts.Expression,seen=new Set<string>()):unknown=>{
  if(ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isSatisfiesExpression(n))return read(n.expression,seen);
  if(ts.isIdentifier(n)){if(seen.has(n.text)||invalid.has(n.text)||!values.has(n.text))return undefined;return read(values.get(n.text)!,new Set([...seen,n.text]));}
  if(ts.isStringLiteralLike(n))return n.text;if(ts.isNumericLiteral(n))return Number(n.text);if(n.kind===ts.SyntaxKind.TrueKeyword||n.kind===ts.SyntaxKind.FalseKeyword)return n.kind===ts.SyntaxKind.TrueKeyword;
  if(ts.isArrayLiteralExpression(n))return n.elements.map(e=>ts.isExpression(e)?read(e,seen):undefined);
  if(ts.isObjectLiteralExpression(n)){const result:Record<string,unknown>={};for(const p of n.properties){if(!ts.isPropertyAssignment(p)||!p.name||!ts.isIdentifier(p.name)&&!ts.isStringLiteralLike(p.name))return undefined;result[p.name.text]=read(p.initializer,seen);}return result;}return undefined;
 };
 for(const statement of file.statements){const expression=ts.isExportAssignment(statement)?statement.expression:ts.isExpressionStatement(statement)&&ts.isBinaryExpression(statement.expression)&&statement.expression.left.getText(file)==='module.exports'&&!values.has('module')?statement.expression.right:undefined;if(expression){const v=read(expression);if(v&&typeof v==='object'&&!Array.isArray(v))return v as Record<string,unknown>;}}
}
