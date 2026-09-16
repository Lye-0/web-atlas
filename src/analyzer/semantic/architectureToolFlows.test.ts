import { beforeAll, describe, expect, it } from 'vitest';
import { scanProjectFiles } from '../scan';
import { semanticInput } from './client';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import { architectureScopeGraph } from './architectureProjection';
import { layoutSemanticFlow } from './flowPresentation';
import { semanticFlow3DInput } from './flow3DInput';

export const unifiedSources:Record<string,string>={
 'package.json':JSON.stringify({name:'demo',private:true,workspaces:['web','api'],scripts:{dev:'concurrently "pnpm --filter web dev" "pnpm --filter api dev"',prod:'pnpm --filter web build && pnpm --filter api deploy'}}),
 'web/package.json':JSON.stringify({name:'web',scripts:{dev:'vite --mode development',build:'vite build --mode production'},devDependencies:{vite:'^8.0.0'}}),
 'web/vite.config.ts':'export default { build: {outDir:"out"} };',
 'web/src/main.ts':'export function run(){ return fetch("/api/items"); }',
 'api/package.json':JSON.stringify({name:'api',scripts:{dev:'wrangler dev --env development',deploy:'wrangler deploy --env production',generate:'drizzle-kit generate',apply:'wrangler d1 migrations apply DB --local --env development',remote:'wrangler d1 migrations apply DB --remote --env production',help:'wrangler dev --help'},devDependencies:{wrangler:'^4.0.0','drizzle-kit':'^0.31.0'}}),
 'api/wrangler.jsonc':JSON.stringify({name:'worker',main:'src/index.ts',env:{development:{d1_databases:[{binding:'DB',database_name:'same',database_id:'dev-id',migrations_dir:'migrations'}]},production:{assets:{directory:'../web/out'},d1_databases:[{binding:'DB',database_name:'same',database_id:'prod-id',migrations_dir:'migrations'}]}}}),
 'api/src/index.ts':'export default {fetch(req: Request, env: any){ return env.DB.prepare("SELECT 1").all(); }};',
 'api/drizzle.config.ts':'export default {schema:"schema.ts",out:"migrations",dialect:"sqlite"};',
 'api/schema.ts':'export const table = "items";',
 'api/migrations/0001.sql':'CREATE TABLE items(id INTEGER);',
};
beforeAll(initializeTestParser);
async function analyze(sources:Record<string,string>){const store=await scanProjectFiles(Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source})));return (await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser)).architecture!;}
describe('one architecture with source-grounded preparation and runtime paths',()=>{
 it('shows environment-specific start, publish, generation and migration against the right identities',async()=>{
  const model=await analyze(unifiedSources), graph=architectureScopeGraph(model);
  for(const purpose of ['start','serve','build','deploy','generate','apply']) expect(graph.nodes.some(n=>n.attributes.purpose===purpose),purpose).toBe(true);
  const local=graph.nodes.find(n=>n.attributes.logicalResourceId&&n.attributes.executionPlace==='local')!;
  expect(local).toBeDefined();expect(graph.edges.some(e=>e.target===local.id&&e.kind==='flow-applies')).toBe(true);
  expect(graph.edges.some(e=>e.target===local.id&&e.kind==='data-operation')).toBe(true);
  expect(model.edges.filter(e=>e.kind==='data-operation').every(e=>e.confidence==='inferred')).toBe(true);
  const production=model.nodes.find(n=>n.architecture?.identity?.identifier==='prod-id')!;
  expect(model.edges.some(e=>e.target===production.id&&e.kind==='flow-applies')).toBe(true);
  const sql=model.nodes.find(n=>n.attributes.artifactPath==='api/migrations')!;
  expect(model.edges.some(e=>e.target===sql.id&&e.kind==='flow-generates')).toBe(true);
  expect(model.edges.some(e=>e.source===sql.id&&e.kind==='flow-input')).toBe(true);
  const built=model.nodes.find(n=>n.attributes.artifactPath==='web/out'&&n.architecture?.environments.includes('production'))!;
  expect(built).toBeDefined();expect(model.edges.some(e=>e.target===built.id&&e.kind==='flow-generates')).toBe(true);expect(model.edges.some(e=>e.source===built.id&&e.kind==='flow-input')).toBe(true);
  expect(model.nodes.filter(n=>n.attributes.purpose==='apply')).toHaveLength(2);
  expect(model.nodes.some(n=>n.attributes.purpose==='start'&&String(n.attributes.command).includes('--help'))).toBe(false);
  expect(model.edges.some(e=>e.kind==='flow-invokes')).toBe(true);
  expect(model.edges.some(e=>e.kind==='flow-precedes'&&e.details?.conditional&&e.provenance?.edges[0]?.details?.reason?.includes('&&'))).toBe(true);
  for(const node of model.nodes.filter(n=>n.attributes.unifiedFlow)){expect(node.attributes.observed).toBe(false);for(const ev of node.evidence){expect(unifiedSources[ev.path]).toBeDefined();expect(ev.end).toBeLessThanOrEqual(unifiedSources[ev.path]!.length);}}
 });
 it('does not create any operation from CLI dependencies or config alone',async()=>{
  const model=await analyze({'package.json':'{"name":"only","devDependencies":{"wrangler":"*"}}','wrangler.jsonc':'{"main":"index.ts"}','index.ts':'export const x=1;'});
  expect(model.nodes.some(n=>n.architecture?.kind==='tool-operation')).toBe(false);
 });
 it('keeps test-fixture tool usage out of the default whole-project view',async()=>{
  const sources=Object.fromEntries(Object.entries(unifiedSources).map(([path,value])=>['tests/fixtures/example/'+path,value]));
  const model=await analyze(sources);expect(model.nodes.some(n=>n.architecture?.kind==='tool-operation')).toBe(true);
  expect(architectureScopeGraph(model).nodes.some(n=>n.architecture?.kind==='tool-operation')).toBe(false);
 });
 it('retains current scope, IDs, coordinates and prepared 3D input across ordinary selection',async()=>{
  const model=await analyze(unifiedSources),graph=architectureScopeGraph(model),before=layoutSemanticFlow(graph,'2d').map(p=>[p.node.id,p.x,p.y]);
  const input=semanticFlow3DInput(graph);
  for(const node of graph.nodes){const selected=architectureScopeGraph(model,undefined,'',false,{selectedNodeId:node.id});expect(layoutSemanticFlow(selected,'2d').map(p=>[p.node.id,p.x,p.y])).toEqual(before);expect(semanticFlow3DInput(selected)).toBe(input);}
 });
 it('does not assign missing or dynamic configuration to an arbitrary worker',async()=>{
  const sources={...unifiedSources,'api/package.json':JSON.stringify({name:'api',scripts:{a:'wrangler dev --config $FILE',b:'wrangler deploy --config missing.jsonc'}})};
  const model=await analyze(sources);for(const op of model.nodes.filter(n=>n.attributes.dictionaryStackId==='wrangler'&&n.architecture?.kind==='tool-operation'))expect(model.edges.some(e=>e.source===op.id&&['flow-starts','flow-deploys'].includes(e.kind))).toBe(false);
 });
 it('does not match different artifact paths or resolve a dynamic build output as dist',async()=>{
  const sources={...unifiedSources,'web/vite.config.ts':'export default {build:{outDir:process.env.OUTPUT}};'};
  const model=await analyze(sources);expect(model.edges.some(e=>e.kind==='flow-generates'&&model.nodes.find(n=>n.id===e.source)?.attributes.purpose==='build')).toBe(false);
 });
 it('keeps remote D1 binding on a local Worker separate from the local migration target',async()=>{
  const settings=JSON.parse(unifiedSources['api/wrangler.jsonc']!);settings.env.development.d1_databases[0].remote=true;
  const model=await analyze({...unifiedSources,'api/wrangler.jsonc':JSON.stringify(settings)});
  const runtime=model.nodes.find(n=>n.architecture?.kind==='execution-config'&&n.attributes.configurationPath==='api/wrangler.jsonc'&&n.architecture.environments.includes('development'))!;
  const remote=model.nodes.find(n=>n.architecture?.identity?.identifier==='dev-id')!;
  expect(model.edges.some(e=>e.source===runtime.id&&e.target===remote.id&&e.kind==='data-operation')).toBe(true);
  expect(model.edges.some(e=>e.source===runtime.id&&model.nodes.find(n=>n.id===e.target)?.attributes.logicalResourceId===remote.id)).toBe(false);
 });
});
