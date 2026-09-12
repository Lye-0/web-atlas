import { isMap, parseAllDocuments, parseDocument } from 'yaml';
import { addProviderResource, hclValues } from './providerAdapters';
import { arrayValue, objectValue, textValue, staticBlocks, localPath, directoryFor } from './manifestAdapters';
import type { ExpansionContext } from './expandedScan';
import type { ResourceFact } from './types';
import { connectDeclaration } from './declarationConnections';
interface Directive {name:string;args:string[];children:Directive[];start:number;end:number}
/** Tokenize configuration, retaining original offsets; quoted text is never a directive. */
export function nginxDirectives(source:string):Directive[]{
  const tokens:{text:string;start:number;end:number;punct?:boolean}[]=[];
  for(let i=0;i<source.length;){if(/\s/.test(source[i]!)){i++;continue;}if(source[i]==='#'){while(i<source.length&&source[i]!=='\n')i++;continue;}
    const start=i;const quote=source[i];if(quote==='"'||quote==="'"){i++;let text='';while(i<source.length&&source[i]!==quote){if(source[i]==='\\'&&i+1<source.length)i++;text+=source[i++];}if(source[i]===quote)i++;tokens.push({text,start,end:i});continue;}
    if('{};'.includes(source[i]!)){tokens.push({text:source[i++]!,start,end:i,punct:true});continue;}
    while(i<source.length&&!/[\s{};#]/.test(source[i]!))i++;tokens.push({text:source.slice(start,i),start,end:i});
  }
  let cursor=0;const parse=(depth:number):Directive[]=>{const result:Directive[]=[];if(depth>32)return result;
    while(cursor<tokens.length){if(tokens[cursor]!.punct&&tokens[cursor]!.text==='}'){cursor++;break;}const first=tokens[cursor++]!;if(first.punct)continue;const args:string[]=[];
      while(cursor<tokens.length&&!tokens[cursor]!.punct)args.push(tokens[cursor++]!.text);const boundary=tokens[cursor++];const children=boundary?.text==='{'?parse(depth+1):[];result.push({name:first.text,args,children,start:first.start,end:tokens[cursor-1]?.end??first.end});}
    return result;
  };return parse(0);
}

export function scanDeploymentDetails(context:ExpansionContext):void {
  const resources:ResourceFact[]=[];context.builder.forEachFact(fact=>{if(fact.kind==='resource')resources.push(fact);});
  const warning=(path:string,message:string)=>context.builder.addWarning({id:`warning:deployment:${path}:${message}`,severity:'warning',filePath:path,message});
  const workloads:{id:string;owner:string;namespace:string;labels:Record<string,unknown>}[]=[];
  const services:{id:string;owner:string;namespace:string;name:string;selector:Record<string,unknown>;path:string;start:number;end:number}[]=[];
  const ingresses:{id:string;owner:string;namespace:string;data:Record<string,unknown>;path:string;start:number;end:number}[]=[];
  for(const [path,source]of context.sources){if(!/\.ya?ml$/.test(path))continue;
    for(const doc of parseAllDocuments(source)){if(doc.errors.length||!isMap(doc.contents))continue;const data=objectValue(doc.toJSON()),kind=textValue(data.kind),metadata=objectValue(data.metadata),name=textValue(metadata.name);
      if(typeof data.apiVersion!=='string'||!name||!['Deployment','StatefulSet','DaemonSet','Service','Ingress'].includes(kind))continue;
      const namespace=textValue(metadata.namespace)||'default',owner=context.owner(path)?.directory??'.';const start=doc.range?.[0]??0,end=doc.range?.[1]??source.length,spec=objectValue(data.spec);
      const existing=resources.find(fact=>fact.dictionaryStackId==='kubernetes'&&fact.filePath===path&&fact.metadata.kind===kind&&fact.label===`${kind} · ${name}`);
      const id=existing?.id??addProviderResource(context,{stackId:'kubernetes',path,start,end,name:`${kind} · ${name}`,type:'other',environment:namespace,identity:`${owner}:${namespace}:${kind}:${name}:${path}`,role:'deployment',attributes:{kind}});
      const fact=context.builder.getFact(id)!;Object.assign(fact.metadata,{kubernetesName:name,namespace,namespaceSource:metadata.namespace?'declared':'default',kind});
      if(kind==='Service'){const selector=objectValue(spec.selector);fact.metadata.selector=JSON.stringify(selector);fact.metadata.ports=JSON.stringify(spec.ports??[]);services.push({id,owner,namespace,name,selector,path,start,end});}
      else if(kind==='Ingress'){fact.metadata.rules=JSON.stringify(spec.rules??[]);ingresses.push({id,owner,namespace,data:spec,path,start,end});}
      else{const labels=objectValue(objectValue(objectValue(spec.template).metadata).labels);fact.metadata.podLabels=JSON.stringify(labels);workloads.push({id,owner,namespace,labels});}
    }
  }
  for(const service of services){const selector=Object.entries(service.selector);if(!selector.length)continue;const matches=workloads.filter(workload=>workload.owner===service.owner&&workload.namespace===service.namespace&&selector.every(([key,value])=>workload.labels[key]===value));
    for(const target of matches)connectDeclaration(context,service.id,target.id,'selects-workload','Service selectorで指定されたworkload',service.path,service.start,service.end);
    if(!matches.length)warning(service.path,`Service ${service.name}: selectorの対象は選択範囲内で未解決`);
  }
  for(const ingress of ingresses){const backends=[objectValue(ingress.data.defaultBackend),...arrayValue(ingress.data.rules).flatMap(rule=>arrayValue(objectValue(objectValue(rule).http).paths).map(entry=>objectValue(objectValue(entry).backend)))];
    for(const backend of backends){const service=objectValue(backend.service),name=textValue(service.name);if(!name)continue;const matches=services.filter(target=>target.owner===ingress.owner&&target.namespace===ingress.namespace&&target.name===name);
      if(matches.length===1)connectDeclaration(context,ingress.id,matches[0]!.id,'routes-to-service',`Ingress → Service ${name}（${JSON.stringify(service.port??{})}）`,ingress.path,ingress.start,ingress.end);else warning(ingress.path,`Ingress backend ${name}: Serviceは未解決または曖昧`);
    }
  }
  for(const [path,source]of context.sources){
    if(/(?:^|\/)(?:httpd|apache2)\.conf$/.test(path)){
      const root=resources.find(resource=>resource.dictionaryStackId==='apache-http-server'&&resource.filePath===path);
      const code=source.replace(/^\s*#.*$/gm,match=>match.replace(/[^\r\n]/g,' '));
      if(root)for(const match of code.matchAll(/^\s*<VirtualHost\s+([^>\r\n]+)>([\s\S]*?)<\/VirtualHost\s*>/gm)){
        const start=match.index!,end=start+match[0].length;
        const id=addProviderResource(context,{stackId:'apache-http-server',path,start,end,name:`Apache VirtualHost · ${match[1]}`,type:'other',environment:'deployment',role:'delivery',attributes:{virtualHost:match[1]!}});
        connectDeclaration(context,root.id,id,'declares-server','VirtualHostの明示宣言',path,start,end);
        for(const directive of match[0].matchAll(/^\s*(ServerName|DocumentRoot|ProxyPass)\s+([^\r\n]+)/gm)){
          const args=[...directive[2]!.matchAll(/"([^"]*)"|'([^']*)'|([^\s]+)/g)].map(item=>item[1]??item[2]??item[3]!);const from=start+directive.index!,to=from+directive[0].length;const fact=context.builder.getFact(id)!;
          if(directive[1]==='ServerName')fact.metadata.serverName=args[0]??'';
          if(directive[1]==='DocumentRoot')fact.metadata.documentRoot=args[0]??'';
          if(directive[1]==='ProxyPass'&&args[1]&&/^https?:\/\//.test(args[1])&&!args[1].includes('$')){const endpoint=args[1];const target=addProviderResource(context,{stackId:'apache-http-server',path,start:from,end:to,name:`Proxy origin · ${endpoint}`,type:'other',environment:'deployment',endpoint,role:'external',attributes:{originOnly:true}});connectDeclaration(context,id,target,'proxy-pass',`ProxyPass ${args[0]} → ${endpoint}`,path,from,to);}
        }
      }
    }
    if(path.split('/').at(-1)==='nginx.conf'){
      const root=resources.find(resource=>resource.dictionaryStackId==='nginx'&&resource.filePath===path);if(!root)continue;
      const expand=(directives:Directive[],file:string,seen=new Set<string>(),depth=0):{directive:Directive;path:string}[]=>directives.flatMap(directive=>{
        if(directive.name!=='include')return[{directive,path:file}];const target=localPath(directoryFor(file),directive.args[0]??'');if(depth>=8||!target||seen.has(target)||!context.sources.has(target)){warning(file,'NGINX includeは未解決・循環・範囲外');return[];}
        return expand(nginxDirectives(context.sources.get(target)!),target,new Set([...seen,file,target]),depth+1);
      });
      const flatten=(entries:{directive:Directive;path:string}[],depth=0):{directive:Directive;path:string}[]=>depth>=16?[]:entries.flatMap(entry=>[entry,...flatten(expand(entry.directive.children,entry.path),depth+1)]);
      const directives=flatten(expand(nginxDirectives(source),path));const groups=new Map<string,string[]>();
      for(const {directive:d,path:file}of directives.filter(entry=>entry.directive.name==='upstream')){
        const name=d.args[0];if(!name)continue;const id=addProviderResource(context,{stackId:'nginx',path:file,start:d.start,end:d.end,name:`NGINX upstream · ${name}`,type:'other',environment:'deployment',role:'delivery',attributes:{upstream:name}});groups.set(name,[...(groups.get(name)??[]),id]);
        for(const member of d.children.filter(child=>child.name==='server')){const endpoint=member.args[0];if(!endpoint||endpoint.includes('$'))continue;const to=addProviderResource(context,{stackId:'nginx',path:file,start:member.start,end:member.end,name:`Upstream server · ${endpoint}`,type:'other',endpoint,environment:'deployment',role:'external',attributes:{originOnly:true}});connectDeclaration(context,id,to,'upstream-server','upstreamに宣言されたserver',file,member.start,member.end);}
      }
      for(const {directive:server,path:file}of directives.filter(entry=>entry.directive.name==='server'&&entry.directive.children.length)){
        const names=server.children.filter(child=>child.name==='server_name').flatMap(child=>child.args);const serverId=addProviderResource(context,{stackId:'nginx',path:file,start:server.start,end:server.end,name:`NGINX server · ${names.join(', ')||'default'}`,type:'other',environment:'deployment',role:'delivery',attributes:{serverNames:names}});connectDeclaration(context,root.id,serverId,'declares-server','HTTP serverの宣言',file,server.start,server.end);
        for(const location of server.children.filter(child=>child.name==='location')){const locationId=addProviderResource(context,{stackId:'nginx',path:file,start:location.start,end:location.end,name:`location · ${location.args.join(' ')}`,type:'other',environment:'deployment',role:'delivery',attributes:{location:location.args.join(' ')}});connectDeclaration(context,serverId,locationId,'declares-location','server内のlocation',file,location.start,location.end);
          for(const proxy of location.children.filter(child=>child.name==='proxy_pass')){const target=proxy.args[0];if(!target||target.includes('$')){warning(file,'proxy_passの変数は未評価');continue;}let url:URL;try{url=new URL(target);}catch{warning(file,'proxy_passのURLは未解決');continue;}
            const group=groups.get(url.hostname);let targetId:string|undefined;if(group?.length===1)targetId=group[0];else if(!group)targetId=addProviderResource(context,{stackId:'nginx',path:file,start:proxy.start,end:proxy.end,name:`Proxy origin · ${target}`,type:'other',endpoint:target,environment:'deployment',role:'external',attributes:{originOnly:true}});
            if(targetId)connectDeclaration(context,locationId,targetId,'proxy-pass',`proxy_pass ${target}`,file,proxy.start,proxy.end);else warning(file,'proxy_passのupstreamは曖昧');
          }
        }
      }
    }
    if(/\.github\/workflows\/.*\.ya?ml$/.test(path)){
      const doc=parseDocument(source);if(doc.errors.length)continue;const jobs=objectValue(objectValue(doc.toJSON()).jobs);
      for(const [name,raw]of Object.entries(jobs)){const steps=arrayValue(objectValue(raw).steps).map(objectValue);const deployments=resources.filter(resource=>resource.dictionaryStackId==='github-pages'&&resource.filePath===path&&resource.metadata.workflowJob===name);
        for(const [index,step]of steps.entries()){if(textValue(step.uses).split('@')[0]!=='actions/upload-pages-artifact')continue;const config=objectValue(step.with);const element=doc.getIn(['jobs',name,'steps',index],true)as{range?:number[]};const start=element?.range?.[0]??0,end=element?.range?.[1]??source.length;
          const artifact=addProviderResource(context,{stackId:'github-pages',path,start,end,name:`Pages artifact · ${textValue(config.name)||'github-pages'}`,type:'other',environment:'build',role:'deployment',attributes:{artifactName:textValue(config.name)||'github-pages',outputPath:textValue(config.path)||'_site/',outputPathSource:config.path?'declared':'action-default',workflowJob:name,buildOutput:true,inputPaths:[]}});
          for(const deployment of deployments)connectDeclaration(context,deployment.id,artifact,'publishes-artifact','Pagesへ公開するartifactの宣言',path,start,end);
        }
      }
    }
    if(/\.tf$/.test(path)){
      const blocks=staticBlocks(source).filter(block=>block.type==='resource');
      for(const block of blocks.filter(block=>block.labels[0]==='bunnynet_pullzone_hostname')){const values=hclValues(block.body).attributes;const reference=block.body.match(/\bpullzone\s*=\s*bunnynet_pullzone\.(\w+)\.id\b/)?.[1];const targets=resources.filter(resource=>resource.dictionaryStackId==='bunny-cdn'&&resource.metadata.resourceName===reference&&context.owner(resource.filePath??'')?.directory===context.owner(path)?.directory);const domain=textValue(values.name);if(targets.length!==1||!domain)continue;const target=targets[0]!;target.metadata.cdnDomains=[...new Set([...(Array.isArray(target.metadata.cdnDomains)?target.metadata.cdnDomains:[]),domain])];const id=addProviderResource(context,{stackId:'bunny-cdn',path,start:block.start,end:block.end,name:`CDN domain · ${domain}`,type:'other',environment:'deployment',endpoint:domain,role:'delivery',attributes:{cdnDomain:domain}});connectDeclaration(context,id,target.id,'cdn-domain','CDN hostnameが参照するPull Zone',path,block.start,block.end);}
    }
  }
}
