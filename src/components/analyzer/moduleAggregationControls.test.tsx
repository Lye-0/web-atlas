// Regression cases independently supplied by the accuracy reviewer (ACC-03 and density restoration).
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AnalyzerSpatialGraphStage } from './AnalyzerSpatialGraphStage';
import type { AnalyzerViewModel } from '../../analyzer/types';
import { layoutAnalyzerView } from '../../analyzer/layout';
import { moduleAggregationInput,moduleAggregationProjection } from '../../analyzer/moduleAutoAggregation';
import { spatialCameraModel } from '../../analyzer/spatialCoordinates';
import { projectAutoAggregation } from '../../analyzer/autoAggregation';
vi.mock('@react-three/fiber',()=>({Canvas:()=>null,useFrame:vi.fn(),useThree:vi.fn()}));
const modules=['open','closed'].flatMap(directory=>Array.from({length:24},(_,i)=>({id:`${directory}-${i}`,type:'module' as const,label:`${directory}-${i}.ts`,evidenceIds:[],metadata:{modulePath:`src/${directory}/file-${i}.ts`,directoryPath:`src/${directory}`,regionPath:[directory]}})));
const graph:AnalyzerViewModel={view:'module-dependency',nodes:modules,edges:[],clusters:[],evidence:[],warnings:[],regions:['open','closed'].map(id=>({id,entityKind:'region',regionKind:'directory',label:id,childIds:modules.filter(n=>n.id.startsWith(id)).map(n=>n.id),ports:[],selectable:true,evidenceIds:[],metadata:{moduleCount:24}}))};
const noop=()=>undefined,expanded=new Set(['open']),camera={x:0,y:0,scale:.03};
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('IntersectionObserver',class{constructor(public callback:IntersectionObserverCallback){}observe(){this.callback([{isIntersecting:true} as IntersectionObserverEntry],this as unknown as IntersectionObserver);}disconnect(){}});vi.stubGlobal('ResizeObserver',class{constructor(public callback:ResizeObserverCallback){}observe(){this.callback([{contentRect:{width:1200,height:800}} as ResizeObserverEntry],this as unknown as ResizeObserver);}disconnect(){}});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
async function render(search='',extra:Record<string,unknown>={}) {await act(async()=>root.render(<AnalyzerSpatialGraphStage view={graph} filter="all" search={search} autoAggregation={false} expandedPresentationIds={expanded} onTogglePresentation={noop} onClearSelection={noop} onResetPresentation={noop} onSelectNode={noop} onSelectRegion={noop} onSelectEdge={noop} transform={camera} hasStoredCamera={true} onTransformChange={noop} cameraResetKey="independent" onCountsChange={noop} {...extra}/>));}
const counts=()=>{const n=host.querySelector<HTMLElement>('[data-manual-member-count]')!;return {scope:Number(n.dataset.scopeCount),manual:Number(n.dataset.manualMemberCount),individual:Number(n.dataset.individualCount),auto:Number(n.dataset.autoMemberCount)};};
it('search input alone leaves the explicitly closed directory membership unchanged in OFF',async()=>{
 await render();expect(counts()).toEqual({scope:48,manual:24,individual:24,auto:0});await render('closed');expect(counts()).toEqual({scope:48,manual:24,individual:24,auto:0});
});
it('selected member in a closed directory is individually protected without restoring excluded scope',async()=>{
 await render('',{selectedNodeId:'closed-3'});expect(counts()).toEqual({scope:48,manual:23,individual:25,auto:0});
 await render('',{selectedNodeId:'closed-3',filter:'resource'});expect(counts()).toEqual({scope:0,manual:0,individual:0,auto:0});
});
it('a directory explicitly expanded by the user is protected from automatic regrouping',async()=>{
 await render('',{autoAggregation:true,expandedPresentationIds:new Set(['open','closed']),aggregationState:{expandedGroupIds:[],collapsedGroupIds:[],expandedRegionIds:['closed']}});
 expect(counts()).toEqual({scope:48,manual:0,individual:24,auto:24});
 await render('',{autoAggregation:false,expandedPresentationIds:new Set(['open','closed']),aggregationState:{expandedGroupIds:[],collapsedGroupIds:[],expandedRegionIds:['closed']}});
 expect(counts()).toEqual({scope:48,manual:0,individual:48,auto:0});
});
it('module renderer restores its own active density history inside the hysteresis deadband',async()=>{
 const layout=layoutAnalyzerView(graph),input=moduleAggregationInput(layout.nodes.filter(p=>p.node.type==='module')),group=input.groups.find(g=>g.label.includes('closed'))!;
 const projection=moduleAggregationProjection(spatialCameraModel({x:0,y:0,scale:1},1200,800)),spacing=projectAutoAggregation({...input,enabled:true,projection}).metrics.get(group.id)!.spacing;
 const atBoundary={x:0,y:0,scale:18/spacing},allOpen=new Set(['open','closed']);
 await render('',{autoAggregation:true,transform:atBoundary,expandedPresentationIds:allOpen,aggregationState:{expandedGroupIds:[],collapsedGroupIds:[],activeGroupIds:[group.id]}});
 expect(counts()).toEqual({scope:48,manual:0,individual:24,auto:24});
 await act(async()=>root.render(<div/>));await render('',{autoAggregation:true,transform:atBoundary,expandedPresentationIds:allOpen,aggregationState:{expandedGroupIds:[],collapsedGroupIds:[],activeGroupIds:[]}});
 expect(counts()).toEqual({scope:48,manual:0,individual:48,auto:0});
});
