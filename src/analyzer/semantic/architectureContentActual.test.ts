// @vitest-environment node
import {beforeAll,it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {semanticInput} from './client';
import {initializeTestParser,testLanguage,testParser} from './testRuntime';
import {analyzeSemanticSources} from './analyze';
import {architectureContentChoices,architectureContentRange} from './architectureContent';
beforeAll(initializeTestParser);
it.skipIf(!process.env.CONTENT_REVIEW)('checks all content choices against the three fixed project models',async()=>{
 const report=[];
 for(const project of ['vehicle-management','git-lines','web-atlas']){
  const store=JSON.parse(readFileSync(`.cache/cross-project/${project}.browser.store.json`,'utf8'));
  const model=(await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser)).architecture!;
  const before=JSON.stringify(model),choices=architectureContentChoices(model),ids=new Set(model.nodes.map(n=>n.id)),edges=new Set(model.edges.map(e=>e.id));
  const ranges=choices.filter(c=>c.id!=='all').map(choice=>{const range=architectureContentRange(model,choice.id)!;
   expect(range.graph.nodes.every(n=>ids.has(n.id)&&model.nodes.includes(n))).toBe(true);expect(range.graph.edges.every(e=>edges.has(e.id)&&model.edges.includes(e))).toBe(true);
   if(choice.path==='database')expect(range.graph.edges.some(e=>['http-request','service-use','data-operation'].includes(e.kind))).toBe(false);
   return {id:choice.id,label:choice.label,nodes:range.graph.nodes.map(n=>({id:n.id,label:n.label,purpose:n.attributes.purpose})),edges:range.graph.edges.map(e=>({id:e.id,source:e.source,target:e.target,kind:e.kind,confidence:e.confidence,evidence:e.evidence.length}))};
  });
  if(project==='web-atlas')expect(choices.some(c=>c.path==='database')).toBe(false);if(project==='vehicle-management')expect(choices.some(c=>c.path==='database')).toBe(true);
  expect(JSON.stringify(model)).toBe(before);report.push({project,sourceCount:store.files.length,originalNodes:model.nodes.length,originalEdges:model.edges.length,choices,ranges});
 }
 writeFileSync('.cache/content-review/actual.json',JSON.stringify(report,null,2));
},180000);
