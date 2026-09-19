import ts from 'typescript';

/** Lexical lookup only. Never invoke project code or resolve modules by execution. */
export function httpFetchSites(path:string,source:string):ReadonlySet<string> {
 const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,path.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 type Binding=false|'fetch'|'client'|'aws-constructor';
 type Scope={parent?:Scope;bindings:Map<string,Binding>};
 const root:Scope={bindings:new Map()},scopes=new Map<ts.Node,Scope>(),calls:{node:ts.CallExpression;scope:Scope}[]=[],variables:{node:ts.VariableDeclaration;scope:Scope}[]=[];
 const bind=(name:ts.BindingName,scope:Scope,http:Binding=false)=>{if(ts.isIdentifier(name))scope.bindings.set(name.text,http);else for(const item of name.elements)if(ts.isBindingElement(item))bind(item.name,scope);};
 const visit=(node:ts.Node,parent:Scope)=>{
  if(ts.isFunctionDeclaration(node)&&node.name)parent.bindings.set(node.name.text,false);
  let scope=parent;if(ts.isFunctionLike(node)||ts.isBlock(node)){scope={parent,bindings:new Map()};scopes.set(node,scope);}
  if(ts.isParameter(node))bind(node.name,scope);
  if(ts.isVariableDeclaration(node)){let target=scope;if(ts.isVariableDeclarationList(node.parent)&&!(node.parent.flags&ts.NodeFlags.BlockScoped)){let p:ts.Node|undefined=node.parent;while(p&&!ts.isFunctionLike(p))p=p.parent;target=p?scopes.get(p)??root:root;}bind(node.name,target);variables.push({node,scope:target});}
  if(ts.isImportDeclaration(node)&&node.importClause){const module=ts.isStringLiteral(node.moduleSpecifier)?node.moduleSpecifier.text:'',known=['node-fetch','undici','cross-fetch'].includes(module),clause=node.importClause;if(clause.name)scope.bindings.set(clause.name.text,['node-fetch','cross-fetch'].includes(module)?'fetch':false);if(clause.namedBindings){if(ts.isNamespaceImport(clause.namedBindings))scope.bindings.set(clause.namedBindings.name.text,module==='undici'?'client':false);else for(const e of clause.namedBindings.elements){const symbol=(e.propertyName??e.name).text;scope.bindings.set(e.name.text,known&&symbol==='fetch'?'fetch':module==='cloudflare:test'&&symbol==='SELF'?'client':module==='aws4fetch'&&symbol==='AwsClient'?'aws-constructor':false);}}}
  if(ts.isCallExpression(node))calls.push({node,scope});ts.forEachChild(node,child=>visit(child,scope));
 };
 visit(file,root);
 const lookup=(scope:Scope,name:string):Binding|undefined=>scope.bindings.has(name)?scope.bindings.get(name):scope.parent?lookup(scope.parent,name):undefined;
 for(const {node,scope}of variables)if(ts.isVariableDeclarationList(node.parent)&&(node.parent.flags&ts.NodeFlags.Const)&&ts.isIdentifier(node.name)&&node.initializer&&ts.isNewExpression(node.initializer)&&ts.isIdentifier(node.initializer.expression)&&lookup(scope,node.initializer.expression.text)==='aws-constructor')scope.bindings.set(node.name.text,'client');
 const result=new Set<string>();for(const {node,scope}of calls){const fn=node.expression,key=`${node.getStart(file)}:${node.end}`;if(ts.isIdentifier(fn)){const binding=lookup(scope,fn.text);if(binding==='fetch'||fn.text==='fetch'&&binding===undefined)result.add(key);}else if(ts.isPropertyAccessExpression(fn)&&fn.name.text==='fetch'&&ts.isIdentifier(fn.expression)&&(lookup(scope,fn.expression.text)==='client'||['globalThis','window','self'].includes(fn.expression.text)&&lookup(scope,fn.expression.text)===undefined))result.add(key);}
 return result;
}
