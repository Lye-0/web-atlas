import type { AnalyzerGraph3D } from '../../analyzer/graph3D';
import { nodeTypeLabels, type AnalyzerViewNode, type AnalyzerViewModel } from '../../analyzer/types';
import type { FlowLabelContent, FlowLabelPlacement, FlowLabelObstacle } from './semanticFlowLabels';
import type { SemanticFlowNodeRole } from '../../analyzer/semantic/flowRelationInteraction';
import { createSpatialLabelPlacer } from './spatialLabelPlacement';

export interface Graph3DLabelDescriptor {
  id: string; entityId: string; kind: 'node' | 'region' | 'aggregate'; label: string; kindLabel: string;
  context: string; disambiguation?: string; tooltip: string; group: string; importance: number;
}
const text = (value: unknown) => typeof value === 'string' ? value : '';
const tail = (value: string) => value.replaceAll('\\', '/').split('/').filter(Boolean).slice(-2).join('/');
export function graph3DNodeKind(node: AnalyzerViewNode): string {
  if (node.presentation?.role === 'summary') return '表示上のまとめ';
  if (node.type === 'project') return 'プロジェクト';
  if (node.type === 'stack-usage') return '技術利用';
  if (node.type === 'workspace-package') return node.metadata.displayRole === 'ROOT PACKAGE' || node.metadata.role === 'root package' ? 'ルートパッケージ' : 'パッケージ';
  if (node.type === 'workspace-config') return 'workspace設定';
  if (node.type === 'workspace-pattern') return '対象パターン';
  if (node.type === 'package-script') return 'package script';
  if (node.type === 'command') return node.metadata.commandType === 'user-command' ? '開始コマンド'
    : text(node.metadata.commandType).endsWith('-script') ? 'scriptを呼ぶコマンド' : 'コマンド';
  if (node.type === 'technology') return '技術';
  if (node.type === 'external-package') return '外部パッケージ';
  if (node.type === 'module') return 'ファイル';
  return nodeTypeLabels[node.type];
}
const cache = new WeakMap<AnalyzerGraph3D, ReadonlyMap<string, Graph3DLabelDescriptor>>();
/** Static names and duplicate identity are prepared once per immutable view. */
export function prepareGraph3DLabels(graph: AnalyzerGraph3D): ReadonlyMap<string, Graph3DLabelDescriptor> {
  const cached = cache.get(graph); if (cached) return cached;
  const labels: Graph3DLabelDescriptor[] = [];
  const owner = new Map<string, typeof graph.regions[number]>();
  for (const region of [...graph.regions].sort((a,b)=>(a.original.depth??0)-(b.original.depth??0))) for (const id of region.memberIds) owner.set(id,region);
  for (const point of graph.points) {
    const n=point.original, region=owner.get(n.id), path=text(n.metadata.modulePath || n.metadata.scopePath || n.metadata.packagePath || n.metadata.path);
    const context=region?.original.subtitle ?? region?.original.label ?? path ?? '';
    const importance=n.type==='project'||n.metadata.commandType==='user-command'?0:n.type==='workspace-config'||n.type==='workspace-pattern'||n.type==='package-script'?1:2;
    labels.push({id:`node:${n.id}`,entityId:n.id,kind:'node',label:n.label,kindLabel:graph3DNodeKind(n),context,
      tooltip:[n.label,graph3DNodeKind(n),path,n.subtitle,region?.original.label].filter(Boolean).join('\n'),group:region?.original.id??(text(n.metadata.packageName||n.metadata.packagePath)||n.type),importance});
  }
  for (const region of graph.regions) {
    const r=region.original,context=r.subtitle??text(r.metadata.scopePath||r.metadata.directoryPath);
    labels.push({id:`region:${r.id}`,entityId:r.id,kind:'region',label:r.label,kindLabel:r.regionKind==='scope'?'Scope':r.regionKind==='directory'?'Directory':'所属',context,tooltip:[r.label,r.regionKind,context].filter(Boolean).join('\n'),group:r.parentRegionId??r.id,importance:r.parentRegionId?1:0});
  }
  const duplicates=new Map<string,Graph3DLabelDescriptor[]>();
  for(const label of labels){const key=label.label+'\0'+label.kindLabel;duplicates.set(key,[...duplicates.get(key)??[],label]);}
  for(const group of duplicates.values())if(group.length>1)for(const label of group){let value=tail(label.context);if(group.some(other=>other!==label&&tail(other.context)===value))value=label.context;if(!value||group.some(other=>other!==label&&other.context===label.context))value=label.context||label.entityId;label.disambiguation=value;}
  const result=new Map(labels.map(label=>[label.id,label]));cache.set(graph,result);return result;
}
export interface Graph3DLabelCandidate { descriptor: Graph3DLabelDescriptor; x:number; y:number; depth:number }
export interface Graph3DLabelContext {
  view: AnalyzerViewModel['view']; zoom:number; width:number;height:number;top:number;bottom:number;
  selected:ReadonlySet<string>; hovered:ReadonlySet<string>; endpoints:ReadonlySet<string>; related:ReadonlySet<string>;
  matches?:ReadonlySet<string>; emphasisIds?:ReadonlySet<string>;
  roles:ReadonlyMap<string,SemanticFlowNodeRole>; previous:readonly FlowLabelPlacement[]; obstacles?:readonly FlowLabelObstacle[];
}
/** Labels do not participate in point aggregation, edge selection, or camera state. */
export function projectGraph3DLabels(candidates:readonly Graph3DLabelCandidate[], context:Graph3DLabelContext):FlowLabelPlacement[]{
  const {width,height,top,bottom,view}=context;if(width<=0||height<=0)return [];
  const cloud=view==='dependencies'||view==='module-dependency';
  const visible=candidates.filter(p=>p.depth>=-1&&p.depth<=1&&p.x>=0&&p.x<=width&&p.y>=top&&p.y<=bottom&&Number.isFinite(p.x+p.y+p.depth));
  const previous=new Map(context.previous.map(p=>[p.id,p]));
  const selected=new Set(visible.filter(p=>context.selected.has(p.descriptor.entityId)).map(p=>p.descriptor.id));
  const hovered=new Set(visible.filter(p=>context.hovered.has(p.descriptor.entityId)).map(p=>p.descriptor.id));
  const endpoints=new Set(visible.filter(p=>context.endpoints.has(p.descriptor.entityId)).map(p=>p.descriptor.id));
  const priority=new Set([...selected,...hovered,...endpoints]);
  const protectedIds=new Set([...priority,...(context.related.size<=4?visible.filter(p=>context.related.has(p.descriptor.entityId)).map(p=>p.descriptor.id):[])]);
  const content=(p:Graph3DLabelCandidate):FlowLabelContent=>{
    const d=p.descriptor, chosen=selected.has(d.id), role=chosen?'selected':d.kind==='region'?undefined:context.roles.get(d.entityId);
    const kind=(!cloud||chosen||d.kind!=='node'||d.disambiguation)?d.kindLabel:'';
    return {...(context.emphasisIds?.size ? {emphasized:context.emphasisIds.has(d.entityId),dimmed:!context.emphasisIds.has(d.entityId)} : {}),id:d.id,label:d.label,path:'',selected:chosen,match:context.matches?.has(d.entityId)??false,hovered:hovered.has(d.id),related:context.related.has(d.entityId),region:d.kind==='region',aggregate:d.kind==='aggregate',role,
      roleLabel:chosen?'選択中':undefined,disambiguation:[kind,d.disambiguation].filter(Boolean).join(' · ')||undefined,tooltip:d.tooltip};
  };
  const measure=(label:FlowLabelContent)=>({width:Math.min(width<700?176:225,Math.max(54,...[label.label,label.disambiguation??'',label.roleLabel??''].map(value=>[...value].reduce((n,c)=>n+(c.charCodeAt(0)>255?12:6.7),18)))),height:24+(label.disambiguation?16:0)+(label.roleLabel?16:0)});
  const placer=createSpatialLabelPlacer(visible.map(p=>({id:p.descriptor.id,x:p.x,y:p.y})),{width,height},top,bottom,{obstacles:context.obstacles,priorityIds:protectedIds,hoveredIds:hovered},selected,previous,measure);
  const area=Math.max(0,width*(bottom-top)),budget=Math.max(3,Math.min(cloud?24:55,Math.floor(area/(cloud?26000:12500))));
  const stable=(a:Graph3DLabelCandidate,b:Graph3DLabelCandidate)=>Number(previous.has(b.descriptor.id))-Number(previous.has(a.descriptor.id))||a.descriptor.importance-b.descriptor.importance||a.descriptor.id.localeCompare(b.descriptor.id);
  const placed=new Set<string>();
  const put=(p:Graph3DLabelCandidate,force=false)=>{if(placed.has(p.descriptor.id))return false;const success=placer.place(content(p),p.x,p.y,force);if(success)placed.add(p.descriptor.id);return success;};
  const required=visible.filter(p=>priority.has(p.descriptor.id)).sort((a,b)=>Number(selected.has(b.descriptor.id))-Number(selected.has(a.descriptor.id))||Number(hovered.has(b.descriptor.id))-Number(hovered.has(a.descriptor.id))||stable(a,b));
  // Only explicit endpoints are forced, never every neighbour of a Directory.
  for(const p of required)put(p,true);
  const regionBudget=Math.max(2,Math.min(cloud?10:16,Math.floor(budget*.45)));
  const regions=visible.filter(p=>p.descriptor.kind!=='node'&&!priority.has(p.descriptor.id)).sort((a,b)=>Number(context.related.has(b.descriptor.entityId))-Number(context.related.has(a.descriptor.entityId))||stable(a,b));
  let regionsPlaced=0;for(const p of regions){if(regionsPlaced>=regionBudget)break;if(put(p,view==='architecture'&&regions.length<=3))regionsPlaced++;}
  const related=visible.filter(p=>p.descriptor.kind==='node'&&!priority.has(p.descriptor.id)&&context.related.has(p.descriptor.entityId)).sort(stable);
  let count=0,attempts=0;for(const p of related){if(count>=budget||attempts++>=budget*5)break;if(put(p,related.length<=3))count++;}
  const ordinary=visible.filter(p=>p.descriptor.kind==='node'&&!priority.has(p.descriptor.id)&&!context.related.has(p.descriptor.entityId));
  if(cloud&&context.zoom<.62)return placer.labels;
  const small=!cloud&&ordinary.length+related.length<=12;
  const groups=new Map<string,number>();attempts=0;
  for(const p of ordinary.filter(p=>!cloud||context.zoom>=(previous.has(p.descriptor.id)? .62 : .78)).sort(stable)){
    if(count>=budget||attempts++>=budget*5)break;
    if(cloud&&context.zoom<(previous.has(p.descriptor.id)?.62:.78))continue;
    if(cloud&&(groups.get(p.descriptor.group)??0)>=(context.zoom>=1.2?3:1))continue;
    if(put(p,small)){count++;groups.set(p.descriptor.group,(groups.get(p.descriptor.group)??0)+1);}
  }
  return placer.labels;
}
