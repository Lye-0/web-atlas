import {parseJsonc} from '../parsers';
import type {ArchitectureModel} from './architecture';
import type {SemanticInput,SemanticNode} from './types';

/** Describe intended position separately from entity kind and existing visibility filters. */
export function describeArchitecturePositioning(model:ArchitectureModel,input:SemanticInput){
 const owners=model.nodes.filter(n=>/^architecture:\["(?:package|manifest|dotnet)",/.test(n.id)).sort((a,b)=>(b.architecture?.ownerPath?.length??0)-(a.architecture?.ownerPath?.length??0)||a.id.localeCompare(b.id));
 const byId=new Map(model.nodes.map(n=>[n.id,n])),definitions=new Set(owners.map(n=>n.id));
 for(const n of owners){
  const path=n.evidence[0]?.path??n.path??'',location=n.architecture?.ownerPath??'';
  let manifest:Record<string,unknown>={};if(path.endsWith('package.json'))try{manifest=parseJsonc(input.sources[path]??'') as Record<string,unknown>;}catch{/* keep the recorded definition */}
  const description=typeof manifest.description==='string'?manifest.description:'',name=typeof manifest.displayName==='string'?manifest.displayName:typeof manifest.name==='string'?manifest.name:'';
  const explicit=/\b(?:for|used for|dedicated to)\s+(?:testing|tests|recording|experiments|benchmarking)\b|(?:検証|実験|記録|テスト)用/.test(description);
  const hint=/\b(?:experiment(?:al)?|capture|recording|benchmark|fixture)\b/i.test(`${name} ${description}`);
  const executable=n.architecture?.kind==='application',shared=n.architecture?.kind==='shared-code';
  n.attributes.compositionRole=explicit?'開発・検証・記録の補助':hint?'補助の用途を示す表記（推定）':shared?'共有コード':executable?'実行構成として定義':'位置づけ未判定';
  n.attributes.compositionReason=explicit?'manifestのdescriptionに補助用途の明示がある':hint?'manifestの名称・説明に補助用途の手掛かりがある。製品で未使用とは断定しない':shared?'既存の参照・共有コードの判定を使用':executable?'既存の入口・起動宣言による判定。プロジェクトの主要構成かどうかとは別':'定義を検出。深さ・workspace外・参照数だけでは主要/補助を決めない';
  n.attributes.compositionEvidencePath=path;
  n.attributes.definitionPath=path;n.attributes.definitionOwnerId=n.id;
  n.attributes.definitionLocation=location&&location!=='.'?`読込プロジェクト配下の個別定義 · ${location}`:'読込プロジェクト直下の定義';
  const workspace=input.projectScopes?.find(scope=>scope.path===path)?.workspaceDeclarations;
  if(workspace?.length)n.attributes.definitionWorkspace=workspace;
 }
 const declaredOwner=(node:SemanticNode):SemanticNode|undefined=>{const seen=new Set<string>();let current:SemanticNode|undefined=node;while(current&&!seen.has(current.id)){if(definitions.has(current.id))return current;seen.add(current.id);current=byId.get(current.architecture?.parentId??String(current.attributes.logicalOwnerId??''));}return undefined;};
 for(const n of model.nodes){if(definitions.has(n.id)||!['application','code-package','shared-code','component','tool-operation','code-definition','artifact','execution-config'].includes(n.architecture?.kind??''))continue;const path=n.architecture?.ownerPath??n.path??n.evidence[0]?.path??'';
  const independent=['application','code-package','shared-code'].includes(n.architecture?.kind??'')&&!n.architecture?.parentId;
  const owner=declaredOwner(n)??(!independent?owners.find(o=>!o.architecture?.ownerPath||path===o.architecture.ownerPath||path.startsWith(o.architecture.ownerPath+'/')):undefined);
  if(owner){for(const key of ['compositionRole','compositionReason','compositionEvidencePath','definitionPath','definitionLocation','definitionOwnerId','definitionWorkspace'])if(owner.attributes[key])n.attributes[key]=owner.attributes[key];}
  else {n.attributes.compositionRole='位置づけ未判定';n.attributes.compositionReason='記録された構成の定義箇所だけでは、所属する個別定義や主要/補助用途を確定できない';n.attributes.definitionPath=n.evidence[0]?.path??n.path??'';n.attributes.definitionLocation=path?`読込プロジェクト配下の構成 · ${path}`:'定義元の位置は未判定';}
 }
}
