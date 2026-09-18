import {it,expect} from 'vitest';
import {simpleEvidenceKey,simpleRelationGroups,simpleUnitRelations} from './architectureSimpleDetails';
import {architectureSimpleOverview} from '../../analyzer/semantic/architectureSimple';
import {prepareArchitectureScope} from '../../analyzer/semantic/architectureProjection';
import type {SemanticNode,SemanticGraph,SemanticEdge} from '../../analyzer/semantic/types';
it('groups thousands of internal records by endpoint and meaning without losing individual source sites',()=>{
 const node=(id:string,parentId?:string):SemanticNode=>({id,label:id,kind:'subsystem',group:'x',confidence:'source',evidence:[],attributes:{},architecture:{kind:parentId?'component':'application',parentId,entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}});
 const nodes=[node('app'),node('a','app'),node('b','app'),node('outside')],edges:SemanticEdge[]=Array.from({length:3000},(_,i)=>({id:`e${i}`,source:'a',target:'b',kind:'code-reference',label:'モジュール参照',views:['architecture-map'],confidence:'source',evidence:[{path:'src/input.ts',start:i,end:i+1,line:i+1,endLine:i+1,description:'参照'}]}));edges.push({...edges[0]!,id:'external',source:'app',target:'outside'});
 const graph:SemanticGraph={view:'architecture-map',nodes,edges},simple=architectureSimpleOverview(prepareArchitectureScope(graph)),inventory=simpleUnitRelations(simple,simple.owners.get('app')!),groups=simpleRelationGroups(inventory.internal,new Map(nodes.map(n=>[n.id,n])));
 expect(inventory.internal).toHaveLength(3000);expect(inventory.external).toHaveLength(1);expect(groups).toHaveLength(1);expect(groups[0]!.edges).toHaveLength(3000);expect(new Set(groups[0]!.edges.flatMap(e=>e.evidence.map(simpleEvidenceKey))).size).toBe(3000);
});
