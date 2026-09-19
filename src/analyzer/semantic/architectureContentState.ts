import {createInitialAnalyzerViewSession,type AnalyzerViewSession} from '../session';
import {recordExplorerSelection} from './semanticExplorerState';

export type ContentSnapshot=Pick<AnalyzerViewSession,'search'|'filter'|'semantic'|'selectedNodeId'|'selectedEdgeId'|'detailOpen'|'architecture'|'aggregation'|'flowCameras'|'expandedPresentationIds'>;
const scope=(s:AnalyzerViewSession)=>s.explorer?.twoD.location.scopeId??'project';
const snapshot=(s:AnalyzerViewSession):ContentSnapshot=>({search:s.search,filter:s.filter,semantic:s.semantic,selectedNodeId:s.selectedNodeId,selectedEdgeId:s.selectedEdgeId,detailOpen:s.detailOpen,architecture:s.architecture,aggregation:s.aggregation,flowCameras:s.flowCameras,expandedPresentationIds:s.expandedPresentationIds});
function stash(s:AnalyzerViewSession){const content=s.architectureContent??{key:'all',states:{}};return {...content,states:{...content.states,[content.key]:{...content.states[content.key],[scope(s)]:snapshot(s)}}};}
function restore(next:AnalyzerViewSession,content:NonNullable<AnalyzerViewSession['architectureContent']>){
 const saved=content.states[content.key]?.[scope(next)]??snapshot(createInitialAnalyzerViewSession());
 const explorer=next.explorer?{...next.explorer,visited2D:true,visited3D:true,twoD:{...next.explorer.twoD,camera:saved.flowCameras?.['2d']},visits:Object.fromEntries(Object.entries(next.explorer.visits).map(([id,v])=>{
  const value=id===next.explorer!.currentVisitId?saved:content.states[content.key]?.[v.twoD.location.scopeId];
  return [id,{...v,twoD:{...v.twoD,camera:value?.flowCameras?.['2d']},camera3d:value?.flowCameras?.['3d'],selectedNodeId:value?.selectedNodeId,selectedEdgeId:value?.selectedEdgeId,detailOpen:value?.detailOpen??false}];
 }))}:undefined;
 return {...next,...saved,explorer,architectureContent:content};
}
/** No route or hierarchy entry is added by a content change. */
export function switchArchitectureContent(current:AnalyzerViewSession,key:string):AnalyzerViewSession{
 if((current.architectureContent?.key??'all')===key)return current;
 return restore(current,{...stash(current),key});
}
/** Navigation remains real hierarchy navigation; view-local state is restored at its destination. */
export function preserveArchitectureContentScope(current:AnalyzerViewSession,next:AnalyzerViewSession):AnalyzerViewSession{
 if(!current.architectureContent||scope(current)===scope(next))return next;
 const content=stash(current);
 if(content.key==='all'&&!content.states.all?.[scope(next)])return {...next,architectureContent:content};
 const restored=restore(next,content);
 if(next.selectedNodeId)return {...recordExplorerSelection(restored,{selectedNodeId:next.selectedNodeId,selectedEdgeId:next.selectedEdgeId,detailOpen:next.detailOpen}),semantic:next.semantic};
 return restored;
}
