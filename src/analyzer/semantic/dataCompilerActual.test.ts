// @vitest-environment node
import {expect,it} from 'vitest';
import {readdir,readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {scanProjectFiles} from '../scan';
import {isExcludedDirectory,isSensitivePath,isAnalyzerSourcePath,isAnalyzerUsageSourcePath,isAnalyzerSemanticSourcePath} from '../fileDiscovery';
import {semanticInput} from './client';
import {analyzeSemanticSources} from './analyze';
import {initializeTestParser,testLanguage,testParser} from './testRuntime';
import {projectSemanticView} from './project';

it.skipIf(!process.env.WEB_ATLAS_ASTRO_REVIEW_ROOT)('analyzes a read-only component project without executing its scripts',async()=>{
 const root=process.env.WEB_ATLAS_ASTRO_REVIEW_ROOT!;
 const files:Parameters<typeof scanProjectFiles>[0]=[];
 const walk=async(directory:string)=>{for(const entry of await readdir(join(root,directory),{withFileTypes:true})){
  const path=directory?directory+'/'+entry.name:entry.name;
  if(entry.isSymbolicLink()||isSensitivePath(path))continue;
  if(entry.isDirectory()){if(!isExcludedDirectory(entry.name))await walk(path);continue;}
  if(!isAnalyzerSourcePath(path)&&!isAnalyzerUsageSourcePath(path)&&!isAnalyzerSemanticSourcePath(path))continue;
  const size=(await stat(join(root,path))).size;if(size>1048576)continue;
  files.push({relativePath:path,name:entry.name,extension:extname(path),size,readText:()=>readFile(join(root,path),'utf8')});
 }};
 await walk('');await initializeTestParser();const start=performance.now();
 const store=await scanProjectFiles(files),input=semanticInput(store);
 expect(Object.keys(input.sources).some(path=>path.endsWith('.astro'))).toBe(true);
 const analysis=await analyzeSemanticSources(input,testLanguage,undefined,testParser);
 expect(analysis.architecture?.nodes.length).toBeGreaterThan(0);
 expect(analysis.nodes.some(node=>node.kind==='model'&&node.path?.endsWith('.astro'))).toBe(true);
 const views=Object.fromEntries((['runtime-flow','function-call-flow','data-flow','data-model','architecture-map'] as const).map(view=>{const graph=view==='architecture-map'?analysis.architecture!:projectSemanticView(analysis,view);return [view,{nodes:graph.nodes.length,edges:graph.edges.length}];}));
 await mkdir('.cache/astro-review',{recursive:true});
 await writeFile('.cache/astro-review/actual.json',JSON.stringify({files:files.length,elapsedMs:performance.now()-start,stats:analysis.stats,views,coverage:analysis.coverage.map(file=>({path:file.path,status:file.status}))},null,2));
},300000);
