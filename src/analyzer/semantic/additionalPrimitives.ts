import { argumentsAt } from './pythonRoutes';
import { declaredConnections } from '../declarationConnections';
import type { AdapterContext } from './stackSemantics';
import type { SemanticEvidence, SemanticNode } from './types';

/** Minimal explicit test-fixture and ORM contracts; no discovery plugins or DB execution. */
export function addAdditionalPrimitives(context:AdapterContext):void {
  const {analysis}=context;
  const at=(path:string,start:number,end:number,description:string):SemanticEvidence=>({path,start,end,line:context.input.sources[path]!.slice(0,start).split('\n').length,endLine:context.input.sources[path]!.slice(0,end).split('\n').length,description});
  const resources=new Map(analysis.nodes.filter(node=>node.kind==='resource').map(node=>[node.attributes.resourceId,node]));
  for(const source of resources.values())for(const relation of declaredConnections(source.attributes.declaredConnections)){
    const target=resources.get(relation.targetId);if(!target||context.input.sources[relation.path]===undefined)continue;
    context.edge(source,target,relation.kind,['runtime-flow'],[at(relation.path,relation.start,relation.end,relation.label)]);
    const edge=analysis.edges.find(edge=>edge.source===source.id&&edge.target===target.id&&edge.kind===relation.kind);if(edge)edge.label=relation.label;
  }
  for(const file of context.files.values()){
    if(!['pytest','django','ruby-on-rails'].some(product=>file.products.has(product)))continue;
    const functions=analysis.nodes.filter(node=>node.path===file.path&&node.kind==='function'&&!node.attributes.initializer);
    if(file.path.endsWith('.py')&&file.products.has('pytest')){
      const fixtures=new Map<string,SemanticNode>();
      for(const match of file.code.matchAll(/@(\w+)(?:\.(fixture))?\s*(\([^\n]*\))?\s*\n\s*(?:async\s+)?def\s+(\w+)/g)){
        const binding=file.imports.get(match[1]!);if(binding?.stackId!=='pytest'||(match[2]?binding.symbol!=='*':binding.symbol!=='fixture'))continue;
        const outer=context.owner(file.path,match.index!);
        if(functions.some(fn=>fn.attributes.name===match[1])||Array.isArray(outer?.attributes.parameters)&&outer.attributes.parameters.includes(match[1]!))continue;
        const fn=functions.find(fn=>fn.attributes.name===match[4]&&fn.evidence.some(range=>range.start<=match.index!+match[0].length&&range.end>match.index!+match[0].length));if(!fn)continue;
        const original=file.source.slice(match.index!,match.index!+match[0].length);const name=original.match(/\bname\s*=\s*['"]([^'"]+)['"]/)?.[1]??match[4]!;
        fn.attributes.test=true;fn.attributes.dictionaryStackId='pytest';fn.attributes.fixture=name;fn.group='Tests';fixtures.set(name,fn);
        const evidence=at(file.path,match.index!,match.index!+match[0].indexOf('\n'),'pytest fixtureの宣言');
        const entry=context.node('entry',`fixture: ${name}`,file.path,evidence.start,evidence.end,{dictionaryStackId:'pytest',test:true,testKind:'fixture'});
        context.edge(entry,fn,'fixture-body',['runtime-flow','function-call-flow'],[evidence,...fn.evidence]);
      }
      for(const fn of functions.filter(fn=>fn.attributes.test))for(const name of Array.isArray(fn.attributes.parameters)?fn.attributes.parameters:[]){
        const fixture=fixtures.get(name);if(!fixture||fixture===fn)continue;
        const header=file.code.slice(fn.evidence[0]!.start,fn.evidence[0]!.end).split('\n').find(line=>/\bdef\b/.test(line))??'';
        const location=file.code.indexOf(header,fn.evidence[0]!.start)+header.indexOf(name);
        context.edge(fn,fixture,'requests-fixture',['runtime-flow','function-call-flow'],[at(file.path,location,location+name.length,'引数名で要求するfixture（直接の関数呼出ではない）'),...fixture.evidence]);
      }
    }
    const product=file.products.has('django')?'django':file.products.has('ruby-on-rails')?'ruby-on-rails':undefined;if(!product)continue;
    for(const operation of analysis.nodes.filter(node=>node.path===file.path&&node.kind==='operation'&&node.attributes.callee)){
      const start=operation.evidence[0]?.start??0;const callee=String(operation.attributes.callee);
      const expression=product==='ruby-on-rails'?file.code.slice(start,operation.evidence[0]!.end):callee;
      const match=expression.match(product==='django'?/^(\w+)\.objects\.(filter|get|all|create|update|delete)/:/^(\w+)\.(where|find|all|create|update|destroy)/);if(!match||product==='ruby-on-rails'&&callee!==match[2])continue;
      const owner=context.owner(file.path,start);if(Array.isArray(owner?.attributes.parameters)&&owner.attributes.parameters.includes(match[1]!))continue;
      const models=analysis.nodes.filter(node=>node.kind==='model'&&node.label===match[1]&&node.attributes.dictionaryStackId===product&&context.files.get(node.path??'')?.project?.directory===file.project?.directory);if(models.length!==1)continue;
      const model=models[0]!;operation.attributes.dictionaryStackId=product;operation.attributes.operation='database';operation.data={...operation.data,role:'operation',expression:file.source.slice(start,operation.evidence[0]!.end),resolution:'partial'};
      const write=/^(?:create|update|delete|destroy)$/.test(match[2]!);
      context.edge(operation,model,write?'writes-model':'reads-model',['runtime-flow','data-flow'],[...operation.evidence,...model.evidence]);
      if(!/^(?:delete|destroy)$/.test(match[2]!))context.edge(operation,model,'result-model',['data-flow'],operation.evidence);
      if(owner)context.edge(owner,operation,'executes',['runtime-flow'],operation.evidence);
      const args=argumentsAt(file.source,file.code,start)?.args??[];
      for(const arg of args){const value=context.node('value',`${match[2]} 入力`,file.path,arg.start,arg.end,{dictionaryStackId:product,...owner?{owner:owner.id}:{}});value.data={role:'argument',expression:arg.text,resolution:'partial'};context.edge(value,operation,'query-input',['data-flow'],[at(file.path,arg.start,arg.end,'明示されたquery入力')]);}
    }
  }
}
