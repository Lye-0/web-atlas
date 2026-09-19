// @vitest-environment node
import {beforeAll,it,expect} from 'vitest';
import {scanProjectFiles} from '../scan';
import {semanticInput} from './client';
import {analyzeSemanticSources} from './analyze';
import {initializeTestParser,testLanguage,testParser} from './testRuntime';
import {architectureScopeGraph} from './architectureProjection';
beforeAll(initializeTestParser);
async function analyze(sources:Record<string,string>){const store=await scanProjectFiles(Object.entries(sources).map(([relativePath,text])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:text.length,readText:async()=>text})));return analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser);}
it('keeps the exact HTTP call and argument across a callback chain',async()=>{
 const text="globalThis.fetch('/assets/parser.wasm').then(response=>response.arrayBuffer()).then(bytes=>Engine.init({bytes})); fetch(endpoint); fetch('/other'); function init(bytes){return Engine.init({bytes});}";
 const a=await analyze({'package.json':'{"name":"sample","scripts":{"dev":"vite"}}','src/main.ts':text});
 const requests=a.nodes.filter(n=>n.kind==='request');expect(requests).toHaveLength(3);
 const targets=a.architecture!.nodes.filter(n=>n.architecture?.request?.kind==='http');
 expect(targets.map(n=>n.architecture!.request!.expression).sort()).toEqual(['/assets/parser.wasm','/other','endpoint']);
 expect(targets.every(n=>n.attributes.compositionRole===undefined)).toBe(true);
 for(const request of requests)expect(text.slice(request.evidence[0]!.start,request.evidence[0]!.end)).toMatch(/^(?:globalThis\.)?fetch\([^)]*\)$/);
});
it('does not classify a local fetch binding or parameter as HTTP',async()=>{
 const a=await analyze({'package.json':'{"name":"sample"}','a.ts':"function fetch(value){return value};fetch('/local'); function run(fetch){fetch('/parameter');} globalThis.fetch('/real');"});
 expect(a.nodes.filter(n=>n.kind==='request').map(n=>n.attributes.endpoint)).toEqual(['/real']);
});
it('keeps code-internal relations off the runtime-to-definition boundary',async()=>{
 const a=await analyze({'package.json':JSON.stringify({name:'sample',scripts:{dev:'wrangler dev',deploy:'wrangler deploy'}}),'wrangler.jsonc':JSON.stringify({name:'sample',main:'main.ts'}),'main.ts':"function handler(){helper()}function helper(){} addEventListener('load',handler);"});
 const m=a.architecture!,configIds=new Set(m.nodes.filter(n=>n.architecture?.kind==='execution-config').map(n=>n.id));
 expect(m.edges.filter(e=>configIds.has(e.source)&&['calls','callback','handles','registers-event','code-reference'].includes(e.kind))).toHaveLength(0);
 expect(m.edges.some(e=>e.kind==='flow-definition')).toBe(true);expect(m.edges.some(e=>e.kind==='registers-event')).toBe(true);
 const original=a.edges.find(e=>e.kind==='registers-event')!;
 const root=architectureScopeGraph(m),internal=root.architectureView!.internalRelations.find(e=>e.provenance?.edges.some(x=>x.id===original.id))!;
 expect(internal).toBeDefined();expect(internal.provenance!.edges.find(e=>e.id===original.id)).toEqual(original);
 expect(root.edges.some(e=>e.provenance?.edges.some(x=>x.id===original.id))).toBe(false);
});
it.each(['panel','renamed-ui'])('resolves a root script to its %s browser input, not its extension host',async(folder)=>{
 const a=await analyze({'package.json':JSON.stringify({name:'host',engines:{vscode:'^1.90'},main:'host.js',scripts:{dev:`vite --config ${folder}/vite.config.ts`,build:`vite build --config ${folder}/vite.config.ts`},devDependencies:{vite:'^7.0.0'}}),[`${folder}/vite.config.ts`]:`import {defineConfig} from 'vite';export default defineConfig({root:'${folder}',build:{outDir:'../out/client'}});`,[`${folder}/src/main.ts`]:'const client=acquireVsCodeApi();client.postMessage({ready:true});','host.js':'export function activate(){}'});
 const m=a.architecture!,browser=m.nodes.find(n=>n.architecture?.context.includes('Webview / ブラウザ'))!;
 const server=m.nodes.find(n=>n.architecture?.kind==='execution-config')!;expect(server.attributes.logicalOwnerId).toBe(browser.id);
 expect(m.nodes.some(n=>n.attributes.artifactPath==='out/client')).toBe(true);expect(m.edges.some(e=>e.source===server.id&&e.target===browser.id&&e.kind==='flow-serves')).toBe(true);
});
it('preserves known HTTP clients and imported fetch aliases, but not lookalike methods',async()=>{
 const a=await analyze({'package.json':'{"name":"clients"}','main.ts':"import {fetch as download} from 'undici'; download('/known'); axios.get('/client'); apiFetch(endpoint); const object={fetch(x){return x}};object.fetch('/not-http');"});
 expect(a.nodes.filter(n=>n.kind==='request').map(n=>n.attributes.endpoint).sort()).toEqual(['','/client','/known']);
});
it('preserves imported test-service and signed HTTP client calls with lexical provenance',async()=>{
 const a=await analyze({'package.json':'{"name":"clients"}','main.ts':"import {SELF as service} from 'cloudflare:test';import {AwsClient as Signed} from 'aws4fetch';const client=new Signed({});service.fetch('/test');client.fetch(endpoint);function fake(client){client.fetch('/not-http')}"});
 expect(a.nodes.filter(n=>n.kind==='request').map(n=>n.attributes.endpoint).sort()).toEqual(['','/test']);
});
it('keeps assets-only delivery separate from browser internal operations and explains its content',async()=>{
 const a=await analyze({'package.json':JSON.stringify({name:'static',scripts:{dev:'vite',deploy:'wrangler deploy'}}),'wrangler.jsonc':JSON.stringify({assets:{directory:'./dist'}}),'src/main.ts':"function ready(){} addEventListener('load',ready);fetch('/data');"});
 const m=a.architecture!,runtime=m.nodes.find(n=>n.architecture?.kind==='execution-config'&&n.attributes.configurationPath==='wrangler.jsonc')!;
 expect(runtime.attributes.providedContent).toBe('静的アセットを配信する構成');
 expect(m.edges.filter(e=>e.source===runtime.id&&['http-request','calls','registers-event'].includes(e.kind))).toHaveLength(0);
 expect(m.edges.some(e=>e.kind==='http-request')).toBe(true);
});
it('reports missing configuration, dynamic root and unsupported export separately without executing them',async()=>{
 const inputs=[['missing.ts',undefined,'入力スナップショット'],['dynamic.ts',"export default {root:process.env.ROOT,build:{outDir:'out'}}",'rootが動的'],['call.ts',"export default (()=>{throw new Error('must never run')})()",'未対応の構文']] as const;
 for(const [path,config,reason]of inputs){const a=await analyze({'package.json':JSON.stringify({name:'sample',scripts:{build:`vite build --config ${path}`},devDependencies:{vite:'^7.0.0'}}),...(config?{[path]:config}:{})});const op=a.architecture!.nodes.find(n=>n.attributes.purpose==='build')!;expect(String(op.attributes.resolution)).toContain(reason);expect(a.architecture!.edges.some(e=>e.source===op.id&&e.kind==='flow-generates')).toBe(false);}
});
it('does not hide an application by directory name, and describes explicit support purposes separately',async()=>{
 const sources={'package.json':JSON.stringify({name:'root',workspaces:['artifacts/product','utility']}),'artifacts/product/package.json':JSON.stringify({name:'product',scripts:{dev:'vite'}}),'artifacts/product/main.ts':"fetch('/real')",'utility/package.json':JSON.stringify({name:'helper',description:'A tool for recording',scripts:{dev:'vite'}}),'utility/main.ts':'export const x=1;'};
 const a=await analyze(sources),b=await analyze(Object.fromEntries(Object.entries(sources).reverse()));
 const product=a.architecture!.nodes.find(n=>n.label==='product')!,helper=a.architecture!.nodes.find(n=>n.label==='helper')!;
 expect(product.architecture?.auxiliary).toBe(false);expect(product.attributes.compositionRole).not.toContain('補助');expect(helper.attributes.compositionRole).toBe('開発・検証・記録の補助');expect(helper.architecture?.auxiliary).toBe(false);
 expect(a.architecture!.nodes.map(n=>n.id).sort()).toEqual(b.architecture!.nodes.map(n=>n.id).sort());
});
it('keeps same-name artifacts and tool uses in separate package paths',async()=>{
 const sources:Record<string,string>={'package.json':JSON.stringify({name:'root',workspaces:['first','second']})};for(const dir of ['first','second']){sources[`${dir}/package.json`]=JSON.stringify({name:'same',scripts:{build:'vite build --config "build setup.ts"'},devDependencies:{vite:'^7.0.0'}});sources[`${dir}/build setup.ts`]='export default {root:"ui",build:{outDir:"out"}}';sources[`${dir}/ui/main.ts`]='export const x=1;';}
 const a=await analyze(sources);expect(a.architecture!.nodes.filter(n=>n.architecture?.kind==='artifact').map(n=>n.attributes.artifactPath).sort()).toEqual(['first/ui/out','second/ui/out']);
 expect(a.architecture!.nodes.filter(n=>n.attributes.purpose==='build')).toHaveLength(2);
});
