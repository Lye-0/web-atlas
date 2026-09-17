// @vitest-environment node
import {beforeAll,it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {semanticInput} from './client';
import {initializeTestParser,testLanguage,testParser} from './testRuntime';
import {analyzeSemanticSources} from './analyze';
import {architectureContentChoices,architectureContentRange} from './architectureContent';
import {architectureEnvironmentContext} from './architectureContext';
beforeAll(initializeTestParser);
it.skipIf(!process.env.CONTENT_REVIEW)('checks all content choices against the three fixed project models',async()=>{
 const report=[];
 const previous=process.env.PRESET_REVIEW?JSON.parse(readFileSync('.cache/preset-polish/actual-before.json','utf8')):undefined;
 for(const project of ['vehicle-management','git-lines','web-atlas']){
  const store=JSON.parse(readFileSync(`.cache/cross-project/${project}.browser.store.json`,'utf8'));
  const model=(await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser)).architecture!;
  const before=JSON.stringify(model),choices=architectureContentChoices(model),ids=new Set(model.nodes.map(n=>n.id)),edges=new Set(model.edges.map(e=>e.id));
  const ranges=choices.filter(c=>c.id!=='all').map(choice=>{const range=architectureContentRange(model,choice.id)!;
   expect(range.graph.nodes.every(n=>ids.has(n.id)&&model.nodes.includes(n))).toBe(true);expect(range.graph.edges.every(e=>edges.has(e.id)&&model.edges.includes(e))).toBe(true);
   if(choice.path==='database')expect(range.graph.edges.some(e=>['http-request','service-use','data-operation'].includes(e.kind))).toBe(false);
   if(process.env.PRESET_REVIEW){
    if(choice.meaning==='definition'){
     expect(range.graph.nodes.some(n=>['tool-operation','artifact','external-service','resource','unresolved'].includes(n.architecture?.kind??''))).toBe(false);
     expect(range.graph.edges.every(e=>['flow-definition','flow-configures','flow-serves'].includes(e.kind))).toBe(true);
    }else{
     const baseline=previous.find((p:{project:string})=>p.project===project).ranges.find((r:{id:string})=>r.id===choice.id);
     expect(range.graph.nodes.map(n=>n.id)).toEqual(baseline.nodes.map((n:{id:string})=>n.id));expect(range.graph.edges.map(e=>e.id)).toEqual(baseline.edges.map((e:{id:string})=>e.id));
    }
   }
   return {id:choice.id,label:choice.label,nodes:range.graph.nodes.map(n=>({id:n.id,label:n.label,purpose:n.attributes.purpose})),edges:range.graph.edges.map(e=>({id:e.id,source:e.source,target:e.target,kind:e.kind,confidence:e.confidence,evidence:e.evidence.length}))};
  });
  if(project==='web-atlas')expect(choices.some(c=>c.path==='database')).toBe(false);if(project==='vehicle-management')expect(choices.some(c=>c.path==='database')).toBe(true);
  expect(JSON.stringify(model)).toBe(before);report.push({project,sourceCount:store.files.length,originalNodes:model.nodes.length,originalEdges:model.edges.length,choices,ranges,...(process.env.PRESET_REVIEW?{contexts:model.nodes.filter(n=>n.architecture?.kind==='tool-operation'||n.architecture?.kind==='execution-config').map(n=>({id:n.id,label:n.label,kind:n.architecture?.kind,environment:architectureEnvironmentContext(n),attributes:n.attributes,evidence:n.evidence}))}:{})});
 }
 writeFileSync(process.env.PRESET_REVIEW?'.cache/preset-polish/actual-after.json':'.cache/content-review/actual.json',JSON.stringify(report,null,2));
},180000);
