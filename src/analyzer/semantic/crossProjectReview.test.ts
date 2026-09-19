// @vitest-environment node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
import {scanProjectFiles} from '../scan';
import {semanticInput} from './client';
import {analyzeSemanticSources} from './analyze';
import {initializeTestParser,testLanguage,testParser} from './testRuntime';
import {architectureScopeGraph} from './architectureProjection';
import {layoutSemanticFlow} from './flowPresentation';
it.skipIf(!process.env.CROSS_PROJECT_REVIEW)('compares three frozen inputs without executing project code',async()=>{
 await initializeTestParser();
 for(const name of ['vehicle-management','git-lines','web-atlas']){
  const store=name==='web-atlas'?await scanProjectFiles(Object.entries(JSON.parse(await readFile('.cache/cross-project/web-atlas.sources.json','utf8')) as Record<string,string>).map(([relativePath,text])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:text.length,readText:async()=>text}))):JSON.parse(await readFile(`.cache/unified-review/verified/${name}.store.json`,'utf8'));
  await writeFile(`.cache/cross-project/${name}.store.json`,JSON.stringify(store));
  const input=semanticInput(store),start=performance.now(),a=await analyzeSemanticSources(input,testLanguage,undefined,testParser),analysisMs=performance.now()-start,m=a.architecture!;
  const t=performance.now(),g=architectureScopeGraph(m),p=layoutSemanticFlow(g,'2d'),projectionMs=performance.now()-t;
  const s=performance.now();for(let i=0;i<100;i++)layoutSemanticFlow(architectureScopeGraph(m,undefined,'',false,{selectedNodeId:g.nodes[i%g.nodes.length]?.id}),'2d');const selection100Ms=performance.now()-s;
  const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const summary={name,inputHash:hash(input.sources),analysisMs,projectionMs,selection100Ms,requests:a.nodes.filter(n=>n.kind==='request').map(n=>({id:n.id,path:n.path,callee:n.attributes.callee,endpoint:n.attributes.endpoint,evidence:n.evidence})),nodes:m.nodes.map(n=>({id:n.id,label:n.label,architecture:n.architecture,attributes:n.attributes,evidenceHash:hash(n.evidence)})),edges:m.edges.map(e=>({id:e.id,source:e.source,target:e.target,kind:e.kind,environment:e.details?.environment,structural:e.details?.structural,originals:e.provenance?.edges.map(x=>x.id),evidenceHash:hash(e.evidence)})),rootNodes:g.nodes.length,rootEdges:g.edges.length,internal:g.architectureView?.internalRecordCount,positions:p.map(v=>[v.node.id,v.x,v.y])};
  await writeFile(`.cache/cross-project/${process.env.CROSS_PROJECT_REVIEW}-${name}.json`,JSON.stringify(summary));
  console.info(JSON.stringify({name,nodes:m.nodes.length,edges:m.edges.length,requests:summary.requests.length,rootNodes:g.nodes.length,rootEdges:g.edges.length,analysisMs,projectionMs,selection100Ms}));expect(m.nodes.length).toBeGreaterThan(0);
 }
},240000);
it.skipIf(!process.env.CROSS_PROJECT_BROWSER_INPUT)('prepares explicitly scoped browser inputs after full-input measurement',async()=>{
 for(const name of ['vehicle-management','git-lines','web-atlas']){
  const original=JSON.parse(await readFile(`.cache/cross-project/${name}.store.json`,'utf8'));
  const entries=Object.entries(original.semanticSources??original.sources) as [string,string][];
  const selected=entries.filter(([p,s])=>s.length<100000&&!/(?:^|\/)(?:__tests__|tests?|fixtures?)(?:\/)|\.(?:test|spec)\./.test(p));
  const store=await scanProjectFiles(selected.map(([relativePath,text])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:text.length,readText:async()=>text})));
  await writeFile(`.cache/cross-project/${name}.browser.store.json`,JSON.stringify(store));
  await writeFile(`.cache/cross-project/${name}.browser-scope.json`,JSON.stringify({included:selected.map(([p])=>p),excluded:entries.filter(([p])=>!selected.some(([path])=>path===p)).map(([p])=>p)}));
  console.info({name,original:entries.length,browser:selected.length});
 }
},120000);
