import type {SemanticGraph,SemanticNode} from './types';
/** Source-first fallback for graphs with no preparation paths. Contains groups stay neighbours;
 * these rows describe related sets, never execution order or inferred ownership. */
export function layoutUnroutedSimple(graph:SemanticGraph){
 const points=new Map<string,{x:number;y:number;z:number}>(),byId=new Map(graph.nodes.map(n=>[n.id,n])),sources=graph.nodes.filter(n=>n.attributes.simpleStage==='source'||n.architecture?.kind==='code-package'&&Boolean(n.attributes.simpleAnchorId)),rest=new Set(graph.nodes.filter(n=>!sources.includes(n)).map(n=>n.id));
 if(!sources.length||!rest.size)return;
 for(const n of sources){n.attributes.simpleStage='source';if(n.architecture?.kind==='code-package')n.attributes.simpleSupportPurpose='実行用途未確認';}
 const adjacency=new Map(graph.nodes.map(n=>[n.id,new Set<string>()]));for(const e of graph.edges)if(e.kind==='contains'&&rest.has(e.source)&&rest.has(e.target)){adjacency.get(e.source)!.add(e.target);adjacency.get(e.target)!.add(e.source);}
 const clusters:SemanticNode[][]=[];while(rest.size){const first=rest.values().next().value!,ids=[first];rest.delete(first);for(let i=0;i<ids.length;i++)for(const id of adjacency.get(ids[i]!)!)if(rest.delete(id))ids.push(id);clusters.push(ids.map(id=>byId.get(id)!));}
 const adjacentSources=(cluster:SemanticNode[])=>{const ids=new Set(cluster.map(n=>n.id));return sources.filter(n=>graph.edges.some(e=>e.source===n.id&&ids.has(e.target)||e.target===n.id&&ids.has(e.source))).map(n=>n.id);};
 const groups=new Map<string,{sources:SemanticNode[];clusters:SemanticNode[][]}>();for(const cluster of clusters){const owners=adjacentSources(cluster).sort(),key=JSON.stringify(owners),group=groups.get(key)??{sources:owners.map(id=>byId.get(id)!),clusters:[]};group.clusters.push(cluster);groups.set(key,group);}
 let top=0;
 for(const group of [...groups.values()].sort((a,b)=>Number(!a.sources.length)-Number(!b.sources.length))){const columns=Math.min(3,Math.max(1,Math.ceil(Math.sqrt(group.clusters.length))));let bottom=top;
  const levels=Array.from({length:columns},()=>top);
  for(const members of [...group.clusters].sort((a,b)=>b.length-a.length||a[0]!.id.localeCompare(b[0]!.id))){const col=levels.indexOf(Math.min(...levels));members.sort((a,b)=>Number(graph.edges.some(e=>e.kind==='contains'&&e.target===a.id))-Number(graph.edges.some(e=>e.kind==='contains'&&e.target===b.id))||a.id.localeCompare(b.id));members.forEach((n,i)=>{points.set(n.id,{x:(col+1)*350,y:levels[col]!+i*140,z:0});n.attributes.simplePlacement='service';n.attributes.simplePlacementLabel='関連する構成';});levels[col]!+=members.length*140+60;}
  bottom=Math.max(top,...levels);
  group.sources.forEach((n,i)=>{if(!points.has(n.id)){points.set(n.id,{x:0,y:top+i*140,z:0});n.attributes.simplePlacement='no-route';n.attributes.simplePlacementLabel='起動・公開経路は未確認';}});top=Math.max(bottom,top+group.sources.length*140)+60;
 }
 const independent=sources.filter(n=>!points.has(n.id)),columns=Math.min(5,Math.max(1,Math.ceil(Math.sqrt(independent.length))));independent.forEach((n,i)=>{points.set(n.id,{x:i%columns*350,y:top+Math.floor(i/columns)*140,z:0});n.attributes.simplePlacement='no-route';n.attributes.simplePlacementLabel='起動・公開経路は未確認';});
 const positions=new Map([...points].map(([id,p])=>[id,{x:p.x*.62,y:p.y*.52,z:0}]));return {positions,positions2d:points};
}
