// @vitest-environment node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { it } from 'vitest';
import type { AnalyzerProjectStore } from '../types';
import { semanticInput } from './client';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser,testLanguage,testParser } from './testRuntime';
import { architectureScopeGraph } from './architectureProjection';
import { layoutSemanticFlow } from './flowPresentation';
it.skipIf(!process.env.WEB_ATLAS_POLISH_REVIEW)('measures fixed read-only inputs without executing their code',async()=>{
 await initializeTestParser();const phase=process.env.WEB_ATLAS_POLISH_REVIEW!;
 await mkdir('.cache/context-polish',{recursive:true});
 for(const name of ['vehicle-management','git-lines']){
  const store=JSON.parse(await readFile(`.cache/unified-review/verified/${name}.store.json`,'utf8')) as AnalyzerProjectStore;
  const input=semanticInput(store),start=performance.now(),analysis=await analyzeSemanticSources(input,testLanguage,undefined,testParser),model=analysis.architecture!,analysisMs=performance.now()-start;
  const t=performance.now(),graph=architectureScopeGraph(model),points=layoutSemanticFlow(graph,'2d'),layoutMs=performance.now()-t;
  const byId=new Map(points.map(p=>[p.node.id,p])),distances=graph.edges.filter(e=>e.source!==e.target&&byId.has(e.source)&&byId.has(e.target)).map(e=>{const a=byId.get(e.source)!,b=byId.get(e.target)!;return Math.hypot(a.x-b.x,a.y-b.y);}).sort((a,b)=>a-b);
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),select=performance.now();for(let i=0;i<100;i++)layoutSemanticFlow(architectureScopeGraph(model,undefined,'',false,{selectedNodeId:graph.nodes[i%graph.nodes.length]?.id}),'2d');
  const selection100Ms=performance.now()-select;
  const evidenceHash=createHash('sha256');for(const n of model.nodes)for(const e of n.evidence)evidenceHash.update(JSON.stringify([n.id,e.path,e.start,e.end,e.description]));
  const record={phase,name,inputHash:createHash('sha256').update(JSON.stringify(input.sources)).digest('hex'),nodes:model.nodes.map(n=>n.id).sort(),edges:model.edges.map(e=>({id:e.id,source:e.source,target:e.target,kind:e.kind})),evidenceHash:evidenceHash.digest('hex'),graphNodes:graph.nodes.length,graphEdges:graph.edges.length,analysisMs,layoutMs,selection100Ms,width:Math.max(...xs)-Math.min(...xs)+248,height:Math.max(...ys)-Math.min(...ys)+108,medianDistance:distances[Math.floor(distances.length/2)],meanDistance:distances.reduce((a,b)=>a+b,0)/distances.length,p95Distance:distances[Math.floor(distances.length*.95)],positions:points.map(p=>({id:p.node.id,x:p.x,y:p.y}))};
  await writeFile(`.cache/context-polish/${phase}-${name}.json`,JSON.stringify(record));console.info(JSON.stringify({...record,nodes:record.nodes.length,edges:record.edges.length,positions:undefined}));
 }
},180000);
