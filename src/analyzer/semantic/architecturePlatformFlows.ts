import type {ArchitectureCommand} from './architectureCommands';
import type {ArchitectureModel,ArchitectureEntity} from './architecture';
import type {SemanticNode,SemanticInput,SemanticEvidence,SemanticEdge} from './types';
import {localPath} from '../projectPaths';
import {parseJsonc} from '../parsers';
import {staticExportConfig} from './staticExportConfig';
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const str=(v:unknown)=>typeof v==='string'?v:'';
const option=(a:string[],name:string)=>{const i=a.indexOf(name);return i>=0?a[i+1]:a.find(v=>v.startsWith(name+'='))?.slice(name.length+1);};
const safe=(base:string,p:string)=>p&&!/[$`*]/.test(p)?localPath(base,p):undefined;
export interface PlatformFlowContext {
 model:ArchitectureModel;input:SemanticInput;
 add:(id:string,label:string,kind:ArchitectureEntity['kind'],evidence:SemanticEvidence[],env?:string[],attrs?:SemanticNode['attributes'],files?:string[])=>SemanticNode;
 connect:(from:SemanticNode,to:SemanticNode,kind:string,label:string,evidence:SemanticEvidence[],environment?:string,original?:SemanticEdge)=>void;
 source:(unit:SemanticNode)=>SemanticNode;
 artifact:(path:string,kind:string,evidence:SemanticEvidence[],environment?:string)=>SemanticNode;
 at:(path:string,reason:string)=>SemanticEvidence[];
 owner:(path:string)=>SemanticNode|undefined;
}
export function platformTool(cmd:ArchitectureCommand,input:SemanticInput){
 if(cmd.argv[0]==='next'&&['dev','build','start'].includes(cmd.argv[1]??''))return {tool:'next',purpose:cmd.argv[1]==='build'?'build':cmd.argv[1]==='dev'?'serve':'start'};
 if(['vsce','@vscode/vsce'].includes(cmd.argv[0]??'')&&['package','publish'].includes(cmd.argv[1]??''))return {tool:'vsce',purpose:cmd.argv[1]==='package'?'package':'deploy'};
 if(cmd.argv[0]==='esbuild')return {tool:'esbuild',purpose:'build'};
 if(cmd.argv[0]==='node'&&cmd.argv[1]&&!cmd.argv[1].startsWith('-')){const base=cmd.workingDirectory?safe(cmd.directory,cmd.workingDirectory):cmd.directory,path=base?safe(base,cmd.argv[1]):undefined;if(path&&input.resources.some(r=>r.path===path&&r.attributes?.dictionaryStackId==='esbuild'&&r.attributes.buildTopLevel===true))return {tool:'esbuild',purpose:'build'};}
}
/** Adapters consume common command resolution and static build declarations. Never execute input code. */
export function addPlatformOperation(c:PlatformFlowContext,cmd:ArchitectureCommand,op:SemanticNode,unit:SemanticNode,base:string,tool:string):void{
 const {input,add,connect,source,artifact,at}=c,a=cmd.argv;
 if(tool==='next'){
  const root=safe(base,a[2]&&!a[2].startsWith('-')?a[2]:'.');if(!root){op.attributes.resolution='Next.jsの入力ディレクトリが動的または入力範囲外';return;}
  const paths=['next.config.ts','next.config.js','next.config.mjs'].map(p=>localPath(root,p)!).filter(p=>Object.hasOwn(input.sources,p));
  const path=paths[0],settings=path?staticExportConfig(path,input.sources[path]!):{};
  const target=c.owner(localPath(root,'package.json')!);if(!target||target.architecture?.ownerPath!==(root==='.'?'':root)||paths.length>1){op.attributes.resolution='Next.jsの入力原本または設定候補を一意に特定できない';return;}
  const evidence=[...cmd.evidence,...(path?at(path,'Next.jsの静的設定。実行未観測'):[])];
  op.attributes.configurationPath=path??'';op.attributes.inputRoot=root;op.attributes.configurationStatus=path?(settings?'読込済み':'動的または未対応のexport'):'入力内に設定なし';op.attributes.buildMode=a[1]==='dev'?'development':'production';op.attributes.environmentMeaning='unknown';op.attributes.targetPlace='unconfirmed';
  connect(source(target),op,'flow-input','Next.jsアプリの原本',evidence);
  if(!settings){op.attributes.resolution='設定exportが動的または未対応。入力は確認、出力・実行構成は未特定';return;}
  const manifestPath=localPath(root,'package.json')!,manifest=obj(parseJsonc(input.sources[manifestPath]??'{}')),version=str(obj(manifest.dependencies).next??obj(manifest.devDependencies).next),known=/^[~^]?(?:1[3-6])\./.test(version);
  const mode=settings.output,dist=Object.hasOwn(settings,'distDir')?str(settings.distDir):known?'.next':'',output=Object.hasOwn(settings,'output')&&!['export','standalone'].includes(str(mode))?undefined:safe(root,mode==='export'?(Object.hasOwn(settings,'distDir')?dist:'out'):dist);
  if(a[1]==='build'){
   if(output){const result=artifact(output,mode==='export'?'Next.js静的出力':mode==='standalone'?'Next.js standaloneを含むビルド':'Next.jsビルド',evidence);result.attributes.outputMode=str(mode)||'server';result.attributes.logicalOwnerId=target.id;connect(op,result,'flow-generates','ビルド出力の指定',evidence);op.attributes.outputPath=output;op.attributes.resolution='設定とNext.js 13–16の出力規約を照合。公開先・生成済み状態は未確認';}
   else op.attributes.resolution='distDir/outputまたはバージョンが未解決。出力先は推測しない';return;
  }
  if(a[1]==='start'&&(mode==='export'||mode==='standalone'||!output)){op.attributes.resolution='next startと出力形式の対応を確認できない。設定を別の実行方式へ読み替えない';return;}
  const runtime=add(`architecture:next-runtime:${target.id}:${root}:${a[1]}`,`${target.label} · ${a[1]==='dev'?'開発サーバー':'ビルド済みアプリの実行設定'}`,'execution-config',evidence,[],{logicalOwnerId:target.id,configurationPath:path??manifestPath,inputRoot:root,executionPlace:'unconfirmed',buildMode:op.attributes.buildMode,providedContent:a[1]==='dev'?'Next.jsアプリの開発配信':'Next.jsビルド成果物を読み込むサーバー設定。配備先未特定'},[root]);
  if(a[1]==='start')connect(artifact(output!,'Next.jsビルド',evidence),op,'flow-input','ビルド成果物を読み込む指定',evidence);
  connect(op,runtime,'flow-starts','サーバーを起動する指定',evidence);connect(runtime,target,'flow-serves','アプリのコードを配信',evidence);op.attributes.resolution='原本とCLIの実行方式を照合。ビルドモードは配備先環境ではない';return;
 }
 if(tool==='esbuild'){
  const script=a[0]==='node'?safe(base,a[1]!):undefined;
  const declarations=input.resources.filter(r=>r.attributes?.buildOutput&&r.attributes.dictionaryStackId==='esbuild'&&(script?r.path===script&&r.attributes.buildTopLevel===true:r.attributes.buildInvocationScriptId===cmd.scriptId&&r.attributes.buildCommandText===cmd.label));
  for(const r of declarations){const attrs=r.attributes!,node=c.model.nodes.find(n=>n.attributes.configurationOccurrence===attrs.configurationOccurrence);if(!node)continue;
   if(script&&attrs.buildOptionsStable===false){op.attributes.resolution='ビルド設定に可変・動的な入出力があるため、初期宣言を確定した生成経路へ昇格しない';continue;}
   if(attrs.buildWorkingDirectoryExplicit||script&&attrs.buildWorkingDirectory!==base){op.attributes.resolution='ビルド設定の作業ディレクトリを呼出条件と一意に対応付けられない';continue;}
   const path=safe(base,str(attrs.outputPath));if(!path)continue;
   node.architecture!.kind='artifact';node.attributes.architectureKind='artifact';node.attributes.artifactPath=path;node.attributes.artifactState='静的な出力宣言。生成未観測';op.attributes.configurationPath=r.path??'';op.attributes.outputPath=path;
   const evidence=[...cmd.evidence,...r.evidence??[]],inputs=Array.isArray(attrs.inputPaths)?attrs.inputPaths:[];
   for(const owner of new Set(inputs.map(p=>c.owner(p)).filter((n):n is SemanticNode=>Boolean(n))))connect(source(owner),op,'flow-input','ビルド設定の入力コード',evidence);
   connect(op,node,'flow-generates','esbuildの出力指定',evidence);op.attributes.resolution='共通コマンド解析と静的build宣言を照合。実行・生成は未観測';
  }return;
 }
 if(tool==='vsce'){
  const manifestPath=localPath(base,'package.json')!,manifest=obj(parseJsonc(input.sources[manifestPath]??'{}'));
  if(!obj(manifest.engines).vscode){op.attributes.resolution='VS Code拡張manifestとの対応が未確認';return;}
  op.attributes.packageRoot=base;op.attributes.configurationPath=manifestPath;
  const out=option(a,'--out')??option(a,'-o'),name=str(manifest.name),version=str(manifest.version),path=out?(out.endsWith('/')?(name&&version?safe(base,out+`${name}-${version}.vsix`):undefined):safe(base,out)):name&&version?safe(base,`${name}-${version}.vsix`):undefined;
  connect(source(unit),op,'flow-input','パッケージ対象の拡張manifest',cmd.evidence);
  if(op.attributes.purpose==='package'&&path){const output=artifact(path,'VSIX配布物',cmd.evidence);output.attributes.logicalOwnerId=unit.id;connect(op,output,'flow-generates','パッケージ化する指定',cmd.evidence);op.attributes.outputPath=path;}
  if(op.attributes.purpose==='deploy'&&str(manifest.publisher)&&name){const target=add(`architecture:marketplace:${manifest.publisher}:${name}`,`${name} · Marketplace公開先の指定`,'external-service',at(manifestPath,'publisher/nameとvsce publishの対応'),[],{provider:'vscode-marketplace',observed:false});connect(op,target,'flow-deploys','Marketplaceへ公開する指定',cmd.evidence);}
  op.attributes.resolution=op.attributes.purpose==='package'?'VSIXの出力指定。インストール・公開・実行は示さない':'vsce publishの記述。公開済みかは未観測';
 }
}

export function finishPlatformFlows(c:PlatformFlowContext){
 const {input,model,add,connect,artifact,at}=c;
 for(const [path,text]of Object.entries(input.sources).filter(([p])=>/(?:^|\/)package\.json$/.test(p))){let manifest:Record<string,unknown>;try{manifest=obj(parseJsonc(text));}catch{continue;}if(!obj(manifest.engines).vscode||typeof manifest.main!=='string')continue;
  const base=path.split('/').slice(0,-1).join('/')||'.',entry=safe(base,manifest.main),unit=c.owner(path);if(!entry||!unit)continue;
  const output=model.nodes.find(n=>n.attributes.artifactPath===entry)??artifact(entry,'拡張エントリーの指定',at(path,'mainで読み込む拡張エントリー'));
  output.attributes.logicalOwnerId=unit.id;
  const runtime=add(`architecture:extension-runtime:${unit.id}`,`${unit.label} · Extension Host読込設定`,'execution-config',at(path,'engines.vscode / mainの拡張読込設定'),[],{logicalOwnerId:unit.id,executionContextLabel:'Extension Host読込設定',configurationPath:path,executionPlace:'unconfirmed',entryDeclaration:manifest.main,providedContent:'Extension Hostがmainを読み込む設定。導入・稼働は未観測'},[entry]);connect(output,runtime,'flow-loads','拡張エントリーとして読み込む指定',at(path,'mainの読込先'));
  const launchPath=localPath(base,'.vscode/launch.json')!;if(input.sources[launchPath]){let launch:Record<string,unknown>={};try{launch=obj(parseJsonc(input.sources[launchPath]!));}catch{/* unresolved */}for(const [i,value]of (Array.isArray(launch.configurations)?launch.configurations:[]).entries()){const setting=obj(value);if(setting.type!=='extensionHost'||setting.request!=='launch'||!Array.isArray(setting.args)||!setting.args.includes('--extensionDevelopmentPath=${workspaceFolder}'))continue;const ev=at(launchPath,'extensionHostの開発起動設定'),debug=add(`architecture:extension-debug:${unit.id}:${i}`,`${unit.label} · 開発用Extension Host`,'execution-config',ev,[],{logicalOwnerId:unit.id,executionContextLabel:'開発用Extension Host',configurationPath:launchPath,executionPlace:'unconfirmed',preLaunchTask:str(setting.preLaunchTask),providedContent:'拡張を開発モードで読み込むlaunch設定。実際の起動は未観測'},[entry]);connect(output,debug,'flow-loads','開発用Hostで読み込む指定',ev);}}
 }
 for(const op of model.nodes.filter(n=>n.attributes.packageRoot!==undefined&&n.attributes.purpose==='package')){
  const root=str(op.attributes.packageRoot),ignorePath=localPath(root,'.vscodeignore')!,ignore=input.sources[ignorePath];if(!ignore){op.attributes.packageContents='配布に含む成果物の範囲は未確認';continue;}
  // Inclusion is demonstrated only for explicit allow rules following an exclude-all.
  const rules=ignore.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')),excluded=rules.lastIndexOf('**');if(excluded<0){op.attributes.packageContents='複雑な配布除外規則は未解決';continue;}
  const allow=rules.slice(excluded+1).filter(s=>s.startsWith('!')).map(s=>s.slice(1));
  for(const n of model.nodes.filter(n=>n.architecture?.kind==='artifact'&&typeof n.attributes.artifactPath==='string')){const full=str(n.attributes.artifactPath),relative=root==='.'?full:full.startsWith(root+'/')?full.slice(root.length+1):undefined;if(!relative)continue;
   const matched=allow.filter(pattern=>pattern===relative||pattern.startsWith(relative+'/')||!/[[\]{}]/.test(pattern)&&new RegExp('^'+pattern.split('**').map(part=>part.split('*').map(piece=>piece.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]*')).join('.*')+'$').test(relative));if(!matched.length||rules.slice(excluded+1).some(s=>!s.startsWith('!')))continue;
   const ev=at(ignorePath,'配布対象として再包含する指定: '+matched.join(' / '));connect(n,op,'flow-input','配布に含む成果物の指定',ev);op.evidence.push(...ev);
  }
 }
}
