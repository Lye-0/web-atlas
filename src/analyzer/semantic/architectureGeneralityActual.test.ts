// @vitest-environment node
import {it,expect} from 'vitest';
import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {scanProjectFiles} from '../scan';
import {isExcludedDirectory,isSensitivePath,isAnalyzerSourcePath,isAnalyzerUsageSourcePath,isAnalyzerSemanticSourcePath} from '../fileDiscovery';
import {semanticInput} from './client';
import {initializeTestParser,testLanguage,testParser} from './testRuntime';
import {analyzeSemanticSources} from './analyze';
import {architectureSimpleOverview} from './architectureSimple';
import {prepareArchitectureScope} from './architectureProjection';
const roots={Chess:'C:/Users/kawau/dev/Web_Services/Chess','git-lines':'C:/Users/kawau/dev/Extension/git-lines','vehicle-management':'C:/Users/kawau/dev/Web_Services/vehicle-management'};
it.skipIf(!process.env.GENERALITY_REVIEW)('reads three original projects without executing any input code',async()=>{
 await initializeTestParser();const reports:{project:string;[key:string]:unknown}[]=[];
 for(const [project,root]of Object.entries(roots).filter(([name])=>!process.env.GENERALITY_PROJECT||name===process.env.GENERALITY_PROJECT)){
  const files:Parameters<typeof scanProjectFiles>[0]=[];
  const walk=async(dir:string)=>{for(const item of await readdir(join(root,dir),{withFileTypes:true})){const path=dir?dir+'/'+item.name:item.name;if(item.isSymbolicLink()||isSensitivePath(path))continue;if(item.isDirectory()){if(!isExcludedDirectory(item.name))await walk(path);continue;}if(!isAnalyzerSourcePath(path)&&!isAnalyzerUsageSourcePath(path)&&!isAnalyzerSemanticSourcePath(path))continue;const size=(await stat(join(root,path))).size;if(size>2000000)continue;files.push({relativePath:path,name:item.name,extension:extname(path),size,readText:()=>readFile(join(root,path),'utf8')});}};
  await walk('');const start=performance.now(),store=await scanProjectFiles(files),input=semanticInput(store),model=(await analyzeSemanticSources(input,testLanguage,undefined,testParser)).architecture!,simple=architectureSimpleOverview(prepareArchitectureScope(model,undefined,'',true));
  expect([...simple.owners.keys()].sort()).toEqual(model.nodes.map(n=>n.id).sort());
  const represented=new Set([...simple.units.values()].flatMap(u=>u.internalEdges).concat([...simple.relations.values()].flatMap(r=>r.edgeIds)));expect([...represented].sort()).toEqual(model.edges.map(e=>e.id).sort());
  const stage=process.env.GENERALITY_REVIEW;
  await writeFile(`.cache/generality/${project}.${stage}.store.json`,JSON.stringify(store));await writeFile(`.cache/generality/${project}.${stage}.model.json`,JSON.stringify(model));
  await writeFile(`.cache/generality/${project}.${stage}.simple.json`,JSON.stringify(simple,(_k,v)=>v instanceof Map?[...v]:v));
  reports.push({project,files:files.length,ms:performance.now()-start,commands:input.commands?.map(c=>({command:c.label,path:c.path,targets:c.targets})),nodes:model.nodes.length,edges:model.edges.length,simpleNodes:simple.graph.nodes.map(n=>({label:n.label,purpose:n.attributes.purpose})),operations:model.nodes.filter(n=>n.architecture?.kind==='tool-operation').map(n=>({label:n.label,command:n.attributes.command,resolution:n.attributes.resolution}))});
 }
 const reportPath=`.cache/generality/${process.env.GENERALITY_REVIEW}.report.json`;let previous:typeof reports=[];if(process.env.GENERALITY_PROJECT)try{previous=JSON.parse(await readFile(reportPath,'utf8'));}catch{/* first selected run */}await writeFile(reportPath,JSON.stringify([...previous.filter(r=>!reports.some(n=>n.project===r.project)),...reports],null,2));
},300000);
