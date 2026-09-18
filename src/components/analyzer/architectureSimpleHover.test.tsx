import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SemanticExplorerNavigation,type SemanticExplorerNavigationActions} from './SemanticExplorerNavigation';
import {buildSemanticExplorer} from '../../analyzer/semantic/semanticExplorer';
import type {SemanticGraph,SemanticNode} from '../../analyzer/semantic/types';
it('labels temporary relations and drops stale hints without changing the selected node',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const nodes=['selected app','build','destination'].map(id=>({id,label:id,kind:'subsystem',group:'test',confidence:'source',evidence:[],attributes:{simpleOverview:true},architecture:{kind:'application',entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}} as SemanticNode));
 const graph:SemanticGraph={view:'architecture-map',nodes,edges:[{id:'edge',source:'build',target:'destination',kind:'flow-deploys',label:'publish',confidence:'source',evidence:[],views:['architecture-map']}]},explorer=buildSemanticExplorer(graph,new Set()),noop=()=>{};
 const navigation:SemanticExplorerNavigationActions={contentLabel:'簡易全体',location:{scopeId:'project',direction:'both',depth:1},visitId:'visit',scrollTop:0,canBack:false,onBack:noop,onParent:noop,onProject:noop,onOpenScope:noop,onOpenNode:noop,onCenter:noop,onDefinition:noop,onJumpMode:noop,onDepth:noop,onScroll:noop,onRevealSelection:noop};
 const host=document.createElement('div'),root=createRoot(host);document.body.append(host);
 const render=async(hover:boolean,selectedEdgeId?:string)=>act(async()=>root.render(<SemanticExplorerNavigation explorer={explorer} navigation={navigation} graph={graph} localGraph={graph} mode="2d" selectedIds={new Set(['selected app'])} selectedEdgeId={selectedEdgeId} hoverTarget={hover?{kind:'edge',id:'edge'}:undefined} relationHint={graph.edges[0]}/>));
 try{await render(true);expect(host.textContent).toContain('一時確認中の関係（ホバー／フォーカス）');expect(host.textContent).toContain('選択中：selected app');await render(false);expect(host.querySelector('.architecture-relation-readout')).toBeNull();await render(false,'edge');expect(host.querySelector('.architecture-relation-readout')!.textContent).toContain('選択中の関係');expect(host.textContent).not.toContain('一時確認中');}
 finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
