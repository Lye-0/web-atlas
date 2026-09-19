import ts from 'typescript';
export interface StaticValue {values:string[];conditions:string[];unknown:boolean;projectPath?:boolean}
export interface ScriptSite {start:number;end:number}
export interface StaticWrite extends ScriptSite {output:StaticValue;inputs:string[];inputSites:ScriptSite[];expression:string;update:boolean}
export interface StaticServe extends ScriptSite {root:string;host:StaticValue;port:StaticValue;sites:ScriptSite[]}
export interface StaticNodeFacts {writes:StaticWrite[];servers:StaticServe[];limitations:string[]}
const unknown=():StaticValue=>({values:[],conditions:[],unknown:true});
const literal=(value:string):StaticValue=>({values:[value],conditions:[],unknown:false});
/** Relative declarations may point outside the snapshot. This function never reads those paths. */
export function declaredPath(base:string,...parts:string[]):string{
 let value=base;
 for(const p of parts){if(/^(?:[A-Za-z]:[\\/]|\/)/.test(p))value=p;else value+='/'+p;}
 const prefix=value.startsWith('/')?'/':'',result:string[]=[];
 for(const p of value.replaceAll('\\','/').split('/'))if(p&&p!=='.'){if(p==='..'&&result.length&&result.at(-1)!=='..')result.pop();else result.push(p);}
 return prefix+result.join('/')||'.';
}
/** Bounded AST interpretation of declarations, not execution. No project imports or JS evaluation. */
export function staticNodeScript(path:string,source:string,cwd:string,args:string[]=[]):StaticNodeFacts{
 const facts:StaticNodeFacts={writes:[],servers:[],limitations:[]};
 if(source.length>2_000_000)return {...facts,limitations:['scriptが解析上限を超える']};
 const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const host:ts.CompilerHost={getSourceFile:n=>n===path?file:undefined,getDefaultLibFileName:()=>'',writeFile:()=>{},getCurrentDirectory:()=>'',getDirectories:()=>[],fileExists:n=>n===path,readFile:n=>n===path?source:undefined,getCanonicalFileName:n=>n,useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\n'};
 const checker=ts.createProgram([path],{noLib:true,noResolve:true,allowJs:true},host).getTypeChecker();
 const sym=(n:ts.Node)=>checker.getSymbolAtLocation(n);
 const imports=new Map<ts.Symbol,{module:string;name:string}>(),assignments=new Map<ts.Symbol,ts.Expression[]>(),bindings=new Map<ts.Symbol,ts.Expression>(),loops=new Map<ts.Symbol,ts.Expression>();
 const calls:ts.CallExpression[]=[],declarations:ts.VariableDeclaration[]=[];let count=0;
 const visit=(n:ts.Node)=>{if(++count>100000)return;
  if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)){const module=n.moduleSpecifier.text.replace(/^node:/,'');const b=n.importClause?.namedBindings;
   if(b&&ts.isNamedImports(b))for(const e of b.elements){const s=sym(e.name);if(s)imports.set(s,{module,name:e.propertyName?.text??e.name.text});}
   if(b&&ts.isNamespaceImport(b)){const s=sym(b.name);if(s)imports.set(s,{module,name:'*'});}if(n.importClause?.name){const s=sym(n.importClause.name);if(s)imports.set(s,{module,name:'*'});}
  }
  if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer){const s=sym(n.name);if(s)bindings.set(s,n.initializer);declarations.push(n);}
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment){let left:ts.Expression=n.left;while(ts.isPropertyAccessExpression(left)||ts.isElementAccessExpression(left))left=left.expression;const s=ts.isIdentifier(left)?sym(left):undefined;if(s)assignments.set(s,[...assignments.get(s)??[],n.right]);}
  if(ts.isForOfStatement(n)&&ts.isVariableDeclarationList(n.initializer)){const d=n.initializer.declarations[0];if(d&&ts.isIdentifier(d.name)){const s=sym(d.name);if(s)loops.set(s,n.expression);}}
  if(ts.isCallExpression(n)){calls.push(n);if(ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='map'){const cb=n.arguments[0];if(cb&&(ts.isArrowFunction(cb)||ts.isFunctionExpression(cb))&&cb.parameters[0]&&ts.isIdentifier(cb.parameters[0].name)){const s=sym(cb.parameters[0].name);if(s)loops.set(s,n.expression.expression);}}}
  ts.forEachChild(n,visit);
 };visit(file);if(count>100000){facts.limitations.push('ASTノード上限');return facts;}
 const api=(expr:ts.Expression,module:string,names:string[])=>{if(ts.isIdentifier(expr)){const binding=imports.get(sym(expr)!);return binding?.module===module&&names.includes(binding.name);}if(ts.isPropertyAccessExpression(expr)){const binding=imports.get(sym(expr.expression)!);return binding?.module===module&&binding.name==='*'&&names.includes(expr.name.text);}return false;};
 const fs=(c:ts.CallExpression,names:string[])=>api(c.expression,'fs',names)||api(c.expression,'fs/promises',names);
 const readCall=(n:ts.Node):n is ts.CallExpression=>ts.isCallExpression(n)&&fs(n,['readFile','readFileSync']);
 const site=(n:ts.Node):ScriptSite=>({start:n.getStart(file),end:n.end});
 const merge=(vs:StaticValue[],values:string[],u=false):StaticValue=>({values:[...new Set(values)].slice(0,64),conditions:[...new Set(vs.flatMap(v=>v.conditions))],unknown:u||vs.some(v=>v.unknown)||values.length>64});
 const read=(n:ts.Node|undefined,seen=new Set<ts.Symbol>(),depth=0):StaticValue=>{
  if(!n||depth>24)return unknown();const recur=(v:ts.Node)=>read(v,seen,depth+1);
  if(ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isAwaitExpression(n))return recur(n.expression);
  if(ts.isStringLiteralLike(n)||ts.isNumericLiteral(n))return literal(n.text);
  if(ts.isIdentifier(n)){const s=sym(n);if(!s||seen.has(s)||assignments.has(s))return unknown();const value=bindings.get(s)??loops.get(s);return value?read(value,new Set([...seen,s]),depth+1):unknown();}
  if(n.kind===ts.SyntaxKind.MetaProperty&&n.getText(file)==='import.meta')return {...literal(path),projectPath:true};
  if(ts.isPropertyAccessExpression(n)&&n.getText(file)==='import.meta.url')return {...literal(path),projectPath:true};
  if(ts.isPropertyAccessExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.getText(file)==='process.env'&&!sym(n.expression.expression))return {...unknown(),conditions:[n.getText(file)+'による上書きは未取得']};
  if(ts.isElementAccessExpression(n)&&n.expression.getText(file)==='process.argv'&&!sym((n.expression as ts.PropertyAccessExpression).expression)){
   const index=Number(n.argumentExpression.getText(file));return index===1?{...literal(path),projectPath:true}:index>=2&&args[index-2]!==undefined&&!/[$`]/.test(args[index-2]!)?literal(args[index-2]!):{...unknown(),conditions:[n.getText(file)+'の指定は未取得']};
  }
  if(ts.isArrayLiteralExpression(n)){const vs=n.elements.map(recur);return merge(vs,vs.flatMap(v=>v.values));}
  if(ts.isConditionalExpression(n)){const test=recur(n.condition),a=recur(n.whenTrue),b=recur(n.whenFalse);if(test.values.length===1&&!test.unknown)return a;return {...b,conditions:[...b.conditions,`既定値（${n.condition.getText(file)}で変更可能）`],unknown:true};}
  if(ts.isBinaryExpression(n)){
   const a=recur(n.left),b=recur(n.right);
   if([ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind))return a.values.length&&!a.unknown?a:{...b,conditions:[...a.conditions,...b.conditions],unknown:a.unknown||b.unknown};
   if(n.operatorToken.kind===ts.SyntaxKind.PlusToken)return merge([a,b],a.values.flatMap(x=>b.values.map(y=>x+y)));
  }
  if(ts.isTemplateExpression(n)){let result=literal(n.head.text);for(const span of n.templateSpans){const v=recur(span.expression);result=merge([result,v],result.values.flatMap(x=>v.values.map(y=>x+y+span.literal.text)));}return result;}
  if(ts.isCallExpression(n)){
   if(api(n.expression,'url',['fileURLToPath']))return recur(n.arguments[0]!);
   if(api(n.expression,'path',['dirname'])){const v=recur(n.arguments[0]!);return {...v,values:v.values.map(p=>p.split('/').slice(0,-1).join('/')||'.')};}
   if(api(n.expression,'path',['resolve','join'])){const vs=n.arguments.map(recur);let values=[''];for(const v of vs)values=values.flatMap(x=>v.values.map(y=>declaredPath(x||(v.projectPath?'.':cwd),y))).slice(0,64);return {...merge(vs,values),projectPath:true};}
   if(ts.isIdentifier(n.expression)&&['Number','String'].includes(n.expression.text)&&!sym(n.expression))return recur(n.arguments[0]!);
   if(n.expression.getText(file)==='process.cwd'&&!sym((n.expression as ts.PropertyAccessExpression).expression))return {...literal(cwd),projectPath:true};
  }
  return unknown();
 };
 // Follow values and their finite assignment sites to the original read expressions.
 const readsFor=(n:ts.Node|undefined):ts.CallExpression[]=>{const found=new Set<ts.CallExpression>(),seen=new Set<ts.Node>();let budget=4000;
  const walk=(node:ts.Node)=>{if(--budget<0||seen.has(node))return;seen.add(node);if(readCall(node))found.add(node);if(ts.isIdentifier(node)){const s=sym(node);const value=s&&bindings.get(s);if(value)walk(value);for(const v of s&&assignments.get(s)||[])if(!n||v.pos<=n.end)walk(v);}ts.forEachChild(node,walk);};if(n)walk(n);return [...found];};
 const topLevel=(n:ts.Node)=>{for(let p=n.parent;p&&p!==file;p=p.parent)if(ts.isFunctionLike(p)||ts.isIfStatement(p)||ts.isConditionalExpression(p)||ts.isForStatement(p)||ts.isForOfStatement(p)||ts.isWhileStatement(p)||ts.isSwitchStatement(p)||ts.isTryStatement(p))return false;return true;};
 for(const call of calls)if(fs(call,['writeFile','writeFileSync'])&&topLevel(call)){
  const reads=readsFor(call.arguments[1]),inputs=[...new Set(reads.flatMap(r=>{const v=read(r.arguments[0]);return v.values.map(p=>v.projectPath?p:declaredPath(cwd,p));}))],v=read(call.arguments[0]);
  if(!reads.length)continue;
  const output={...v,values:v.values.map(p=>v.projectPath?p:declaredPath(cwd,p))};
  if(output.values.length&&!output.values.some(p=>/\.(?:html?|[cm]?js|css)$/i.test(p)&&!/(?:^|\/)(?:logs?|\.?cache|tmp|temp|tests?|fixtures?)(?:\/|$)/i.test(p)))continue;
  facts.writes.push({...site(call),output,inputs,inputSites:reads.map(site),expression:call.arguments[0]?.getText(file)??'未特定',update:output.values.some(p=>inputs.includes(p))});
 }
 // A server must pass request-derived file contents to its response and listen on the same instance.
 for(const create of calls.filter(c=>api(c.expression,'http',['createServer']))){
  const declaration=ts.isVariableDeclaration(create.parent)?create.parent:undefined;if(!declaration||!ts.isIdentifier(declaration.name))continue;
  const serverSymbol=sym(declaration.name);let handler:ts.Node|undefined=create.arguments[0];
  if(handler&&ts.isIdentifier(handler)){const s=sym(handler);handler=s?.declarations?.find(ts.isFunctionDeclaration)??(s&&bindings.get(s));}
  if(!handler||!ts.isFunctionLike(handler)||handler.parameters.length<2)continue;
  const requestSymbol=sym(handler.parameters[0]!.name),responseSymbol=sym(handler.parameters[1]!.name);
  const within=(n:ts.Node)=>n.pos>=handler!.pos&&n.end<=handler!.end;
  const responses=calls.filter(c=>within(c)&&ts.isPropertyAccessExpression(c.expression)&&c.expression.name.text==='end'&&sym(c.expression.expression)===responseSymbol);
  const reads=responses.flatMap(c=>readsFor(c.arguments[0]));
  const depends=(n:ts.Node|undefined,target:ts.Symbol|undefined):boolean=>{const seen=new Set<ts.Node>();let budget=1500;const walk=(x:ts.Node):boolean=>{if(--budget<0||seen.has(x))return false;seen.add(x);if(ts.isIdentifier(x)){const s=sym(x);if(s&&s===target)return true;const v=s&&bindings.get(s);if(v&&walk(v))return true;}let yes=false;ts.forEachChild(x,c=>{if(walk(c))yes=true;});return yes;};return !!n&&!!target&&walk(n);};
  const requestReads=reads.filter(c=>depends(c.arguments[0],requestSymbol));if(!requestReads.length)continue;
  const resolveCalls=calls.filter(c=>within(c)&&api(c.expression,'path',['resolve','join'])&&depends(c,requestSymbol));
  const roots=[...new Set(resolveCalls.flatMap(c=>read(c.arguments[0]).values))];if(roots.length!==1)continue;
  for(const listen of calls.filter(c=>ts.isPropertyAccessExpression(c.expression)&&c.expression.name.text==='listen'&&sym(c.expression.expression)===serverSymbol)){
   // Allow the standard direct-entry guard, but not an uncalled function's server.
   const argvEntry=(n:ts.Expression)=>ts.isElementAccessExpression(n)&&ts.isNumericLiteral(n.argumentExpression)&&n.argumentExpression.text==='1'&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='argv'&&ts.isIdentifier(n.expression.expression)&&n.expression.expression.text==='process'&&!sym(n.expression.expression);
   const directEntry=(n:ts.Expression):boolean=>{if(ts.isParenthesizedExpression(n))return directEntry(n.expression);if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken)return argvEntry(n.left)&&directEntry(n.right);if(!ts.isBinaryExpression(n)||n.operatorToken.kind!==ts.SyntaxKind.EqualsEqualsEqualsToken)return false;const matches=(a:ts.Expression,b:ts.Expression)=>ts.isCallExpression(a)&&api(a.expression,'path',['resolve'])&&a.arguments.length===1&&argvEntry(a.arguments[0]!)&&ts.isCallExpression(b)&&api(b.expression,'url',['fileURLToPath'])&&b.arguments[0]?.getText(file)==='import.meta.url';return matches(n.left,n.right)||matches(n.right,n.left);};
   let nested=false;for(let p=create.parent;p&&p!==file;p=p.parent)if(ts.isFunctionLike(p)||ts.isIfStatement(p)&&!directEntry(p.expression)||ts.isConditionalExpression(p)||ts.isForStatement(p)||ts.isForOfStatement(p)||ts.isWhileStatement(p))nested=true;if(nested)continue;
   facts.servers.push({...site(listen),root:roots[0]!,port:read(listen.arguments[0]),host:read(listen.arguments[1]),sites:[site(create),...requestReads.map(site),...resolveCalls.map(site)]});
  }
 }
 return facts;
}
