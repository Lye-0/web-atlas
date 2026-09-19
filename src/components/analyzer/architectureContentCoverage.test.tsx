import {describe,it,expect,vi} from 'vitest';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {architectureContentCoverage} from './architectureContentCoverage';
import {ArchitectureDetail} from './ArchitectureDetail';
import {architectureScopeGraph} from '../../analyzer/semantic/architectureProjection';
import type {SemanticGraph,SemanticNode,SemanticEdge,SemanticAnalysis} from '../../analyzer/semantic/types';
const n=(id:string):SemanticNode=>({id,label:'same name',kind:'subsystem',group:'',confidence:'source',evidence:[],attributes:{},architecture:{kind:'application',environments:[],roles:[],files:[],memberIds:[],entryPaths:[],context:[],technologyNames:[],auxiliary:false}});
const r=(id:string):SemanticNode=>({...n(id),architecture:{...n(id).architecture!,kind:'unresolved',request:{ownerId:'owner',kind:'http',sourceId:id,expression:'url'}}});
const edge=(id:string,source:string,target:string):SemanticEdge=>({id,source,target,kind:'http-request',label:'request',confidence:'source',evidence:[],views:['architecture-map']});
const model:SemanticGraph={view:'architecture-map',nodes:[n('owner'),r('a'),r('b'),r('c')],edges:[edge('a','owner','a'),edge('b','owner','b'),edge('c','owner','c')]};
describe('display group content coverage',()=>{
 it.each([[['a','b','c'],'inside',3],[['a'],'partial',1],[[],'outside',0]] as const)('uses original members for %s', (ids,state,count)=>{
  const view=architectureScopeGraph(model),group=view.architectureView!.requestGroups[0]!;
  const coverage=architectureContentCoverage(new Set(ids),model,view);expect(coverage(group.id)).toMatchObject({state,inside:count,total:3,wholeTarget:'a'});expect(coverage(group.id)).toBe(coverage(group.id));
 });
 it('counts only remaining members after extraction and returns to the original group',()=>{
  const view=architectureScopeGraph(model),group=view.architectureView!.requestGroups[0]!,selected=architectureScopeGraph(model,undefined,'',false,{selectedNodeId:'a'});
  expect(architectureContentCoverage(new Set(['a','b']),model,selected)(group.id)).toMatchObject({state:'partial',inside:1,total:2});
  expect(architectureContentCoverage(new Set(['a','b']),model,selected)('a').state).toBe('inside');
  const expanded=architectureScopeGraph(model,undefined,'',false,{expandedRequestGroupIds:[group.id]});expect(architectureContentCoverage(new Set(['a','b','c']),model,expanded)(group.id)).toMatchObject({state:'inside',total:3});
  expect(architectureContentCoverage(new Set(['a','b']),model,view)(group.id)).toMatchObject({inside:2,total:3});
 });
 it('distinguishes same-named groups and ignores camera, filtering and outer-scope classification',()=>{
  const first={...n('group1'),attributes:{architectureRequestGroup:true,requestIds:['a','b'],architectureScopeRole:'direct'}},second={...first,id:'group2',attributes:{...first.attributes,requestIds:['x','y']}};
  const view:SemanticGraph={...model,nodes:[first,second]};const coverage=architectureContentCoverage(new Set(['a','b','owner']),model,view);
  expect(coverage('group1').state).toBe('inside');expect(coverage('group2').state).toBe('outside');expect(coverage('owner').state).toBe('inside');
 });
 it('keeps partner membership separate from an excluded relationship and preserves actual outside partners',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const rootNode=n('root'),inside=n('inside'),outside=n('outside');inside.label='inside';outside.label='outside';
  const full:SemanticGraph={view:'architecture-map',nodes:[rootNode,inside,outside],edges:[edge('excluded-edge','root','inside'),edge('outside-edge','root','outside')]};
  const visible:SemanticGraph={view:'architecture-map',nodes:[rootNode,inside],edges:[]};const host=document.createElement('div'),root=createRoot(host),select=vi.fn(),show=vi.fn();document.body.append(host);
  const analysis:SemanticAnalysis={nodes:[],edges:[],warnings:[],coverage:[],stats:{files:0,functions:0,models:0,unresolved:0,elapsedMs:0}};
  try{await act(async()=>root.render(<MemoryRouter><ArchitectureDetail node={rootNode} graph={full} visible={visible} contentAllowedIds={new Set(['root','inside'])} contentEdgeIds={new Set()} onShowAll={show} sources={{}} store={{files:[],facts:[],relations:[],evidence:[],sources:{},warnings:[],scannedAt:''}} analysis={analysis} onOpen={()=>{}} onReveal={()=>{}} onSelect={select} onSelectEdge={()=>{}} onJump={()=>{}} onClose={()=>{}}/></MemoryRouter>));
   const insideRow=host.querySelector('[data-partner-id="inside"]')!,outsideRow=host.querySelector('[data-partner-id="outside"]')!;
   expect(insideRow.textContent).not.toContain('この表示範囲の外側');expect(outsideRow.textContent).toContain('この表示範囲の外側');
   const details=insideRow.querySelector('details')!;await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'));});
   expect(insideRow.textContent).toContain('この関係は表示内容の範囲外');expect(insideRow.textContent).not.toContain('図で関係を選択');
   await act(async()=>[...insideRow.querySelectorAll('button')].find(b=>b.textContent==='inside')!.click());expect(select).toHaveBeenCalledWith('inside');expect(show).not.toHaveBeenCalled();
  }finally{await act(async()=>root.unmount());host.remove();}
 });
});
