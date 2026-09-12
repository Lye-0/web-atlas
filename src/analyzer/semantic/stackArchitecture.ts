import { directoryFor, parseManifest, type ManifestProject } from '../manifestAdapters';
import type { ArchitectureModel, ArchitectureEntity } from './architecture';
import type { SemanticAnalysis, SemanticEvidence, SemanticInput, SemanticNode } from './types';
import{stackRegistry}from'../stackRegistry';
import { declaredConnections } from '../declarationConnections';

/** Augment the existing semantic ownership model using explicit project/config identities. */
export function addStackArchitecture(model:ArchitectureModel,input:SemanticInput,analysis:SemanticAnalysis):void {
  const getStack=(id:string)=>input.stackMetadata?.[id]??(stackRegistry.some(entry=>entry.stackId===id)?{name:id,aliases:[]}:undefined);
  const sources=new Map(Object.entries(input.sources));const projects:ManifestProject[]=[];
  for(const[path,source]of sources)try{const project=parseManifest(path,source,sources);if(project)projects.push(project,...(project.children??[]));}catch{/* malformed config already carries coverage */}
  const evidence=(path:string,description:string):SemanticEvidence[]=>[{path,start:0,end:input.sources[path]?.length??0,line:1,endLine:input.sources[path]?.split('\n').length??1,description}];
  const add=(id:string,label:string,kind:ArchitectureEntity['kind'],at:SemanticEvidence[],attributes:Partial<ArchitectureEntity>={}):SemanticNode=>{
    const existing=model.nodes.find(node=>node.id===id);if(existing)return existing;
    const architecture:ArchitectureEntity={kind,entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false,...attributes};
    const node:SemanticNode={id,kind:kind==='resource'?'resource':kind==='external-service'||kind==='external-program'?'external':'subsystem',label,path:architecture.ownerPath??at[0]?.path,line:at[0]?.line,group:architecture.parentId?'内部構成':'プロジェクト',confidence:kind==='unresolved'?'unresolved':'source',evidence:at,attributes:{architectureKind:kind,auxiliary:architecture.auxiliary},architecture};model.nodes.push(node);return node;
  };
  const connect=(from:SemanticNode,to:SemanticNode,kind:string,label:string,at:SemanticEvidence[],environment='')=>{
    if(from.id===to.id)return;const id=`architecture:stack:${kind}:${from.id}:${to.id}`;if(model.edges.some(edge=>edge.id===id))return;
    model.edges.push({id,source:from.id,target:to.id,kind,label,views:['architecture-map'],confidence:'source',evidence:at,details:{environment,architectureOrigin:'architecture',architectureRelation:'connection',reason:'ソース/設定に明示された関係。実行や通信の観測ではない'}});
  };
  const projectNodes=new Map<ManifestProject,SemanticNode>();
  for(const project of projects){
    if(project.attributes.solution)continue;const dir=project.directory==='.'?'':project.directory;
    const existing=model.nodes.filter(node=>node.architecture?.ownerPath===dir&&['application','code-package','shared-code'].includes(node.architecture.kind)).sort((a,b)=>Number(b.evidence.some(item=>item.path===project.path))-Number(a.evidence.some(item=>item.path===project.path)))[0];
    const members=analysis.nodes.filter(node=>node.path&&(dir===''||node.path.startsWith(dir+'/'))&&!projects.some(other=>other.directory!==project.directory&&other.directory.startsWith(dir?dir+'/':'')&&other.directory!=='.'&&node.path!.startsWith(other.directory+'/')));
    const entries=members.filter(node=>node.kind==='entry'&&(node.attributes.runtimeEntry||node.attributes.fileRoute||node.attributes.endpoint)&&!node.attributes.test);
    const executable=Boolean(project.attributes.webSdk||/^(?:Exe|WinExe)$/i.test(String(project.attributes.outputType??''))||entries.length&&project.ecosystem!=='nuget');
    const unit=existing??add(`architecture:manifest:${project.path}:${project.directory}`,project.name,executable?'application':'code-package',evidence(project.path,`${project.ecosystem} projectの宣言`),{ownerPath:dir,entryPaths:entries.map(entry=>entry.path!).filter((path,index,all)=>all.indexOf(path)===index),context:[project.ecosystem],files:members.map(node=>node.path!).filter((path,index,all)=>all.indexOf(path)===index),memberIds:members.map(node=>node.id)});
    const runtimeEntries=input.resources.filter(resource=>resource.type==='runtime'&&resource.path===project.path&&resource.entryPath&&resource.attributes?.commandPurpose==='start');
    if(runtimeEntries.length){unit.architecture!.kind='application';unit.attributes.architectureKind='application';unit.architecture!.entryPaths=[...new Set([...unit.architecture!.entryPaths,...runtimeEntries.map(resource=>resource.entryPath!)])];unit.evidence.push(...runtimeEntries.flatMap(resource=>resource.evidence??[]));}
    if(existing&&!existing.evidence.some(item=>/(?:package\.json|\.csproj|pom\.xml|pyproject\.toml|Cargo\.toml)$/.test(item.path))){
      unit.label=project.name;unit.evidence.push(...evidence(project.path,`${project.ecosystem} projectの宣言`));
      if(executable){unit.architecture!.kind='application';unit.attributes.architectureKind='application';unit.architecture!.entryPaths=[...new Set([...unit.architecture!.entryPaths,...entries.map(entry=>entry.path!)])];}
    }
    projectNodes.set(project,unit);
    const added=members.filter(node=>node.attributes.dictionaryStackId);for(const member of added){const product=String(member.attributes.dictionaryStackId);if(!unit.architecture!.technologyNames.includes(product))unit.architecture!.technologyNames.push(product);}
    if(!existing&&entries.length){const roles=[...new Set(entries.map(entry=>entry.attributes.component?'UI':'API'))];for(const label of roles)unit.architecture!.roles.push({label,confidence:'source',reason:'専用adapterが確認した入口・componentの所属',evidence:entries.flatMap(entry=>entry.evidence)});}
  }
  const semanticById=new Map(analysis.nodes.map(node=>[node.id,node]));const ownersByPath=new Map<string,SemanticNode|undefined>();const sortedProjects=[...projectNodes].sort(([a],[b])=>b.directory.length-a.directory.length);
  const owner=(path:string)=>{if(!ownersByPath.has(path))ownersByPath.set(path,sortedProjects.find(([project])=>project.directory==='.'||path.startsWith(project.directory+'/'))?.[1]);return ownersByPath.get(path);};
  // The common architecture pass discovers source groups before non-npm manifests.
  // Transfer those groups to the most specific declared project, retaining semantic IDs.
  for(const component of model.nodes){const arch=component.architecture;if(!arch?.parentId||!['component','shared-code'].includes(arch.kind)||!arch.files.length)continue;
    const owners=[...new Set(arch.files.map(path=>owner(path)).filter((node):node is SemanticNode=>Boolean(node)))];
    const previousParent=model.nodes.find(node=>node.id===arch.parentId);const previousPath=previousParent?.architecture?.ownerPath??'';const nextPath=owners[0]?.architecture?.ownerPath??'';
    if(owners.length===1&&owners[0]!.id!==component.id&&nextPath.length>previousPath.length){arch.parentId=owners[0]!.id;component.group=owners[0]!.label;}
  }
  for(const unit of new Set(projectNodes.values())){const arch=unit.architecture!;arch.files=arch.files.filter(path=>owner(path)?.id===unit.id);arch.memberIds=arch.memberIds.filter(id=>{const member=semanticById.get(id);return !member?.path||owner(member.path)?.id===unit.id;});}
  const resourceNodes=new Map<string,SemanticNode>();const identityNodes=new Map<string,SemanticNode>();
  for(const resource of [...input.resources].sort((a,b)=>Number(a.attributes?.dictionaryStackId==='docker-compose')-Number(b.attributes?.dictionaryStackId==='docker-compose'))){
    const attributes=resource.attributes;if(!attributes?.configurationOccurrence)continue;
    const stackId=String(attributes.dictionaryStackId??'');const environment=String(attributes.environment??'unknown');const role=String(attributes.resourceRole??'external');const project=String(attributes.projectIdentity??'');const identifier=String(attributes.stableIdentity||attributes.endpoint||'');
    if(stackId==='docker-compose'){
      const targetPath=attributes.deploymentTargetPath;const target=typeof targetPath==='string'?[...projectNodes].find(([project])=>project.directory===targetPath)?.[1]:undefined;
      const peer=input.resources.find(candidate=>candidate.id!==resource.id&&candidate.attributes?.dictionaryStackId!=='docker-compose'&&candidate.attributes?.stableIdentity===attributes.stableIdentity&&candidate.path===resource.path);
      const deployed=target??(peer?resourceNodes.get(peer.id):undefined);
      if(deployed){deployed.evidence.push(...(resource.evidence??[]));deployed.architecture!.technologyNames.push('docker-compose');deployed.architecture!.context.push(`Compose service: ${String(attributes.serviceName)}`);deployed.attributes.deploymentConfiguration=resource.path??'';resourceNodes.set(resource.id,deployed);const from=resource.path?owner(resource.path):undefined;if(from)connect(from,deployed,'deployment-config','Composeの明示build / image配置',resource.evidence??[],'deployment');continue;}
    }
    const key=identifier&&project?`${stackId}|${project}|${environment}|${identifier}`:resource.id;
    const legacyKv=stackId==='cloudflare-kv'?model.nodes.filter(node=>node.architecture?.identity?.type==='KV'&&(!attributes.stableIdentity||node.architecture.identity.identifier===attributes.stableIdentity)&&node.architecture.identity.configurations.some(config=>config.path===resource.path&&config.binding===resource.binding&&(config.environment||'default')===environment)):[];
    const existing=identityNodes.get(key)??(legacyKv.length===1?legacyKv[0]:undefined);
    const node=existing??add(`architecture:provider:${key}`,resource.label,resource.type==='database'||resource.type==='storage'?'resource':role==='deployment'?'external-program':'external-service',resource.evidence??[],{ownerPath:resource.path?directoryFor(resource.path):undefined,context:[role==='local'?'ローカル検証環境':role==='delivery'?'配信/公開':role==='deployment'?'配置設定':'外部サービス'],technologyNames:[stackId],environments:[environment],roles:[{label:role==='local'?`${String(attributes.emulatorService??'Suite')} ローカル検証`:role==='delivery'?'配信':role==='deployment'?'配置設定':'外部サービス',confidence:'source',reason:'明示された設定または接続API',evidence:resource.evidence??[]}],auxiliary:false,identity:{status:identifier&&project?'confirmed':'unconfirmed',type:stackId,identifier:identifier||undefined,scope:project||undefined,reason:identifier&&project?'product / project / environment / endpointの明示identity':'設定の存在を確認。安定identityが不足するoccurrenceは統合しない',configurations:[{id:String(attributes.configurationOccurrence),path:resource.path??'',environment,evidence:resource.evidence??[]}]}});
    if(existing)existing.evidence.push(...(resource.evidence??[]));identityNodes.set(key,node);resourceNodes.set(resource.id,node);node.attributes={...node.attributes,...attributes,dictionaryStackId:stackId,resourceRole:role};
    if(legacyKv.length===1)node.architecture!.technologyNames=[...new Set(node.architecture!.technologyNames.map(name=>name==='KV'?'cloudflare-kv':name))];
    if(attributes.assetKind==='package-css'){node.architecture!.kind='resource';node.attributes.architectureKind='resource';const parent=resource.path?owner(resource.path):undefined;if(parent)node.architecture!.parentId=parent.id;node.architecture!.context=['読み込むスタイル資産'];}
    if(attributes.buildOutput){node.kind='resource';node.architecture!.kind='resource';node.attributes.architectureKind='resource';const parent=resource.path?owner(resource.path):undefined;if(parent)node.architecture!.parentId=parent.id;node.architecture!.context=['ビルド成果物の宣言'];}
    if(!model.environments.includes(environment))model.environments.push(environment);
    const occurrences=new Map<string,SemanticEvidence[]>();for(const at of resource.evidence??[]){const list=occurrences.get(at.path)??[];list.push(at);occurrences.set(at.path,list);}if(!occurrences.size&&resource.path)occurrences.set(resource.path,[]);
    for(const[path,at]of occurrences){const from=owner(path);if(from&&!attributes.originOnly&&!(legacyKv.length===1&&model.edges.some(edge=>edge.source===from.id&&edge.target===node.id&&edge.kind==='deployment-config')))connect(from,node,role==='delivery'?'deployment-config':role==='deployment'?'deployment-config':'service-use',role==='delivery'?'配信設定':role==='deployment'?'配置宣言':environment==='local'?'ローカル接続設定':'サービス利用設定',at,environment);if(node.architecture?.identity&&!node.architecture.identity.configurations.some(config=>config.path===path&&(config.environment||'default')===environment))node.architecture.identity.configurations.push({id:`${resource.id}:${path}:${at[0]?.start??0}`,path,environment,evidence:at});}
  }
  for(const resource of input.resources){const node=resourceNodes.get(resource.id);if(!node)continue;const parentId=resource.attributes?.parentResourceId;
    for(const relation of declaredConnections(resource.attributes?.declaredConnections)){const target=resourceNodes.get(relation.targetId);if(target)connect(node,target,relation.kind,relation.label,[{path:relation.path,start:relation.start,end:relation.end,line:input.sources[relation.path]!.slice(0,relation.start).split('\n').length,endLine:input.sources[relation.path]!.slice(0,relation.end).split('\n').length,description:relation.label}],'deployment');}
    if(resource.attributes?.buildOutput)for(const path of Array.isArray(resource.attributes.inputPaths)?resource.attributes.inputPaths:[]){
      const parent=owner(path);if(!parent)continue;
      const components=model.nodes.filter(candidate=>candidate.architecture?.parentId===parent.id&&candidate.architecture.kind==='component'&&candidate.architecture.files.includes(path));
      const component=components[0]??add(`architecture:build-input:${path}`,path,'component',evidence(path,'ビルド設定で入力として指定されたソース'),{parentId:parent.id,ownerPath:directoryFor(path),files:[path],memberIds:analysis.nodes.filter(member=>member.path===path).map(member=>member.id),context:['ビルド入力']});
      connect(component,node,'build-output','入力から成果物へのビルド宣言',resource.evidence??[],'build');
    }
    for(const dependency of Array.isArray(resource.attributes?.deploymentDependencies)?resource.attributes.deploymentDependencies:[]){const target=resourceNodes.get(dependency);if(target)connect(node,target,'deployment-config','Compose depends_onの配置依存',resource.evidence??[],'deployment');}
    if(typeof parentId==='string'){const parent=resourceNodes.get(parentId);if(parent){node.architecture!.parentId=parent.id;connect(parent,node,'contains','個別emulatorを構成',resource.evidence??[],'local');}}
    const origin=resource.attributes?.origin;if(typeof origin==='string'&&!declaredConnections(resource.attributes?.declaredConnections).some(relation=>relation.kind==='delivery-origin')){
      const target=input.resources.find(candidate=>candidate.attributes?.originOnly&&candidate.attributes.endpoint===origin);const to=target?resourceNodes.get(target.id):undefined;if(to)connect(node,to,'deployment-config','originとして配信に利用',resource.evidence??[],String(resource.attributes?.environment??''));
    }
  }
  // Adapter primitives become internal components under the actual declared application.
  for(const semantic of analysis.nodes.filter(node=>node.attributes.component&&node.path)){
    const parent=owner(semantic.path!);if(!parent)continue;
    const existing=model.nodes.find(node=>node.architecture?.parentId===parent.id&&node.architecture.files.includes(semantic.path!));
    if(existing){if(!existing.architecture!.memberIds.includes(semantic.id))existing.architecture!.memberIds.push(semantic.id);continue;}
    add(`architecture:component:${semantic.id}`,semantic.label,'component',semantic.evidence,{parentId:parent.id,ownerPath:directoryFor(semantic.path!),files:[semantic.path!],memberIds:[semantic.id],context:['UI'],technologyNames:[String(semantic.attributes.dictionaryStackId??'')],roles:[{label:'UI',confidence:'source',reason:'template / component宣言',evidence:semantic.evidence}]});
  }
  for(const node of model.nodes){const arch=node.architecture;if(!arch)continue;arch.technologyNames=[...new Set(arch.technologyNames)].filter(Boolean);node.attributes.members=arch.memberIds;node.attributes.files=arch.files;node.attributes.auxiliary=arch.auxiliary;
    for(const name of arch.technologyNames)if(getStack(name)&&!arch.technologies?.some(item=>item.name===name)){(arch.technologies??=[]).push({name,usage:node.attributes.configurationOccurrence||name==='docker-compose'?'configuration':'source',reason:'専用adapterで確認した宣言・参照',declarations:[],evidence:node.evidence});}
    if(typeof node.attributes.dictionaryStackId==='string')node.attributes.technologyName=getStack(node.attributes.dictionaryStackId)?.name??node.attributes.dictionaryStackId;}
}
