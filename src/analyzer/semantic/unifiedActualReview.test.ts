// @vitest-environment node
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { it } from 'vitest';
import { scanProjectFiles } from '../scan';
import { semanticInput } from './client';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import { architectureScopeGraph } from './architectureProjection';
import { layoutSemanticFlow } from './flowPresentation';

it.skipIf(!process.env.WEB_ATLAS_UNIFIED_REVIEW)('captures read-only actual inputs and same-condition measurements', async () => {
  await initializeTestParser();
  const phase = process.env.WEB_ATLAS_UNIFIED_REVIEW!;
  const destination = `.cache/unified-review/${phase}`;
  await mkdir(destination, { recursive: true });
  for (const name of ['vehicle-management', 'git-lines', 'Chess']) {
    const root = `C:/Users/kawau/dev/${name}`;
    const files: {relativePath:string;name:string;extension:string;size:number;readText:()=>Promise<string>}[] = [];
    const hashes: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(join(root,dir), {withFileTypes:true})) {
        if (entry.isSymbolicLink() || /^(?:\.|node_modules|dist|build|bin$|obj$|coverage|vendor|target)/i.test(entry.name)) continue;
        const path = `${dir ? dir+'/' : ''}${entry.name}`;
        if (entry.isDirectory()) { await walk(path); continue; }
        if (!/\.(?:[cm]?[jt]sx?|jsonc?|toml|ya?ml|sql|cs|csproj|sln|xaml|html|css|py|go|rs|xml)$/.test(path) || /lock\.|lock$|\.min\.|\.d\.ts$/.test(path)) continue;
        const source = await readFile(join(root,path),'utf8'); if (source.length > 700000) continue;
        hashes.push(path+':'+createHash('sha256').update(source).digest('hex'));
        files.push({relativePath:path,name:entry.name,extension:extname(path),size:source.length,readText:async()=>source});
      }
    };
    await walk('');
    const start = performance.now(), store = await scanProjectFiles(files), scanned = performance.now();
    const input = semanticInput(store), prepared = performance.now();
    const analysis = await analyzeSemanticSources(input,testLanguage,undefined,testParser), analyzed=performance.now();
    const graph=architectureScopeGraph(analysis.architecture!); const layout=layoutSemanticFlow(graph,'2d');
    const loops=performance.now(); for(let i=0;i<100;i++) {const selected=graph.nodes[i%graph.nodes.length]?.id; layoutSemanticFlow(architectureScopeGraph(analysis.architecture!,undefined,'',false,{selectedNodeId:selected,mode:'2d'}),'2d');}
    const metrics={name,files:files.length,fingerprint:createHash('sha256').update(hashes.sort().join('\n')).digest('hex'),scanMs:scanned-start,inputMs:prepared-scanned,analysisMs:analyzed-prepared,selection100Ms:performance.now()-loops,nodes:graph.nodes.length,edges:graph.edges.length,layoutNodes:layout.length};
    await writeFile(`${destination}/${name}.metrics.json`,JSON.stringify(metrics,null,2));
    await writeFile(`${destination}/${name}.store.json`,JSON.stringify(store));
    await writeFile(`${destination}/${name}.architecture.json`,JSON.stringify({nodes:analysis.architecture!.nodes.map(n=>({id:n.id,label:n.label,kind:n.architecture?.kind,attributes:n.attributes,environments:n.architecture?.environments})),edges:analysis.architecture!.edges.map(e=>({id:e.id,source:e.source,target:e.target,kind:e.kind}))}));
    console.info(JSON.stringify(metrics));
  }
},120000);
