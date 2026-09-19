import { argumentsAt } from './pythonRoutes';
import type { AdapterContext } from './stackSemantics';
import type { SemanticEvidence, SemanticNode } from './types';

const literal=(text:string|undefined)=>text?.match(/^(['"])(.*?)\1$/)?.[2];
const join=(prefix:string,path:string)=>('/'+prefix+'/'+path).replace(/\/+/g,'/');
export function addNativeRegistrations(context:AdapterContext){
  const removed=new Set<string>();const pending:{product:string;path:string;start:number;end:number;endpoint:string;method:string;handler:SemanticNode;at:SemanticEvidence[]}[]=[];
  const ev=(path:string,start:number,end:number,description:string):SemanticEvidence=>{const source=context.input.sources[path]!;return{path,start,end,line:source.slice(0,start).split('\n').length,endLine:source.slice(0,end).split('\n').length,description};};
  const remove=(path:string,start:number,end:number)=>{for(const entry of context.analysis.nodes)if(entry.kind==='entry'&&entry.path===path&&entry.attributes.endpoint&&entry.evidence.some(at=>at.start<end&&at.end>start))removed.add(entry.id);};
  for(const file of context.files.values()){
    const functions=context.analysis.nodes.filter(node=>node.kind==='function'&&!node.attributes.initializer&&node.path===file.path);
    const scope=(position:number)=>context.owner(file.path,position)?.id;
    const shadowed=(name:string,position:number)=>{const owner=context.owner(file.path,position);return Array.isArray(owner?.attributes.parameters)&&owner.attributes.parameters.includes(name);};
    const handler=(name:string,position:number)=>shadowed(name,position)?undefined:context.handler(file.path,name);
    if(file.path.endsWith('.go')&&file.products.has('gin')){
      const routers:{name:string;prefix:string;start:number;owner?:string;at:SemanticEvidence[]}[]=[];
      for(const match of file.code.matchAll(/\b(\w+)\s*:?=\s*(\w+)\.(?:Default|New)\s*\(/g))if(file.imports.get(match[2]!)?.module==='github.com/gin-gonic/gin'&&!shadowed(match[2]!,match.index!))routers.push({name:match[1]!,prefix:'',start:match.index!,owner:scope(match.index!),at:[]});
      const find=(name:string,position:number)=>{const candidates=routers.filter(router=>router.name===name&&router.start<position&&router.owner===scope(position));return !shadowed(name,position)&&candidates.length===1?candidates[0]:undefined;};
      for(let pass=0;pass<8;pass++){let changed=false;for(const match of file.code.matchAll(/\b(\w+)\s*:?=\s*(\w+)\.Group\s*\(/g)){if(routers.some(router=>router.start===match.index))continue;const parent=find(match[2]!,match.index!);const call=argumentsAt(file.source,file.code,match.index!);const prefix=literal(call?.args[0]?.text);if(!parent||!call||prefix===undefined)continue;routers.push({name:match[1]!,prefix:join(parent.prefix,prefix),start:match.index!,owner:scope(match.index!),at:[...parent.at,ev(file.path,match.index!,call.end,'Gin Groupのprefix登録')]});changed=true;}if(!changed)break;}
      for(const match of file.code.matchAll(/\b(\w+)\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g)){const router=find(match[1]!,match.index!);const call=argumentsAt(file.source,file.code,match.index!);if(!router||!call)continue;const path=literal(call.args[0]?.text),target=handler(call.args.at(-1)?.text??'',match.index!);if(path===undefined||!target)continue;remove(file.path,match.index!,call.end);pending.push({product:'gin',path:file.path,start:match.index!,end:call.end,endpoint:join(router.prefix,path),method:match[2]!,handler:target,at:router.at});}
    }
    if(file.path.endsWith('.rs')&&file.products.has('axum')){
      const constructors=[...file.code.matchAll(/\b(\w+)::new\s*\(\s*\)/g)].filter(match=>file.imports.get(match[1]!)?.module==='axum::Router'&&!context.analysis.nodes.some(node=>node.kind==='model'&&node.path===file.path&&node.label===match[1]));
      const routers=constructors.map(match=>{const begin=Math.max(file.code.lastIndexOf(';',match.index!),file.code.lastIndexOf('\n',match.index!),file.code.lastIndexOf('{',match.index!))+1;const prefix=file.code.slice(begin,match.index!);return{start:match.index!,end:file.code.indexOf(';',match.index!)<0?context.owner(file.path,match.index!)?.evidence[0]?.end??file.code.length:file.code.indexOf(';',match.index!),name:prefix.match(/\blet\s+(?:mut\s+)?(\w+)(?:\s*:[^=]+)?\s*=\s*$/)?.[1],owner:scope(match.index!)};});
      const receiver=(position:number)=>routers.filter(router=>router.start<position&&router.end>=position&&router.owner===scope(position)).sort((a,b)=>b.start-a.start)[0];
      const mounts:{from:number;to:number;prefix:string;at:SemanticEvidence}[]=[];
      for(const match of file.code.matchAll(/\.nest\s*\(/g)){const from=receiver(match.index!);const call=argumentsAt(file.source,file.code,match.index!);const prefix=literal(call?.args[0]?.text);const argument=call?.args[1];const to=argument?routers.filter(router=>router.owner===scope(match.index!)&&(router.name===argument.text||router.start>=argument.start&&router.start<argument.end)):[];if(from&&call&&prefix!==undefined&&to.length===1)mounts.push({from:from.start,to:to[0]!.start,prefix,at:ev(file.path,match.index!,call.end,'Axum nestのprefix登録')});}
      const prefixes=(start:number,seen=new Set<number>()):{prefix:string;at:SemanticEvidence[]}[]=>{if(seen.has(start)||seen.size>=8)return[];const parents=mounts.filter(mount=>mount.to===start);return parents.length?parents.flatMap(parent=>prefixes(parent.from,new Set([...seen,start])).map(prior=>({prefix:join(prior.prefix,parent.prefix),at:[...prior.at,parent.at]}))):[{prefix:'',at:[]}];};
      for(const match of file.code.matchAll(/\.route\s*\(/g)){const router=receiver(match.index!);const call=argumentsAt(file.source,file.code,match.index!);if(!router||!call)continue;const path=literal(call.args[0]?.text),method=call.args[1]?.text.match(/^(\w+)\s*\(\s*(\w+)\s*\)$/);const imported=method?file.imports.get(method[1]!):undefined;const target=method?handler(method[2]!,match.index!):undefined;if(path===undefined||!method||!imported?.module.startsWith('axum::routing::')||!target)continue;remove(file.path,router.start,call.end);for(const prefix of prefixes(router.start))pending.push({product:'axum',path:file.path,start:match.index!,end:call.end,endpoint:join(prefix.prefix,path),method:imported.symbol.toUpperCase(),handler:target,at:prefix.at});}
    }
    if(file.path.endsWith('.rs')&&file.products.has('actix-web')){
      for(const match of file.code.matchAll(/\b(\w+)::new\s*\(\s*\)\s*\.service\s*\(/g)){if(file.imports.get(match[1]!)?.module!=='actix_web::App')continue;const serviceStart=file.code.indexOf('.service',match.index!);const call=argumentsAt(file.source,file.code,serviceStart);const target=call?handler(call.args[0]?.text??'',match.index!):undefined;if(!call||!target)continue;const entries=context.analysis.edges.filter(edge=>edge.kind==='handles'&&edge.target===target.id).flatMap(edge=>context.analysis.nodes.find(node=>node.id===edge.source&&node.attributes.dictionaryStackId==='actix-web')??[]);if(!entries.length)continue;const at=ev(file.path,match.index!,call.end,'Actix App serviceの明示登録');const registration=context.node('operation','Actix service登録',file.path,at.start,at.end,{dictionaryStackId:'actix-web',operation:'registration'});const owner=context.owner(file.path,match.index!);if(owner)context.edge(owner,registration,'executes',['runtime-flow'],[at]);for(const entry of entries)context.edge(registration,entry,'registers-service',['runtime-flow','function-call-flow'],[at,...entry.evidence]);}
      if(file.imports.get('web')?.module==='actix_web::web')for(const fn of functions){const header=file.code.slice(fn.evidence[0]!.start,fn.evidence[0]!.end).split('{')[0]!;for(const match of header.matchAll(/\bweb::(Json|Path|Query)\s*<\s*(\w+)\s*>/g)){const models=context.analysis.nodes.filter(node=>node.kind==='model'&&node.path===file.path&&node.label===match[2]);if(models.length===1)context.edge(models[0]!,fn,'extractor-input',['data-flow','data-model'],[ev(file.path,fn.evidence[0]!.start+match.index!,fn.evidence[0]!.start+match.index!+match[0].length,'Actixの型付きextractor入力')]);}}
    }
    if(file.path.endsWith('.cs')&&file.products.has('aspnet-core')&&/\busing\s+Microsoft\.AspNetCore\.Mvc\s*;/.test(file.code)){
      if(/\bclass\s+(?:ControllerBase|HttpGetAttribute|ApiControllerAttribute)\b/.test(file.code))continue;
      const configured=[...context.files.values()].some(candidate=>{
        if(candidate.project?.directory!==file.project?.directory||/\bclass\s+WebApplication\b/.test(candidate.code))return false;
        const ownerAt=(at:number)=>context.owner(candidate.path,at)?.id;
        for(const builder of candidate.code.matchAll(/\b(?:var|WebApplicationBuilder)\s+(\w+)\s*=\s*WebApplication\.CreateBuilder\s*\(/g)){
          const name=builder[1]!, owner=ownerAt(builder.index!);
          for(const app of candidate.code.matchAll(/\b(?:var|WebApplication)\s+(\w+)\s*=\s*(\w+)\.Build\s*\(\s*\)/g)){
            if(app[2]!==name||app.index!<builder.index!||ownerAt(app.index!)!==owner)continue;
            for(const mapping of candidate.code.matchAll(/\b(\w+)\.MapControllers\s*\(/g)){
              if(mapping[1]!==app[1]||mapping.index!<app.index!||ownerAt(mapping.index!)!==owner)continue;
              const between=candidate.code.slice(app.index!+app[0].length,mapping.index!);
              if(!new RegExp('\\b'+app[1]+'\\s*=(?!=)').test(between))return true;
            }
          }
        }
        return false;
      });
      for(const controller of context.analysis.nodes.filter(node=>node.kind==='model'&&node.path===file.path)){
        const at=controller.evidence[0]!;const definition=file.source.slice(at.start,at.end),code=file.code.slice(at.start,at.end);if(!/\bclass\s+\w+\s*:\s*ControllerBase\b/.test(code)||!code.includes('[ApiController'))continue;const prefix=definition.match(/\[Route\s*\(\s*"([^"]*)"\s*\)\]/)?.[1];if(prefix===undefined)continue;
        for(const fn of functions.filter(fn=>fn.attributes.className===controller.label)){const range=fn.evidence[0]!;const header=file.source.slice(range.start,range.end).split('{')[0]!,headerCode=file.code.slice(range.start,range.end).split('{')[0]!;const attribute=header.match(/\[(Http(Get|Post|Put|Patch|Delete|Head|Options))(?:\s*\(\s*"([^"]*)"\s*\))?\]/);if(!attribute||!headerCode.includes('['+attribute[1]))continue;remove(file.path,range.start,range.end);if(!configured)continue;pending.push({product:'aspnet-core',path:file.path,start:range.start+attribute.index!,end:range.start+attribute.index!+attribute[0].length,endpoint:join(prefix.replaceAll('[controller]',controller.label.replace(/Controller$/,'')),attribute[3]??'').replace(/\/$/,'')||'/',method:attribute[2]!.toUpperCase(),handler:fn,at:[ev(file.path,at.start,at.start+definition.indexOf('{'),'ASP.NET Core Controllerの明示属性')]});}
      }
    }
  }
  context.analysis.nodes=context.analysis.nodes.filter(node=>!removed.has(node.id));context.analysis.edges=context.analysis.edges.filter(edge=>!removed.has(edge.source)&&!removed.has(edge.target));
  for(const route of pending){const entry=context.node('entry',`${route.method} ${route.endpoint}`,route.path,route.start,route.end,{dictionaryStackId:route.product,endpoint:route.endpoint,method:route.method,routeRegistrationVerified:true});entry.evidence.push(...route.at);context.edge(entry,route.handler,'handles',['runtime-flow','function-call-flow'],entry.evidence);route.handler.attributes.entry=true;route.handler.attributes.dictionaryStackId=route.product;}
}
