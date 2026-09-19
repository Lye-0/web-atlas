import {staticSiteEntries} from '../staticSiteSources';
import {staticNodeScript,declaredPath,type StaticNodeFacts,type StaticValue} from '../staticNodeScript';
import {localPath} from '../projectPaths';
import type {PlatformFlowContext} from './architecturePlatformFlows';
import type {ArchitectureCommand} from './architectureCommands';
import type {SemanticNode,SemanticEvidence} from './types';
import {architectureEvidence} from './architecture';
const key=(...v:string[])=>`architecture:custom:${JSON.stringify(v)}`;
interface CustomUse {path:string;facts:StaticNodeFacts;unit:SemanticNode;purpose:'serve'|'build'}
/** Invoked script only; the caller checks known adapters first. Cache bounded work per invocation context. */
export function staticSiteFlowAdapter(c:PlatformFlowContext){
 const cache=new Map<string,StaticNodeFacts>(),entries=staticSiteEntries(c.input.sources);
 const detect=(cmd:ArchitectureCommand):CustomUse|undefined=>{
  const a=cmd.argv;if(a[0]!=='node'||!a[1]||a[1].startsWith('-'))return;
  const base=cmd.workingDirectory?localPath(cmd.directory,cmd.workingDirectory):cmd.directory;
  const path=base&&localPath(base,a[1]);if(!path||/(?:^|\/)(?:tests?|__tests__|fixtures?|__fixtures__)(?:\/|\.)|\.(?:test|spec)\./i.test(path)||!c.input.sources[path])return;
  const unit=c.owner(cmd.path);if(!unit||!unit.attributes.staticSite&&!(unit.architecture?.context.includes('ブラウザ')&&entries.some(e=>e.root===(unit.architecture?.ownerPath||'.'))))return;
  const id=JSON.stringify([path,base,a.slice(2)]);let facts=cache.get(id);if(!facts){facts=staticNodeScript(path,c.input.sources[path]!,base!,a.slice(2));if(cache.size<256)cache.set(id,facts);else return;}
  const root=unit.architecture?.ownerPath||'.';
  const servers=facts.servers.filter(s=>s.root===root);
  if(servers.length)return {path,facts:{...facts,servers},unit,purpose:'serve'};
  if(facts.writes.some(w=>w.output.values.some(p=>/\.(?:html?|[cm]?js|css)$/.test(p))))return {path,facts,unit,purpose:'build'};
 };
 const describe=(v:StaticValue)=>`${v.values.join(' / ')||'未特定'}${v.conditions.length?' · '+v.conditions.join(' / '):''}${v.unknown?'（実行時の値は未確認）':''}`;
 const apply=(use:CustomUse,cmd:ArchitectureCommand,op:SemanticNode)=>{
  const {path,facts,unit}=use,{input,source,connect,add}=c;
  const ev=(n:{start:number;end:number},reason:string)=>architectureEvidence(path,input.sources[path]!,n.start,n.end-n.start,reason);
  op.label=use.purpose==='serve'?'Node.js：静的ファイル配信':'Node.js：独自ビルド';
  op.attributes.configurationPath=path;op.attributes.inputRoot=unit.architecture!.ownerPath||'.';op.attributes.configurationStatus='呼出元scriptと実装を照合';op.attributes.customStaticOperation=true;
  op.architecture!.context=['Node.jsの独自script・実行未観測'];
  const operationEvidence=[...cmd.evidence,...(use.purpose==='serve'?facts.servers:facts.writes).map(s=>ev(s,'呼出先scriptの静的な配信・出力指定（未実行）'))];op.evidence=operationEvidence;
  connect(source(unit),op,'flow-input','原本を入力にする指定',operationEvidence);
  if(use.purpose==='serve')for(const server of facts.servers){
   const evidence=[...cmd.evidence,ev(server,'同じHTTPサーバーのlisten指定'),...server.sites.map(s=>ev(s,'HTTPサーバーとリクエスト由来ファイルの読み出し・応答'))];
   const settings=[`配信ルート：${server.root}`,`ホストの設定上の既定値：${describe(server.host)}`,`ポートの設定上の既定値：${describe(server.port)}`,'稼働・到達は未観測。ローカル用途からdevelopment環境は推定しない'];
   const target=add(key('server',cmd.id,path,String(server.start)),`${unit.label} · ローカル閲覧用の構成`,'execution-config',evidence,[],{logicalOwnerId:unit.id,configurationPath:path,inputRoot:server.root,executionPlace:'unconfirmed',executionContextLabel:'ローカル閲覧用の構成',providedContent:`静的ファイル配信 · 既定 ${server.host.values.join('/')||'host未特定'}:${server.port.values.join('/')||'port未特定'}`,customStaticDetails:settings},unit.architecture!.entryPaths);
   op.attributes.customStaticDetails=settings;connect(op,target,'flow-starts','静的ファイル配信を起動する指定',evidence);connect(target,unit,'flow-serves','HTML入口とそのファイルを配信する設定',evidence);
  }
  if(use.purpose==='build'){
   // Keep every original write/path/evidence within two output roles, not a file listing in the diagram.
   const groups=new Map<string,typeof facts.writes>();
   for(const w of facts.writes){const preview=!w.update&&w.output.values.some(p=>/\.html?$/.test(p))&&w.inputs.some(p=>/\.html?$/.test(p));const role=preview?'preview':w.output.values.length?'files':'unresolved';groups.set(role,[...groups.get(role)??[],w]);}
   for(const [role,writes]of groups){const evidence=[...cmd.evidence,...writes.flatMap(w=>[ev(w,w.update?'既存ファイルの読み取り・更新':role==='preview'?'単一HTML出力の指定':'ファイル生成の指定'),...w.inputSites.map(r=>ev(r,'この出力に寄与する読み取り'))])];
    const outputs=[...new Set(writes.flatMap(w=>w.output.values))],inputs=[...new Set(writes.flatMap(w=>w.inputs))],details=writes.map(w=>`${w.update?'更新':role==='preview'?'単一HTML生成':'生成'}：${describe(w.output)}${w.output.values.some(p=>p.startsWith('../')||p.startsWith('/'))?' · 解析範囲外の出力指定（走査・書込なし）':''}\n入力：${(w.inputs.length>3?`${w.inputs.length}パス（入力パスの内訳で確認）`:w.inputs.join(' / '))||'動的な読み取り（パス未解決）'}${w.output.unknown?'\n指定式：'+w.expression:''}`);
    const target=add(key('outputs',cmd.id,role),role==='preview'?'単一HTMLプレビュー':role==='files'?'分離ファイル版の出力・更新':'出力先が未解決の生成','artifact',evidence,[],{customStaticOutput:true,customStaticDetails:details,outputPaths:outputs,inputPaths:inputs,artifactState:'ソース内の出力・更新指定。生成済み状態は未観測'},outputs);
    connect(op,target,'flow-generates',role==='files'?'ファイルを生成・更新する指定':'プレビューを生成する指定',evidence);
   }
   op.attributes.inputPaths=[...new Set(facts.writes.flatMap(w=>w.inputs))];
   op.attributes.customStaticDetails=[`実装script：${path}`,`入力：${op.attributes.inputPaths.length}パス（内訳で確認）`,'配信操作との自動連続実行は、この生成指定からは推定しない'];
  }
  op.attributes.resolution='元scriptと読み取り・配信/生成指定を照合。実行・生成・稼働は未観測';
 };
 const documents=()=>{
  for(const unit of c.model.nodes.filter(n=>n.attributes.staticSite)){
   const path=declaredPath(unit.architecture?.ownerPath||'.','README.md'),text=c.input.sources[path];if(!text)continue;
   let deployment=false,fenced=false,offset=0;const records:string[]=[],evidence:SemanticEvidence[]=[];
   for(const line of text.split('\n')){if(/^\s*```/.test(line))fenced=!fenced;const heading=line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);if(heading)deployment=/^(?:deployment|公開先|デプロイ先)$/i.test(heading[1]!);
    if(deployment&&!fenced&&/^\s*(?:https?:\/\/\S+|\[(?:site|website|production|公開先|本番|GitHub Pages)\]\(https?:\/\/[^)]+\))\s*$/i.test(line))for(const m of line.matchAll(/https?:\/\/[^\s<>\])]+/g)){try{const url=new URL(m[0]);if(url.username||url.password||url.search)continue;records.push(`${url.hostname.endsWith('.github.io')?'GitHub Pages · ':''}${url.href}\n公開先としてREADMEに記載。公開手順・公開済み状態・現在の稼働は未確認`);evidence.push(architectureEvidence(path,text,offset+m.index!,m[0].length,'DEPLOYMENT節の公開先記載。公開操作・通信の根拠ではない'));}catch{/* invalid URL remains source text */}}
    offset+=line.length+1;
   }
   if(records.length){unit.attributes.documentedDestinations=records;unit.evidence.push(...evidence);}
  }
 };
 return {detect,apply,documents};
}
