import type ts from 'typescript';
import { parseModuleImports } from './moduleResolver';
import { scriptSource, sourceSyntax } from './sourceSyntax';
import { stackSupportById } from './stackRegistry';
import { addProviderResource, type ProviderResource } from './providerAdapters';
import type { ExpansionContext } from './expandedScan';
import { templateElements } from './templateSyntax';
import { publicUrlText } from './urlPrivacy';

export function cdnAsset(url: string): { stackId: string; href: string; packageName?: string } | undefined {
  let parsed: URL; try { parsed = new URL(url.startsWith('//') ? `https:${url}` : url); } catch { return; }
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) return;
  const stackId = parsed.hostname === 'cdn.jsdelivr.net' ? 'jsdelivr' : parsed.hostname === 'unpkg.com' ? 'unpkg' : undefined; if (!stackId) return;
  const packagePath = stackId === 'jsdelivr' ? parsed.pathname.startsWith('/npm/') ? parsed.pathname.slice(5) : undefined : parsed.pathname.slice(1);
  const match = packagePath?.match(/^((?:@[^/@]+\/)?[^/@]+)(?:@[^/]+)?(?:\/|$)/);
  return { stackId, href: publicUrlText(parsed.href), packageName: match?.[1] };
}
export function scanCdnReferences(context: ExpansionContext): void {
  for (const [path, source] of context.sources) {
    if (!/\.(?:[cm]?[jt]sx?|html|vue|svelte|astro|css)$/.test(path)) continue;
    const references: Array<{ value: string; start: number; end: number }> = [];
    if (/\.(?:html|vue|svelte|astro)$/.test(path)) for (const element of templateElements(source)) for (const attribute of element.attributes) {
      if ((attribute.name === 'src' && ['script','img','source','iframe'].includes(element.name)) || attribute.name === 'href' && element.name === 'link') references.push(attribute);
    }
    for (const reference of parseModuleImports(scriptSource(path,source))) references.push({value:reference.specifier,start:reference.start,end:reference.end});
    if (/\.css$/.test(path)) {
      const syntax=sourceSyntax(source,'css');
      for(const literal of syntax.literals)if(/(?:@import\s+(?:url\(\s*)?|\burl\(\s*)$/.test(syntax.code.slice(Math.max(0,literal.start-100),literal.start)))references.push(literal);
    }
    for (const reference of references) {
      if(/^bootstrap\/dist\/css\/[^/]+\.css$/.test(reference.value)){
        addProviderResource(context,{stackId:'bootstrap',path,start:reference.start,end:reference.end,name:`Bootstrap CSS · ${reference.value.split('/').at(-1)}`,type:'other',environment:'client',endpoint:reference.value,role:'external',attributes:{assetReference:true,assetKind:'package-css',assetScope:context.owner(path)?.directory??'.'}});
        continue;
      }
      const asset=cdnAsset(reference.value);if(!asset)continue;
      addProviderResource(context,{stackId:asset.stackId,path,start:reference.start,end:reference.end,name:`${asset.stackId==='jsdelivr'?'jsDelivr':'UNPKG'} · ${asset.packageName??new URL(asset.href).pathname}`,type:'other',environment:'cloud',endpoint:asset.href,identity:asset.href,role:'delivery',attributes:{assetUrl:asset.href,assetReference:true,sourcePath:path}});
      // Explicit public package URL mapping; this is never an installed dependency edge.
      if(asset.packageName==='bootstrap')context.technology('bootstrap',path,reference.start,reference.end,'usage','Bootstrapの公開CDN資産参照');
    }
  }
}

interface Binding { module: string; symbol: string }
interface FirebaseInstance { key: string; stackId: string; service: string; type: ProviderResource['type']; project?: string; environment: string; endpoint?: string; binding?: string; start: number; end: number; connected?: { start: number; end: number }; condition?: string }
export async function scanFirebaseApi(context: ExpansionContext): Promise<void> {
  for (const [path, originalSource] of context.sources) {
    if (!/\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/.test(path))continue;
    const source=scriptSource(path,originalSource);const references=parseModuleImports(source);
    if(!references.some(reference=>/^firebase(?:-admin)?\//.test(reference.specifier)||/^(?:@supabase\/supabase-js|redis|ioredis|mariadb|mssql|auth0|@auth0\/|@clerk\/)/.test(reference.specifier)))continue;
    const typescript=await import('typescript');const file=typescript.createSourceFile(path,source,typescript.ScriptTarget.Latest,true,/x$/.test(path)?typescript.ScriptKind.TSX:typescript.ScriptKind.TS);
    const host:ts.CompilerHost={getSourceFile:name=>name===path?file:undefined,getDefaultLibFileName:()=>'',writeFile:()=>undefined,getCurrentDirectory:()=>'',getDirectories:()=>[],fileExists:name=>name===path,readFile:name=>name===path?source:undefined,getCanonicalFileName:name=>name,useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\n'};
    const checker=typescript.createProgram([path],{noLib:true,noResolve:true,allowJs:true},host).getTypeChecker();
    const bindings=new Map<ts.Symbol,Binding>();const values=new Map<ts.Symbol,ts.Expression>();const calls:ts.CallExpression[]=[];const constructions:ts.NewExpression[]=[];
    const symbolFor=(identifier:ts.Node)=>checker.getSymbolAtLocation(identifier);
    const bind=(identifier:ts.Identifier,binding:Binding)=>{const symbol=symbolFor(identifier);if(symbol)bindings.set(symbol,binding);};
    const visit=(node:ts.Node)=>{
      if(typescript.isImportDeclaration(node)&&typescript.isStringLiteralLike(node.moduleSpecifier)){
        const module=node.moduleSpecifier.text;const clause=node.importClause;if(clause?.isTypeOnly)return;
        if(clause?.name)bind(clause.name,{module,symbol:'default'});
        if(clause?.namedBindings){if(typescript.isNamespaceImport(clause.namedBindings))bind(clause.namedBindings.name,{module,symbol:'*'});else for(const item of clause.namedBindings.elements)if(!item.isTypeOnly)bind(item.name,{module,symbol:item.propertyName?.text??item.name.text});}
      }
      if(typescript.isVariableDeclaration(node)&&typescript.isIdentifier(node.name)&&node.initializer){const symbol=symbolFor(node.name);if(symbol)values.set(symbol,node.initializer);}
      if(typescript.isCallExpression(node))calls.push(node);if(typescript.isNewExpression(node))constructions.push(node);typescript.forEachChild(node,visit);
    };visit(file);
    const bindingFor=(expression:ts.Expression):Binding|undefined=>{const symbol=typescript.isIdentifier(expression)?symbolFor(expression):typescript.isPropertyAccessExpression(expression)?symbolFor(expression.expression):undefined;const binding=symbol?bindings.get(symbol):undefined;return typescript.isIdentifier(expression)?binding:typescript.isPropertyAccessExpression(expression)&&binding?.symbol==='*'?{module:binding.module,symbol:expression.name.text}:undefined;};
    const staticValue=(expression:ts.Expression|undefined,seen=new Set<ts.Symbol>()):unknown=>{
      if(!expression)return undefined;if(typescript.isStringLiteralLike(expression))return expression.text;if(typescript.isNumericLiteral(expression))return Number(expression.text);
      if(typescript.isIdentifier(expression)){const symbol=symbolFor(expression);if(symbol&&!seen.has(symbol))return staticValue(values.get(symbol),new Set([...seen,symbol]));}
      if(typescript.isObjectLiteralExpression(expression))return Object.fromEntries(expression.properties.flatMap(property=>typescript.isPropertyAssignment(property)&&(typescript.isIdentifier(property.name)||typescript.isStringLiteralLike(property.name))?[[property.name.text,staticValue(property.initializer,seen)]]:[]));return undefined;
    };
    const apps=new Map<ts.Symbol|number,string|undefined>();
    for(const call of [...calls,...constructions]){
      const binding=bindingFor(call.expression);if(!binding)continue;const args=call.arguments??[];const config=staticValue(args[0]);const options=config&&typeof config==='object'?config as Record<string,unknown>:{};let stackId:string|undefined,endpoint:string|undefined,provider:string|undefined;let type:ProviderResource['type']='other';
      if(binding.module==='@supabase/supabase-js'&&binding.symbol==='createClient'){stackId='supabase';if(typeof config==='string')endpoint=config;}
      if(binding.module==='redis'&&binding.symbol==='createClient'||binding.module==='ioredis'&&['default','Redis'].includes(binding.symbol)){stackId='redis';type='database';endpoint=typeof config==='string'?config:typeof options.url==='string'?options.url:undefined;const socket=options.socket&&typeof options.socket==='object'?options.socket as Record<string,unknown>:options;if(!endpoint&&typeof socket.host==='string')endpoint=`redis://${socket.host}:${typeof socket.port==='number'?socket.port:6379}`;}
      if(binding.module==='mariadb'&&binding.symbol==='createPool'){stackId='mariadb';type='database';provider='mysql-compatible-unresolved';if(typeof options.host==='string')endpoint=`mysql://${options.host}:${typeof options.port==='number'?options.port:3306}/${typeof options.database==='string'?options.database:''}`;}
      if(binding.module==='mssql'&&['ConnectionPool','connect'].includes(binding.symbol)){stackId='sql-server';type='database';if(typeof options.server==='string')endpoint=`mssql://${options.server}:${typeof options.port==='number'?options.port:1433}/${typeof options.database==='string'?options.database:''}`;}
      if(/^@auth0\//.test(binding.module)&&['Auth0Client','createAuth0Client'].includes(binding.symbol)||binding.module==='auth0'&&['AuthenticationClient','ManagementClient'].includes(binding.symbol)){stackId='auth0';type='auth';const domain=options.domain??options.issuerBaseURL;if(typeof domain==='string')endpoint=domain.includes('://')?domain:`https://${domain}`;}
      if(/^@clerk\//.test(binding.module)&&binding.symbol==='createClerkClient'){stackId='clerk';type='auth';if(typeof options.apiUrl==='string')endpoint=options.apiUrl;}
      if(!stackId)continue;let project:string|undefined;if(endpoint)try{const url=new URL(endpoint);project=url.hostname;}catch{endpoint=undefined;}
      const assigned=typescript.isVariableDeclaration(call.parent)&&typescript.isIdentifier(call.parent.name)?call.parent.name.text:undefined;
      addProviderResource(context,{stackId,path,start:call.getStart(file),end:call.end,name:`${stackId} client${assigned?` · ${assigned}`:''}`,type,environment:'configured',provider,project,endpoint,binding:assigned,role:'external',attributes:{sourceInstance:`${path}:${call.getStart(file)}`,endpointResolved:Boolean(endpoint),serverIdentityResolved:Boolean(endpoint)&&provider!=='mysql-compatible-unresolved'}});
    }
    for(const call of calls){const binding=bindingFor(call.expression);if(binding?.symbol==='initializeApp'&&['firebase/app','firebase-admin/app'].includes(binding.module)){
      const config=staticValue(call.arguments[0]) as Record<string,unknown>|undefined;const project=typeof config?.projectId==='string'?config.projectId:undefined;
      const assigned=typescript.isVariableDeclaration(call.parent)&&typescript.isIdentifier(call.parent.name)?symbolFor(call.parent.name):undefined;apps.set(assigned??call.getStart(file),project);
      addProviderResource(context,{stackId:'firebase',path,start:call.getStart(file),end:call.end,name:`Firebase app${project?` · ${project}`:''}`,type:'other',environment:'cloud',project,identity:project,role:'external',attributes:{sourceInstance:`${path}:${call.getStart(file)}`,firebaseApp:true,projectResolved:Boolean(project)}});
      context.technology('firebase',path,call.getStart(file),call.end,'usage','Firebase initializeAppによるapp初期化');
    }}
    const instances=new Map<ts.Symbol|number,FirebaseInstance>();const callInstances=new Map<number,FirebaseInstance>();
    const factories:Record<string,{service:string;stackId:string;type:ProviderResource['type'];module:string}>={getAuth:{service:'auth',stackId:'firebase-authentication',type:'auth',module:'firebase/auth'},getFirestore:{service:'firestore',stackId:'cloud-firestore',type:'database',module:'firebase/firestore'},getStorage:{service:'storage',stackId:'firebase-storage',type:'storage',module:'firebase/storage'}};
    for(const call of calls){const binding=bindingFor(call.expression);const factory=binding?factories[binding.symbol]:undefined;if(!factory||binding?.module!==factory.module&&binding?.module!==factory.module.replace('firebase/','firebase-admin/'))continue;
      const assigned=typescript.isVariableDeclaration(call.parent)&&typescript.isIdentifier(call.parent.name)?call.parent.name:undefined;const app=call.arguments[0];const appSymbol=app&&typescript.isIdentifier(app)?symbolFor(app):undefined;const project=appSymbol?apps.get(appSymbol):!app&&apps.size===1?[...apps.values()][0]:undefined;
      const instance:FirebaseInstance={key:assigned?`${assigned.text}:${assigned.getStart(file)}`:`instance:${call.getStart(file)}`,stackId:factory.stackId,service:factory.service,type:factory.type,project,environment:'cloud',binding:assigned?.text,start:call.getStart(file),end:call.end};instances.set(assigned?symbolFor(assigned)??call.getStart(file):call.getStart(file),instance);callInstances.set(call.getStart(file),instance);
    }
    const apiForms=stackSupportById.get('firebase-emulator-suite')!.apiForms!;
    for(const call of calls){const binding=bindingFor(call.expression);const form=apiForms.find(form=>form.module===binding?.module&&form.symbol===binding?.symbol);if(!form)continue;
      const arg=call.arguments[0];const argSymbol=arg&&typescript.isIdentifier(arg)?symbolFor(arg):undefined;const instance=argSymbol?instances.get(argSymbol):arg&&typescript.isCallExpression(arg)?callInstances.get(arg.getStart(file)):undefined;
      if(!instance||instance.service!==form.service){context.builder.addWarning({id:`warning:emulator-instance:${path}:${call.getStart(file)}`,severity:'warning',filePath:path,message:'Emulator APIのservice instanceは静的に未解決'});continue;}
      const host=staticValue(call.arguments[1]);const port=staticValue(call.arguments[2]);let endpoint:string|undefined;
      if(form.service==='auth'&&typeof host==='string')try{const url=new URL(host);if(['http:','https:'].includes(url.protocol))endpoint=url.origin;}catch{/* unresolved */}
      else if(typeof host==='string'&&typeof port==='number'&&port>0&&port<=65535)endpoint=`http://${host.includes(':')?`[${host}]`:host}:${port}`;
      const conditions:string[]=[];let parent:ts.Node=call;let unreachable=false;
      while(parent.parent){const ancestor=parent.parent;if(typescript.isIfStatement(ancestor)){const inThen=parent===ancestor.thenStatement;const condition=ancestor.expression;
          if(condition.kind===typescript.SyntaxKind.FalseKeyword&&inThen||condition.kind===typescript.SyntaxKind.TrueKeyword&&!inThen)unreachable=true;
          else if(condition.kind!==typescript.SyntaxKind.TrueKeyword&&condition.kind!==typescript.SyntaxKind.FalseKeyword)conditions.push((inThen?'':'!')+condition.getText(file));
        }parent=ancestor;}
      if(unreachable)continue;
      if(conditions.length)instances.set(call.getStart(file)+.5,{...instance,key:`${instance.key}:conditional:${call.getStart(file)}`,environment:'local',endpoint,connected:{start:call.getStart(file),end:call.end},condition:conditions.join(' && ')});
      else{instance.environment='local';instance.endpoint=endpoint;instance.connected={start:call.getStart(file),end:call.end};}
      context.technology('firebase-emulator-suite',path,call.getStart(file),call.end,'usage',`${form.service} Emulatorへの接続API`);
    }
    let suiteId:string|undefined;
    for(const instance of instances.values()){
      if(instance.environment==='local'&&!suiteId){context.builder.forEachFact(fact=>{if(fact.kind==='resource'&&fact.dictionaryStackId==='firebase-emulator-suite'&&fact.metadata.projectIdentity===instance.project&&fact.filePath?.endsWith('firebase.json')&&context.owner(fact.filePath)?.directory===context.owner(path)?.directory)suiteId??=fact.id;});
        suiteId??=addProviderResource(context,{stackId:'firebase-emulator-suite',path,start:instance.connected!.start,end:instance.connected!.end,name:'Firebase Local Emulator Suite · 接続設定',type:'other',environment:'local',project:instance.project,identity:`suite:${context.owner(path)?.directory??path}`,role:'local'});}
      addProviderResource(context,{stackId:instance.stackId,path,start:instance.connected?.start??instance.start,end:instance.connected?.end??instance.end,name:`${instance.service==='auth'?'Firebase Auth':instance.service==='firestore'?'Firestore':'Firebase Storage'}${instance.environment==='local'?' Emulator':''}${instance.endpoint?` · ${instance.endpoint}`:''}`,type:instance.type,environment:instance.environment,project:instance.project,endpoint:instance.endpoint,binding:instance.binding,identity:instance.environment==='cloud'&&instance.project?instance.project:undefined,parentId:instance.environment==='local'?suiteId:undefined,role:instance.environment==='local'?'local':'external',attributes:{service:instance.service,connectionConfigured:Boolean(instance.connected),sourceInstance:instance.key,condition:instance.condition,factoryPath:path,factoryStart:instance.start,factoryEnd:instance.end,connectionStart:instance.connected?.start,connectionEnd:instance.connected?.end}});
    }
  }
}
