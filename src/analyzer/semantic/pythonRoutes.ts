import { sourceSyntax } from '../sourceSyntax';
import type { AdapterContext } from './stackSemantics';
import type { SemanticEvidence, SemanticNode } from './types';

interface Argument {text:string;start:number;end:number}
interface Router {key:string;path:string;name:string;product:'fastapi'|'flask';kind:'app'|'router';prefix:string;start:number;end:number;owner?:string}
interface Mount {from:string;to:string;prefix:string;override:boolean;evidence:SemanticEvidence}
export function argumentsAt(source:string,code:string,start:number):{args:Argument[];end:number}|undefined{
  const open=code.indexOf('(',start);if(open<0)return;let depth=0,begin=open+1;const args:Argument[]=[];
  const push=(end:number)=>{const raw=source.slice(begin,end),left=raw.length-raw.trimStart().length,right=raw.trimEnd().length;if(right>left)args.push({text:raw.slice(left,right),start:begin+left,end:begin+right});};
  for(let at=open+1;at<code.length;at++){const character=code[at]!;if('([{'.includes(character))depth++;else if(')]}'.includes(character)){if(!depth){push(at);return{args,end:at+1};}depth--;}else if(character===','&&!depth){push(at);begin=at+1;}}
}
const literal=(text:string|undefined)=>text?.match(/^(['"])(.*?)\1$/)?.[2];
const keyword=(args:Argument[],key:string)=>args.find(arg=>new RegExp(`^${key}\\s*=`).test(arg.text))?.text.replace(new RegExp(`^${key}\\s*=\\s*`),'');
const join=(...parts:string[])=>{const value=('/'+parts.join('/')).replace(/\/+/g,'/');return parts.at(-1)?.endsWith('/')?value:value.replace(/\/$/,'')||'/';};

/** Static router registrations are followed through actual local module imports. */
export function addPythonRouterRegistrations(context:AdapterContext){
  const files=[...context.files.values()].filter(file=>file.path.endsWith('.py'));
  const routers:Router[]=[],mounts:Mount[]=[];
  const evidence=(path:string,start:number,end:number,description:string):SemanticEvidence=>{const source=context.input.sources[path]!;return{path,start,end,line:source.slice(0,start).split('\n').length,endLine:source.slice(0,end).split('\n').length,description};};
  const functionOwner=(path:string,position:number)=>{const owner=context.owner(path,position);return owner?.attributes.initializer?undefined:owner;};
  const shadowed=(path:string,name:string,position:number)=>{const file=context.files.get(path)!;const owner=functionOwner(path,position);const header=owner?file.code.slice(owner.evidence[0]!.start,owner.evidence[0]!.end).split('\n')[0]??'':'';return new RegExp(`\\bdef\\s+\\w+\\s*\\([^)]*\\b${name}\\b`).test(header)||context.analysis.nodes.some(node=>node.path===path&&node.kind==='function'&&node.attributes.name===name);};
  const targetFile=(path:string,module:string)=>context.input.imports.find(item=>item.from===path&&item.specifier===module)?.to;
  for(const file of files)for(const match of file.code.matchAll(/\b(\w+)\s*=\s*(\w+)\s*\(/g)){
    const binding=file.imports.get(match[2]!);if(!binding||!['fastapi','flask'].includes(binding.stackId??'')||!['FastAPI','APIRouter','Flask','Blueprint'].includes(binding.symbol)||shadowed(file.path,match[2]!,match.index!))continue;
    const call=argumentsAt(file.source,file.code,match.index!);if(!call)continue;const prefixArgument=keyword(call.args,binding.stackId==='fastapi'?'prefix':'url_prefix');if(prefixArgument!==undefined&&literal(prefixArgument)===undefined)continue;
    routers.push({key:`${file.path}:${match.index}`,path:file.path,name:match[1]!,product:binding.stackId as Router['product'],kind:['FastAPI','Flask'].includes(binding.symbol)?'app':'router',prefix:literal(prefixArgument)??'',start:match.index!,end:call.end,owner:functionOwner(file.path,match.index!)?.id});
  }
  const resolve=(path:string,name:string,position:number):Router|undefined=>{
    if(!/^\w+$/.test(name)||shadowed(path,name,position))return;const file=context.files.get(path)!;const binding=file.imports.get(name);const imported=binding?targetFile(path,binding.module):undefined;
    const candidates=routers.filter(router=>imported?router.path===imported&&router.name===binding!.symbol&&!router.owner:router.path===path&&router.name===name&&(!router.owner||router.owner===functionOwner(path,position)?.id));return candidates.length===1?candidates[0]:undefined;
  };
  for(const file of files)for(const match of file.code.matchAll(/\b(\w+)\.(include_router|register_blueprint)\s*\(/g)){
    const from=resolve(file.path,match[1]!,match.index!);const call=argumentsAt(file.source,file.code,match.index!);if(!from||!call)continue;const target=resolve(file.path,call.args[0]?.text??'',match.index!);if(!target||target.product!==from.product)continue;
    const prefixArgument=keyword(call.args,from.product==='fastapi'?'prefix':'url_prefix');if(prefixArgument!==undefined&&literal(prefixArgument)===undefined)continue;
    const at=evidence(file.path,match.index!,call.end,'静的router / blueprint登録');mounts.push({from:from.key,to:target.key,prefix:literal(prefixArgument)??'',override:from.product==='flask'&&prefixArgument!==undefined,evidence:at});
    const source=context.node('entry',`${from.product} app · ${from.name}`,from.path,from.start,from.end,{dictionaryStackId:from.product,routerRegistration:true});const destination=context.node('entry',`${target.product} router · ${target.name}`,target.path,target.start,target.end,{dictionaryStackId:target.product,routerRegistration:true});context.edge(source,destination,'registers-router',['runtime-flow','function-call-flow'],[at]);
  }
  const prefixes=(router:Router,seen=new Set<string>()):{prefix:string;evidence:SemanticEvidence[]}[]=>{if(seen.has(router.key)||seen.size>=8)return[];if(router.kind==='app')return[{prefix:router.prefix,evidence:[]}];return mounts.filter(mount=>mount.to===router.key).flatMap(mount=>{const parent=routers.find(router=>router.key===mount.from)!;return prefixes(parent,new Set([...seen,router.key])).map(prior=>({prefix:join(prior.prefix,mount.override?mount.prefix:join(mount.prefix,router.prefix)),evidence:[...prior.evidence,mount.evidence]}));});};
  const removed=new Set<string>();const removeAt=(path:string,start:number,end:number)=>{for(const node of context.analysis.nodes)if(node.kind==='entry'&&node.path===path&&node.attributes.endpoint&&node.evidence.some(at=>at.start<end&&at.end>start))removed.add(node.id);};
  const addRoute=(product:string,path:string,start:number,end:number,route:string,method:string,target:SemanticNode,at:SemanticEvidence[])=>{const entry=context.node('entry',`${method} ${route}`,path,start,end,{dictionaryStackId:product,endpoint:route,method,routeRegistrationVerified:true,registeredRouter:true});entry.evidence.push(...at);context.edge(entry,target,'handles',['runtime-flow','function-call-flow'],entry.evidence);target.attributes.entry=true;target.attributes.dictionaryStackId=product;return entry;};
  const pending:{product:string;path:string;start:number;end:number;route:string;method:string;target:SemanticNode;at:SemanticEvidence[];router?:string}[]=[];
  for(const file of files)for(const match of file.code.matchAll(/@(\w+)\.(get|post|put|patch|delete|route|head|options)\s*\(/g)){
    const router=resolve(file.path,match[1]!,match.index!);if(!router)continue;const call=argumentsAt(file.source,file.code,match.index!);if(!call)continue;const route=literal(call.args[0]?.text);if(route===undefined)continue;removeAt(file.path,match.index!,call.end);
    const tail=file.code.slice(call.end);const definition=tail.match(/^(?:\s*@[^\n]*\n)*\s*(?:async\s+)?def\s+(\w+)\s*\(/);if(!definition)continue;const functionStart=call.end+definition[0]!.lastIndexOf('def ');const target=context.analysis.nodes.find(node=>node.kind==='function'&&node.path===file.path&&node.attributes.name===definition[1]&&node.evidence.some(at=>at.start<=functionStart&&at.end>functionStart||at.start>=functionStart&&at.start<functionStart+definition[1]!.length+5));if(!target)continue;
    const declaredMethods=keyword(call.args,'methods');const methods=match[2]==='route'?declaredMethods?[...declaredMethods.matchAll(/['"]([A-Z]+)['"]/g)].map(item=>item[1]!):['GET']:[match[2]!.toUpperCase()];
    for(const mounted of prefixes(router))for(const method of methods)pending.push({product:router.product,path:file.path,start:match.index!,end:call.end,route:join(mounted.prefix,route),method,target,at:mounted.evidence,router:router.key});
  }
  // Django include composes URLconf paths; it never changes module ownership.
  const urls:{path:string;start:number;end:number;prefix:string;target?:SemanticNode;include?:string;unresolvedInclude?:string}[]=[];
  for(const file of files)if(file.products.has('django'))for(const match of file.code.matchAll(/\b(\w+)\s*\(/g)){
    const binding=file.imports.get(match[1]!);if(binding?.module!=='django.urls'||binding.symbol!=='path'||shadowed(file.path,match[1]!,match.index!))continue;const call=argumentsAt(file.source,file.code,match.index!);if(!call)continue;const prefix=literal(call.args[0]?.text),second=call.args[1];if(prefix===undefined||!second)continue;const includeName=sourceSyntax(second.text,'python').code.match(/^(\w+)\s*\(/)?.[1];const includeBinding=includeName?file.imports.get(includeName):undefined;
    if(includeName&&includeBinding?.module==='django.urls'&&includeBinding.symbol==='include'&&!shadowed(file.path,includeName,second.start)){const included=argumentsAt(file.source,file.code,second.start)?.args[0];const module=literal(included?.text);const modulePath=module?file.path.split('/').slice(0,-1).concat(module.replaceAll('.','/')+'.py').join('/'):undefined;const imported=included&&!module?file.imports.get(included.text):undefined;const projectPath=module?[file.project?.directory==='.'?'':file.project?.directory,module.replaceAll('.','/')+'.py'].filter(Boolean).join('/'):undefined;const target=modulePath&&context.input.sources[modulePath]!==undefined?modulePath:projectPath&&context.input.sources[projectPath]!==undefined?projectPath:imported?targetFile(file.path,imported.module):undefined;urls.push({path:file.path,start:match.index!,end:call.end,prefix,include:target,...(!target?{unresolvedInclude:included?.text??'include'}:{})});}
    else{const target=context.handler(file.path,second.text);if(target)urls.push({path:file.path,start:match.index!,end:call.end,prefix,target});}
  }
  const urlPrefixes=(path:string,seen=new Set<string>()):{prefix:string;at:SemanticEvidence[]}[]=>{if(seen.has(path)||seen.size>=8)return[];const parents=urls.filter(url=>url.include===path);return parents.length?parents.flatMap(parent=>urlPrefixes(parent.path,new Set([...seen,path])).map(prior=>({prefix:join(prior.prefix,parent.prefix),at:[...prior.at,evidence(parent.path,parent.start,parent.end,'Django includeの親URLconf')]}))):[{prefix:'',at:[]}];};
  for(const url of urls){removeAt(url.path,url.start,url.end);if(url.target)for(const parent of urlPrefixes(url.path))pending.push({product:'django',path:url.path,start:url.start,end:url.end,route:join(parent.prefix,url.prefix),method:'ANY',target:url.target,at:parent.at});}
  context.analysis.nodes=context.analysis.nodes.filter(node=>!removed.has(node.id));context.analysis.edges=context.analysis.edges.filter(edge=>!removed.has(edge.source)&&!removed.has(edge.target));
  for(const url of urls)if(url.unresolvedInclude){const entry=context.node('entry',`Django include · ${url.prefix}`,url.path,url.start,url.end,{dictionaryStackId:'django',routeRegistrationVerified:false,unresolvedHandler:url.unresolvedInclude});entry.confidence='unresolved';}
  for(const route of pending){const entry=addRoute(route.product,route.path,route.start,route.end,route.route,route.method,route.target,route.at);const router=route.router?routers.find(router=>router.key===route.router):undefined;if(router){const registration=context.node('entry',`${router.product} ${router.kind==='app'?'app':'router'} · ${router.name}`,router.path,router.start,router.end,{dictionaryStackId:router.product,routerRegistration:true});context.edge(registration,entry,'registers-route',['runtime-flow','function-call-flow'],entry.evidence);}};
}
