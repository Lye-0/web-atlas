import { expect,it } from 'vitest';
import { dependencyDetailRelations } from './dependencyDetailRelations';
import type { AnalyzerViewModel,AnalyzerViewNode } from './types';
it('separates summary navigation while keeping shared targets and distinct declarations by ID',()=>{
 const node=(id:string):AnalyzerViewNode=>({id,type:'external-package',label:'same',metadata:{},evidenceIds:[]});
 const nodes=[node('a'),node('b'),node('react'),{...node('summary'),presentation:{role:'summary' as const,childNodeIds:['react']}}];
 const edge=(id:string,sourceId:string,targetId:string,versionRange:string)=>({id,sourceId,targetId,kind:'depends-on' as const,label:'dependency',evidenceIds:[id],metadata:{versionRange}});
 const edges=[edge('decl1','a','react','^1'),edge('decl2','a','react','^2'),edge('shared','b','react','^3'),{...edge('bundle','a','summary',''),presentation:{displayKind:'bundle' as const}}];
 const model:AnalyzerViewModel={view:'dependencies',nodes,edges,clusters:[],evidence:[],warnings:[]},before=JSON.stringify(model);
 const a=dependencyDetailRelations(model,'a');expect(a.declarations).toEqual(edges.slice(0,2));expect(a.outgoingTargets).toBe(1);expect(a.summaries[0]!.node.id).toBe('summary');
 const target=dependencyDetailRelations(model,'react');expect(target.incomingSources).toBe(2);expect(target.declarations.map(e=>e.metadata.versionRange)).toEqual(['^1','^2','^3']);expect(JSON.stringify(model)).toBe(before);
});
