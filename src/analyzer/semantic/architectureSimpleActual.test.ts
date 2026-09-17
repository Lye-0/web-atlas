// @vitest-environment node
import {beforeAll,it,expect} from 'vitest';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {semanticInput} from './client';
import {initializeTestParser,testLanguage,testParser} from './testRuntime';
import {analyzeSemanticSources} from './analyze';
import {architectureContentChoices,architectureContentRange} from './architectureContent';
import {architectureScopeGraph} from './architectureProjection';
beforeAll(initializeTestParser);
it.skipIf(!process.env.SIMPLE_REVIEW)('preserves three project models and existing preset projections',async()=>{
 mkdirSync('.cache/simple-overview',{recursive:true});
 const results=[];
 for(const project of ['vehicle-management','git-lines','web-atlas']){
  const store=JSON.parse(readFileSync(`.cache/cross-project/${project}.browser.store.json`,'utf8'));
  const model=(await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser)).architecture!;
  const baseline=architectureContentChoices(model).filter(c=>c.id!=='simple-overview').map(c=>{
   const graph=architectureContentRange(model,c.id)?.graph??model;
   return {id:c.id,nodes:graph.nodes.map(n=>n.id),edges:graph.edges,projection:architectureScopeGraph(graph)};
  });
  const data=JSON.parse(JSON.stringify(baseline,(_key,value)=>value instanceof Map?[...value]:value));
  if(process.env.SIMPLE_REVIEW==='baseline'){writeFileSync(`.cache/simple-overview/${project}-baseline.json`,JSON.stringify(data));writeFileSync(`.cache/simple-overview/${project}-model.json`,JSON.stringify(model));}
  else expect(data).toEqual(JSON.parse(readFileSync(`.cache/simple-overview/${project}-baseline.json`,'utf8')));
  results.push({project,nodes:model.nodes.length,edges:model.edges.length});
 }
 writeFileSync('.cache/simple-overview/baseline-counts.json',JSON.stringify(results));
},180000);
