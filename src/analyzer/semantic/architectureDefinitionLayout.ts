import type {SemanticGraph,SemanticNode} from './types';
import type {SemanticPosition} from './presentation';

/** Definition-only 2D layout. ID ordering and structural components are selection-independent. */
export function layoutArchitectureDefinitions(graph:SemanticGraph):SemanticPosition[]{
 const nodes=[...graph.nodes].sort((a,b)=>a.id.localeCompare(b.id)),byId=new Map(nodes.map(n=>[n.id,n]));
 const adjacent=new Map(nodes.map(n=>[n.id,new Set<string>()]));
 for(const edge of graph.edges)if(['flow-definition','flow-configures','flow-serves'].includes(edge.kind)&&edge.source!==edge.target&&byId.has(edge.source)&&byId.has(edge.target)){
  adjacent.get(edge.source)!.add(edge.target);adjacent.get(edge.target)!.add(edge.source);
 }
 const components:SemanticNode[][]=[],seen=new Set<string>();
 for(const node of nodes){if(seen.has(node.id))continue;const queue=[node.id];seen.add(node.id);for(let i=0;i<queue.length;i++)for(const other of adjacent.get(queue[i]!)!)if(!seen.has(other)){seen.add(other);queue.push(other);}components.push(queue.map(id=>byId.get(id)!).sort((a,b)=>a.id.localeCompare(b.id)));}
 const points:SemanticPosition[]=[];let top=0;
 const column=(node:SemanticNode)=>node.architecture?.kind==='execution-config'?2:node.architecture?.kind==='code-definition'?1:0;
 for(const members of components.filter(c=>c.length>1)){
  const columns=[0,1,2].map(index=>members.filter(n=>column(n)===index));
  const rows=Math.max(...columns.map(c=>c.length));
  columns.forEach((list,x)=>list.forEach((node,row)=>points.push({node,x:x*360,y:top+(row+(rows-list.length)/2)*156,z:0})));
  top+=rows*156+120;
 }
 const isolated=components.filter(c=>c.length===1).flat();
 isolated.forEach((node,i)=>points.push({node,x:i%3*360,y:top+Math.floor(i/3)*156,z:0}));
 return points;
}
