// @vitest-environment node
import {it,expect} from 'vitest';
import {readdir,readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {join,extname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {scanProjectFiles} from '../scan';
import {isExcludedPath,isSensitivePath,isAnalyzerSourcePath,isAnalyzerUsageSourcePath,isAnalyzerSemanticSourcePath} from '../fileDiscovery';
import {semanticInput} from './client';
import {initializeTestParser,testLanguage,testParser} from './testRuntime';
import {analyzeSemanticSources} from './analyze';
import {architectureContentChoices,architectureContentRange} from './architectureContent';
import {architectureScopeGraph,prepareArchitectureScope} from './architectureProjection';
import {architectureSimpleOverview} from './architectureSimple';
import type {SemanticGraph} from './types';
const destination='.cache/simple-polish';
const serialize=(value:unknown)=>JSON.stringify(value,(_key,value)=>value instanceof Map?[...value]:value);
const hash=(value:unknown)=>createHash('sha256').update(serialize(value)).digest('hex');
it.skipIf(!process.env.SIMPLE_POLISH)('checks fresh read-only projects, conservation and unchanged presets',async()=>{
 await mkdir(destination,{recursive:true});await initializeTestParser();const reports=[];
 for(const project of ['vehicle-management','git-lines','web-atlas'].filter(name=>!process.env.SIMPLE_PROJECT||name===process.env.SIMPLE_PROJECT)){
  let model:SemanticGraph;
  if(process.env.SIMPLE_POLISH==='baseline'){
   const root=`C:/Users/kawau/dev/${project}`,files=[] as Parameters<typeof scanProjectFiles>[0],fingerprints:string[]=[],skipped:string[]=[];
   const walk=async(dir:string)=>{for(const e of await readdir(join(root,dir),{withFileTypes:true})){const path=dir?`${dir}/${e.name}`:e.name;if(e.isSymbolicLink()||isExcludedPath(path)||isSensitivePath(path))continue;if(e.isDirectory()){await walk(path);continue;}if(!isAnalyzerSourcePath(path)&&!isAnalyzerUsageSourcePath(path)&&!isAnalyzerSemanticSourcePath(path))continue;const size=(await stat(join(root,path))).size;if(size>2_000_000){skipped.push(path);continue;}const text=await readFile(join(root,path),'utf8');fingerprints.push(path+':'+hash(text));files.push({relativePath:path,name:e.name,extension:extname(path),size,readText:async()=>text});}};
   await walk('');const store=await scanProjectFiles(files);model=(await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser)).architecture!;
   await writeFile(`${destination}/${project}.store.json`,JSON.stringify(store));await writeFile(`${destination}/${project}.model.json`,JSON.stringify(model));await writeFile(`${destination}/${project}.input.json`,JSON.stringify({files:files.length,fingerprint:hash(fingerprints.sort()),skipped}));
  }else model=JSON.parse(await readFile(`${destination}/${project}.model.json`,'utf8'));
  const original=hash(model),presets=architectureContentChoices(model).filter(c=>c.id!=='simple-overview').map(c=>({id:c.id,digest:hash(architectureScopeGraph(architectureContentRange(model,c.id)?.graph??model))}));
  const base=prepareArchitectureScope(model,undefined,'',true),start=performance.now(),simple=architectureSimpleOverview(base),cold=performance.now()-start;
  expect(hash(model)).toBe(original);expect([...simple.owners.keys()].sort()).toEqual(base.allowed.map(n=>n.id).sort());
  const represented=[...simple.units.values()].flatMap(u=>u.internalEdges).concat([...simple.relations.values()].flatMap(r=>r.edgeIds));expect([...new Set(represented)].sort()).toEqual(model.edges.map(e=>e.id).sort());
  for(const [id,u]of simple.units)for(const edgeId of u.internalEdges){const edge=model.edges.find(e=>e.id===edgeId)!;expect(simple.owners.get(edge.source)).toBe(id);expect(simple.owners.get(edge.target)).toBe(id);}
  const warm=performance.now();for(let i=0;i<100;i++)architectureSimpleOverview(base);const warmMs=performance.now()-warm;
  const result={project,original,presets,originalNodes:model.nodes.length,originalEdges:model.edges.length,nodes:simple.graph.nodes.length,edges:simple.graph.edges.length,coldMs:cold,warm100Ms:warmMs,units:[...simple.units.values()],relations:[...simple.relations],graph:simple.graph};
  if(process.env.SIMPLE_POLISH?.startsWith('baseline'))await writeFile(`${destination}/${project}.before.json`,serialize(result));
  else {const before=JSON.parse(await readFile(`${destination}/${project}.before.json`,'utf8'));expect(original).toBe(before.original);
   const oldPath=resolve(destination,'baseline-src/src/analyzer/semantic/architectureProjection.ts'),oldContentPath=resolve(destination,'baseline-src/src/analyzer/semantic/architectureContent.ts');
   const oldProjection=await import(/* @vite-ignore */ oldPath),oldContent=await import(/* @vite-ignore */ oldContentPath);const oldModel=JSON.parse(JSON.stringify(model));
   const normalized=oldContent.architectureContentChoices(oldModel).filter((c:{id:string})=>c.id!=='simple-overview').map((c:{id:string})=>({id:c.id,digest:hash(oldProjection.architectureScopeGraph(oldContent.architectureContentRange(oldModel,c.id)?.graph??oldModel))}));expect(presets).toEqual(normalized);await writeFile(`${destination}/${project}.after.json`,serialize(result));}
  reports.push({project,nodes:result.nodes,edges:result.edges,coldMs:cold,warm100Ms:warmMs});
 }
 await writeFile(`${destination}/${process.env.SIMPLE_POLISH}-counts.json`,JSON.stringify(reports));
},240000);
