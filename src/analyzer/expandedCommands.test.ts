import { describe,expect,it } from 'vitest';
import { commandStackId } from './expandedCommands';
import { commandArgv,commandSourceRange,parseCommandExpression } from './commandParser';
import { scanProjectFiles } from './scan';
import { projectCommand as projectCommands } from './projectors';
import type { AnalyzerSourceFile } from './types';

const files=(sources:Record<string,string>):AnalyzerSourceFile[]=>Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source}));
describe('ecosystem commands and explicit targets',()=>{
  it('resolves each Deno target against its manifest directory without suffix matching',async()=>{
    const store=await scanProjectFiles(files({'deno.json':JSON.stringify({tasks:{other:'deno run nested/main.ts',start:'deno run main.ts'}}),'main.ts':'export function main(){}','nested/main.ts':'export function nested(){}'}));
    const script=store.facts.find(fact=>fact.kind==='package-script'&&fact.scriptName==='start')!;const graph=projectCommands(store,script.id);
    expect(graph.nodes.filter(node=>node.type==='runtime').map(node=>node.metadata.entryPath)).toEqual(['main.ts']);
  });
  it('maps nested exec fragment ranges to raw escaped JSON including a repeated command',async()=>{
    const command='echo "prefix" && firebase emulators:exec --only auth "pnpm test" && pnpm test';const source=JSON.stringify({name:'app',scripts:{check:command}});
    const store=await scanProjectFiles(files({'package.json':source}));const script=store.facts.find(fact=>fact.kind==='package-script')!;
    const fragments=parseCommandExpression(command);const visit=(items:typeof fragments):void=>{for(const fragment of items){const range=commandSourceRange(source,script,fragment);expect(source.slice(range.start,range.end)).toBe(JSON.stringify(command.slice(fragment.start,fragment.end)).slice(1,-1));if(fragment.children)visit(fragment.children);}};visit(fragments);
    const graph=projectCommands(store,script.id);const commands=graph.nodes.filter(node=>node.type==='command');expect(commands.some(node=>node.label.includes('pnpm test'))).toBe(true);
    for(const node of commands)for(const item of graph.evidence.filter(item=>node.evidenceIds.includes(item.id))){const range=item.highlightRanges[0]!;expect(source.slice(range.start.column-1,range.end.column-1)).not.toBe('"pnpm tes');}
  });
  it.each([['docker compose up','docker-compose'],['docker run web','docker'],['firebase emulators:start --only auth','firebase-emulator-suite'],['firebase deploy --only hosting:site','firebase-hosting'],['firebase projects:list','firebase'],['dotnet build','dotnet'],['java -jar app.jar','jvm'],['mvn test','maven'],['gradle test','gradle'],['uv sync','uv'],['pip install -r requirements.txt','pip']])('recognizes %s without inferring unrelated child products',(command,id)=>{
    expect(commandStackId(commandArgv(parseCommandExpression(command)[0]!))).toBe(id);
  });
  it('resolves Deno tasks and preserves an unknown command',async()=>{
    const store=await scanProjectFiles(files({'deno.json':'{"tasks":{"start":"deno run main.ts","check":"mystery --flag"}}','main.ts':'export function main(){return 1;}'}));
    const scripts=store.facts.filter(fact=>fact.kind==='package-script');const start=scripts.find(script=>script.scriptName==='start')!;const graph=projectCommands(store,start.id);
    expect(graph.nodes.some(node=>node.type==='runtime'&&node.metadata.entryPath==='main.ts')).toBe(true);
    const unknown=projectCommands(store,scripts.find(script=>script.scriptName==='check')!.id);expect(unknown.nodes.some(node=>node.metadata.commandType==='unknown')).toBe(true);
    expect(parseCommandExpression('deno task start')[0]).toMatchObject({kind:'project-script',scriptName:'start'});
  });
  it('targets the Suite and selected service and represents exec tests sequentially',async()=>{
    const store=await scanProjectFiles(files({'package.json':JSON.stringify({name:'app',scripts:{check:'firebase emulators:exec --only auth "pnpm test"',test:'vitest run'},devDependencies:{vitest:'3'}}),'firebase.json':'{"emulators":{"auth":{"port":9099},"firestore":{"port":8080}}}'}));
    const script=store.facts.find(fact=>fact.kind==='package-script'&&fact.scriptName==='check')!;const graph=projectCommands(store,script.id);
    expect(graph.nodes.some(node=>node.metadata.dictionaryStackId==='firebase-emulator-suite')).toBe(true);
    expect(graph.nodes.some(node=>node.metadata.emulatorService==='auth')).toBe(true);expect(graph.nodes.some(node=>node.metadata.emulatorService==='firestore')).toBe(false);
    expect(graph.nodes.some(node=>node.type==='package-script'&&node.label==='test')).toBe(true);expect(graph.edges.some(edge=>edge.metadata.parallel===true)).toBe(false);
  });
});
