// @vitest-environment node
import{beforeAll,describe,expect,it}from'vitest';
import{frameworkCoverageFixtures}from'../fixtures/stack-coverage/frameworks';
import{stackSupportById}from'../stackRegistry';
import{scanProjectFiles}from'../scan';
import{semanticInput}from'./client';
import{analyzeSemanticSources}from'./analyze';
import{initializeTestParser,testLanguage,testParser}from'./testRuntime';
import{projectSemanticView}from'./project';
beforeAll(initializeTestParser);
describe('framework registry fixtures: route → handler → direct processing → data',()=>{
  it.each(frameworkCoverageFixtures)('$fixtureId ignores commented registrations while retaining its manifest declaration',async fixture=>{
    const sources=Object.fromEntries(Object.entries(fixture.sources).map(([path,source])=>{if(!/\.(?:ts|tsx|py|rb|php|java|cs|go|rs)$/.test(path))return[path,source];const prefix=/\.(?:py|rb)$/.test(path)?'# ':'// ';return[path,(path.endsWith('.php')?'<?php\n':'')+source.split('\n').map(line=>prefix+line).join('\n')];}));
    const store=await scanProjectFiles(Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source})));const analysis=await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser);
    expect(analysis.nodes.some(node=>node.kind==='entry'&&node.attributes.endpoint===fixture.endpoint)).toBe(false);expect(analysis.edges.some(edge=>edge.kind==='handles')).toBe(false);
  });
  it.each(frameworkCoverageFixtures)('$fixtureId retains project-local handler calls for twin projects',async fixture=>{
    const sources=Object.fromEntries(['a','b'].flatMap(prefix=>Object.entries(fixture.sources).map(([path,source])=>[`${prefix}/${path}`,source])));const store=await scanProjectFiles(Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source})));const analysis=await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser);
    for(const prefix of ['a','b']){const entries=analysis.nodes.filter(node=>node.kind==='entry'&&node.path?.startsWith(prefix+'/')&&node.attributes.endpoint===fixture.endpoint);expect(entries.length).toBeGreaterThan(0);for(const entry of entries){const targets=analysis.edges.filter(edge=>edge.source===entry.id&&edge.kind==='handles').map(edge=>analysis.nodes.find(node=>node.id===edge.target));expect(targets.length).toBeGreaterThan(0);expect(targets.every(node=>node?.path?.startsWith(prefix+'/'))).toBe(true);}}
  });
  it.each(frameworkCoverageFixtures)('$fixtureId preserves its real handler chain',async fixture=>{
    expect(stackSupportById.get(fixture.stackId)?.fixtureId).toBe(fixture.fixtureId);
    const store=await scanProjectFiles(Object.entries(fixture.sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source})));const analysis=await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser);
    expect(store.facts.some(fact=>fact.kind==='technology'&&fact.dictionaryStackId===fixture.stackId)).toBe(true);
    const handler=analysis.nodes.find(node=>node.kind==='function'&&node.attributes.name===fixture.handler)!;expect(handler).toBeDefined();
    const entries=analysis.nodes.filter(node=>node.kind==='entry'&&node.attributes.endpoint===fixture.endpoint);expect(entries.length).toBeGreaterThan(0);expect(entries.some(entry=>analysis.edges.some(edge=>edge.source===entry.id&&edge.target===handler.id&&edge.kind==='handles'))).toBe(true);
    expect([...new Set(analysis.nodes.filter(node=>node.kind==='entry'&&node.attributes.endpoint).map(node=>node.attributes.endpoint))]).toEqual([fixture.endpoint]);
    expect(entries.some(entry=>entry.attributes.dictionaryStackId===fixture.stackId||fixture.stackId==='spring-boot'&&entry.attributes.dictionaryStackId==='spring-framework')).toBe(true);
    expect(projectSemanticView(analysis,'function-call-flow').edges.some(edge=>edge.source===handler.id&&edge.kind==='calls'&&analysis.nodes.find(node=>node.id===edge.target)?.attributes.name===fixture.processing)).toBe(true);
    const runtime=projectSemanticView(analysis,'runtime-flow');expect(runtime.edges.some(edge=>entries.some(entry=>entry.id===edge.source))).toBe(true);
    expect(projectSemanticView(analysis,'data-flow').nodes.some(node=>node.data?.role==='return'||node.attributes.returnValue)).toBe(true);
    if(fixture.field)expect(projectSemanticView(analysis,'data-model').nodes.some(node=>node.fields?.some(field=>field.name===fixture.field))).toBe(true);
    if(fixture.stackId==='ruby-on-rails')expect(analysis.nodes.find(node=>node.kind==='model'&&node.label==='User')?.fields?.map(field=>field.name)).toEqual(['name']);
    expect(analysis.architecture?.nodes.some(node=>node.architecture?.kind==='application')).toBe(true);
  });
});
