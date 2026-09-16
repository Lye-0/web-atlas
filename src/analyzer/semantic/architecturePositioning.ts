import {parseJsonc} from '../parsers';
import type {ArchitectureModel} from './architecture';
import type {SemanticInput} from './types';

/** Describe intended position separately from entity kind and existing visibility filters. */
export function describeArchitecturePositioning(model:ArchitectureModel,input:SemanticInput){
 const owners=model.nodes.filter(n=>n.id.startsWith('architecture:["package",')).sort((a,b)=>(b.architecture?.ownerPath?.length??0)-(a.architecture?.ownerPath?.length??0));
 for(const n of owners){
  const path=n.evidence.find(e=>e.path.endsWith('package.json'))?.path;if(!path)continue;
  let manifest:Record<string,unknown>;try{manifest=parseJsonc(input.sources[path]??'') as Record<string,unknown>;}catch{continue;}
  const description=typeof manifest.description==='string'?manifest.description:'',name=typeof manifest.displayName==='string'?manifest.displayName:typeof manifest.name==='string'?manifest.name:'';
  const explicit=/\b(?:for|used for|dedicated to)\s+(?:testing|tests|recording|experiments|benchmarking)\b|(?:検証|実験|記録|テスト)用/.test(description);
  const hint=/\b(?:experiment(?:al)?|capture|recording|benchmark|fixture)\b/i.test(`${name} ${description}`);
  n.attributes.compositionRole=explicit?'開発・検証・記録の補助':hint?'補助の用途を示す表記（推定）':!n.architecture?.ownerPath?'ルートで定義された構成':'位置づけ未判定';
  n.attributes.compositionReason=explicit?'manifestのdescriptionに補助用途の明示がある':hint?'manifestの名称・説明に補助用途の手掛かりがある。製品で未使用とは断定しない':!n.architecture?.ownerPath?'ルートmanifestで確認。配下の全構成が製品本体である意味ではない':'独立したmanifestを確認。workspace外・参照数・フォルダー名だけでは用途を決めない';
  n.attributes.compositionEvidencePath=path;
 }
 for(const n of model.nodes){if(n.attributes.compositionRole||!['application','code-package','shared-code','component','tool-operation','code-definition','artifact','execution-config'].includes(n.architecture?.kind??''))continue;const path=n.architecture?.ownerPath??n.path??n.evidence[0]?.path??'';
  const owner=owners.find(o=>!o.architecture?.ownerPath||path===o.architecture.ownerPath||path.startsWith(o.architecture.ownerPath+'/'));
  if(owner)for(const key of ['compositionRole','compositionReason','compositionEvidencePath'])if(owner.attributes[key])n.attributes[key]=owner.attributes[key];
 }
}
