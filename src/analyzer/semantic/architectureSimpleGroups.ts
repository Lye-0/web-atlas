import type {SemanticGraph,SemanticNode} from './types';

export interface SimpleGroup {id:string;label:string;reason:string;category:'destination'|'runtime'|'resources'|'unconfirmed';targetIds:string[]}
/** Display groups retain independent members; they never assert entity identity. */
export function simpleStructuralGroups(model:SemanticGraph,allowed:ReadonlySet<string>){
 const byId=new Map(model.nodes.map(n=>[n.id,n])),result=new Map<string,SimpleGroup>(),buckets=new Map<string,{node:SemanticNode;slots:string[]}[]>();
 const destinations=new Set(model.edges.filter(e=>e.kind==='flow-deploys').map(e=>e.target)),starts=new Set(model.edges.filter(e=>e.kind==='flow-starts').map(e=>e.target));
 for(const n of model.nodes){if(!allowed.has(n.id))continue;
  if(n.architecture?.kind==='execution-config'){
   const owner=typeof n.attributes.logicalOwnerId==='string'?n.attributes.logicalOwnerId:'',config=typeof n.attributes.configurationPath==='string'?n.attributes.configurationPath:'';
   const published=destinations.has(n.id),label=published?'公開・配信先':typeof n.attributes.executionContextLabel==='string'?n.attributes.executionContextLabel:starts.has(n.id)?'起動・配信先':'実行構成';
   const id=`architecture-simple:${published?'destination':'runtime'}:${JSON.stringify(owner&&config?[owner,config,n.attributes.executionPlace??'',[...n.architecture.environments].sort()]:['original',n.id])}`;
   result.set(n.id,{id,label:`${byId.get(owner)?.label??n.label}：${label}`,category:published?'destination':'runtime',reason:published?'公開する指定の到着先。環境別の実行・配信構成を保持':starts.has(n.id)?'起動する指定の到着先。原本とは別の実行・配信構成':'確認できた実行構成の設定。対応する起動・公開操作は未確認',targetIds:owner?[owner]:[]});
  }
  if(n.architecture?.kind!=='resource')continue;
  const basis=typeof n.attributes.logicalResourceId==='string'?byId.get(n.attributes.logicalResourceId):n,identity=basis?.architecture?.identity,configs=identity?.configurations??[];
  if(!identity?.type||!configs.length||configs.some(c=>!c.path||!c.binding||!c.evidence.length))continue;
  const roles=[...new Set(configs.map(c=>JSON.stringify([c.path.replaceAll('\\','/'),c.binding])))];if(roles.length!==1)continue;
  const key=JSON.stringify([identity.type,roles[0]]),bucket=buckets.get(key)??[];
  bucket.push({node:n,slots:configs.map(c=>JSON.stringify([c.environment||'default',n.attributes.executionPlace??(n.attributes.logicalResourceId?'local':'configured')]))});buckets.set(key,bucket);
 }
 const destinationBuckets=new Map<string,string[]>();for(const [id,group]of result){const list=destinationBuckets.get(group.id)??[];list.push(id);destinationBuckets.set(group.id,list);}
 for(const ids of destinationBuckets.values()){const environments=ids.map(id=>JSON.stringify([...(byId.get(id)!.architecture?.environments??[])].sort()));if(new Set(environments).size===environments.length)continue;for(const id of ids){const group=result.get(id)!;result.set(id,{...group,id:`${group.id}:${id}`,label:`${byId.get(id)!.label}：${group.category==='destination'?'公開・配信先':'実行構成'}`});}}
 for(const [key,bucket]of buckets){if(bucket.length<2)continue;const slots=bucket.flatMap(b=>b.slots);if(new Set(slots).size!==slots.length)continue;
  const first=bucket[0]!.node,basis=typeof first.attributes.logicalResourceId==='string'?byId.get(first.attributes.logicalResourceId):first,identity=basis!.architecture!.identity!;
  const group:SimpleGroup={id:`architecture-simple:resource-settings:${key}`,label:`${identity.type} · ${identity.configurations[0]!.binding}（環境別の対象）`,category:'resources',reason:'同じ設定ファイル・bindingの役割に対応する環境別の別対象。実体の同一性は統合しません',targetIds:[]};
  for(const {node}of bucket)result.set(node.id,group);
 }
 const unknown=model.nodes.filter(n=>allowed.has(n.id)&&n.architecture?.kind==='code-package'&&!n.architecture.parentId&&!n.architecture.auxiliary&&!String(n.attributes.compositionRole??'').includes('補助'));
 if(unknown.length>1){const group:SimpleGroup={id:'architecture-simple:unconfirmed-code-packages',label:'実行用途を未確認のコード構成',category:'unconfirmed',reason:'独立実行の根拠が未確認のコードパッケージを並べた表示集合。既知の補助用途とは別に保持',targetIds:[]};for(const n of unknown)result.set(n.id,group);}
 return result;
}
