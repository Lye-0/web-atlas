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
it('keeps the publishing operation visible as a peer of a destination collection',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const make=(id:string,kind:NonNullable<SemanticNode['architecture']>['kind']):SemanticNode=>({id,label:id,kind:'subsystem',group:'test',confidence:'source',evidence:[],attributes:{},architecture:{kind,entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}});
 const app=make('app','application'),publisher=make('publisher','tool-operation'),destination=make('serving','execution-config');publisher.attributes.purpose='deploy';destination.attributes.logicalOwnerId='app';
 const simple=architectureSimpleOverview(prepareArchitectureScope({view:'architecture-map',nodes:[app,publisher,destination],edges:[{id:'publish',source:'publisher',target:'serving',kind:'flow-deploys',label:'publish',confidence:'source',evidence:[],views:['architecture-map']}]})),host=document.createElement('div'),root=createRoot(host);document.body.append(host);
 try{await act(async()=>root.render(<ArchitectureSimpleDetail simple={simple} node={simple.graph.nodes.find(n=>n.id===simple.owners.get('serving'))} sources={{}} onShowAll={()=>{}} onOpen={()=>{}} canOpen={()=>true} onClose={()=>{}}/>));expect(host.textContent).toContain('publisher');expect(host.textContent).toContain('公開する指定');expect(host.textContent).not.toContain('この構成の内部を開く');}
 finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
it('keeps membership, evidence preview and copied path paired while explaining peer direction',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const make=(id:string):SemanticNode=>({id,label:id,kind:'subsystem',group:'test',confidence:'source',evidence:[],attributes:{},architecture:{kind:'application',entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}});
 const app=make('api'),peer=make('browser'),component=make('Authentication');component.architecture!.kind='component';component.architecture!.parentId='api';component.path='apps/api';component.evidence=[{path:'apps/api/auth.ts',line:2,endLine:2,start:6,end:10,description:'auth marker'}];
 const model:SemanticGraph={view:'architecture-map',nodes:[app,peer,component],edges:[{id:'request',source:'browser',target:'api',kind:'http-request',label:'HTTP',confidence:'source',evidence:[],views:['architecture-map']}]};
 const simple=architectureSimpleOverview(prepareArchitectureScope(model)),host=document.createElement('div'),root=createRoot(host),copy=vi.fn().mockResolvedValue(undefined),descriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{value:{writeText:copy},configurable:true});document.body.append(host);
 try{
  await act(async()=>root.render(<ArchitectureSimpleDetail simple={simple} node={simple.graph.nodes.find(n=>n.id===simple.owners.get('api'))} sources={{'apps/api/auth.ts':'first\nAUTH\nlast'}} onShowAll={()=>{}} onOpen={()=>{}} canOpen={()=>false} onClose={()=>{}}/>));
  expect(host.textContent).toContain('browser → この構成');expect(host.textContent).not.toContain('この構成 → browser');
  const open=async(text:string)=>{const d=[...host.querySelectorAll('details')].find(d=>d.querySelector(':scope > summary')?.textContent?.includes(text))!;await act(async()=>{d.open=true;d.dispatchEvent(new Event('toggle'));});};
  await open('内部構成');expect(host.textContent).toContain('所属：apps/api');expect(host.textContent).toContain('代表的な根拠：api/auth.ts · L2');expect(host.textContent).not.toContain('apps/api:2');
  await open('完全なパス・その他の根拠');await open('auth.ts');expect(host.textContent).toContain('2  AUTH');expect(host.textContent).toContain('ソース範囲：6–10');await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='パスをコピー')!.click());expect(copy).toHaveBeenCalledWith('apps/api/auth.ts');
 }finally{await act(async()=>root.unmount());host.remove();if(descriptor)Object.defineProperty(navigator,'clipboard',descriptor);else Reflect.deleteProperty(navigator,'clipboard');vi.unstubAllGlobals();}
});
it('separates tools, artifacts and definitions in the support overview',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const make=(id:string,kind:NonNullable<SemanticNode['architecture']>['kind']):SemanticNode=>({id,label:id,kind:'subsystem',group:'test',confidence:'source',evidence:[],attributes:{},architecture:{kind,entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}});
 const db=make('database','resource'),schema=make('schema','code-definition'),sql=make('sql-output','artifact'),gen=make('generator','tool-operation'),apply=make('apply','tool-operation');gen.attributes.purpose='generate';apply.attributes.purpose='apply';
 const model:SemanticGraph={view:'architecture-map',nodes:[db,schema,sql,gen,apply],edges:[['in','schema','generator','flow-input'],['out','generator','sql-output','flow-generates'],['read','sql-output','apply','flow-input'],['apply','apply','database','flow-applies']].map(([id,source,target,kind])=>({id:id!,source:source!,target:target!,kind:kind!,label:kind!,confidence:'source',evidence:[],views:['architecture-map']}))};
 const simple=architectureSimpleOverview(prepareArchitectureScope(model)),host=document.createElement('div'),root=createRoot(host);document.body.append(host);
 try{await act(async()=>root.render(<ArchitectureSimpleDetail simple={simple} node={simple.graph.nodes.find(n=>n.id===simple.owners.get('database'))} sources={{}} onShowAll={()=>{}} onOpen={()=>{}} canOpen={()=>false} onClose={()=>{}}/>));const section=[...host.querySelectorAll('section')].find(s=>s.querySelector('h4')?.textContent==='開発・公開・更新に関わるもの')!;expect(section.textContent).toContain('道具');expect(section.textContent).toContain('成果物');expect(section.textContent).toContain('定義');const tools=[...section.children].find(c=>c.querySelector(':scope > strong')?.textContent==='道具')!;expect(tools.textContent).toContain('generator');expect(tools.textContent).not.toContain('sql-output');expect(tools.textContent).not.toContain('schema');}
 finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
