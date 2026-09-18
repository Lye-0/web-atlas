import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {ArchitectureSimpleDetail} from './ArchitectureSimpleDetail';
import {architectureSimpleOverview} from '../../analyzer/semantic/architectureSimple';
import {prepareArchitectureScope} from '../../analyzer/semantic/architectureProjection';
import type {SemanticGraph,SemanticNode} from '../../analyzer/semantic/types';
it('exposes original intermediate IDs and evidence only on explicit disclosure',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const nodes=['source','target'].map(id=>({id,label:id,kind:'subsystem',group:'test',confidence:'source',evidence:[],attributes:{},architecture:{kind:'application',entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}} as SemanticNode));
 const evidence={path:'sample.ts',line:1,endLine:1,start:0,end:5,description:'source marker'};
 const model:SemanticGraph={view:'architecture-map',nodes,edges:[{id:'path',source:'source',target:'target',kind:'http-request',label:'設定の経路',views:['architecture-map'],confidence:'inferred',evidence:[evidence],provenance:{intermediateNodeIds:['middle-id'],edges:[{id:'original-id',source:'original-source',target:'middle-id',kind:'http-request',label:'元の要求',confidence:'inferred',evidence:[evidence]}]}}]};
 const simple=architectureSimpleOverview(prepareArchitectureScope(model)),host=document.createElement('div'),root=createRoot(host),show=vi.fn(),showRelation=vi.fn();document.body.append(host);
 try{
  await act(async()=>root.render(<ArchitectureSimpleDetail simple={simple} edge={simple.graph.edges[0]} sources={{'sample.ts':'value'}} onShowAll={show} onShowRelation={showRelation} onOpen={()=>{}} canOpen={()=>false} onClose={()=>{}}/>));
  expect(host.textContent).not.toContain('middle-id');
  const open=async(text:string)=>{const details=[...host.querySelectorAll('details')].find(d=>d.querySelector(':scope > summary')?.textContent?.includes(text))!;await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'));});};
  await open('元の関係・段階');await open('source → target');await open('sample.ts');expect(host.textContent).toContain('source marker');expect(host.textContent).not.toContain('middle-id');
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='全体でこの関係を詳しく見る')!.click());expect(showRelation).toHaveBeenCalledWith('path');
  await open('元解析との対応');await open('元の要求');expect((host.textContent?.match(/source marker/g)??[])).toHaveLength(1);expect(host.textContent).not.toContain('original-id');await open('診断情報／元ID');expect(host.textContent).toContain('middle-id');expect(host.textContent).toContain('original-id');await open('元の定義・共有部分');
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='全体で詳しく見る：target')!.click());expect(show).toHaveBeenCalledWith('target');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
