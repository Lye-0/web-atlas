// @vitest-environment node
import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {prepareArchitectureScope} from './architectureProjection';
import {architectureSimpleOverview} from './architectureSimple';
import type {SemanticGraph} from './types';
it.skipIf(!process.env.STATIC_SITE_COMPARE)('compares original IDs, relations, stable regression input and cached projections',async()=>{
 const old=await import(/* @vite-ignore */resolve('.cache/static-site/baseline-src/analyzer/semantic/architectureSimple.ts')),oldProjection=await import(/* @vite-ignore */resolve('.cache/static-site/baseline-src/analyzer/semantic/architectureProjection.ts')),results=[];
 for(const project of ['Chess','git-lines','vehicle-management']){
  const before:SemanticGraph=JSON.parse(readFileSync(`.cache/static-site/${project}.before.model.json`,'utf8')),after:SemanticGraph=JSON.parse(readFileSync(`.cache/static-site/${project}.after.model.json`,'utf8')),nodeIds=new Set(after.nodes.map(n=>n.id)),edges=new Map(after.edges.map(e=>[e.id,e]));
  expect(before.nodes.every(n=>nodeIds.has(n.id))).toBe(true);for(const e of before.edges)expect(edges.get(e.id)).toEqual(e);
  const t=performance.now(),previous=old.architectureSimpleOverview(oldProjection.prepareArchitectureScope(before,undefined,'',true)),beforeMs=performance.now()-t,base=prepareArchitectureScope(after,undefined,'',true),t2=performance.now(),simple=architectureSimpleOverview(base),afterMs=performance.now()-t2;
  expect([...simple.owners.keys()].sort()).toEqual(after.nodes.map(n=>n.id).sort());const represented=[...new Set([...simple.units.values()].flatMap(u=>u.internalEdges).concat([...simple.relations.values()].flatMap(r=>r.edgeIds)))];expect(represented.sort()).toEqual(after.edges.map(e=>e.id).sort());
  expect(after.nodes).toEqual(before.nodes);expect(after.edges).toEqual(before.edges);{expect(simple.graph.nodes.map(n=>n.id)).toEqual(previous.graph.nodes.map((n:{id:string})=>n.id));expect(simple.graph.edges).toEqual(previous.graph.edges);expect(simple.graph.architectureView!.positions2d).toEqual(previous.graph.architectureView.positions2d);expect(simple.graph.architectureView!.positions).toEqual(previous.graph.architectureView.positions);}
  const warm=performance.now();for(let i=0;i<100;i++)expect(architectureSimpleOverview(base)).toBe(simple);const warm100Ms=performance.now()-warm;
  results.push({project,beforeNodes:before.nodes.length,nodes:after.nodes.length,beforeEdges:before.edges.length,edges:after.edges.length,beforeShown:previous.graph.nodes.length,shown:simple.graph.nodes.length,shownEdges:simple.graph.edges.length,annotations:simple.referenceEdges?.length,beforeMs,afterMs,warm100Ms});
 }
 const before:SemanticGraph=JSON.parse(readFileSync('.cache/static-site/HEAVY-PLAY.before.model.json','utf8')),after:SemanticGraph=JSON.parse(readFileSync('.cache/static-site/HEAVY-PLAY.after.model.json','utf8'));
 const edges=new Map(after.edges.map(e=>[e.id,e]));for(const e of before.edges)expect(edges.get(e.id)).toEqual(e);
 const requests=before.nodes.filter(n=>n.architecture?.request?.kind==='http');expect(requests).toHaveLength(7);
 for(const request of requests){const n=after.nodes.find(n=>n.id===request.id)!;expect(n.architecture?.request).toEqual(request.architecture?.request);expect(n.evidence).toEqual(request.evidence);expect(n.architecture?.files).toEqual(['tests/site.test.mjs']);expect(n.architecture?.auxiliary).toBe(true);}
 writeFileSync('.cache/static-site/comparison.json',JSON.stringify(results,null,2));
},120000);
