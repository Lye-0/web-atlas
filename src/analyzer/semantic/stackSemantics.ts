import ts from 'typescript';
import { directoryFor, localPath, parseManifest, type ManifestProject } from '../manifestAdapters';
import { languageImports, scriptSource, sourceLanguage, sourceSyntax } from '../sourceSyntax';
import { registeredStackForDependency, stackRegistry, type Ecosystem } from '../stackRegistry';
import { templateElements } from '../templateSyntax';
import { addPythonRouterRegistrations } from './pythonRoutes';
import { addExpressRouterRegistrations } from './expressRouters';
import { addNativeRegistrations } from './nativeRegistrations';
import { addAdditionalPrimitives } from './additionalPrimitives';
import { type DataCompiler, sourceEvidence, visitSource } from './dataCompiler';
import type { SemanticAnalysis, SemanticEvidence, SemanticField, SemanticInput, SemanticKind, SemanticNode, SemanticViewId } from './types';

interface ImportSymbol { module: string; symbol: string; stackId?: string }
interface FileContext { path: string; source: string; code: string; products: Set<string>; project?: ManifestProject; imports: Map<string,ImportSymbol>; symbols:Map<ts.Symbol,ImportSymbol>; checker:ts.TypeChecker; ast?: ts.SourceFile; inlineTemplate?: { start:number; text:string; ownerName:string }; externalTemplates?: { path:string; ownerName:string }[] }
export interface AdapterContext {
  analysis: SemanticAnalysis; input: SemanticInput; files: Map<string,FileContext>;
  node: (kind:SemanticKind,label:string,path:string,start:number,end:number,attributes?:SemanticNode['attributes'])=>SemanticNode;
  edge: (from:SemanticNode,to:SemanticNode,kind:string,views:SemanticViewId[],evidence:SemanticEvidence[])=>void;
  handler: (path:string,name:string)=>SemanticNode|undefined;
  owner: (path:string,start:number)=>SemanticNode|undefined;
  model: (file:FileContext,name:string,stackId:string,start:number,end:number,fields:SemanticField[],domain?:'code'|'validation'|'storage')=>SemanticNode;
}
const flowViews:SemanticViewId[]=['runtime-flow','data-flow'];
function ev(path:string,source:string,start:number,end:number,description:string):SemanticEvidence{return{path,start,end,line:source.slice(0,start).split('\n').length,endLine:source.slice(0,end).split('\n').length,description};}
function productForModule(module:string,ecosystem:Ecosystem):string|undefined {
  const special:Record<string,string>={'firebase/auth':'firebase-authentication','firebase/firestore':'cloud-firestore','firebase/storage':'firebase-storage'};if(special[module])return special[module];
  return stackRegistry.find(entry=>entry.imports[ecosystem]?.some(value=>module===value||ecosystem==='npm'&&module.startsWith(value+'/')||['maven','nuget','pypi'].includes(ecosystem)&&module.startsWith(value+'.')||ecosystem==='composer'&&module.startsWith(value+'\\')))?.stackId
    ??registeredStackForDependency(ecosystem,module)?.stackId;
}
function fieldsFromText(path:string,source:string,body:string,offset:number):SemanticField[]{
  return [...body.matchAll(/(?:^|[,;\n])\s*(?:public\s+|private\s+|protected\s+|readonly\s+|export\s+|let\s+)*([A-Za-z_$]\w*)\??\s*:\s*([^,;\n={}]+)(?:=\s*([^,;\n]+))?/g)].map(match=>({name:match[1]!,type:match[2]!.trim(),optional:match[0].includes('?:'),evidence:[ev(path,source,offset+match.index!,offset+match.index!+match[0].length,`${match[1]} field`)]}));
}
function callArguments(source:string,start:number,end:number,language:string):{text:string;start:number;end:number}[]{
  const code=sourceSyntax(source.slice(start,end),language).code;const open=code.indexOf('(');if(open<0)return[];let depth=0,begin=open+1;const result:{text:string;start:number;end:number}[]=[];
  const push=(limit:number)=>{const raw=source.slice(start+begin,start+limit);const left=raw.length-raw.trimStart().length,right=raw.trimEnd().length;if(right>left)result.push({text:raw.slice(left,right),start:start+begin+left,end:start+begin+right});};
  for(let index=open+1;index<code.length;index++){const character=code[index]!;if('([{'.includes(character))depth++;else if(')]}'.includes(character)){if(depth===0){push(index);break;}depth--;}else if(character===','&&depth===0){push(index);begin=index+1;}}
  return result;
}
function createContext(analysis:SemanticAnalysis,input:SemanticInput,compiler:DataCompiler):AdapterContext {
  const sources=new Map(Object.entries(input.sources));const projects:ManifestProject[]=[];
  const operationsByRange=new Map<string,SemanticNode>();const functionsByPath=new Map<string,SemanticNode[]>();
  for(const item of analysis.nodes){if(item.kind==='operation')for(const at of item.evidence){const key=`${item.path}:${at.start}:${at.end}`;if(!operationsByRange.has(key))operationsByRange.set(key,item);}if(item.kind==='function'&&item.path)functionsByPath.set(item.path,[...(functionsByPath.get(item.path)??[]),item]);}
  for(const[path,source]of sources)try{const project=parseManifest(path,source,sources);if(project)projects.push(project,...(project.children??[]));}catch{/* scan coverage reports malformed manifest */}
  const files=new Map<string,FileContext>();
  for(const[path,source]of sources){
    const language=sourceLanguage(path);if(!language&&!/\.[cm]?[jt]sx?$/.test(path))continue;
    const project=projects.filter(project=>project.directory==='.'||path.startsWith(project.directory+'/')).sort((a,b)=>b.directory.length-a.directory.length)[0];
    const products=new Set(project?.dependencies.map(dep=>registeredStackForDependency(project.ecosystem,dep.name)?.stackId).filter((id):id is string=>Boolean(id))??[]);
    for(const tool of project?.tools??[])products.add(tool);
    const extension=path.split('.').at(-1)!;for(const entry of stackRegistry)if(entry.sourceExtensions.includes(extension)&&entry.stackId!=='wpf')products.add(entry.stackId);
    const ecosystem=({python:'pypi',java:'maven',kotlin:'maven',scala:'maven',csharp:'nuget',go:'go',rust:'cargo',ruby:'gem',php:'composer',dart:'dart',swift:'swift'}as Record<string,Ecosystem>)[language??'']??'npm';
    for(const reference of languageImports(path,source)){const product=productForModule(reference.specifier,ecosystem);if(product)products.add(product);}
    const script=scriptSource(path,source);const ast=compiler.files.get(path)??(/\.(?:vue|svelte|astro|html)$/.test(path)?ts.createSourceFile(path,script,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS):undefined);
    const imports=new Map<string,ImportSymbol>();
    if(language==='python')for(const match of source.matchAll(/^\s*from\s+([\w.]+)\s+import\s+([^\n]+)/gm)){
      if(!sourceSyntax(source,'python').code.slice(match.index!,match.index!+match[0].length).trim())continue;
      for(const item of match[2]!.replace(/[()]/g,'').split(',')){const named=item.trim().match(/^(\w+)(?:\s+as\s+(\w+))?$/);if(named){const module=/^\.+$/.test(match[1]!)?match[1]!+named[1]:match[1]!;imports.set(named[2]??named[1]!,{module,symbol:named[1]!,stackId:productForModule(module,'pypi')});}}
    }
    if(language==='python')for(const match of sourceSyntax(source,'python').code.matchAll(/^\s*import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm))imports.set(match[2]??match[1]!.split('.')[0]!,{module:match[1]!,symbol:'*',stackId:productForModule(match[1]!,'pypi')});
    const nativeCode=sourceSyntax(source,language??'typescript').code;
    if(['java','kotlin','scala'].includes(language??''))for(const match of nativeCode.matchAll(/\bimport\s+([\w.]+)(?:\s+as\s+(\w+))?/g)){const name=match[1]!.split('.').at(-1)!;imports.set(match[2]??name,{module:match[1]!,symbol:name,stackId:productForModule(match[1]!,'maven')});}
    if(language==='php')for(const match of nativeCode.matchAll(/\buse\s+([\w\\]+)(?:\s+as\s+(\w+))?\s*;/g)){const name=match[1]!.split('\\').at(-1)!;imports.set(match[2]??name,{module:match[1]!,symbol:name,stackId:productForModule(match[1]!,'composer')});}
    if(language==='go')for(const reference of languageImports(path,source)){const prefix=source.slice(source.lastIndexOf('\n',reference.start)+1,reference.start);const alias=prefix.match(/\bimport\s+(\w+)\s*$/)?.[1]??prefix.match(/^\s*(\w+)\s*$/)?.[1];const local=alias&&alias!=='import'?alias:reference.specifier.split('/').at(-1)!;imports.set(local,{module:reference.specifier,symbol:'*',stackId:productForModule(reference.specifier,'go')});}
    if(language==='rust')for(const match of nativeCode.matchAll(/\buse\s+([\w:]+)(?:\{([^}]+)\})?\s*;/g)){const parts=match[2]?match[2].split(',').map(item=>match[1]!.replace(/::$/,'')+'::'+item.trim()):[match[1]!];for(const part of parts){const pieces=part.split(/\s+as\s+/);const name=pieces[0]!.split('::').at(-1)!;imports.set(pieces[1]??name,{module:pieces[0]!,symbol:name,stackId:productForModule(pieces[0]!.split('::')[0]!,'cargo')});}}
    if(ast)for(const statement of ast.statements)if(ts.isImportDeclaration(statement)&&ts.isStringLiteralLike(statement.moduleSpecifier)&&!statement.importClause?.isTypeOnly){const module=statement.moduleSpecifier.text,stackId=productForModule(module,'npm');if(stackId)products.add(stackId);const clause=statement.importClause;
      if(clause?.name)imports.set(clause.name.text,{module,symbol:'default',stackId});if(clause?.namedBindings){if(ts.isNamespaceImport(clause.namedBindings))imports.set(clause.namedBindings.name.text,{module,symbol:'*',stackId});else for(const item of clause.namedBindings.elements)if(!item.isTypeOnly)imports.set(item.name.text,{module,symbol:item.propertyName?.text??item.name.text,stackId});}}
    const symbols=new Map<ts.Symbol,ImportSymbol>();
    if(ast)visitSource(ast,current=>{if(ts.isImportClause(current)&&current.name){const symbol=compiler.checker.getSymbolAtLocation(current.name);const binding=imports.get(current.name.text);if(symbol&&binding)symbols.set(symbol,binding);}if(ts.isImportSpecifier(current)||ts.isNamespaceImport(current)){const symbol=compiler.checker.getSymbolAtLocation(current.name);const binding=imports.get(current.name.text);if(symbol&&binding)symbols.set(symbol,binding);}});
    const fileContext:FileContext={path,source,code:sourceSyntax(script,language??'typescript').code,products,project,imports,symbols,checker:compiler.checker,ast};files.set(path,fileContext);
    if(ast&&products.has('angular'))visitSource(ast,current=>{
      if(!ts.isClassDeclaration(current)||!current.name)return;
      for(const decorator of ts.getDecorators(current)??[]){if(!ts.isCallExpression(decorator.expression)||!ts.isIdentifier(decorator.expression.expression))continue;const symbol=compiler.checker.getSymbolAtLocation(decorator.expression.expression);const binding=symbol?symbols.get(symbol):undefined;if(binding?.stackId!=='angular'||binding.symbol!=='Component')continue;
        const options=decorator.expression.arguments[0];if(!options||!ts.isObjectLiteralExpression(options))continue;const template=options.properties.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(ast)==='template')as ts.PropertyAssignment|undefined;
        if(template&&ts.isStringLiteralLike(template.initializer)&&template.initializer.getText(ast).slice(1,-1)===template.initializer.text){const start=template.initializer.getStart(ast)+1;files.set(`${path}#template:${start}`,{...fileContext,inlineTemplate:{start,text:template.initializer.text,ownerName:current.name.text}});}
        const external=options.properties.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(ast)==='templateUrl')as ts.PropertyAssignment|undefined;
        if(external&&ts.isStringLiteralLike(external.initializer)){const target=localPath(directoryFor(path),external.initializer.text);if(target)(fileContext.externalTemplates??=[]).push({path:target,ownerName:current.name.text});}
      }
    });
  }
  const node:AdapterContext['node']=(kind,label,path,start,end,attributes={})=>{
    const existing=kind==='operation'?operationsByRange.get(`${path}:${start}:${end}`):analysis.nodes.find(node=>node.kind===kind&&node.path===path&&node.evidence.some(item=>item.start===start&&(!attributes.event||item.end===end))&&(node.label===label||kind==='entry'&&attributes.event&&node.attributes.event===attributes.event));
    if(existing){existing.attributes={...existing.attributes,...attributes};if(attributes.event)existing.label=label;return existing;}
    const value:SemanticNode={id:`stack-semantic:${kind}:${path}:${start}:${end}:${label}`,kind,label,path,line:input.sources[path]!.slice(0,start).split('\n').length,endLine:input.sources[path]!.slice(0,end).split('\n').length,language:sourceLanguage(path),group:attributes.test?'Tests':attributes.component?'UI':attributes.dictionaryStackId&&['schema','table','document'].includes(String(attributes.modelKind))?'Persistence':'Domain services',confidence:'source',evidence:[ev(path,input.sources[path]!,start,end,label)],attributes};analysis.nodes.push(value);if(kind==='operation')operationsByRange.set(`${path}:${start}:${end}`,value);return value;
  };
  const edge:AdapterContext['edge']=(from,to,kind,views,evidence)=>{if(from.id===to.id)return;const existing=kind==='handles'?analysis.edges.find(edge=>edge.kind===kind&&edge.source===from.id&&edge.target===to.id):undefined;if(existing){existing.views=[...new Set([...existing.views,...views])];for(const at of evidence)if(!existing.evidence.some(prior=>prior.path===at.path&&prior.start===at.start&&prior.end===at.end))existing.evidence.push(at);return;}const id=`stack-semantic:${kind}:${from.id}:${to.id}:${evidence[0]?.start??''}`;if(!analysis.edges.some(edge=>edge.id===id))analysis.edges.push({id,source:from.id,target:to.id,kind,label:kind.replaceAll('-',' '),views,confidence:'source',evidence});};
  const handler:AdapterContext['handler']=(path,name)=>{
    let cleaned=name.replace(/^this\./,'').replace(/\(.*$/,'').trim();const paths=new Set([path,...input.imports.filter(item=>item.from===path).map(item=>item.to)]);
    if(cleaned.includes('.')){const binding=files.get(path)?.imports.get(cleaned.split('.')[0]!);if(binding){const target=input.imports.find(item=>item.from===path&&(item.specifier===binding.module||item.specifier.endsWith(binding.module)));if(target){paths.clear();paths.add(target.to);cleaned=cleaned.split('.').at(-1)!;}}}
    const candidates=analysis.nodes.filter(node=>node.kind==='function'&&!node.attributes.initializer&&paths.has(node.path??'')&&(node.attributes.name===cleaned||node.label===cleaned||node.label.endsWith('.'+cleaned)));
    return candidates.length===1?candidates[0]:undefined;
  };
  const owner:AdapterContext['owner']=(path,start)=>(functionsByPath.get(path)??[]).filter(node=>node.evidence.some(item=>item.start<=start&&item.end>=start)).sort((a,b)=>(a.evidence[0]!.end-a.evidence[0]!.start)-(b.evidence[0]!.end-b.evidence[0]!.start))[0];
  const model:AdapterContext['model']=(file,name,stackId,start,end,fields,domain='code')=>{
    const existing=analysis.nodes.find(node=>node.kind==='model'&&node.path===file.path&&node.label===name&&node.evidence.some(at=>at.start<=start&&at.end>=end||at.start>=start&&at.end<=end));const result=existing??node('model',name,file.path,start,end,{dictionaryStackId:stackId});
    result.attributes.dictionaryStackId=stackId;result.attributes.modelKind=domain==='storage'?'schema':domain==='validation'?'validation':'object';
    const merged=new Map((result.fields??[]).map(field=>[field.name,field]));for(const field of fields)merged.set(field.name,{...merged.get(field.name),...field,id:`${result.id}:field:${field.name}`});result.fields=[...merged.values()];
    result.model={domain,kind:domain==='storage'?'schema':'object',definition:file.source.slice(start,end),expansion:fields.length?'expanded':'partial',reasons:fields.length?[]:['明示fieldを展開できる範囲に制限']};return result;
  };
  return{analysis,input,files,node,edge,handler,owner,model};
}

