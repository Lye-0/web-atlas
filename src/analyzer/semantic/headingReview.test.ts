// @vitest-environment node
import {it,expect} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {scanProjectFiles} from '../scan';
import {semanticInput} from './client';
import {analyzeSemanticSources} from './analyze';
import {initializeTestParser,testLanguage,testParser} from './testRuntime';
it.skipIf(!process.env.HEADING_REVIEW)('checks the read-only nested manifest alongside the fixed vehicle input',async()=>{
 const saved=JSON.parse(await readFile('.cache/cross-project/vehicle-management.browser.store.json','utf8'));
 const sources:Record<string,string>={...(saved.semanticSources??saved.sources)};
 const prefix='.agents/skills/xcode-project-setup/scripts/xcode_spm_setup';
 for(const suffix of ['Package.swift','Sources/main.swift']){const path=`${prefix}/${suffix}`;sources[path]=await readFile(`C:/Users/kawau/dev/vehicle-management/${path}`,'utf8');}
 const store=await scanProjectFiles(Object.entries(sources).map(([relativePath,text])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:text.length,readText:async()=>text})));
 await writeFile('.cache/cross-project/vehicle-definition.browser.store.json',JSON.stringify(store));
 await initializeTestParser();const model=(await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser)).architecture!;
 const definition=model.nodes.find(n=>n.architecture?.ownerPath===prefix)!;
 expect(definition).toBeDefined();expect(definition.attributes.definitionPath).toBe(prefix+'/Package.swift');expect(definition.attributes.definitionLocation).toContain('読込プロジェクト配下');expect(definition.attributes.compositionRole).not.toContain('ルート');
 await writeFile('.cache/heading-review/nested-definition.json',JSON.stringify({id:definition.id,attributes:definition.attributes,evidence:definition.evidence}));
},120000);
