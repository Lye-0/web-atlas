import type {SemanticGraph} from '../../analyzer/semantic/types';

/** Content membership uses original IDs, never viewport visibility or a synthetic group's ID. */
export function architectureContentCoverage(allowed:ReadonlySet<string>|undefined,model:SemanticGraph,visible:SemanticGraph){
 const nodes=new Map([...model.nodes,...visible.nodes].map(n=>[n.id,n]));
 const groups=new Map(visible.architectureView?.requestGroups.map(g=>[g.id,g.memberIds]));
 const cached=new Map<string,{state:'inside'|'partial'|'outside';inside:number;total:number;wholeTarget:string}>();
 return (id:string)=>{
  const old=cached.get(id);if(old)return old;
  const node=nodes.get(id);
  // requestIds describes the remaining group after a member is temporarily peeled out.
  const represented=node?.attributes.architectureRequestGroup&&Array.isArray(node.attributes.requestIds)?node.attributes.requestIds:groups.get(id)??[id];
  const members=[...new Set(represented)],inside=allowed?members.filter(member=>allowed.has(member)).length:members.length;
  const result={state:(!allowed||inside===members.length&&inside>0?'inside':inside?'partial':'outside') as 'inside'|'partial'|'outside',inside,total:members.length,wholeTarget:members[0]??id};
  cached.set(id,result);return result;
 };
}