function templateAdapters(context:AdapterContext):void {
  const{files,node,edge,handler,model}=context;
  const bindings:{file:FileContext;component:SemanticNode;value:SemanticNode;name:string;expression:string;handlerPath:string;stackId:string;evidence:SemanticEvidence}[]=[];
  for(const file of files.values()){
    const extension=file.path.split('.').at(-1);let stackId=file.inlineTemplate?'angular':extension==='vue'?'vue':extension==='svelte'?'svelte':extension==='astro'?'astro':extension==='xaml'&&file.products.has('wpf')?'wpf':undefined;
    let handlerPath=file.path;
    if(extension==='html'){const owners=[...files.values()].filter(candidate=>!candidate.inlineTemplate&&candidate.externalTemplates?.some(template=>template.path===file.path));if(owners.length===1){stackId='angular';handlerPath=owners[0]!.path;}}
    if(!stackId&&extension==='html'){
      const reachable=new Map<string,SemanticEvidence[]>([[file.path,[]]]);
      for(const element of templateElements(file.source)){const reference=element.attributes.find(attribute=>element.name==='script'&&attribute.name==='src'||element.name==='link'&&attribute.name==='href'&&element.attributes.some(item=>item.name==='rel'&&item.value.split(/\s+/).includes('stylesheet')));if(!reference||/^(?:[a-z]+:|\/\/)/i.test(reference.value))continue;const target=localPath(directoryFor(file.path),reference.value.replace(/^\//,''));if(target&&context.input.sources[target]!==undefined)reachable.set(target,[ev(file.path,file.source,reference.start,reference.end,'HTMLから読み込むscript / stylesheet')]);}
      for(let size=-1;size!==reachable.size;){size=reachable.size;for(const reference of context.input.imports){const prior=reachable.get(reference.from);const source=context.input.sources[reference.from]??'';const position=languageImports(reference.from,source).find(item=>item.specifier===reference.specifier);if(prior&&position&&!reachable.has(reference.to))reachable.set(reference.to,[...prior,ev(reference.from,source,position.start,position.end,'到達可能なmodule import')]);}}
      const assets=context.analysis.nodes.filter(node=>node.kind==='resource'&&node.attributes.dictionaryStackId==='bootstrap'&&node.attributes.assetReference&&node.path&&reachable.has(node.path));
      if(assets.length)for(const element of templateElements(file.source)){const classes=element.attributes.find(attribute=>attribute.name==='class');if(!classes||!classes.value.split(/\s+/).some(value=>/^(?:btn|container|row|col|card|modal|navbar|form-control)(?:-|$)/.test(value)))continue;const component=node('entry',`Bootstrap · ${element.name}`,file.path,element.start,element.end,{component:true,dictionaryStackId:'bootstrap'});for(const asset of assets)edge(component,asset,'uses-style',['runtime-flow'],[ev(file.path,file.source,classes.start,classes.end,'読み込み経路が確認されたBootstrap CSSを使用する要素'),...reachable.get(asset.path!)!,...asset.evidence]);}
    }
    if(!stackId)continue;
    const templateSource=file.inlineTemplate?file.source.slice(0,file.inlineTemplate.start).replace(/[^\r\n]/g,' ')+file.inlineTemplate.text:file.source;
    const elements=templateElements(templateSource);if(!elements.length)continue;const component=node('entry',`Component · ${file.inlineTemplate?.ownerName??file.path.split('/').at(-1)}`,file.path,file.inlineTemplate?.start??0,file.inlineTemplate?file.inlineTemplate.start+file.inlineTemplate.text.length:file.source.length,{component:true,dictionaryStackId:stackId});
    if(stackId==='angular')component.attributes.className=file.inlineTemplate?.ownerName??files.get(handlerPath)?.externalTemplates?.find(template=>template.path===file.path)?.ownerName??'';
    if(stackId==='astro'&&file.ast){
      visitSource(file.ast,current=>{if(!ts.isPropertyAccessExpression(current)||current.getText(file.ast)!=='Astro.props')return;const declaration=file.ast!.statements.find(statement=>ts.isInterfaceDeclaration(statement)&&statement.name.text==='Props');if(!declaration||!ts.isInterfaceDeclaration(declaration))return;const fields=declaration.members.filter(ts.isPropertySignature).map(property=>({name:property.name.getText(file.ast),type:property.type?.getText(file.ast)??'unknown',optional:Boolean(property.questionToken),evidence:[sourceEvidence(property,'Astro Props field')]}));const props=model(file,'Props','astro',declaration.getStart(file.ast),declaration.end,fields);edge(props,component,'component-props',['data-flow'],[sourceEvidence(current,'Astro.propsの参照'),...props.evidence]);});
      for(const element of elements){const directive=element.attributes.find(attribute=>/^client:(?:load|idle|visible|media|only)$/.test(attribute.name));if(!directive)continue;const rawTag=file.source.slice(element.start).match(/^<([\w.]+)/)?.[1];const target=rawTag?handler(file.path,rawTag):undefined;if(!target)continue;const island=node('entry',`Island · ${rawTag}`,file.path,directive.start,directive.end,{dictionaryStackId:'astro',component:true,islandDirective:directive.name});edge(component,island,'hydrates-island',['runtime-flow'],island.evidence);edge(island,target,'renders-island',['runtime-flow','function-call-flow'],[...island.evidence,...target.evidence]);}
      const ids=new Set(elements.flatMap(element=>element.attributes.filter(attribute=>attribute.name==='id').map(attribute=>attribute.value)));
      for(const event of context.analysis.nodes.filter(node=>node.kind==='entry'&&node.path===file.path&&node.attributes.registration)){const source=event.evidence.map(at=>file.source.slice(at.start,at.end)).join(' ');if([...ids].some(id=>source.includes(`'#${id}'`)||source.includes(`"#${id}"`)))edge(component,event,'registers-event',['runtime-flow'],event.evidence);}
    }
    if(stackId==='wpf'){
      const xclass=elements.flatMap(element=>element.attributes).find(attribute=>attribute.name==='x:class')?.value;
      handlerPath='';
      if(xclass){const target=[...files.values()].filter(candidate=>candidate.path.endsWith('.cs')&&candidate.project?.directory===file.project?.directory&&[...candidate.code.matchAll(/\bclass\s+(\w+)/g)].some(match=>{const namespaces=[...candidate.code.slice(0,match.index!).matchAll(/\bnamespace\s+([\w.]+)\s*[{;]/g)];const qualified=[namespaces.at(-1)?.[1],match[1]].filter(Boolean).join('.');return qualified===xclass;}));if(target.length===1)handlerPath=target[0]!.path;}
      component.attributes.className=xclass??'';
    }
    for(const element of elements)for(const attribute of element.attributes){
      const rawName=file.source.slice(attribute.start,attribute.end).match(/^([^\s=]+)/)?.[1]??attribute.name;
      const event=stackId==='vue'?/^(?:@|v-on:)([\w:-]+)/.exec(attribute.name)?.[1]:stackId==='svelte'||stackId==='astro'?/^(?:on:|on)([a-z]+)/.exec(attribute.name)?.[1]:stackId==='angular'?/^\(([^)]+)\)$/.exec(attribute.name)?.[1]:stackId==='wpf'&&/^(?:Click|Loaded|Unloaded|TextChanged|SelectionChanged|Checked|Unchecked|KeyDown|MouseDown|CommandExecuted)$/.test(rawName)?rawName:undefined;
      const expression=attribute.value.replace(/^[{]|[}]$/g,'').trim();const at=ev(file.path,file.source,attribute.start,attribute.end,`${rawName} template binding`);
      if(event){const eventNode=node('entry',`${event} · ${element.name}`,file.path,attribute.start,attribute.end,{event,componentId:component.id,dictionaryStackId:stackId});edge(component,eventNode,'registers-event',['runtime-flow'],[at]);
        let target=handler(handlerPath,expression);if(stackId==='astro'&&target&&!([...file.source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].some(match=>target!.evidence.some(item=>item.start>match.index!&&item.end<match.index!+match[0].length))))target=undefined;
        if(target){edge(eventNode,target,'handles',['runtime-flow','function-call-flow'],[at,...target.evidence]);target.attributes.entry=true;target.attributes.dictionaryStackId=stackId;}else{eventNode.confidence='unresolved';eventNode.attributes.unresolvedHandler=expression;}
      }
      const binding=stackId==='vue'?/^(?:v-model(?::[^.]+)?|:|v-bind:)/.test(attribute.name):stackId==='svelte'?/^bind:/.test(attribute.name):stackId==='angular'?/^\[/.test(attribute.name):stackId==='wpf'?/^\{Binding\b/.test(attribute.value):false;
      if(binding){const valueName=stackId==='wpf'?attribute.value.match(/\{Binding\s+(?:Path=)?([\w.]+)/)?.[1]??attribute.value:expression;
        const value=node('value',valueName,file.path,attribute.start,attribute.end,{dictionaryStackId:stackId,binding:true,componentId:component.id});value.data={role:'use',expression:attribute.value,resolution:/^[\w.]+$/.test(valueName)?'partial':'unresolved',reasons:['templateの静的binding。実行時の値は未評価']};edge(value,component,'template-binding',flowViews,[at]);
        bindings.push({file,component,value,name:valueName,expression:attribute.value,handlerPath,stackId,evidence:at});
      }
    }
    const script=scriptSource(file.path,file.source);
    if(stackId==='vue'&&file.ast)visitSource(file.ast,current=>{
      if(!ts.isCallExpression(current)||!ts.isIdentifier(current.expression)||current.expression.text!=='defineProps')return;
      const symbol=file.checker.getSymbolAtLocation(current.expression);if(symbol&&!file.symbols.has(symbol))return;
      const shape=current.typeArguments?.[0];if(!shape||!ts.isTypeLiteralNode(shape))return;
      const fields=shape.members.filter(ts.isPropertySignature).map(property=>({name:property.name.getText(file.ast),type:property.type?.getText(file.ast)??'unknown',optional:Boolean(property.questionToken),evidence:[sourceEvidence(property,'Vue prop')]}));
      const props=model(file,`${component.label} props`,stackId,current.getStart(file.ast),current.end,fields);edge(props,component,'component-props',['data-flow'],props.evidence);
    });
    if(stackId==='svelte'){
      const fields:SemanticField[]=[];for(const statement of file.ast?.statements??[]){if(!ts.isVariableStatement(statement)||!statement.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword)||!(statement.declarationList.flags&ts.NodeFlags.Let))continue;for(const declaration of statement.declarationList.declarations)if(ts.isIdentifier(declaration.name))fields.push({name:declaration.name.text,type:declaration.type?.getText(file.ast)??'unknown',optional:Boolean(declaration.initializer),evidence:[sourceEvidence(declaration,'Svelte prop')]});}
      if(fields.length){const props=model(file,`${component.label} props`,stackId,0,script.length,fields);edge(props,component,'component-props',['data-flow'],props.evidence);}
    }
    const state:SemanticField[]=[];for(const statement of file.ast?.statements??[]){if(!ts.isVariableStatement(statement))continue;for(const declaration of statement.declarationList.declarations){const call=declaration.initializer;if(!ts.isIdentifier(declaration.name)||!call||!ts.isCallExpression(call)||!ts.isIdentifier(call.expression))continue;const symbol=file.checker.getSymbolAtLocation(call.expression);const imported=symbol?file.symbols.get(symbol):undefined;const isState=imported?.stackId==='vue'&&['ref','reactive'].includes(imported.symbol)||!symbol&&(stackId==='svelte'&&call.expression.text==='$state'||file.products.has('nuxt')&&['ref','reactive'].includes(call.expression.text));if(!isState)continue;const initial=call.arguments[0];state.push({name:declaration.name.text,type:initial&&ts.isStringLiteralLike(initial)?'string':initial&&ts.isNumericLiteral(initial)?'number':'unknown',optional:false,evidence:[sourceEvidence(declaration,'component stateの宣言')]});}}
    if(state.length){const stateModel=model(file,`${component.label} state`,stackId,0,script.length,state);edge(stateModel,component,'component-state',['data-flow'],stateModel.evidence);}
  }
  for(const binding of bindings){const source=files.get(binding.handlerPath);if(!source)continue;let declaration:SemanticNode|undefined;
    if(binding.stackId==='wpf'){
      const className=String(binding.component.attributes.className??'').split('.').at(-1);const owner=context.analysis.nodes.find(node=>node.kind==='model'&&node.path===binding.handlerPath&&node.label===className);
      const ownerCode=owner?source.code.slice(owner.evidence[0]!.start,owner.evidence[0]!.end):'';const explicitlyThis=/(?:\bthis\.)?\bDataContext\s*=\s*this\s*;/.test(ownerCode)&&!/\b(?:var|object)\s+DataContext\s*=/.test(ownerCode);
      const elementName=binding.expression.match(/\bElementName\s*=\s*(\w+)/)?.[1];const namedRoot=elementName&&templateElements(binding.file.source).some(element=>element.attributes.some(attribute=>attribute.name==='x:name'&&attribute.value===elementName)&&element.attributes.some(attribute=>attribute.name==='x:class'&&attribute.value===binding.component.attributes.className));
      if((explicitlyThis||namedRoot)&&owner?.fields?.some(field=>field.name===binding.name))declaration=owner;
      else{binding.value.data!.resolution='unresolved';binding.value.data!.reasons=['Binding source / DataContextを静的に特定できない'];}
    }else{
      const root=(source.ast?.statements??[]).flatMap(statement=>ts.isVariableStatement(statement)?[...statement.declarationList.declarations]:[]).find(item=>ts.isIdentifier(item.name)&&item.name.text===binding.name);
      if(root){const candidates=context.analysis.nodes.filter(node=>node.kind==='value'&&node.id!==binding.value.id&&node.path===binding.handlerPath&&node.data?.role==='declaration'&&node.label===binding.name&&node.evidence.some(at=>at.start<=root.name.getStart()&&at.end>=root.name.end));if(candidates.length===1)declaration=candidates[0];}
      if(!declaration){const models=context.analysis.nodes.filter(node=>node.kind==='model'&&node.path===binding.handlerPath&&node.fields?.some(field=>field.name===binding.name)&&(node.label===binding.component.attributes.className||node.label===`${binding.component.label} props`||node.label===`${binding.component.label} state`));if(models.length===1)declaration=models[0];}
    }
    if(declaration)edge(declaration,binding.value,'binds-value',['data-flow'],[...declaration.evidence,binding.evidence]);
  }
}

function jsAdapters(context:AdapterContext):void {
  const{node,edge,owner,model}=context;
  for(const file of context.files.values()){
    if(!file.ast||file.inlineTemplate)continue;const ast=file.ast;const bindingFor=(expression:ts.Expression):ImportSymbol|undefined=>{
      const name=ts.isIdentifier(expression)?expression:ts.isPropertyAccessExpression(expression)?expression.expression:undefined;const symbol=name?file.checker.getSymbolAtLocation(name):undefined;const binding=symbol?file.symbols.get(symbol):undefined;
      return ts.isIdentifier(expression)?binding:ts.isPropertyAccessExpression(expression)&&binding&&['*','default'].includes(binding.symbol)?{...binding,symbol:expression.name.text}:undefined;
    };
    const resolveSymbol=(node:ts.Node)=>{let symbol=file.checker.getSymbolAtLocation(node);if(symbol?.flags&&symbol.flags&ts.SymbolFlags.Alias)symbol=file.checker.getAliasedSymbol(symbol);return symbol;};
    const shapeForType=(type:ts.TypeNode|undefined)=>{if(type&&ts.isArrayTypeNode(type))type=type.elementType;if(!type||!ts.isTypeReferenceNode(type))return;const symbol=resolveSymbol(type.typeName);const declarations=symbol?.declarations?.filter(declaration=>ts.isInterfaceDeclaration(declaration)||ts.isClassDeclaration(declaration)||ts.isTypeAliasDeclaration(declaration))??[];const candidates=declarations.flatMap(declaration=>{const path=declaration.getSourceFile().fileName;const name=declaration.name;if(!name)return[];return context.analysis.nodes.filter(item=>item.kind==='model'&&item.path===path&&item.evidence.some(at=>at.start<=name.getStart()&&at.end>=name.end&&at.end===declaration.end));});return candidates.length===1?candidates[0]:undefined;};
    const handlerExpression=(expression:ts.Expression):SemanticNode|undefined=>{
      const symbol=resolveSymbol(expression);const declarations=ts.isArrowFunction(expression)||ts.isFunctionExpression(expression)?[expression]:symbol?.declarations??[];
      const candidates=declarations.flatMap(declaration=>{
        const target=ts.isVariableDeclaration(declaration)?declaration.initializer:declaration;
        if(!target||!ts.isFunctionDeclaration(target)&&!ts.isMethodDeclaration(target)&&!ts.isArrowFunction(target)&&!ts.isFunctionExpression(target))return[];
        const targetFile=target.getSourceFile();const functions=context.analysis.nodes.filter(node=>node.kind==='function'&&!node.attributes.initializer&&node.path===targetFile.fileName&&node.evidence.some(at=>at.start>=target.getStart(targetFile)&&at.end<=target.end));return functions.filter(node=>!functions.some(other=>other!==node&&other.evidence.some(outer=>node.evidence.some(inner=>outer.start<=inner.start&&outer.end>=inner.end&&(outer.start<inner.start||outer.end>inner.end)))));
      });return candidates.length===1?candidates[0]:undefined;
    };
    const objectFields=(value:ts.ObjectLiteralExpression):SemanticField[]=>value.properties.flatMap(property=>{if(!ts.isPropertyAssignment(property)&&!ts.isShorthandPropertyAssignment(property))return[];const name=property.name.getText(ast).replace(/^['"]|['"]$/g,'');const initializer=ts.isPropertyAssignment(property)?property.initializer:undefined;const type=initializer?ts.isStringLiteralLike(initializer)?'string':ts.isNumericLiteral(initializer)?'number':initializer.getText(ast):'unknown';return[{name,type,optional:/optional|nullable/.test(type),evidence:[sourceEvidence(property,`${name} field`)]}];});
    const declarations=new Map<ts.Symbol,{product:string;kind:string;node:ts.VariableDeclaration;member?:string}>();
    const classProducts=new Map<ts.Symbol,string>();const ormModels=new Map<ts.Symbol,SemanticNode>();
    visitSource(ast,current=>{if(!ts.isClassDeclaration(current)||!current.name)return;for(const clause of current.heritageClauses??[])if(clause.token===ts.SyntaxKind.ExtendsKeyword)for(const type of clause.types){const binding=bindingFor(type.expression);const symbol=file.checker.getSymbolAtLocation(current.name);if(symbol&&binding?.stackId==='sequelize'&&binding.symbol==='Model')classProducts.set(symbol,'sequelize');}});
    const parameterProducts=new Map<ts.Symbol,string>();const mountedPrefixes=new Map<ts.Symbol,{prefix:string;evidence:SemanticEvidence}[]>();
    const mount=(symbol:ts.Symbol,prefix:string,evidence:SemanticEvidence)=>mountedPrefixes.set(symbol,[...(mountedPrefixes.get(symbol)??[]),{prefix,evidence}]);
    if([...file.imports.values()].some(binding=>['express','fastify','nestjs'].includes(binding.stackId??''))){
      const sites:SemanticEvidence[]=[];visitSource(ast,current=>{if(!ts.isCallExpression(current))return;const name=bindingFor(current.expression)?.symbol??(ts.isPropertyAccessExpression(current.expression)?current.expression.name.text:ts.isIdentifier(current.expression)?current.expression.text:'');if(!/^(?:get|post|put|patch|delete|all|route|Get|Post|Put|Patch|Delete|All|HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete)$/.test(name))return;if(!current.arguments.some(argument=>ts.isStringLiteralLike(argument)))return;sites.push(sourceEvidence(ts.isDecorator(current.parent)?current.parent:current,'専用route adapterの検証対象'));});
      const replaced=new Set(context.analysis.nodes.filter(item=>item.kind==='entry'&&item.path===file.path&&item.attributes.endpoint&&item.evidence.some(at=>sites.some(site=>site.start===at.start&&site.end===at.end))).map(item=>item.id));
      const priorHandlers=new Set(context.analysis.edges.filter(relation=>replaced.has(relation.source)&&relation.kind==='handles').map(relation=>relation.target));
      context.analysis.nodes=context.analysis.nodes.filter(item=>!replaced.has(item.id));context.analysis.edges=context.analysis.edges.filter(relation=>!replaced.has(relation.source)&&!replaced.has(relation.target));
      for(const id of priorHandlers){const target=context.analysis.nodes.find(item=>item.id===id);if(target&&!context.analysis.edges.some(relation=>relation.target===id&&relation.kind==='handles')&&!/^(?:main|GET|POST|PUT|PATCH|DELETE|activate)$/.test(String(target.attributes.name)))target.attributes.entry=false;}
    }
    const valueProduct=(expression:ts.Expression):string|undefined=>{
      if(ts.isAwaitExpression(expression)){const product=valueProduct(expression.expression);return product&&['mongoose','sequelize','supabase'].includes(product)?undefined:product;}if(ts.isParenthesizedExpression(expression))return valueProduct(expression.expression);
      const imported=bindingFor(expression);if(imported?.stackId)return imported.stackId;
      if(ts.isIdentifier(expression)){const symbol=file.checker.getSymbolAtLocation(expression);return symbol?declarations.get(symbol)?.product??parameterProducts.get(symbol)??classProducts.get(symbol):undefined;}
      if(ts.isPropertyAccessExpression(expression))return valueProduct(expression.expression);
      if(ts.isCallExpression(expression)||ts.isNewExpression(expression)){const product=valueProduct(expression.expression);const symbol=bindingFor(expression.expression)?.symbol??(ts.isPropertyAccessExpression(expression.expression)?expression.expression.name.text:expression.expression.getText(ast));if(product==='redis'&&!ts.isNewExpression(expression)&&!['createClient','duplicate','multi'].includes(symbol))return;if(product==='cloud-firestore'&&!['getFirestore','collection','doc','query'].includes(symbol))return;if(product==='auth0'&&!ts.isNewExpression(expression))return;if(product==='clerk'&&!['createClerkClient'].includes(symbol))return;if(product==='supabase'&&/^(?:getUser|getSession|signInWithPassword|signOut|download|upload)$/.test(symbol))return;return product;}
      return undefined;
    };
    for(let pass=0;pass<3;pass++)visitSource(ast,current=>{if(!ts.isVariableDeclaration(current)||!current.initializer)return;const product=valueProduct(current.initializer);if(!product)return;
      const names=ts.isIdentifier(current.name)?[current.name]:ts.isObjectBindingPattern(current.name)||ts.isArrayBindingPattern(current.name)?current.name.elements.flatMap(item=>ts.isBindingElement(item)&&ts.isIdentifier(item.name)?[item.name]:[]):[];
      for(const name of names){const symbol=file.checker.getSymbolAtLocation(name);if(symbol)declarations.set(symbol,{product,kind:current.initializer.getText(ast),node:current,member:ts.isBindingElement(name.parent)?name.parent.propertyName?.getText(ast)??name.text:undefined});}
    });
    const sourceInstances=(expression:ts.Expression,seen=new Set<ts.Symbol>()):string[]=>{
      if(ts.isIdentifier(expression)){const symbol=file.checker.getSymbolAtLocation(expression);const declaration=symbol?declarations.get(symbol)?.node:undefined;if(!symbol||seen.has(symbol)||!declaration?.initializer)return[];return[`${file.path}:${declaration.initializer.getStart(ast)}`,`${expression.text}:${declaration.name.getStart(ast)}`,...sourceInstances(declaration.initializer,new Set([...seen,symbol]))];}
      if(ts.isPropertyAccessExpression(expression)||ts.isAwaitExpression(expression)||ts.isParenthesizedExpression(expression))return sourceInstances(expression.expression,seen);
      if(ts.isCallExpression(expression)||ts.isNewExpression(expression))return[...sourceInstances(expression.expression,seen),...(expression.arguments??[]).flatMap(argument=>sourceInstances(argument,seen))];return[];
    };
    const sdkService=(expression:ts.Expression,seen=new Set<ts.Symbol>()):string|undefined=>{
      if(ts.isPropertyAccessExpression(expression)){const parent=sdkService(expression.expression,seen);return parent??(['auth','storage'].includes(expression.name.text)?expression.name.text:undefined);}
      if(ts.isCallExpression(expression)||ts.isNewExpression(expression)||ts.isAwaitExpression(expression)||ts.isParenthesizedExpression(expression))return sdkService(expression.expression,seen);
      if(ts.isIdentifier(expression)){const symbol=file.checker.getSymbolAtLocation(expression);const declaration=symbol?declarations.get(symbol)?.node:undefined;return symbol&&!seen.has(symbol)&&declaration?.initializer?sdkService(declaration.initializer,new Set([...seen,symbol])):undefined;}return undefined;
    };
    const firestoreReference=(expression:ts.Expression,seen=new Set<ts.Symbol>()):{path:string;kind:string;unresolved?:boolean;prefix?:string}|undefined=>{
      if(ts.isIdentifier(expression)){const symbol=file.checker.getSymbolAtLocation(expression);const declaration=symbol?declarations.get(symbol)?.node:undefined;return symbol&&!seen.has(symbol)&&declaration?.initializer?firestoreReference(declaration.initializer,new Set([...seen,symbol])):undefined;}
      if(ts.isCallExpression(expression)){const binding=bindingFor(expression.expression);const method=binding?.symbol??(ts.isPropertyAccessExpression(expression.expression)?expression.expression.name.text:undefined);if(valueProduct(expression.expression)!=='cloud-firestore')return;const base=binding?expression.arguments[0]:ts.isPropertyAccessExpression(expression.expression)?expression.expression.expression:undefined;const parent=base?firestoreReference(base,seen):undefined;if(method==='query')return parent;if(method==='doc'||method==='collection'){const argumentsToPath=binding?expression.arguments.slice(1):expression.arguments;const values=argumentsToPath.flatMap(item=>ts.isStringLiteralLike(item)?[item.text]:[]);const kind=method==='doc'?'document':'collection';if(parent?.unresolved||values.length!==argumentsToPath.length||!values.length){const prefix=parent?.unresolved?parent.prefix:[parent?.path,...argumentsToPath.slice(0,argumentsToPath.findIndex(item=>!ts.isStringLiteralLike(item))).flatMap(item=>ts.isStringLiteralLike(item)?[item.text]:[])].filter(Boolean).join('/');return{path:'',kind,unresolved:true,prefix};}return{path:[parent?.path,...values].filter(Boolean).join('/'),kind};}}
      return undefined;
    };
    const stateDefinitions=new Map<string,{model:SemanticNode;actions:Map<string,SemanticNode>;selectors:Map<string,SemanticNode>}>();const reduxStores=new Map<string,Set<string>>();const swrHooks=new Map<string,SemanticNode>();
    visitSource(ast,current=>{if(!ts.isCallExpression(current)||!ts.isPropertyAccessExpression(current.expression))return;const product=valueProduct(current.expression.expression),method=current.expression.name.text;
      if(product==='express'&&method==='use'&&current.arguments[0]&&ts.isStringLiteralLike(current.arguments[0])&&current.arguments[1]&&ts.isIdentifier(current.arguments[1])&&valueProduct(current.arguments[1])==='express'){
        const symbol=file.checker.getSymbolAtLocation(current.arguments[1]);if(symbol)mount(symbol,current.arguments[0].text,sourceEvidence(current,'Express Routerの静的mount path'));
      }
      if(product==='fastify'&&method==='register'&&current.arguments[0]){
        const argument=current.arguments[0];const declaration=ts.isIdentifier(argument)?file.checker.getSymbolAtLocation(argument)?.valueDeclaration:argument;
        const callback=declaration&&ts.isVariableDeclaration(declaration)?declaration.initializer:declaration;
        if(callback&&(ts.isFunctionExpression(callback)||ts.isArrowFunction(callback)||ts.isFunctionDeclaration(callback))&&callback.parameters[0]&&ts.isIdentifier(callback.parameters[0].name)){
          const symbol=file.checker.getSymbolAtLocation(callback.parameters[0].name);if(symbol){parameterProducts.set(symbol,'fastify');const options=current.arguments[1];if(options&&ts.isObjectLiteralExpression(options)){const prefix=options.properties.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(ast)==='prefix')as ts.PropertyAssignment|undefined;if(prefix&&ts.isStringLiteralLike(prefix.initializer))mount(symbol,prefix.initializer.text,sourceEvidence(prefix,'Fastify plugin prefix'));}}
        }
      }
    });
    visitSource(ast,current=>{if(!ts.isClassDeclaration(current)||!current.name)return;const controller=(ts.getDecorators(current)??[]).map(item=>({item,call:ts.isCallExpression(item.expression)?item.expression:undefined})).find(({call})=>call&&bindingFor(call.expression)?.stackId==='nestjs'&&bindingFor(call.expression)?.symbol==='Controller');if(!controller?.call)return;
      const prefix=controller.call.arguments[0];const base=prefix&&ts.isStringLiteralLike(prefix)?prefix.text:'';
      for(const member of current.members){if(!ts.isMethodDeclaration(member))continue;for(const decorator of ts.getDecorators(member)??[]){if(!ts.isCallExpression(decorator.expression))continue;const call=decorator.expression,binding=bindingFor(call.expression);if(binding?.stackId!=='nestjs'||!['Get','Post','Put','Patch','Delete','Head','Options','All'].includes(binding.symbol))continue;const pathArg=call.arguments[0];if(pathArg&&!ts.isStringLiteralLike(pathArg))continue;
        const route=('/'+base+'/'+(pathArg?.text??'')).replace(/\/+/g,'/').replace(/\/$/,'')||'/';const method=binding.symbol==='All'?'ANY':binding.symbol.toUpperCase();const at=sourceEvidence(decorator,'NestJS Controllerのhandler登録');const entry=node('entry',`${method} ${route}`,file.path,at.start,at.end,{dictionaryStackId:'nestjs',endpoint:route,method,routeRegistrationVerified:true});const target=context.analysis.nodes.find(item=>item.kind==='function'&&item.path===file.path&&item.attributes.className===current.name!.text&&item.attributes.name===member.name.getText(ast));if(target){edge(entry,target,'handles',['runtime-flow','function-call-flow'],[at]);target.attributes.entry=true;target.attributes.dictionaryStackId='nestjs';}
      }}
    });
    visitSource(ast,current=>{
      if(ts.isJsxSelfClosingElement(current)||ts.isJsxOpeningElement(current)){
        const tag=current.tagName.getText(ast);const binding=ts.isJsxNamespacedName(current.tagName)?undefined:bindingFor(current.tagName);const product=binding?.stackId;
        if(product&&['mui','radix-ui','bootstrap','angular'].includes(product)){
          const component=node('entry',`${tag} component`,file.path,current.getStart(ast),current.end,{component:true,dictionaryStackId:product});
          for(const attribute of current.attributes.properties)if(ts.isJsxAttribute(attribute)){
            const name=attribute.name.getText(ast);const at=sourceEvidence(attribute,`${tag} ${name}`);const expression=attribute.initializer&&ts.isJsxExpression(attribute.initializer)?attribute.initializer.expression:undefined;
            if(/^on[A-Z]/.test(name)&&expression){const target=handlerExpression(expression);const event=node('entry',`${name} · ${tag}`,file.path,at.start,at.end,{event:name,dictionaryStackId:product});edge(component,event,'registers-event',['runtime-flow'],[at]);if(target)edge(event,target,'handles',['runtime-flow','function-call-flow'],[at,...target.evidence]);else event.confidence='unresolved';}
            else{const value=node('value',`${tag}.${name}`,file.path,at.start,at.end,{dictionaryStackId:product,prop:true});value.data={role:'argument',expression:attribute.initializer?.getText(ast)??'true',resolution:'partial'};edge(value,component,'component-prop',['data-flow'],[at]);}
          }
        }
      }
      if(!ts.isCallExpression(current)&&!ts.isNewExpression(current))return;
      const call=current;const binding=bindingFor(call.expression);const callee=call.expression.getText(ast);const receiver=ts.isPropertyAccessExpression(call.expression)?file.checker.getSymbolAtLocation(call.expression.expression):undefined;const declared=receiver?declarations.get(receiver):undefined;
      if(ts.isPropertyAccessExpression(call.expression)&&['get','put','delete','list'].includes(call.expression.name.text)&&ts.isPropertyAccessExpression(call.expression.expression)&&ts.isIdentifier(call.expression.expression.expression)){
        const namespace=call.expression.expression;const symbol=file.checker.getSymbolAtLocation(namespace.expression);const parameter=symbol?.valueDeclaration;const fn=parameter&&ts.isParameter(parameter)?parameter.parent:undefined;
        if(fn&&ts.isMethodDeclaration(fn)&&fn.parameters[1]===parameter&&['fetch','scheduled','queue'].includes(fn.name.getText(ast))&&ts.isObjectLiteralExpression(fn.parent)&&ts.isExportAssignment(fn.parent.parent)&&context.input.resources.some(resource=>resource.type==='runtime'&&resource.entryPath===file.path)){
          const resources=context.analysis.nodes.filter(node=>node.kind==='resource'&&node.attributes.dictionaryStackId==='cloudflare-kv'&&node.attributes.binding===namespace.name.text&&(context.input.projectScopes?.filter(scope=>scope.directory==='.'||node.path?.startsWith(scope.directory+'/')).sort((a,b)=>b.directory.length-a.directory.length)[0]?.directory??directoryFor(node.path??''))===(file.project?.directory??'.'));const at=sourceEvidence(call,'Workers entryのenv KV binding操作');
          for(const resource of resources){const operation=node('operation',`${callee}()`,file.path,at.start,at.end,{dictionaryStackId:'cloudflare-kv',callee,operation:'database'});operation.data={role:'operation',expression:call.getText(ast),resolution:'partial'};const parent=owner(file.path,at.start);if(parent)edge(parent,operation,'executes',['runtime-flow'],[at]);edge(operation,resource,'uses-resource',['runtime-flow','data-flow'],[at,...resource.evidence]);}
        }
      }
      const unboundGlobal=ts.isIdentifier(call.expression)&&!file.checker.getSymbolAtLocation(call.expression);const product=binding?.stackId??declared?.product??valueProduct(call.expression)??(unboundGlobal&&file.products.has('jest')&&/^(?:describe|it|test|expect)$/.test(callee)?'jest':file.products.has('cypress')&&(unboundGlobal&&/^(?:describe|it|test)$/.test(callee)||/^cy\./.test(callee))?'cypress':undefined);if(!product)return;
      const symbol=binding?.symbol==='default'?callee:binding?.symbol??(ts.isPropertyAccessExpression(call.expression)?call.expression.name.text:callee);const args=call.arguments??[];const at=sourceEvidence(call,`${product}: ${callee}`);const op=node('operation',`${callee}()`,file.path,at.start,at.end,{dictionaryStackId:product,callee});
      const parent=owner(file.path,at.start);if(parent)edge(parent,op,'executes',['runtime-flow'],[at]);
      const assigned=ts.isVariableDeclaration(call.parent)?call.parent.name.getText(ast):undefined;
      // Explicit application-owned types remain the input/output model; SDK brands do not become models.
      let assignment:ts.Node=call;while(ts.isAwaitExpression(assignment.parent)||ts.isParenthesizedExpression(assignment.parent))assignment=assignment.parent;
      if(ts.isVariableDeclaration(assignment.parent)){const output=shapeForType(assignment.parent.type);if(output){edge(op,output,'produces-shape',['data-flow'],[at,...output.evidence]);output.attributes.usedByStackId=product;}}
      if(product==='swr')for(const type of call.typeArguments??[]){const result=shapeForType(type);if(result)edge(op,result,'declared-result-shape',['data-flow'],[sourceEvidence(type,'呼出側が指定した結果型'),...result.evidence]);}
      for(const arg of args)if(ts.isIdentifier(arg)){const symbol=file.checker.getSymbolAtLocation(arg);for(const declaration of symbol?.declarations??[]){if(!ts.isVariableDeclaration(declaration)&&!ts.isParameter(declaration))continue;const inputModel=shapeForType(declaration.type);if(inputModel){edge(inputModel,op,'accepts-shape',['data-flow'],[sourceEvidence(arg,'明示入力型'),...inputModel.evidence]);inputModel.attributes.usedByStackId=product;}}}
      if(['redux-toolkit','pinia','swr'].includes(product)){
        op.data={role:'operation',expression:call.getText(ast),resolution:'partial'};op.attributes.operation='state';
        const options=[...args].find((value): value is ts.ObjectLiteralExpression => ts.isObjectLiteralExpression(value));let fields:SemanticField[]=[];
        if(options){const initial=options.properties.find(property=>ts.isPropertyAssignment(property)&&['initialState','state'].includes(property.name.getText(ast)))as ts.PropertyAssignment|undefined;
          if(initial&&ts.isObjectLiteralExpression(initial.initializer))fields=objectFields(initial.initializer);else if(initial&&ts.isArrowFunction(initial.initializer)){let body:ts.Node=initial.initializer.body;if(ts.isParenthesizedExpression(body))body=body.expression;if(ts.isObjectLiteralExpression(body))fields=objectFields(body);}}
        if(product==='redux-toolkit'&&binding?.symbol==='configureStore'&&options){const reducers=options.properties.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(ast)==='reducer')as ts.PropertyAssignment|undefined;if(reducers){const values=ts.isObjectLiteralExpression(reducers.initializer)?reducers.initializer.properties.flatMap(property=>ts.isPropertyAssignment(property)?[property.initializer]:[]):[reducers.initializer];const keys=values.filter(value=>ts.isPropertyAccessExpression(value)&&value.name.text==='reducer').flatMap(value=>sourceInstances(value));reduxStores.set(`${file.path}:${call.getStart(ast)}`,new Set(keys.filter(key=>stateDefinitions.has(key))));}}
        if(fields.length){const state=model(file,assigned??`${symbol} state`,product,at.start,at.end,fields);edge(state,op,'state-definition',['data-flow'],[at]);const actions=new Map<string,SemanticNode>();
          const definition=options?.properties.find(property=>ts.isPropertyAssignment(property)&&['reducers','actions'].includes(property.name.getText(ast)))as ts.PropertyAssignment|undefined;
          if(definition&&ts.isObjectLiteralExpression(definition.initializer))for(const method of definition.initializer.properties){const action=method.name?.getText(ast);if(!action)continue;const fn=context.analysis.nodes.find(node=>node.kind==='function'&&node.path===file.path&&node.attributes.name===action&&node.evidence.some(range=>range.start>=method.getStart(ast)&&range.end<=method.end));if(!fn)continue;const entry=node('entry',`${product} action · ${action}`,file.path,method.getStart(ast),method.end,{dictionaryStackId:product,event:'action',action});actions.set(action,entry);edge(op,entry,'registers-action',['runtime-flow'],entry.evidence);edge(entry,fn,'handles',['runtime-flow','function-call-flow'],entry.evidence);
            if(fields.some(field=>new RegExp(`\\b(?:state|this)\\.${field.name}\\s*(?:[+*/-]?=|\\+\\+|--)`).test(method.getText(ast))))edge(fn,state,'updates-state',['data-flow'],entry.evidence);
          }
          const selectors=new Map<string,SemanticNode>();const selectorGroup=options?.properties.find(property=>ts.isPropertyAssignment(property)&&['selectors','getters'].includes(property.name.getText(ast)))as ts.PropertyAssignment|undefined;
          if(selectorGroup&&ts.isObjectLiteralExpression(selectorGroup.initializer))for(const method of selectorGroup.initializer.properties){if(!method.name)continue;const name=method.name.getText(ast);const declaration=ts.isMethodDeclaration(method)?method:ts.isPropertyAssignment(method)&&ts.isArrowFunction(method.initializer)?method.initializer:undefined;if(!declaration)continue;const fn=context.analysis.nodes.find(node=>node.kind==='function'&&node.path===file.path&&node.evidence.some(at=>at.start>=declaration.getStart(ast)&&at.end<=declaration.end));if(!fn)continue;selectors.set(name,fn);fn.attributes.dictionaryStackId=product;edge(op,fn,'registers-selector',['data-flow'],[sourceEvidence(method,'静的selector/getter登録')]);const parameter=declaration.parameters[0];const symbol=parameter?file.checker.getSymbolAtLocation(parameter.name):undefined;
            visitSource(declaration,current=>{if(!ts.isPropertyAccessExpression(current)||!fields.some(field=>field.name===current.name.text))return;const root=ts.isIdentifier(current.expression)?file.checker.getSymbolAtLocation(current.expression):undefined;let sameThis=true;for(let parent:ts.Node|undefined=current.parent;parent&&parent!==declaration;parent=parent.parent)if(ts.isFunctionDeclaration(parent)||ts.isFunctionExpression(parent)||ts.isMethodDeclaration(parent))sameThis=false;if(root&&root===symbol||product==='pinia'&&sameThis&&current.expression.kind===ts.SyntaxKind.ThisKeyword)edge(state,fn,'reads-state',['data-flow'],[sourceEvidence(current,'selector/getterが参照するstate field'),...state.fields!.find(field=>field.name===current.name.text)!.evidence??[]]);});
          }
          stateDefinitions.set(`${file.path}:${call.getStart(ast)}`,{model:state,actions,selectors});
        }
        if(product==='swr'&&binding&&['default','useSWR'].includes(binding.symbol)){swrHooks.set(`${file.path}:${call.getStart(ast)}`,op);op.attributes.cacheKey=args[0]?.getText(ast)??'';if(args[1]){const target=handlerExpression(args[1]);if(target)edge(op,target,'fetcher',['runtime-flow','function-call-flow','data-flow'],[at]);}}
        const calledSymbol=ts.isIdentifier(call.expression)?file.checker.getSymbolAtLocation(call.expression):undefined;
        if(product==='swr'&&!binding&&calledSymbol&&declarations.get(calledSymbol)?.member==='mutate'){for(const key of sourceInstances(call.expression)){const hook=swrHooks.get(key);if(hook)edge(op,hook,'invalidates-cache',['runtime-flow','data-flow'],[at,...hook.evidence]);}}
        const actionName=product==='redux-toolkit'&&symbol==='dispatch'&&args[0]&&ts.isCallExpression(args[0])&&ts.isPropertyAccessExpression(args[0].expression)?args[0].expression.name.text:product==='pinia'&&ts.isPropertyAccessExpression(call.expression)?call.expression.name.text:undefined;
        if(actionName){const origin=product==='redux-toolkit'&&args[0]&&ts.isCallExpression(args[0])?args[0].expression:call.expression;const registered=product==='redux-toolkit'?new Set(sourceInstances(call.expression).flatMap(key=>[...(reduxStores.get(key)??[])])):undefined;for(const key of sourceInstances(origin)){if(registered&&!registered.has(key))continue;const action=stateDefinitions.get(key)?.actions.get(actionName);if(action)edge(op,action,'dispatches-action',['runtime-flow','function-call-flow'],[at,...action.evidence]);}}
        if(product==='redux-toolkit'&&ts.isPropertyAccessExpression(call.expression)&&ts.isPropertyAccessExpression(call.expression.expression)&&call.expression.expression.name.text==='selectors')for(const key of sourceInstances(call.expression.expression.expression)){const selector=stateDefinitions.get(key)?.selectors.get(call.expression.name.text);if(selector)edge(op,selector,'selects-state',['runtime-flow','function-call-flow','data-flow'],[at,...selector.evidence]);}
      }
      if(['mongoose','sequelize'].includes(product)&&['Schema','model','define','init'].includes(symbol)){
        const object=[...args].find((value): value is ts.ObjectLiteralExpression => ts.isObjectLiteralExpression(value));if(object){const classDeclaration=symbol==='init'&&receiver&&classProducts.has(receiver)?receiver.valueDeclaration:undefined;const modelName=classDeclaration&&ts.isClassDeclaration(classDeclaration)&&classDeclaration.name?classDeclaration.name.text:assigned??(args[0]&&ts.isStringLiteralLike(args[0])?args[0].text:`${product} schema`);const schema=model(file,modelName,product,classDeclaration?.getStart(ast)??at.start,classDeclaration?.end??at.end,objectFields(object),'storage');schema.attributes.orm=true;edge(schema,op,'model-definition',['data-flow'],[at]);const identifier=assigned&&ts.isVariableDeclaration(call.parent)&&ts.isIdentifier(call.parent.name)?file.checker.getSymbolAtLocation(call.parent.name):classDeclaration?receiver:undefined;if(identifier)ormModels.set(identifier,schema);}
        if(product==='mongoose'&&symbol==='model'&&args[1]&&ts.isIdentifier(args[1])){const schemaSymbol=file.checker.getSymbolAtLocation(args[1]);const declaration=schemaSymbol?declarations.get(schemaSymbol)?.node:undefined;const schema=declaration?.initializer?context.analysis.nodes.find(item=>item.kind==='model'&&item.path===file.path&&item.attributes.dictionaryStackId===product&&item.evidence.some(range=>range.start>=declaration.getStart(ast)&&range.start<=declaration.initializer!.getStart(ast)&&range.end===declaration.initializer!.end)):undefined;if(schema&&assigned){const entity=model(file,assigned,product,at.start,at.end,[...(schema.fields??[])],'storage');entity.attributes.orm=true;edge(schema,entity,'schema-model',['data-model'],[at,...schema.evidence]);edge(entity,op,'model-definition',['data-flow'],[at]);if(ts.isVariableDeclaration(call.parent)&&ts.isIdentifier(call.parent.name)){const identifier=file.checker.getSymbolAtLocation(call.parent.name);if(identifier)ormModels.set(identifier,entity);}}}
      }
      if(['mongoose','sequelize'].includes(product)&&/^(?:create|find|findOne|findById|findAll|update|updateOne|updateMany|destroy|deleteOne|deleteMany|save|belongsTo|hasMany|hasOne)$/.test(symbol)){
        op.attributes.operation='database';op.data={role:'operation',expression:call.getText(ast),resolution:'partial'};
        const receiverName=ts.isPropertyAccessExpression(call.expression)?call.expression.expression.getText(ast):'';const receiverDeclaration=receiver?declarations.get(receiver)?.node:undefined;const schema=receiver&&ormModels.get(receiver)||context.analysis.nodes.find(item=>item.kind==='model'&&item.path===file.path&&item.label===receiverName&&item.attributes.dictionaryStackId===product&&receiverDeclaration?.initializer&&item.evidence.some(at=>at.start>=receiverDeclaration.getStart(ast)&&at.start<=receiverDeclaration.initializer!.getStart(ast)&&at.end===receiverDeclaration.initializer!.end));
        if(schema)edge(op,schema,/^(?:find)/.test(symbol)?'reads-model':/^(?:belongsTo|hasMany|hasOne)$/.test(symbol)?'model-association':'writes-model',['data-flow','runtime-flow'],[at,...schema.evidence]);
        if(schema&&['belongsTo','hasMany','hasOne'].includes(symbol)&&args[0]){const identifier=file.checker.getSymbolAtLocation(args[0]);const target=identifier?ormModels.get(identifier):undefined;if(target)edge(schema,target,'model-reference',['data-model'],[at]);}
        if(schema&&/^(?:find|create)/.test(symbol))edge(op,schema,'result-model',['data-flow'],[at,...schema.evidence]);
        if(schema&&args[0]&&ts.isObjectLiteralExpression(args[0])&&/^(?:create|update)/.test(symbol)){const data=model(file,`${receiverName} ${symbol} input`,product,args[0].getStart(ast),args[0].end,objectFields(args[0]));edge(data,op,'writes-data',['data-flow'],[at,...data.evidence]);}
      }
      if(['express','fastify'].includes(product)&&/^(?:get|post|put|patch|delete|all|route|use|register)$/i.test(symbol)){
        const route=args[0]&&ts.isStringLiteralLike(args[0])?args[0].text:undefined;
        if(route&&route.startsWith('/')&&/^(?:get|post|put|patch|delete|all)$/i.test(symbol)){
          const mounts=receiver?mountedPrefixes.get(receiver):undefined;
          for(const mounted of mounts?.length?mounts:[undefined]){const endpoint=(mounted?.prefix?mounted.prefix.replace(/\/$/,''):'')+route;
            const entry=node('entry',`${symbol.toUpperCase()} ${endpoint}`,file.path,at.start,at.end,{dictionaryStackId:product,endpoint,method:symbol.toUpperCase(),routeRegistrationVerified:true});if(mounted)entry.evidence.push(mounted.evidence);
            const targetArg=args.at(-1);const target=targetArg?handlerExpression(targetArg):undefined;if(target){edge(entry,target,'handles',['runtime-flow','function-call-flow'],[at]);target.attributes.entry=true;}else{entry.confidence='unresolved';entry.attributes.unresolvedHandler=targetArg?.getText(ast)??'';}
            if(product==='fastify'&&target&&args[1]&&ts.isObjectLiteralExpression(args[1])){const schemaProperty=args[1].properties.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(ast).replace(/^['"]|['"]$/g,'')==='schema')as ts.PropertyAssignment|undefined;
              if(schemaProperty&&ts.isObjectLiteralExpression(schemaProperty.initializer))for(const declaration of schemaProperty.initializer.properties){if(!ts.isPropertyAssignment(declaration))continue;const role=declaration.name.getText(ast).replace(/^['"]|['"]$/g,'');const definitions=role==='response'&&ts.isObjectLiteralExpression(declaration.initializer)?declaration.initializer.properties.flatMap(status=>ts.isPropertyAssignment(status)&&ts.isObjectLiteralExpression(status.initializer)?[status.initializer]:[]):ts.isObjectLiteralExpression(declaration.initializer)?[declaration.initializer]:[];
                for(const definition of definitions){const properties=definition.properties.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(ast).replace(/^['"]|['"]$/g,'')==='properties')as ts.PropertyAssignment|undefined;if(!properties||!ts.isObjectLiteralExpression(properties.initializer))continue;const requiredProperty=definition.properties.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(ast).replace(/^['"]|['"]$/g,'')==='required')as ts.PropertyAssignment|undefined;const required=requiredProperty&&ts.isArrayLiteralExpression(requiredProperty.initializer)?requiredProperty.initializer.elements.flatMap(value=>ts.isStringLiteralLike(value)?[value.text]:[]):[];
                  const fields=properties.initializer.properties.flatMap(property=>{if(!ts.isPropertyAssignment(property)||!ts.isObjectLiteralExpression(property.initializer))return[];const type=property.initializer.properties.find(item=>ts.isPropertyAssignment(item)&&item.name.getText(ast).replace(/^['"]|['"]$/g,'')==='type')as ts.PropertyAssignment|undefined;const name=property.name.getText(ast).replace(/^['"]|['"]$/g,'').replace(/^['"]|['"]$/g,'');return[{name,type:type&&ts.isStringLiteralLike(type.initializer)?type.initializer.text:'unknown',optional:!required.includes(name),evidence:[sourceEvidence(property,'Fastify JSON Schemaの明示property')]}];});
                  const status=role==='response'&&ts.isPropertyAssignment(definition.parent)?definition.parent.name.getText(ast).replace(/^['"]|['"]$/g,''):undefined;const shape=model(file,`${symbol.toUpperCase()} ${endpoint} ${role}${status?' '+status:''}`,product,definition.getStart(ast),definition.end,fields,'validation');edge(role==='response'?target:shape,role==='response'?shape:target,role==='response'?'response-schema':'validates-input',['data-flow','data-model'],[sourceEvidence(definition,'Fastify routeのschema登録'),...target.evidence]);
                }
              }
            }
          }
        }
        if(['use','register'].includes(symbol)){const targetArg=args.find(arg=>Boolean(handlerExpression(arg)));const target=targetArg?handlerExpression(targetArg):undefined;if(target)edge(op,target,'registers-middleware',['runtime-flow','function-call-flow'],[at]);}
      }
      if(['cloud-firestore','supabase','redis','mariadb','sql-server','clerk','auth0','firebase-authentication','firebase-storage','firebase'].includes(product)){
        const service=product==='supabase'?sdkService(call.expression):undefined;
        op.data={role:'operation',expression:call.getText(ast),resolution:'partial'};op.attributes.operation=service??(['clerk','auth0','firebase-authentication'].includes(product)?'auth':['cloud-firestore','supabase','redis','mariadb','sql-server'].includes(product)?'database':product==='firebase'?'platform':'storage');if(service)op.attributes.sdkService=service;
        if(product==='cloud-firestore'){const reference=firestoreReference(call as ts.Expression)??(binding&&args[0]?firestoreReference(args[0]):ts.isPropertyAccessExpression(call.expression)?firestoreReference(call.expression.expression):undefined);if(reference){op.attributes.resourceKind=reference.kind;if(reference.unresolved){op.attributes.referenceResolution='unresolved';op.attributes.resourcePrefix=reference.prefix??'';}else op.attributes.resourcePath=reference.path;}}
        const object=[...args].find((value): value is ts.ObjectLiteralExpression => ts.isObjectLiteralExpression(value));if(object&&['addDoc','setDoc','updateDoc','insert','update','set','hSet'].includes(symbol)){
          const shape=model(file,`${symbol} data · L${at.line}`,product,object.getStart(ast),object.end,objectFields(object),'storage');edge(shape,op,'writes-data',['data-flow'],[at]);}
        const resource=context.analysis.nodes.filter(node=>node.kind==='resource'&&node.attributes.dictionaryStackId===product&&(node.path===file.path||node.attributes.factoryPath===file.path||node.evidence.some(at=>at.path===file.path)||!node.path||file.project&&node.path.startsWith(file.project.directory+'/')));
        const instances=new Set(sourceInstances(call));const matched=resource.filter(node=>typeof node.attributes.sourceInstance==='string'&&instances.has(node.attributes.sourceInstance)||node.evidence.some(at=>instances.has(`${at.path}:${at.start}`)));const targets=matched.length?matched:resource;
        if(targets.length===1){edge(op,targets[0]!,'uses-resource',flowViews,[at,...targets[0]!.evidence]);if(product==='supabase'&&service)edge(op,targets[0]!,service==='auth'?'authentication-operation':'storage-operation',flowViews,[at,...targets[0]!.evidence]);}
      }
      if(['jest','cypress'].includes(product)||file.products.has('jest')&&/^(?:describe|it|test)$/.test(callee)||file.products.has('cypress')&&/^(?:describe|it|test|cy\.)/.test(callee)){
        if(/^(?:describe|it|test)$/.test(symbol)){const title=args[0]&&ts.isStringLiteralLike(args[0])?args[0].text:symbol;const entry=node('entry',`${symbol}: ${title}`,file.path,at.start,at.end,{test:true,testKind:symbol==='describe'?'suite':'case',dictionaryStackId:product||'jest'});entry.group='Tests';const callback=context.analysis.nodes.find(fn=>fn.kind==='function'&&fn.path===file.path&&fn.evidence.some(item=>item.start>=at.start&&item.end<=at.end));if(callback){callback.attributes.test=true;callback.group='Tests';edge(entry,callback,'test-body',['runtime-flow','function-call-flow'],[at]);}}
      }
    });
    visitSource(ast,current=>{if(!ts.isPropertyAccessExpression(current)||valueProduct(current.expression)!=='pinia')return;if(ts.isCallExpression(current.parent)&&current.parent.expression===current)return;for(const key of sourceInstances(current.expression)){const getter=stateDefinitions.get(key)?.selectors.get(current.name.text);if(!getter)continue;const at=sourceEvidence(current,'Pinia instanceのgetter参照');const value=context.analysis.nodes.find(item=>item.kind==='value'&&item.path===file.path&&item.data?.role==='property-read'&&item.evidence.some(range=>range.start===at.start&&range.end===at.end))??node('value',current.getText(ast),file.path,at.start,at.end,{dictionaryStackId:'pinia',operation:'state'});value.attributes.dictionaryStackId='pinia';value.data={...value.data,role:'property-read',expression:current.getText(ast),resolution:'partial'};const from=owner(file.path,at.start);if(from)edge(from,value,'executes',['runtime-flow'],[at]);edge(value,getter,'selects-state',['runtime-flow','function-call-flow','data-flow'],[at,...getter.evidence]);}});
    const mappedOperations=(expression:ts.Node,seen=new Set<ts.Symbol>()):SemanticNode[]=>{
      if(ts.isIdentifier(expression)){const symbol=ts.isShorthandPropertyAssignment(expression.parent)?file.checker.getShorthandAssignmentValueSymbol(expression.parent):file.checker.getSymbolAtLocation(expression);if(!symbol||seen.has(symbol))return[];const declaration=symbol.valueDeclaration;const variable=declaration&&ts.isBindingElement(declaration)?declaration.parent.parent:declaration;return variable&&ts.isVariableDeclaration(variable)&&variable.initializer?mappedOperations(variable.initializer,new Set([...seen,symbol])):[];}
      if(ts.isCallExpression(expression))return context.analysis.nodes.filter(item=>item.kind==='operation'&&item.path===file.path&&['clerk','auth0'].includes(String(item.attributes.dictionaryStackId))&&/(?:^|\.)(?:auth|getSession|getUser)$/.test(String(item.attributes.callee))&&item.evidence.some(at=>at.start===expression.getStart(ast)&&at.end===expression.end));
      if(ts.isNewExpression(expression))return[];if(ts.isBinaryExpression(expression)){if(expression.operatorToken.kind===ts.SyntaxKind.CommaToken)return mappedOperations(expression.right,seen);return[...mappedOperations(expression.left,seen),...mappedOperations(expression.right,seen)];}if(ts.isConditionalExpression(expression))return[...mappedOperations(expression.whenTrue,seen),...mappedOperations(expression.whenFalse,seen)];if(ts.isPropertyAccessExpression(expression))return mappedOperations(expression.expression,seen);
      const children:SemanticNode[]=[];expression.forEachChild(child=>{children.push(...mappedOperations(child,seen));});return children;
    };
    visitSource(ast,current=>{if(!ts.isVariableDeclaration(current)||!current.initializer||!ts.isObjectLiteralExpression(current.initializer))return;const shape=shapeForType(current.type);if(!shape)return;const operations=new Map(mappedOperations(current.initializer).map(item=>[item.id,item]));for(const operation of operations.values()){edge(operation,shape,'maps-to-shape',['data-flow'],[sourceEvidence(current.initializer,'利用側の明示object mapping'),...operation.evidence,...shape.evidence]);shape.attributes.usedByStackId=operation.attributes.dictionaryStackId;}});
  }
}

function languageFrameworkAdapters(context:AdapterContext):void {
  const{analysis,node,edge,handler,model}=context;
  const nodesByPath=new Map<string,SemanticNode[]>();for(const item of analysis.nodes)if(item.path){const list=nodesByPath.get(item.path)??[];list.push(item);nodesByPath.set(item.path,list);}
  const handlesByTarget=new Map<string,Set<string>>();for(const relation of analysis.edges)if(relation.kind==='handles'){const sources=handlesByTarget.get(relation.target)??new Set<string>();sources.add(relation.source);handlesByTarget.set(relation.target,sources);}
  for(const file of context.files.values()){
    const fileNodes=nodesByPath.get(file.path)??[];
    const language=sourceLanguage(file.path);if(!language||['vue','svelte','astro','html','wpf'].includes(language))continue;
    const ecosystem=({python:'pypi',java:'maven',kotlin:'maven',scala:'maven',csharp:'nuget',go:'go',rust:'cargo',ruby:'gem',php:'composer'}as Record<string,Ecosystem>)[language];
    const importedProducts=new Set(languageImports(file.path,file.source).map(reference=>ecosystem?productForModule(reference.specifier,ecosystem):undefined));
    const unverifiedRoutes=new Set<string>();
    const functionAt=(offset:number)=>fileNodes.filter(node=>node.path===file.path&&node.kind==='function'&&!node.attributes.initializer&&node.evidence.some(at=>at.start<=offset&&at.end>=offset));
    const shadows=(name:string,offset:number)=>functionAt(offset).some(fn=>Array.isArray(fn.attributes.parameters)&&fn.attributes.parameters.includes(name))||fileNodes.some(node=>node.path===file.path&&node.kind==='function'&&node.attributes.name===name&&node.evidence.some(at=>at.start<offset));
    const frameworkProducts=[...file.products].filter(product=>stackRegistry.find(support=>support.stackId===product)?.profiles.includes('F'));
    for(const entry of fileNodes.filter(node=>node.kind==='entry'&&node.path===file.path&&node.attributes.endpoint)){
      let verified=false;
      for(const product of frameworkProducts){
      if(!stackRegistry.find(support=>support.stackId===product)?.profiles.includes('F'))continue;
      const routeSource=entry.evidence.map(at=>file.source.slice(at.start,at.end)).join(' ');
      let proven=importedProducts.has(product);
      if(product==='ruby-on-rails')proven=/(?:^|\/)config\/routes\.rb$/.test(file.path)&&/\bRails\.application\.routes\.draw\b/.test(file.code);
      if(product==='aspnet-core'){const receiver=routeSource.match(/\b(\w+)\.Map(?:Get|Post|Put|Patch|Delete|Group)\s*\(/)?.[1];proven=Boolean(receiver&&new RegExp(`\\b${receiver}\\s*=\\s*WebApplication\\.CreateBuilder\\s*\\(`).test(file.code))&&!fileNodes.some(node=>node.path===file.path&&node.kind==='model'&&node.label==='WebApplication');}
      if(product==='fastapi'||product==='flask'){
        const receiver=routeSource.match(/@([\w]+)\./)?.[1];const factories=[...file.imports].filter(([,binding])=>binding.stackId===product&&['FastAPI','APIRouter','Flask','Blueprint'].includes(binding.symbol)).map(([alias])=>alias);
        proven=Boolean(receiver&&!shadows(receiver,entry.evidence[0]!.start)&&factories.some(factory=>!shadows(factory,entry.evidence[0]!.start)&&new RegExp(`\\b${receiver}\\s*=\\s*${factory}\\s*\\(`).test(file.code)));
      }
      if(product==='django'){const callee=routeSource.match(/\b(\w+)\s*\(/)?.[1];const imported=callee?file.imports.get(callee):undefined;proven=Boolean(callee&&imported?.module==='django.urls'&&['path','re_path'].includes(imported.symbol)&&!shadows(callee,entry.evidence[0]!.start));}
      if(product==='spring-framework'){const annotation=routeSource.match(/@(\w+)/)?.[1];const imported=annotation?file.imports.get(annotation):undefined;proven=Boolean(imported&&imported.module.startsWith('org.springframework.web.bind.annotation.')&&/Mapping$/.test(imported.symbol));}
      if(product==='spring-boot')proven=false;
      if(product==='gin'){
        const receiver=routeSource.match(/\b(\w+)\.(?:GET|POST|PUT|PATCH|DELETE)\s*\(/)?.[1];const factory=receiver?file.code.match(new RegExp(`\\b${receiver}\\s*:?=\\s*(\\w+)\\.(?:Default|New)\\s*\\(`))?.[1]:undefined;proven=Boolean(factory&&file.imports.get(factory)?.module==='github.com/gin-gonic/gin'&&receiver&&!shadows(receiver,entry.evidence[0]!.start));
      }
      if(product==='axum')proven=Boolean(file.imports.get('Router')?.stackId==='axum'&&/\bRouter::new\s*\([^)]*\)\s*\.route\s*\(/.test(routeSource));
      if(product==='actix-web'){const annotation=routeSource.match(/(?:#\[)?(\w+)\s*\(/)?.[1];proven=Boolean(annotation&&file.imports.get(annotation)?.module===`actix_web::${annotation}`);}
      if(product==='laravel'){const receiver=routeSource.match(/\b(\w+)::(?:get|post|put|patch|delete)\s*\(/)?.[1];proven=Boolean(receiver&&file.imports.get(receiver)?.module==='Illuminate\\Support\\Facades\\Route');}
      if(!proven)continue;verified=true;entry.attributes.dictionaryStackId=product;entry.attributes.routeRegistrationVerified=true;for(const relation of analysis.edges.filter(edge=>edge.source===entry.id&&edge.kind==='handles')){const target=analysis.nodes.find(node=>node.id===relation.target);if(target)target.attributes.dictionaryStackId=product;}
      }
      if(frameworkProducts.length&&!verified)unverifiedRoutes.add(entry.id);
    }
    if(unverifiedRoutes.size){analysis.nodes=analysis.nodes.filter(node=>!unverifiedRoutes.has(node.id));analysis.edges=analysis.edges.filter(edge=>!unverifiedRoutes.has(edge.source)&&!unverifiedRoutes.has(edge.target));}
    const functions=fileNodes.filter(item=>item.kind==='function'&&item.path===file.path&&!item.attributes.initializer);
    const models=fileNodes.filter(item=>item.kind==='model'&&item.path===file.path);
    const declaredBaseProducts=new Map<string,string>();
    if(language==='python')for(const declaration of file.code.matchAll(/^\s*class\s+(\w+)\s*\(([^\n)]*)\)\s*:/gm)){
      for(const base of declaration[2]!.split(',').map(value=>value.trim().replace(/\[.*$/,''))){
        const [local,member]=base.split('.');const imported=file.imports.get(local!);const importedName=member??imported?.symbol;
        const inherited=declaredBaseProducts.get(base);const product=inherited??(imported?.stackId==='pydantic'&&importedName==='BaseModel'?'pydantic':imported?.stackId==='sqlalchemy'&&['DeclarativeBase','AsyncAttrs'].includes(importedName??'')?'sqlalchemy':imported?.stackId==='django'&&importedName==='Model'?'django':undefined);
        if(product)declaredBaseProducts.set(declaration[1]!,product);
      }
    }
    for(const item of models){
      const definition=file.source.slice(item.evidence[0]?.start??0,item.evidence[0]?.end??0);const definitionCode=file.code.slice(item.evidence[0]?.start??0,item.evidence[0]?.end??0);
      const pydantic=declaredBaseProducts.get(item.label)==='pydantic';
      const sqlalchemy=declaredBaseProducts.get(item.label)==='sqlalchemy';
      const django=declaredBaseProducts.get(item.label)==='django';
      const ef=file.products.has('entity-framework-core')&&/\busing\s+Microsoft\.EntityFrameworkCore\s*;/.test(file.code)&&/\bclass\s+\w+\s*:\s*DbContext\b/.test(definitionCode);
      const rails=file.products.has('ruby-on-rails')&&/\bclass\s+\w+\s*<\s*(?:ApplicationRecord|ActiveRecord::Base)\b/.test(definitionCode);
      const laravel=file.products.has('laravel')&&/\buse\s+Illuminate\\Database\\Eloquent\\Model\s*;/.test(file.code)&&/\bclass\s+\w+\s+extends\s+Model\b/.test(definitionCode);
      const product=pydantic?'pydantic':sqlalchemy?'sqlalchemy':django?'django':ef?'entity-framework-core':rails?'ruby-on-rails':laravel?'laravel':undefined;
      if(product){const start=item.evidence[0]!.start;const fields=language==='python'?fieldsFromText(file.path,file.source,definition,start).filter(field=>!field.evidence?.some(at=>functions.some(fn=>fn.evidence.some(range=>range.start<=at.start&&range.end>=at.end)))):[];
        if(['sqlalchemy','django'].includes(product))for(const match of definition.matchAll(/^\s*(\w+)\s*=\s*(?:models\.)?(\w*(?:Field|Column))\s*\(([^\n]*)/gm))fields.push({name:match[1]!,type:match[2]!,optional:/null\s*=\s*True|nullable\s*=\s*True/.test(match[3]!),evidence:[ev(file.path,file.source,start+match.index!,start+match.index!+match[0].length,`${product} field`)]});
        if(language==='python')item.fields=(item.fields??[]).filter(field=>fields.some(declared=>declared.name===field.name));
        model(file,item.label,product,start,item.evidence[0]!.end,[...(item.fields??[]),...fields],pydantic?'validation':'storage');item.attributes.orm=!pydantic;
        if(pydantic)for(const match of definition.matchAll(/^\s*(\w+)\s*:[^\n=]+?=\s*(\w+)\s*\(([^\n]*)/gm)){
          const imported=file.imports.get(match[2]!);if(imported?.stackId!=='pydantic'||imported.symbol!=='Field')continue;const field=item.fields?.find(field=>field.name===match[1]);if(!field)continue;
          field.constraints=[...match[3]!.matchAll(/\b(min_length|max_length|ge|gt|le|lt|multiple_of)\s*=\s*(-?\d+(?:\.\d+)?)/g)].map(constraint=>`${constraint[1]}=${constraint[2]}`);field.evidence=[...(field.evidence??[]),ev(file.path,file.source,start+match.index!,start+match.index!+match[0].length,'Pydantic Fieldの明示constraint')];
        }
      }
    }
    const pydanticHooks:{model:SemanticNode;fn:SemanticNode;kind:'validator'|'serializer';fields:string[];evidence:SemanticEvidence}[]=[];
    if(language==='python')for(const fn of functions){const model=models.find(model=>model.attributes.dictionaryStackId==='pydantic'&&model.label===fn.attributes.className);if(!model)continue;const start=fn.evidence[0]!.start;const prefix=file.code.slice(0,start);const block=prefix.match(/(?:^|\n)((?:[ \t]*@[^\n]*\n)+)[ \t]*$/);if(!block)continue;const blockStart=prefix.length-block[0]!.length;const raw=file.source.slice(blockStart,start);for(const decorator of raw.matchAll(/@(\w+)\s*\(([^\n]*)\)/g)){const imported=file.imports.get(decorator[1]!);if(shadows(decorator[1]!,blockStart)||imported?.stackId!=='pydantic'||!['field_validator','model_validator','field_serializer','model_serializer'].includes(imported.symbol))continue;const fields=[...decorator[2]!.matchAll(/['"]([A-Za-z_]\w*)['"]/g)].map(match=>match[1]!).filter(name=>model.fields?.some(field=>field.name===name));const kind=imported.symbol.includes('serializer')?'serializer':'validator';const at=ev(file.path,file.source,blockStart+decorator.index!,blockStart+decorator.index!+decorator[0].length,`Pydantic ${imported.symbol}の登録`);pydanticHooks.push({model,fn,kind,fields,evidence:at});for(const field of model.fields??[])if(fields.includes(field.name)){field.constraints=[...(field.constraints??[]),`${kind}:${String(fn.attributes.name)}`];field.evidence=[...(field.evidence??[]),at];}edge(model,fn,`registers-${kind}`,['data-flow'],[at,...fn.evidence]);}}
    const typedInstances:{name:string;model?:SemanticNode;product:string;start:number;owner?:string}[]=[];
    for(const match of file.code.matchAll(/\b(\w+)\s*=\s*(\w+)(?:\.\w+)?\s*\(/g)){
      const declared=models.find(model=>model.label===match[2]&&model.attributes.dictionaryStackId);const imported=file.imports.get(match[2]!);const product=declared?String(declared.attributes.dictionaryStackId):imported?.stackId==='sqlalchemy'&&['Session','sessionmaker','async_sessionmaker'].includes(imported.symbol)?'sqlalchemy':undefined;
      if(product&&!shadows(match[2]!,match.index!))typedInstances.push({name:match[1]!,model:declared,product,start:match.index!,owner:context.owner(file.path,match.index!)?.id});
    }
    for(const fn of functions){
      const start=fn.evidence[0]?.start??0;const name=String(fn.attributes.name??fn.label.split('.').at(-1));
      const signature=file.code.slice(start,fn.evidence[0]!.end).split('{')[0]??'';const junitAnnotation=[...signature.matchAll(/@([\w.]+)/g)].some(match=>{const imported=file.imports.get(match[1]!);return imported?.module.startsWith('org.junit.')&&/^(?:Test|ParameterizedTest|RepeatedTest)$/.test(imported.symbol)||/^org\.junit\..*\.(?:Test|ParameterizedTest|RepeatedTest)$/.test(match[1]!);});
      const pytestPatterns=Array.isArray(file.project?.attributes.pytestPythonFiles)&&file.project!.attributes.pytestPythonFiles.length?file.project!.attributes.pytestPythonFiles:['test_*.py','*_test.py'];const pytestFile=pytestPatterns.some(pattern=>new RegExp('^'+pattern.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(file.path.split('/').at(-1)!));
      const test=file.products.has('pytest')&&pytestFile&&/^test_/.test(name)||file.products.has('junit')&&junitAnnotation;
      if(test){const product=file.products.has('pytest')?'pytest':'junit';fn.attributes.test=true;fn.group='Tests';const entry=node('entry',`test: ${name}`,file.path,start,fn.evidence[0]!.end,{dictionaryStackId:product,test:true,testKind:'case'});edge(entry,fn,'test-body',['runtime-flow','function-call-flow'],fn.evidence);}
      const supported=[...file.products].filter(id=>stackRegistry.find(entry=>entry.stackId===id)?.profiles.includes('F'));
      for(const product of supported){const entries=fileNodes.filter(item=>item.kind==='entry'&&item.path===file.path&&handlesByTarget.get(fn.id)?.has(item.id));
        for(const entry of entries)if(entry.attributes.dictionaryStackId===product)fn.attributes.dictionaryStackId=product;
        if(product==='spring-boot'&&name==='main'&&file.imports.get('SpringBootApplication')?.module==='org.springframework.boot.autoconfigure.SpringBootApplication'&&file.imports.get('SpringApplication')?.module==='org.springframework.boot.SpringApplication'&&/@SpringBootApplication\b/.test(file.code)&&/\bstatic\b/.test(file.code.slice(start,fn.evidence[0]!.end))&&/\bSpringApplication\.run\s*\(/.test(file.code.slice(start,fn.evidence[0]!.end))){fn.attributes.entry=true;fn.attributes.dictionaryStackId=product;const entry=node('entry','Spring Boot main',file.path,start,fn.evidence[0]!.end,{dictionaryStackId:product,runtimeEntry:true});edge(entry,fn,'runtime-entry',['runtime-flow'],fn.evidence);}
      }
    }
    // Explicit validator/ORM calls keep input/output shape and source position from the common language IR.
    for(const op of fileNodes.filter(item=>item.kind==='operation'&&item.path===file.path)){
      const callee=String(op.attributes.callee??'');const modelName=callee.split(/[.:]/)[0];const from=context.owner(file.path,op.evidence[0]!.start);const instance=typedInstances.filter(instance=>instance.name===modelName&&instance.start<op.evidence[0]!.start&&(!instance.owner||instance.owner===from?.id)).at(-1);const target=models.find(model=>model.label===modelName&&model.attributes.dictionaryStackId)??instance?.model;
      const imported=file.imports.get(modelName!);const product=shadows(modelName!,op.evidence[0]!.start)?undefined:target?String(target.attributes.dictionaryStackId):instance?.product??(imported?.stackId==='sqlalchemy'&&['select','insert','update','delete','Session'].includes(imported.symbol)?'sqlalchemy':undefined);
      if(!product)continue;if(product==='pydantic'&&callee!==target?.label&&!/\.model_(?:validate(?:_json|_strings)?|dump(?:_json)?|construct|copy)$/.test(callee))continue;
      const construction=target&&callee===target.label&&product!=='pydantic';const serialization=product==='pydantic'&&/\.model_dump(?:_json)?$/.test(callee);op.attributes.dictionaryStackId=product;op.attributes.operation=product==='pydantic'?serialization?'serialization':'validation':construction?'model-construction':'database';op.data={role:'operation',expression:file.source.slice(op.evidence[0]!.start,op.evidence[0]!.end),resolution:'partial'};
      if(from)edge(from,op,'executes',['runtime-flow'],op.evidence);
      if(target)edge(!construction&&/create|insert|save|update|delete|remove|add/i.test(callee)?op:target,!construction&&/create|insert|save|update|delete|remove|add/i.test(callee)?target:op,product==='pydantic'?serialization?'serializes':'validates':construction?'constructs-model':'model-operation',construction?['data-flow']:['data-flow','runtime-flow'],op.evidence);
      if(product==='pydantic'&&target){for(const hook of pydanticHooks.filter(hook=>hook.model.id===target.id&&hook.kind===(serialization?'serializer':'validator')))edge(op,hook.fn,serialization?'serializes-with':'validates-with',['runtime-flow','function-call-flow','data-flow'],[...op.evidence,hook.evidence]);
        if(serialization&&/\.model_dump\(\s*\)$/.test(op.data.expression)){const output=model(file,`${target.label} serialized`,product,op.evidence[0]!.start,op.evidence[0]!.end,(target.fields??[]).map(field=>({...field,referenceIds:undefined})),'code');output.model!.reasons=['model_dumpの既定のfield出力。独自serializerの実行結果は未評価'];for(const hook of pydanticHooks.filter(hook=>hook.model.id===target.id&&hook.kind==='serializer')){const returnType=hook.fn.signature?.match(/->\s*([^:]+):?$/)?.[1]?.trim();if(returnType)for(const field of output.fields??[])if(hook.fields.includes(field.name))field.type=returnType;}edge(op,output,'serialized-output',['data-flow'],[...op.evidence,...target.evidence]);}}
      if(product==='sqlalchemy'&&!construction)for(const model of models.filter(model=>model.attributes.dictionaryStackId==='sqlalchemy'))if(!shadows(model.label,op.evidence[0]!.start)&&new RegExp(`\\b${model.label}\\b`).test(file.code.slice(op.evidence[0]!.start,op.evidence[0]!.end)))edge(model,op,'query-model',['data-flow'],[...op.evidence,...model.evidence]);
    }
    if(file.products.has('fastapi')||file.products.has('flask')||file.products.has('django')){
      for(const match of file.source.matchAll(/\b(?:include_router|register_blueprint|include)\s*\(\s*([\w.]+)([^\n]*)/g)){
        if(!file.code.slice(match.index!,match.index!+7).trim())continue;const target=handler(file.path,match[1]!);if(target){const op=node('operation','router registration',file.path,match.index!,match.index!+match[0].length,{dictionaryStackId:file.products.has('fastapi')?'fastapi':file.products.has('flask')?'flask':'django'});edge(op,target,'registers-router',['runtime-flow','function-call-flow'],op.evidence);}
      }
    }
  }
}

function fileRoutes(context:AdapterContext):void{
  for(const file of context.files.values()){
    const framework=file.products.has('nuxt')?'nuxt':file.products.has('astro')?'astro':file.products.has('sveltekit')?'sveltekit':undefined;if(!framework)continue;
    let route:string|undefined;
    if(framework==='nuxt'){const match=file.path.match(/(?:^|\/)(?:app\/)?pages\/(.*?)\.vue$/);if(match)route='/'+match[1]!.replace(/\/index$|^index$/,'');const api=file.path.match(/(?:^|\/)server\/api\/(.*?)(?:\.(get|post|put|delete|patch))?\.[jt]s$/);if(api)route='/api/'+api[1]!.replace(/\/index$|^index$/,'');}
    if(framework==='astro'){const match=file.path.match(/(?:^|\/)src\/pages\/(.*?)\.(?:astro|[jt]s)$/);if(match)route='/'+match[1]!.replace(/\/index$|^index$/,'');}
    if(framework==='sveltekit'){const match=file.path.match(/(?:^|\/)src\/routes\/(.*?)\/?\+(?:page|layout|server)(?:\.server)?\.(?:svelte|[jt]s)$/);if(match)route='/'+match[1]!.replace(/\([^/]+\)\/?/g,'');}
    if(route===undefined)continue;route=route.replace(/\[\.\.\.(.*?)\]/g,'*').replace(/\[(.*?)\]/g,':$1');
    const generic=new Set(context.analysis.nodes.filter(node=>node.path===file.path&&node.kind==='entry'&&node.attributes.framework==='file routing').map(node=>node.id));context.analysis.nodes=context.analysis.nodes.filter(node=>!generic.has(node.id));context.analysis.edges=context.analysis.edges.filter(edge=>!generic.has(edge.source)&&!generic.has(edge.target));
    const page=/\.(?:vue|svelte|astro)$/.test(file.path);let targets=context.analysis.nodes.filter(node=>node.path===file.path&&(page?node.attributes.component&&node.label.startsWith('Component ·'):node.kind==='function'&&!node.attributes.initializer&&(/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|load|actions)$/.test(String(node.attributes.name))||node.attributes.defaultExport)));
    if(framework==='nuxt'&&!page&&file.ast)for(const statement of file.ast.statements){if(!ts.isExportAssignment(statement)||!ts.isCallExpression(statement.expression)||statement.expression.expression.getText(file.ast)!=='defineEventHandler')continue;const argument=statement.expression.arguments[0];if(!argument)continue;let declaration:ts.Node=argument;if(ts.isIdentifier(argument)){let symbol=file.checker.getSymbolAtLocation(argument);if(symbol?.flags&&symbol.flags&ts.SymbolFlags.Alias)symbol=file.checker.getAliasedSymbol(symbol);declaration=symbol?.valueDeclaration??argument;}const matches=context.analysis.nodes.filter(node=>node.kind==='function'&&!node.attributes.initializer&&node.path===declaration.getSourceFile().fileName&&node.evidence.some(at=>at.start>=declaration.getStart()&&at.end<=declaration.end));if(matches.length===1)targets.push(matches[0]!);}
    targets=[...new Map(targets.map(target=>[target.id,target])).values()];
    if(!page&&file.ast&&framework!=='nuxt')targets=targets.filter(target=>file.ast!.statements.some(statement=>{
      if(!ts.canHaveModifiers(statement)||!ts.getModifiers(statement)?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))return false;
      const declarations=ts.isFunctionDeclaration(statement)?[statement]:ts.isVariableStatement(statement)?statement.declarationList.declarations.flatMap(declaration=>declaration.initializer&&[ts.SyntaxKind.ArrowFunction,ts.SyntaxKind.FunctionExpression].includes(declaration.initializer.kind)?[declaration.initializer]:[]):[];
      return declarations.some(declaration=>target.evidence.some(at=>at.start>=declaration.getStart(file.ast)&&at.end<=declaration.end));
    }));
    if(framework==='sveltekit'&&/\+page\.server\.[jt]s$/.test(file.path)&&file.ast)for(const statement of file.ast.statements){if(!ts.isVariableStatement(statement)||!statement.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))continue;
      for(const declaration of statement.declarationList.declarations){if(!ts.isIdentifier(declaration.name)||declaration.name.text!=='actions'||!declaration.initializer)continue;let initializer=declaration.initializer;while(ts.isSatisfiesExpression(initializer)||ts.isAsExpression(initializer)||ts.isParenthesizedExpression(initializer))initializer=initializer.expression;if(!ts.isObjectLiteralExpression(initializer))continue;
        for(const member of initializer.properties){if(!member.name||!ts.isIdentifier(member.name)&&!ts.isStringLiteralLike(member.name))continue;let implementation:ts.Node|undefined=ts.isMethodDeclaration(member)?member:ts.isPropertyAssignment(member)?member.initializer:undefined;if(!implementation)continue;if(ts.isIdentifier(implementation)){let symbol=file.checker.getSymbolAtLocation(implementation);if(symbol&&symbol.flags&ts.SymbolFlags.Alias)symbol=file.checker.getAliasedSymbol(symbol);implementation=symbol?.valueDeclaration;if(implementation&&ts.isVariableDeclaration(implementation))implementation=implementation.initializer;}const direct=implementation&&(ts.isMethodDeclaration(implementation)||ts.isFunctionDeclaration(implementation)||ts.isFunctionExpression(implementation)||ts.isArrowFunction(implementation))?implementation:undefined;const fn=direct?context.analysis.nodes.find(node=>node.kind==='function'&&!node.attributes.initializer&&node.path===direct.getSourceFile().fileName&&node.evidence.some(at=>at.start>=direct.getStart()&&at.end<=direct.end)):undefined;const at=sourceEvidence(member,'SvelteKit actionsの静的登録');const entry=context.node('entry',`sveltekit action ${member.name.text} ${route}`,file.path,at.start,at.end,{dictionaryStackId:framework,endpoint:route,method:'POST',fileRoute:true,action:member.name.text,routeRegistrationVerified:true});if(fn){context.edge(entry,fn,'handles',['runtime-flow','function-call-flow'],[at,...fn.evidence]);fn.attributes.entry=true;}else{entry.confidence='unresolved';entry.attributes.unresolvedHandler=member.getText(file.ast);}}
      }
    }
    for(const target of targets){const method=page?'PAGE':framework==='nuxt'?file.path.match(/\.(get|post|put|patch|delete|head|options)\.[jt]s$/)?.[1]?.toUpperCase()??'ANY':/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(String(target.attributes.name))?String(target.attributes.name):'PAGE';
      const entry=context.node('entry',`${framework} ${method} ${route}`,file.path,target.evidence[0]?.start??0,target.evidence[0]?.end??file.source.length,{dictionaryStackId:framework,endpoint:route,method,fileRoute:true,routeRegistrationVerified:method!=='PAGE'});context.edge(entry,target,'handles',['runtime-flow','function-call-flow'],[...entry.evidence,...target.evidence]);target.attributes.entry=true;
    }
  }
}

function sqlAlchemyData(context:AdapterContext):void{
  const{analysis,edge,model}=context;
  for(const file of context.files.values()){
    if(sourceLanguage(file.path)!=='python'||!file.products.has('sqlalchemy'))continue;
    const local=analysis.nodes.filter(node=>node.path===file.path);const functions=local.filter(node=>node.kind==='function'&&!node.attributes.initializer);
    const imported=(name:string,position:number,expected:string)=>{const binding=file.imports.get(name);if(binding?.stackId!=='sqlalchemy'||binding.symbol!==expected)return false;const fn=context.owner(file.path,position);const header=fn?file.code.slice(fn.evidence[0]!.start,fn.evidence[0]!.end).split('\n')[0]??'':'';if(new RegExp(`\\bdef\\s+\\w+\\s*\\([^)]*\\b${name}\\b`).test(header))return false;return!functions.some(candidate=>candidate.attributes.name===name);};
    const models=local.filter(node=>node.kind==='model'&&node.attributes.dictionaryStackId==='sqlalchemy');
    const shadowsModel=(name:string,position:number)=>{const fn=context.owner(file.path,position);const header=fn?file.code.slice(fn.evidence[0]!.start,fn.evidence[0]!.end).split('\n')[0]??'':'';return new RegExp(`\\bdef\\s+\\w+\\s*\\([^)]*\\b${name}\\b`).test(header);};
    for(const op of local.filter(node=>node.kind==='operation')){
      const at=op.evidence[0]!;const callee=String(op.attributes.callee??'');
      if(!imported(callee,at.start,'Table'))continue;
      const args=callArguments(file.source,at.start,at.end,'python');const table=args[0]?.text.match(/^(['"])(.*?)\1$/)?.[2];const prefix=file.code.slice(file.code.lastIndexOf('\n',at.start)+1,at.start);const assigned=prefix.match(/\b(\w+)\s*=\s*$/)?.[1];if(!table||!assigned)continue;
      const fields:SemanticField[]=[];
      for(const argument of args.slice(2)){const name=sourceSyntax(argument.text,'python').code.match(/^(\w+)\s*\(/)?.[1];if(!name||!imported(name,argument.start,'Column'))continue;const column=callArguments(file.source,argument.start,argument.end,'python');const field=column[0]?.text.match(/^(['"])(.*?)\1$/)?.[2];if(!field)continue;fields.push({name:field,type:column[1]?.text??'unknown',optional:false,key:column.some(arg=>/^primary_key\s*=\s*True$/.test(arg.text))?'primary':undefined,nullable:!column.some(arg=>/^nullable\s*=\s*False$/.test(arg.text)),evidence:[ev(file.path,file.source,argument.start,argument.end,'SQLAlchemy TableのColumn宣言')]});}
      const declared=model(file,assigned,'sqlalchemy',at.start,at.end,fields,'storage');declared.attributes.orm=true;declared.attributes.storageName=table;models.push(declared);op.attributes.dictionaryStackId='sqlalchemy';edge(declared,op,'table-definition',['data-model','data-flow'],[at]);
    }
    for(const declared of models){const at=declared.evidence[0]!;const body=file.source.slice(at.start,at.end);const table=body.match(/__tablename__\s*=\s*['"]([^'"]+)['"]/)?.[1];if(table)declared.attributes.storageName=table;
      for(const field of declared.fields??[]){
        const source=field.evidence?.find(item=>item.path===file.path);if(!source)continue;const text=file.source.slice(source.start,source.end);const code=file.code.slice(source.start,source.end);
        const relation=code.match(/\b(\w+)\s*\(/g)?.map(item=>item.replace(/\s*\($/,'' )).find(name=>imported(name,source.start,'relationship'));
        if(!relation)continue;
        const targetName=text.match(new RegExp(`\\b${relation}\\s*\\(\\s*['"](\\w+)['"]`))?.[1]??field.type.match(/Mapped\s*\[\s*(?:list\[\s*)?['"]?(\w+)/)?.[1];
        const targets=models.filter(target=>target.label===targetName&&target.id!==declared.id);if(targets.length===1){field.referenceIds=[targets[0]!.id];field.target=targets[0]!.label;edge(declared,targets[0]!,'model-reference',['data-model'],[source,...targets[0]!.evidence]);}else{declared.model!.expansion='partial';declared.model!.reasons.push(`relationshipの参照先は未解決: ${targetName??field.name}`);}
      }
    }
    for(const op of local.filter(node=>node.kind==='operation'&&node.attributes.dictionaryStackId==='sqlalchemy')){
      const at=op.evidence[0]!;const expression=file.code.slice(at.start,at.end);const callee=String(op.attributes.callee??'');
      for(const declared of models)if(!shadowsModel(declared.label,at.start)&&new RegExp(`\\b${declared.label}\\b`).test(expression)&&!/^(?:Table|Column)$/.test(callee)){
        if(/(?:select|scalars|execute|all|first)/.test(callee)){edge(declared,op,'query-model',['data-flow'],[at,...declared.evidence]);edge(op,declared,'result-model',['data-flow'],[at,...declared.evidence]);}
      }
      if(/\.add$/.test(callee)){const argument=callArguments(file.source,at.start,at.end,'python')[0]?.text;const owner=context.owner(file.path,at.start);const start=owner?.evidence[0]?.start??0;const prefix=file.code.slice(start,at.start);const constructor=argument&&/^\w+$/.test(argument)?[...prefix.matchAll(new RegExp(`\\b${argument}\\s*=\\s*(\\w+)\\s*\\(`,'g'))].at(-1)?.[1]:undefined;const declared=models.find(model=>model.label===constructor&&!shadowsModel(model.label,at.start));if(declared)edge(op,declared,'writes-model',['runtime-flow','data-flow'],[at,...declared.evidence]);}
    }
  }
}

function entityFrameworkData(context:AdapterContext):void{
  const {analysis,edge}=context;
  for(const file of context.files.values()){
    if(sourceLanguage(file.path)!=='csharp'||!file.products.has('entity-framework-core'))continue;
    const namespace=file.code.match(/\bnamespace\s+([\w.]+)/)?.[1]??'';const using=[...file.code.matchAll(/\busing\s+([\w.]+)\s*;/g)].map(match=>match[1]!);
    const findModel=(name:string)=>{const candidates=analysis.nodes.filter(node=>node.kind==='model'&&node.label===name.split('.').at(-1)&&node.path&&context.files.get(node.path)?.project?.directory===file.project?.directory);const visible=candidates.filter(node=>{const target=context.files.get(node.path!)!;const targetNamespace=target.code.match(/\bnamespace\s+([\w.]+)/)?.[1]??'';return name.includes('.')?targetNamespace===name.split('.').slice(0,-1).join('.'):targetNamespace===namespace||using.includes(targetNamespace);});return visible.length===1?visible[0]:undefined;};
    const contexts=analysis.nodes.filter(node=>node.kind==='model'&&node.attributes.dictionaryStackId==='entity-framework-core'&&node.path&&context.files.get(node.path)?.project?.directory===file.project?.directory);
    const sets=new Map<string,SemanticNode>();for(const owner of contexts)for(const field of owner.fields??[]){const type=field.type.match(/\bDbSet\s*<\s*([\w.]+)\s*>/)?.[1];const entity=type?findModel(type):undefined;if(!entity)continue;sets.set(`${owner.label}.${field.name}`,entity);entity.attributes.dictionaryStackId='entity-framework-core';entity.attributes.orm=true;entity.model={domain:'storage',kind:'object',definition:context.input.sources[entity.path!]?.slice(entity.evidence[0]!.start,entity.evidence[0]!.end)??'',expansion:entity.fields?.length?'expanded':'partial',reasons:[]};edge(owner,entity,'entity-set',['data-model','data-flow'],[...(field.evidence??owner.evidence),...entity.evidence]);}
    for(const op of analysis.nodes.filter(node=>node.kind==='operation'&&node.path===file.path)){
      const expression=file.source.slice(op.evidence[0]!.start,op.evidence[0]!.end);const code=file.code.slice(op.evidence[0]!.start,op.evidence[0]!.end);const callee=String(op.attributes.callee??'');const receiver=callee.split('.')[0]!;const owner=context.owner(file.path,op.evidence[0]!.start);const ownerCode=owner?file.code.slice(owner.evidence[0]!.start,owner.evidence[0]!.end):file.code;
      const declaredType=ownerCode.match(new RegExp(`\\b([\\w.]+)\\s+${receiver}\\b`))?.[1]??ownerCode.match(new RegExp(`\\b${receiver}\\s*=\\s*new\\s+([\\w.]+)\\b`))?.[1];const resolvedType=declaredType?findModel(declaredType):undefined;const dbContext=resolvedType&&contexts.some(item=>item.id===resolvedType.id)?resolvedType:undefined;
      if(dbContext&&/\.(?:Add|AddAsync|Update|Remove|SaveChanges|SaveChangesAsync|ToList|ToListAsync|First|FirstAsync|Find|FindAsync|Where)\b/.test(callee)){
        op.attributes.dictionaryStackId='entity-framework-core';op.attributes.operation='database';op.data={role:'operation',expression,resolution:'partial'};if(owner)edge(owner,op,'executes',['runtime-flow'],op.evidence);
        const setName=callee.split('.')[1];const entity=setName?sets.get(`${dbContext.label}.${setName}`):undefined;if(entity)edge(op,entity,/\.(?:Add|Update|Remove)/.test(callee)?'writes-model':'reads-model',['runtime-flow','data-flow'],[...op.evidence,...entity.evidence]);else edge(op,dbContext,'context-operation',['runtime-flow','data-flow'],op.evidence);
      }
      const entityName=code.match(/\b(\w+)\.Entity\s*<\s*([\w.]+)\s*>/)?.[2];const builder=code.match(/\b(\w+)\.Entity\s*</)?.[1];if(!entityName||!builder||!new RegExp(`\\bModelBuilder\\s+${builder}\\b`).test(ownerCode)||!using.includes('Microsoft.EntityFrameworkCore'))continue;
      const entity=findModel(entityName);if(!entity)continue;entity.attributes.dictionaryStackId='entity-framework-core';
      const property=code.match(/\.Property\s*\(\s*(\w+)\s*=>\s*\1\.(\w+)\s*\)/)?.[2];const field=entity.fields?.find(field=>field.name===property);if(field){const length=code.match(/\.HasMaxLength\s*\(\s*(\d+)\s*\)/)?.[1];if(length)field.constraints=[...new Set([...(field.constraints??[]),`max_length=${length}`])];const required=code.match(/\.IsRequired\s*\(\s*(true|false)?\s*\)/);if(required){field.optional=required[1]==='false';field.nullable=required[1]==='false';}field.evidence=[...(field.evidence??[]),...op.evidence];}
      const targetName=code.match(/\.Has(?:One|Many)\s*<\s*([\w.]+)\s*>/)?.[1];const target=targetName?findModel(targetName):undefined;if(target)edge(entity,target,'model-reference',['data-model'],op.evidence);
    }
  }
}

function dependencyInjectionAdapters(context:AdapterContext):void {
  const {analysis,edge}=context;
  const injections:{owner:SemanticNode;target:SemanticNode;evidence:SemanticEvidence;product:string}[]=[];
  const declaredControllers=new Set<string>();
  const findClass=(file:FileContext,name:string)=>{const paths=new Set([file.path,...context.input.imports.filter(item=>item.from===file.path).map(item=>item.to)]);const matches=analysis.nodes.filter(node=>node.kind==='model'&&paths.has(node.path??'')&&node.label===name);return matches.length===1?matches[0]:undefined;};
  const findClassSymbol=(file:FileContext,expression:ts.Node)=>{let symbol=file.checker.getSymbolAtLocation(expression);if(symbol&&symbol.flags&ts.SymbolFlags.Alias)symbol=file.checker.getAliasedSymbol(symbol);const declaration=symbol?.declarations?.find(ts.isClassDeclaration);if(!declaration?.name)return;return analysis.nodes.find(node=>node.kind==='model'&&node.path===declaration.getSourceFile().fileName&&node.evidence.some(at=>at.start<=declaration.name!.getStart()&&at.end>=declaration.end));};
  for(const file of context.files.values()){
    if(file.inlineTemplate)continue;
    if(file.ast&&(file.products.has('nestjs')||file.products.has('angular'))){const ast=file.ast;
      visitSource(ast,current=>{
        if(!ts.isClassDeclaration(current)||!current.name)return;const owner=findClassSymbol(file,current.name);if(!owner)return;
        for(const decorator of ts.getDecorators(current)??[]){const expression=decorator.expression;if(!ts.isCallExpression(expression)||!ts.isIdentifier(expression.expression))continue;const symbol=file.checker.getSymbolAtLocation(expression.expression);const binding=symbol?file.symbols.get(symbol):undefined;if(!binding?.stackId||!['nestjs','angular'].includes(binding.stackId))continue;
          owner.attributes.dictionaryStackId=binding.stackId;const options=expression.arguments[0];if(binding.symbol==='Module'&&options&&ts.isObjectLiteralExpression(options))for(const property of options.properties){if(!ts.isPropertyAssignment(property)||!['providers','controllers','imports'].includes(property.name.getText(ast))||!ts.isArrayLiteralExpression(property.initializer))continue;
            for(const value of property.initializer.elements)if(ts.isIdentifier(value)){const target=findClassSymbol(file,value);if(target){edge(owner,target,property.name.getText(ast)==='providers'?'registers-provider':'declares-module-member',['runtime-flow'],[sourceEvidence(value,'静的module登録'),...target.evidence]);if(binding.stackId==='nestjs'&&property.name.getText(ast)==='controllers')declaredControllers.add(target.id);}}}
        }
        for(const constructor of current.members.filter(ts.isConstructorDeclaration))for(const parameter of constructor.parameters){if(!parameter.type||!ts.isTypeReferenceNode(parameter.type)||!ts.isIdentifier(parameter.type.typeName))continue;const target=findClassSymbol(file,parameter.type.typeName);if(!target)continue;
          injections.push({owner,target,evidence:sourceEvidence(parameter,'constructorの型と静的provider登録が一致'),product:file.products.has('nestjs')?'nestjs':'angular'});
        }
        if(file.products.has('angular'))for(const member of current.members){if(!ts.isPropertyDeclaration(member)||!member.name)continue;for(const decorator of ts.getDecorators(member)??[]){if(!ts.isCallExpression(decorator.expression))continue;const symbol=file.checker.getSymbolAtLocation(decorator.expression.expression);const binding=symbol?file.symbols.get(symbol):undefined;if(binding?.stackId!=='angular'||binding.symbol!=='Input')continue;const field=owner.fields?.find(field=>field.name===member.name.getText(ast));if(!field)continue;const at=sourceEvidence(decorator,'Angular Inputの明示宣言');field.constraints=[...(field.constraints??[]),'component-input'];field.evidence=[...(field.evidence??[]),at];const value=context.node('value',`${owner.label}.${field.name} input`,file.path,member.getStart(ast),member.end,{dictionaryStackId:'angular',prop:true});value.data={role:'declaration',expression:member.getText(ast),propertyPath:[field.name],resolution:'partial'};edge(value,owner,'component-prop',['data-flow'],[at,...(field.evidence??[])]);}}
      });
      if(file.products.has('angular'))visitSource(ast,current=>{if(!ts.isObjectLiteralExpression(current))return;const properties=current.properties.filter(ts.isPropertyAssignment);const path=properties.find(property=>property.name.getText(ast)==='path');const component=properties.find(property=>property.name.getText(ast)==='component');if(!path||!component||!ts.isStringLiteralLike(path.initializer)||!ts.isIdentifier(component.initializer))return;
        let parent:ts.Node=current;while(parent.parent&&!ts.isVariableDeclaration(parent))parent=parent.parent;if(!ts.isVariableDeclaration(parent)||!parent.type||!ts.isTypeReferenceNode(parent.type))return;const typeName=parent.type.typeName.getText(ast);const routeImport=file.imports.get(typeName);const typeSymbol=file.checker.getSymbolAtLocation(parent.type.typeName);const importedType=typeSymbol?.declarations?.find(ts.isImportSpecifier);if(!(routeImport?.module==='@angular/router'&&routeImport.symbol==='Routes')&&!(importedType&&(importedType.propertyName?.text??importedType.name.text)==='Routes'&&ts.isImportDeclaration(importedType.parent.parent.parent)&&ts.isStringLiteralLike(importedType.parent.parent.parent.moduleSpecifier)&&importedType.parent.parent.parent.moduleSpecifier.text==='@angular/router'))return;
        const target=findClassSymbol(file,component.initializer);if(!target)return;const at=sourceEvidence(current,'Angular Routerの静的component登録');const entry=context.node('entry',`Angular /${path.initializer.text}`,file.path,at.start,at.end,{dictionaryStackId:'angular',endpoint:'/'+path.initializer.text,componentRoute:true});edge(entry,target,'routes-to-component',['runtime-flow'],[at,...target.evidence]);
      });
    }
    if(file.products.has('spring-framework'))for(const item of analysis.nodes.filter(node=>node.kind==='model'&&node.path===file.path)){
      const at=item.evidence[0];if(!at)continue;const body=file.source.slice(at.start,at.end);
      for(const match of body.matchAll(/@Autowired\s+(?:private|protected|public)?\s*(\w+)\s+(\w+)\s*;/g)){if(file.imports.get('Autowired')?.module!=='org.springframework.beans.factory.annotation.Autowired'||!file.code.slice(at.start+match.index!,at.start+match.index!+match[0].length).includes('@Autowired'))continue;const target=findClass(file,match[1]!);if(target)edge(item,target,'injects',['runtime-flow'],[ev(file.path,file.source,at.start+match.index!,at.start+match.index!+match[0].length,'@Autowiredの型参照'),...target.evidence]);}
      for(const fn of analysis.nodes.filter(node=>node.kind==='function'&&node.path===file.path&&node.attributes.className===item.label)){const start=fn.evidence[0]?.start??0;const signature=file.code.slice(start,fn.evidence[0]!.end).split('{')[0]??'';if(file.imports.get('Bean')?.module==='org.springframework.context.annotation.Bean'&&/@Bean\b/.test(signature)){const entry=context.node('entry',`Bean · ${fn.label}`,file.path,start,fn.evidence[0]!.end,{dictionaryStackId:'spring-framework',provider:true});edge(entry,fn,'provider-factory',['runtime-flow'],fn.evidence);}}
    }
  }
  for(const injection of injections){const modules=analysis.edges.filter(relation=>relation.target===injection.target.id&&relation.kind==='registers-provider').map(relation=>relation.source);const registered=modules.some(module=>analysis.edges.some(relation=>relation.source===module&&relation.target===injection.owner.id&&['registers-provider','declares-module-member'].includes(relation.kind)));
    if(registered)edge(injection.owner,injection.target,'injects',['runtime-flow','function-call-flow'],[injection.evidence,...injection.target.evidence]);}
  for(const entry of analysis.nodes.filter(node=>node.kind==='entry'&&node.attributes.dictionaryStackId==='nestjs'&&node.attributes.endpoint)){const handler=analysis.edges.find(edge=>edge.source===entry.id&&edge.kind==='handles');const target=handler?analysis.nodes.find(node=>node.id===handler.target):undefined;const owner=target?analysis.nodes.find(node=>node.kind==='model'&&node.path===target.path&&node.label===target.attributes.className):undefined;if(!owner||!declaredControllers.has(owner.id)){entry.attributes.routeRegistrationVerified=false;entry.attributes.unresolvedRegistration='ControllerのModule登録は未確認';}}
}

/** Product adapters add evidence-backed primitives; they do not promote brand names to models or functions. */
export function refineStackSemantics(analysis:SemanticAnalysis,input:SemanticInput,compiler:DataCompiler):void {
  const getStack=(id:string)=>input.stackMetadata?.[id]??(stackRegistry.some(entry=>entry.stackId===id)?{name:id,aliases:[]}:undefined);
  const context=createContext(analysis,input,compiler);templateAdapters(context);jsAdapters(context);addExpressRouterRegistrations(context);languageFrameworkAdapters(context);addPythonRouterRegistrations(context);addNativeRegistrations(context);addAdditionalPrimitives(context);sqlAlchemyData(context);entityFrameworkData(context);fileRoutes(context);dependencyInjectionAdapters(context);
  // A statically resolved selector replaces only the same unresolved callsite.
  const replacedCalls=new Set<string>(),resolvedExternals=new Set<string>();
  for(const relation of analysis.edges.filter(edge=>edge.kind==='selects-state')){const operation=analysis.nodes.find(node=>node.id===relation.source);const target=analysis.nodes.find(node=>node.id===relation.target);if(operation?.kind!=='operation'||target?.kind!=='function')continue;
    for(const call of analysis.edges.filter(edge=>edge.kind==='calls')){const external=analysis.nodes.find(node=>node.id===call.target);if(external?.kind!=='external'||external.confidence!=='unresolved')continue;const matched=call.evidence.filter(at=>operation.evidence.some(source=>source.path===at.path&&source.start===at.start&&source.end===at.end));if(!matched.length)continue;const source=analysis.nodes.find(node=>node.id===call.source);if(source)context.edge(source,target,'calls',['runtime-flow','function-call-flow'],matched);call.evidence=call.evidence.filter(at=>!matched.includes(at));if(!call.evidence.length)replacedCalls.add(call.id);resolvedExternals.add(external.id);}
  }
  analysis.edges=analysis.edges.filter(edge=>!replacedCalls.has(edge.id));const referenced=new Set(analysis.edges.flatMap(edge=>[edge.source,edge.target]));analysis.nodes=analysis.nodes.filter(node=>!resolvedExternals.has(node.id)||referenced.has(node.id));
  // A product call enriches the existing call occurrence used by both semantic passes.
  // Registration entries are intentionally excluded: one call can mount multiple routes.
  const operationIds=new Map<string,string>();
  const dataOperations=new Map<string,SemanticNode[]>();for(const node of analysis.nodes.filter(node=>node.kind==='operation'&&!node.attributes.dictionaryStackId&&node.attributes.dataFlow&&node.attributes.callee&&!node.data?.contextId))for(const at of node.evidence){const key=JSON.stringify([node.path,at.start,at.end,node.attributes.callee]);dataOperations.set(key,[...(dataOperations.get(key)??[]),node]);}
  for(const operation of analysis.nodes.filter(node=>node.kind==='operation'&&node.attributes.dictionaryStackId&&node.attributes.callee&&!node.data?.contextId)){
    for(const duplicate of operation.evidence.flatMap(at=>dataOperations.get(JSON.stringify([operation.path,at.start,at.end,operation.attributes.callee]))??[])){
      operationIds.set(duplicate.id,operation.id);operation.data={...duplicate.data!,...operation.data};operation.attributes={...duplicate.attributes,...operation.attributes};operation.links=[...(operation.links??[]),...(duplicate.links??[])];
    }
  }
  if(operationIds.size){const priorSelfEdges=new Set(analysis.edges.filter(edge=>edge.source===edge.target).map(edge=>edge.id));const remap=(id:string)=>operationIds.get(id)??id;analysis.nodes=analysis.nodes.filter(node=>!operationIds.has(node.id));for(const node of analysis.nodes){for(const link of node.links??[])link.targetId=remap(link.targetId);if(node.data)for(const key of ['declarationId','objectId','callSiteId','contextId']as const){const value=node.data[key];if(value)node.data[key]=remap(value);}for(const key of ['owner','target','callContext'])if(typeof node.attributes[key]==='string')node.attributes[key]=remap(String(node.attributes[key]));}for(const edge of analysis.edges){edge.source=remap(edge.source);edge.target=remap(edge.target);if(edge.details)for(const key of ['callSiteId','contextId']as const){const value=edge.details[key];if(value)edge.details[key]=remap(value);}}analysis.edges=analysis.edges.filter(edge=>edge.source!==edge.target||priorSelfEdges.has(edge.id));}
  for(const node of analysis.nodes)if(typeof node.attributes.dictionaryStackId==='string'){const stack=getStack(node.attributes.dictionaryStackId);if(stack){node.attributes.technologyName=stack.name;node.attributes.aliases=[...new Set([...(Array.isArray(node.attributes.aliases)?node.attributes.aliases:[]),...(stack.aliases??[])])];}}
  for(const request of analysis.nodes.filter(node=>node.kind==='request'&&node.attributes.endpoint)){
    const path=String(request.attributes.endpoint).replace(/^https?:\/\/[^/]+/,'').split(/[?#]/)[0];const matches=analysis.nodes.filter(node=>node.kind==='entry'&&node.attributes.routeRegistrationVerified&&node.attributes.endpoint===path&&(node.attributes.method===request.attributes.method||node.attributes.method==='ANY'));
    if(matches.length===1&&!analysis.edges.some(edge=>edge.source===request.id&&edge.target===matches[0]!.id&&edge.kind==='http')){context.edge(request,matches[0]!,'http',['runtime-flow','data-flow'],[...request.evidence,...matches[0]!.evidence]);analysis.edges.at(-1)!.confidence='inferred';}
  }
  for(const file of context.files.values())for(const product of file.products){const support=stackRegistry.find(entry=>entry.stackId===product);if(!support)continue;
    const outputs=analysis.nodes.filter(node=>node.path===file.path&&node.attributes.dictionaryStackId===product);
    if(outputs.length)analysis.coverage.push({path:file.path,language:product,status:'partial',message:`${getStack(product)?.name}: 明示した${[...new Set(outputs.map(node=>node.kind))].join('/')}を解析。${support.limitations.join('。')}`});
  }
}

