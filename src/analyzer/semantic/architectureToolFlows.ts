import { parseJsonc } from '../parsers';
import { localPath } from '../projectPaths';
import { architectureSyntax } from './architectureSyntax';
import { architectureToml } from './architectureToml';
import { uniqueArchitectureEvidence } from './architectureEvidence';
import type { ArchitectureCommand } from './architectureCommands';
import type { ArchitectureEntity, ArchitectureModel } from './architecture';
import type { SemanticInput, SemanticNode, SemanticEvidence, SemanticEdge } from './types';

const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const str=(v:unknown)=>typeof v==='string'?v:'';
const key=(...parts:string[])=>`architecture:flow:${JSON.stringify(parts)}`;
const dir=(p:string)=>p.split('/').slice(0,-1).join('/')||'.';
const option=(args:string[],...keys:string[])=>{for(const k of keys){const i=args.indexOf(k);if(i>=0)return args[i+1]??'';const eq=args.find(a=>a.startsWith(k+'='));if(eq)return eq.slice(k.length+1);}return undefined;};
const staticPath=(base:string,value:string|undefined)=>value&&!/[$`*]/.test(value)?localPath(base,value):undefined;
const purposes:Record<string,string>={start:'起動',serve:'開発配信',build:'ビルド',deploy:'公開',generate:'SQL生成',apply:'DB変更の適用'};

/** Add usage-specific preparation paths to the same canonical architecture graph.
 * Source/configuration are data: never load or execute project modules. */
export function addArchitectureToolFlows(model:ArchitectureModel,input:SemanticInput):void {
  if(!input.commands?.length)return;
  const byId=new Map(model.nodes.map(n=>[n.id,n]));
  const initialEdges=[...model.edges];
  const sourcePaths=Object.keys(input.sources);
  const units=model.nodes.filter(n=>['application','code-package','shared-code'].includes(n.architecture?.kind??'')).sort((a,b)=>(b.architecture?.ownerPath?.length??0)-(a.architecture?.ownerPath?.length??0));
  const owner=(path:string)=>units.find(n=>!n.architecture?.ownerPath||path.startsWith(n.architecture.ownerPath+'/'));
  const at=(path:string,reason:string):SemanticEvidence[]=>[{path,start:0,end:input.sources[path]?.length??0,line:1,endLine:input.sources[path]?.split('\n').length??1,description:reason}];
  const config=(path:string)=>{try{return path.endsWith('.toml')?architectureToml(input.sources[path]??'').config:/\.jsonc?$/.test(path)?obj(parseJsonc(input.sources[path]??'')):architectureSyntax(path,input.sources[path]??'').config??{};}catch{return{};}};
  const add=(id:string,label:string,kind:ArchitectureEntity['kind'],evidence:SemanticEvidence[],environments:string[]=[],attributes:SemanticNode['attributes']={},files:string[]=[]):SemanticNode=>{
    const existing=byId.get(id);if(existing){existing.evidence=uniqueArchitectureEvidence([...existing.evidence,...evidence]);return existing;}
    const node:SemanticNode={id,label,kind:kind==='tool-operation'?'operation':kind==='artifact'?'resource':'subsystem',path:files[0]??evidence[0]?.path,line:evidence[0]?.line,group:environments.join(' / ')||'共通・環境未特定',confidence:'source',evidence,
      attributes:{...attributes,architectureKind:kind,unifiedFlow:true,observed:false},architecture:{kind,entryPaths:[],roles:[],environments,context:[],memberIds:[],files,technologyNames:[],auxiliary:Boolean(evidence[0]&&owner(evidence[0].path)?.architecture?.auxiliary),ownerPath:typeof attributes.ownerPath==='string'?attributes.ownerPath:undefined}};
    if(kind==='execution-config'||kind==='artifact'||kind==='code-definition')node.architecture!.roles=[{label:kind==='artifact'?'操作の入力・出力として指定された成果物':kind==='code-definition'?'操作の入力となるコード・定義':'起動・公開の対象となる実行構成',confidence:'source',reason:'元のコード・設定と操作の対応。実行や生成は未観測',evidence}];
    byId.set(id,node);model.nodes.push(node);return node;
  };
  const edgeIds=new Set(model.edges.map(e=>e.id));
  const connect=(from:SemanticNode,to:SemanticNode,kind:string,label:string,evidence:SemanticEvidence[],environment='',original?:SemanticEdge)=>{
    const id=key('edge',from.id,to.id,kind,environment,original?.id??'');if(edgeIds.has(id))return;
    edgeIds.add(id);model.edges.push({id,source:from.id,target:to.id,kind,label,confidence:original?.confidence??'source',evidence,views:['architecture-map'],provenance:original?{edges:original.provenance?.edges??[original]}:undefined,
      details:{...original?.details,environment,architectureOrigin:'architecture',reason:'ソース・設定上の対応。起動・生成・公開・適用・通信はいずれも未観測。',sourceEdgeIds:original?[original.id]:undefined}});
  };
  const artifact=(path:string,kind:string,evidence:SemanticEvidence[],environment='')=>add(key('artifact',path,environment),`${path.split('/').at(-1)} · ${kind}`,'artifact',evidence,environment?[environment]:[],{artifactPath:path,artifactState:sourcePaths.some(p=>p.startsWith(path+'/'))?'ファイルを確認・生成/適用は未観測':'出力先の指定・生成未確認'},[path]);
  const source=(unit:SemanticNode)=>add(key('code',unit.id),`${unit.label} · コード`,'code-definition',unit.evidence,[],{logicalOwnerId:unit.id,ownerPath:unit.architecture?.ownerPath??''},unit.architecture?.files??[]);
  const resourceAt=(original:SemanticNode,place:string,environment:string,evidence:SemanticEvidence[])=>{
    if(place!=='local')return original;
    const node=add(key('local-resource',original.id,environment),`${original.label} · local`,'resource',uniqueArchitectureEvidence([...original.evidence,...evidence]),[environment||'default'],{logicalResourceId:original.id,executionPlace:'local',dictionaryStackId:original.attributes.dictionaryStackId??original.architecture?.technologyNames[0]??''},original.architecture?.files);
    node.architecture!.context=['ローカルのリソース構成'];return node;
  };
  const execution=(unit:SemanticNode,path:string,environment:string,place:string,evidence:SemanticEvidence[])=>{
    const runtime=add(key('execution',unit.id,path,environment,place),`${unit.label} · ${environment||'既定設定'}${place==='local'?' / local':''}`,'execution-config',evidence,[environment||'default'],{logicalOwnerId:unit.id,executionPlace:place,configurationPath:path,ownerPath:unit.architecture?.ownerPath??''},unit.architecture?.entryPaths??[]);
    runtime.architecture!.context=unit.architecture?.context??[];
    connect(source(unit),runtime,'flow-configures','実行構成のコード',evidence,environment);
    const belongs=(id:string)=>{let n=byId.get(id);const seen=new Set<string>();while(n&&!seen.has(n.id)){if(n.id===unit.id)return true;seen.add(n.id);n=byId.get(n.architecture?.parentId??'');}return false;};
    for(const original of initialEdges.filter(e=>belongs(e.source)&&(e.details?.environment??'')===environment)){
      const target=byId.get(original.target);if(!target)continue;
      const settings=config(path),values=environment?obj(obj(settings.env)[environment]):settings;
      const bindings=Array.isArray(values.d1_databases)?values.d1_databases.map(obj):[];
      const remoteBinding=bindings.some(b=>b.remote===true&&target.architecture?.identity?.configurations.some(c=>c.binding===b.binding&&c.path===path&&(c.environment||'')===environment));
      const local=place==='local'&&target.architecture?.context.includes('D1')&&!remoteBinding?resourceAt(target,'local',environment,evidence):target;
      connect(runtime,local,original.kind,original.label,original.evidence,environment,original);
    }
    return runtime;
  };
  const operations=new Map<string,SemanticNode>();
  for(const cmd of input.commands){
    const a=cmd.argv,tool=a[0],sub=a[1];if(a.some(v=>['--help','-h','--version','-v'].includes(v)))continue;
    const purpose=tool==='wrangler'?(sub==='dev'?'start':sub==='deploy'?'deploy':sub==='d1'&&a[2]==='migrations'&&a[3]==='apply'?'apply':undefined)
      :tool==='vite'?(sub==='build'?'build':!sub||sub==='dev'||sub==='serve'||sub.startsWith('-')?'serve':undefined)
      :tool==='drizzle-kit'&&sub==='generate'?'generate':tool==='firebase'&&['emulators:start','emulators:exec'].includes(sub??'')?'start'
      :['vercel','netlify','supabase'].includes(tool??'')&&['dev','start'].includes(sub??'')?'start':undefined;
    if(!purpose)continue;
    const unit=owner(cmd.path);if(!unit)continue;
    const explicitEnvironment=option(a,'--env','-e','--mode');
    const environment=explicitEnvironment??(tool==='vite'&&purpose==='serve'?'development':'');
    const place=a.includes('--remote')?'cloud':a.includes('--local')||purpose==='serve'||purpose==='start'?'local':'unconfirmed';
    const product=({firebase:'firebase-cli',vercel:'vercel-cli',netlify:'netlify-cli',supabase:'supabase-cli','drizzle-kit':'drizzle-orm'} as Record<string,string>)[tool!]??tool!;
    const name=tool==='drizzle-kit'?'Drizzle Kit':input.stackMetadata?.[product]?.name??tool!;
    const op=add(key('operation',cmd.id),`${name}：${purposes[purpose]}`,'tool-operation',cmd.evidence,environment?[environment]:[],{sourceId:cmd.sourceCommandId??cmd.id,scriptId:cmd.sourceScriptId??cmd.scriptId,dictionaryStackId:product,purpose,executionPlace:'unconfirmed',targetPlace:place,command:cmd.label,ownerPath:unit.architecture?.ownerPath??'',resolution:'操作対象は未特定'});
    operations.set(cmd.id,op);op.architecture!.roles=[{label:`${name}で${purposes[purpose]}する操作の記述`,confidence:'source',reason:'実際のコマンドと設定を照合。実行・成功は未観測',evidence:cmd.evidence}];op.architecture!.technologyNames=[product];op.architecture!.context=['静的コマンド・実行未観測'];if(tool==='vite'&&purpose==='serve'&&explicitEnvironment===undefined)op.attributes.defaultEnvironment='Vite devの既定mode=development';
    const cwd=cmd.workingDirectory??option(a,'--cwd','--workdir');const base=cwd===undefined?cmd.directory:staticPath(cmd.directory,cwd);
    if(!base||/[$`]/.test(environment))continue;
    const explicit=option(a,'--config','-c');
    const candidates=explicit!==undefined?[staticPath(base,explicit)]:tool==='wrangler'?['wrangler.jsonc','wrangler.json','wrangler.toml'].map(p=>localPath(base,p)):tool==='vite'?['vite.config.ts','vite.config.js','vite.config.mts','vite.config.mjs'].map(p=>localPath(base,p)):tool==='drizzle-kit'?['drizzle.config.ts','drizzle.config.js','drizzle.config.json'].map(p=>localPath(base,p)):[];
    const paths=candidates.filter((p):p is string=>Boolean(p&&Object.hasOwn(input.sources,p)));
    if(explicit!==undefined&&paths.length!==1||paths.length>1)continue;
    const path=paths[0],settings=path?config(path):{}, evidence=uniqueArchitectureEvidence([...cmd.evidence,...(path?at(path,'操作対象・入出力の設定（実行未観測）'):[])]);
    if(tool==='wrangler'){
      if(!path)continue;const selected=environment?obj(obj(settings.env)[environment]):settings;if(environment&&!Object.hasOwn(obj(settings.env),environment))continue;
      const main=str(selected.main??settings.main),targetUnit=units.find(n=>n.architecture?.entryPaths.includes(localPath(dir(path),main)??''))??owner(path);
      if(!targetUnit)continue;
      if(purpose==='apply'){
        const dbName=a[4],list=Array.isArray(selected.d1_databases)?selected.d1_databases.map(obj):[];
        const binding=list.filter(v=>v.binding===dbName||v.database_name===dbName);if(binding.length!==1)continue;
        const v=binding[0]!,matches=model.nodes.filter(n=>n.architecture?.identity?.type==='D1'&&n.architecture.identity.configurations.some(c=>c.path===path&&(c.environment||'')===environment&&c.binding===v.binding));if(matches.length!==1||!a.includes('--local')&&!a.includes('--remote'))continue;
        const target=resourceAt(matches[0]!,place,environment,evidence);
        connect(op,target,'flow-applies','DB変更を適用する指定',evidence,environment);
        const migration=staticPath(dir(path),str(v.migrations_dir)||'migrations');
        if(migration){const sql=artifact(migration,'Migration SQL',evidence);connect(sql,op,'flow-input','適用するSQL',evidence,environment);}
        op.attributes.resolution='binding・環境・適用場所を照合。適用済みかは未観測';
      }else{
        const target=execution(targetUnit,path,environment,purpose==='deploy'?'cloud':place,evidence);
        connect(source(targetUnit),op,'flow-input','入力コード',evidence,environment);
        connect(op,target,purpose==='deploy'?'flow-deploys':'flow-starts',purpose==='deploy'?'公開する指定':'起動する指定',evidence,environment);
        const assets=obj(selected.assets??settings.assets),output=staticPath(dir(path),str(assets.directory));
        if(output){const files=artifact(output,'Web成果物',at(path,'assets.directoryの入力指定'),environment);files.attributes.artifactInput=true;connect(files,op,'flow-input','公開する成果物',evidence,environment);}
        op.attributes.resolution='コマンドとWrangler設定を照合。稼働・公開状態は未観測';
      }
    }else if(tool==='vite'){
      const root=staticPath(base,str(settings.root)||'.');if(!root)continue;
      connect(source(unit),op,'flow-input','入力コード',evidence,environment);
      if(purpose==='build'){
        const build=obj(settings.build),out=option(a,'--outDir')??str(build.outDir);
        // Vite 2–8 documented default. Dynamic config/unknown version must not become dist.
        let version='';try{const manifest=obj(parseJsonc(input.sources[localPath(cmd.directory,'package.json')!]??'{}'));version=str(obj(manifest.devDependencies).vite??obj(manifest.dependencies).vite);}catch{/* unresolved */}
        const knownVersion=/^[~^]?[2-8]\./.test(version);
        const dynamic=path&&!architectureSyntax(path,input.sources[path]!).config||Object.hasOwn(build,'outDir')&&typeof build.outDir!=='string';
        const output=staticPath(root,out||(!dynamic&&knownVersion?'dist':undefined));
        if(output){const files=artifact(output,'Web成果物',evidence,environment);files.attributes.defaultOutput=!out;connect(op,files,'flow-generates','生成する指定',evidence,environment);op.attributes.resolution=out?'明示出力先':'Vite 2–8の既定outDir=dist。生成未観測';}
      }else{
        const server=add(key('dev-server',unit.id,environment,root),`${unit.label} · 開発サーバー`,'execution-config',evidence,environment?[environment]:[],{logicalOwnerId:unit.id,ownerPath:unit.architecture?.ownerPath??'',executionPlace:'local',host:option(a,'--host')??str(obj(settings.server).host),port:option(a,'--port')??str(obj(settings.server).port)},[root]);
        connect(op,server,'flow-starts','開発配信を起動する指定',evidence,environment);
        if(unit.architecture?.context.includes('ブラウザ'))connect(server,unit,'flow-serves','アプリのコードを配信',evidence,environment);
        op.attributes.resolution='開発配信の使用記述。ブラウザ起動・稼働は未観測';
      }
    }else if(tool==='drizzle-kit'){
      if(!path)continue;const schema=staticPath(dir(path),str(settings.schema)),out=staticPath(dir(path),str(settings.out));
      if(schema&&Object.hasOwn(input.sources,schema)){const definition=add(key('schema',schema),`${schema.split('/').at(-1)} · スキーマ`,'code-definition',at(schema,'スキーマ定義'),[],{ownerPath:owner(schema)?.architecture?.ownerPath??''},[schema]);connect(definition,op,'flow-input','生成元スキーマ',evidence);}
      if(out){connect(op,artifact(out,'Migration SQL',evidence),'flow-generates','SQLを生成する指定',evidence);op.attributes.resolution='schema / outの明示設定。生成・適用は別操作、いずれも未観測';}
    }else{
      const targets=input.resources.filter(r=>cmd.targets.includes(r.id));
      for(const r of targets){const target=model.nodes.find(n=>n.attributes.configurationOccurrence&&n.attributes.configurationOccurrence===r.attributes?.configurationOccurrence||n.id===`architecture:provider:${r.id}`);if(target){connect(op,target,'flow-starts','ローカル環境を起動する指定',evidence,'local');op.attributes.resolution='CLIと元の設定対象を照合。起動は未観測';}}
    }
  }
  if(!operations.size)return;
  // Bind declared artifacts by exact normalized path and environment. No tool-name matching.
  const artifacts=model.nodes.filter(n=>n.architecture?.kind==='artifact');
  for(const incoming of artifacts.filter(n=>n.attributes.artifactInput)){
    const producers=artifacts.filter(n=>n!==incoming&&n.attributes.artifactPath===incoming.attributes.artifactPath&&n.architecture!.environments.join()===incoming.architecture!.environments.join());
    if(producers.length===1)connect(producers[0]!,incoming,'flow-artifact','同じ成果物パス',uniqueArchitectureEvidence([...producers[0]!.evidence,...incoming.evidence]));
  }
  // Keep script ancestry without treating the mixed graph as an observed execution trace.
  const commands=new Map(input.commands.map(c=>[c.id,c]));
  const scripts=new Map<string,ArchitectureCommand[]>();for(const c of input.commands){const list=scripts.get(c.scriptId)??[];list.push(c);scripts.set(c.scriptId,list);}
  const reached=(id:string,seen=new Set<string>()):SemanticNode[]=>{if(seen.has(id))return[];seen.add(id);const op=operations.get(id);if(op)return[op];const cs=commands.has(id)?[commands.get(id)!]:scripts.get(id)??[];return cs.flatMap(c=>operations.has(c.id)?[operations.get(c.id)!]:c.calls.flatMap(link=>reached(link.target,seen)));};
  for(const cs of scripts.values())for(let i=1;i<cs.length;i++){
    const next=cs[i]!,previous=cs[i-1]!;if(!next.operator||next.id.includes(':child:')||previous.id.includes(':child:'))continue;
    const label=next.operator==='&&'?'成功時に続く記述':next.operator==='||'?'失敗時に続く記述':'後続の操作記述';
    for(const from of reached(previous.id))for(const to of reached(next.id))if(from.id!==to.id)connect(from,to,'flow-precedes',label,next.evidence,'',{id:key('command-order',previous.id,next.id),source:previous.id,target:next.id,kind:'flow-precedes',label,confidence:'source',evidence:next.evidence,views:['architecture-map'],details:{conditional:next.operator!==';',contextId:next.scriptId,reason:`演算子 ${next.operator} の記述。前後の成功・実行は未観測`}});
  }
  for(const [scriptId,cs]of scripts){const invokes=cs.filter(c=>c.calls.some(l=>scripts.has(l.target)));if(!invokes.length)continue;const targets=reached(scriptId);if(!targets.length)continue;
    const script=add(key('script',scriptId),`${cs[0]!.scriptName} · 開始script`,'tool-operation',uniqueArchitectureEvidence(cs.flatMap(c=>c.evidence)),[],{scriptId,sourceId:scriptId,purpose:'script',executionPlace:'unconfirmed',ownerPath:cs[0]!.directory});
    for(const c of invokes)for(const link of c.calls)for(const target of reached(link.target)){
      const label=link.parallel?'並列の呼出記述':link.operator==='&&'?'成功時の呼出記述':link.operator==='||'?'失敗時の呼出記述':'scriptから呼び出す記述';
      connect(script,target,'flow-invokes',label,link.evidence,'',{id:link.id,source:c.id,target:link.target,kind:'flow-invokes',label,confidence:'source',evidence:link.evidence,views:['architecture-map'],details:{contextId:c.id,conditional:Boolean(link.operator),reason:`元コマンド関係。operator=${link.operator??'なし'} / parallel=${link.parallel}。実行未観測`}});
    }
  }
  for(const n of model.nodes){
    const environments=n.architecture?.environments.filter(e=>!e.startsWith('except:'))??[];
    const locationOnly=Boolean(n.attributes.configurationOccurrence)&&environments.length===1&&['local','cloud','deployment','build'].includes(environments[0]!);
    n.attributes.flowEnvironment=locationOnly?'共通・環境未特定':environments.length===1?(environments[0]==='default'?'既定設定':environments[0]!):environments.length?'複数環境で共有':'共通・環境未特定';
    if(locationOnly)n.attributes.executionPlace=environments[0]!;
    for(const environment of environments)if(!model.environments.includes(environment))model.environments.push(environment);
  }
}
