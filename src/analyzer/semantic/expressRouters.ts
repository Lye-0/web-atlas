import ts from 'typescript';
import { sourceEvidence, visitSource } from './dataCompiler';
import type { AdapterContext } from './stackSemantics';
import type { SemanticEvidence, SemanticNode } from './types';

export function addExpressRouterRegistrations(context:AdapterContext){
  const routers=new Map<ts.Symbol,{path:string;node:ts.VariableDeclaration;kind:'app'|'router'}>();
  const mounts:{from:ts.Symbol;to:ts.Symbol;prefix:string;evidence:SemanticEvidence}[]=[];
  const symbol=(file:NonNullable<ReturnType<typeof context.files.get>>,expression:ts.Node)=>{let value=file.checker.getSymbolAtLocation(expression);if(value&&value.flags&ts.SymbolFlags.Alias)value=file.checker.getAliasedSymbol(value);return value;};
  for(const file of context.files.values()){if(!file.ast||file.inlineTemplate)continue;visitSource(file.ast,current=>{
    if(!ts.isVariableDeclaration(current)||!ts.isIdentifier(current.name)||!current.initializer||!ts.isCallExpression(current.initializer))return;
    const expression=current.initializer.expression;const root=ts.isPropertyAccessExpression(expression)?expression.expression:expression;const bindingSymbol=file.checker.getSymbolAtLocation(root);const binding=bindingSymbol?file.symbols.get(bindingSymbol):undefined;if(binding?.module!=='express')return;
    const method=ts.isPropertyAccessExpression(expression)?expression.name.text:binding.symbol;
    if(!['default','Router'].includes(method))return;const value=symbol(file,current.name);if(value)routers.set(value,{path:file.path,node:current,kind:method==='Router'?'router':'app'});
  });}
  if(!routers.size)return;
  for(const file of context.files.values()){if(!file.ast||file.inlineTemplate)continue;visitSource(file.ast,current=>{
    if(!ts.isCallExpression(current)||!ts.isPropertyAccessExpression(current.expression)||current.expression.name.text!=='use')return;const from=symbol(file,current.expression.expression);if(!from||!routers.has(from))return;
    const first=current.arguments[0];const prefix=first&&ts.isStringLiteralLike(first)?first.text:'';const target=first&&ts.isStringLiteralLike(first)?current.arguments[1]:first;if(!target)return;const to=symbol(file,target);if(!to||!routers.has(to)||routers.get(to)!.kind!=='router')return;
    mounts.push({from,to,prefix,evidence:sourceEvidence(current,'Express Routerの明示mount')});
  });}
  const prefixes=(router:ts.Symbol,seen=new Set<ts.Symbol>()):{prefix:string;at:SemanticEvidence[]}[]=>{if(seen.has(router)||seen.size>=8)return[];if(routers.get(router)?.kind==='app')return[{prefix:'',at:[]}];return mounts.filter(mount=>mount.to===router).flatMap(mount=>prefixes(mount.from,new Set([...seen,router])).map(parent=>({prefix:parent.prefix+'/'+mount.prefix,at:[...parent.at,mount.evidence]})));};
  const pending:{path:string;call:ts.CallExpression;endpoint:string;method:string;target?:SemanticNode;at:SemanticEvidence[]}[]=[],removed=new Set<string>();
  for(const file of context.files.values()){if(!file.ast||file.inlineTemplate)continue;visitSource(file.ast,current=>{
    if(!ts.isCallExpression(current)||!ts.isPropertyAccessExpression(current.expression)||!['get','post','put','patch','delete','head','options','all'].includes(current.expression.name.text))return;const receiver=symbol(file,current.expression.expression);if(!receiver||!routers.has(receiver))return;const route=current.arguments[0];if(!route||!ts.isStringLiteralLike(route))return;
    const at=sourceEvidence(current,'Expressの静的route登録');for(const node of context.analysis.nodes)if(node.kind==='entry'&&node.path===file.path&&node.attributes.endpoint&&node.evidence.some(source=>source.start===at.start&&source.end===at.end))removed.add(node.id);
    const argument=current.arguments.at(-1);const handlerSymbol=argument?symbol(file,argument):undefined;const declaration=handlerSymbol?.valueDeclaration??argument;const handler=declaration&&ts.isVariableDeclaration(declaration)?declaration.initializer:declaration;
    const targets=handler?context.analysis.nodes.filter(node=>node.kind==='function'&&!node.attributes.initializer&&node.path===handler.getSourceFile().fileName&&node.evidence.some(source=>source.start>=handler.getStart()&&source.end<=handler.end)):[];const target=targets.filter(node=>!targets.some(other=>other!==node&&other.evidence.some(outer=>node.evidence.some(inner=>outer.start<=inner.start&&outer.end>=inner.end))))[0];
    for(const prefix of prefixes(receiver))pending.push({path:file.path,call:current,endpoint:('/'+prefix.prefix+'/'+route.text).replace(/\/+/g,'/').replace(/\/$/,'')||'/',method:current.expression.name.text==='all'?'ANY':current.expression.name.text.toUpperCase(),target,at:prefix.at});
  });}
  context.analysis.nodes=context.analysis.nodes.filter(node=>!removed.has(node.id));context.analysis.edges=context.analysis.edges.filter(edge=>!removed.has(edge.source)&&!removed.has(edge.target));
  for(const route of pending){const at=sourceEvidence(route.call,'Express routeとmount prefixの登録');const entry=context.node('entry',`${route.method} ${route.endpoint}`,route.path,at.start,at.end,{dictionaryStackId:'express',endpoint:route.endpoint,method:route.method,routeRegistrationVerified:true,registeredRouter:true});entry.evidence.push(...route.at);if(route.target){context.edge(entry,route.target,'handles',['runtime-flow','function-call-flow'],entry.evidence);route.target.attributes.entry=true;}else{entry.confidence='unresolved';entry.attributes.unresolvedHandler=route.call.arguments.at(-1)?.getText()??'';}}
}
