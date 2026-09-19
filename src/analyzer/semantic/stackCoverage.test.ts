// @vitest-environment node
import{beforeAll,describe,expect,it}from'vitest';
import{languageCoverageFixtures}from'../fixtures/stack-coverage/languages';
import{stackSupportById}from'../stackRegistry';
import{scanProjectFiles}from'../scan';
import{projectModuleDependency,projectStackMap}from'../projectors';
import{semanticInput}from'./client';
import{analyzeSemanticSources}from'./analyze';
import{initializeTestParser,testLanguage,testParser}from'./testRuntime';
import{projectSemanticView}from'./project';
import type{AnalyzerSourceFile}from'../types';
beforeAll(initializeTestParser);
const files=(sources:Record<string,string>):AnalyzerSourceFile[]=>Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source}));
describe('registry language fixtures: basic call/data/model, scope and negative gates (runtime boundary delegated)',()=>{
  it.each(languageCoverageFixtures)('$fixtureId excludes commented declarations and calls',async fixture=>{
    const prefix=['python','ruby'].includes(fixture.stackId)?'# ':'// ';const commented=fixture.sources[fixture.main]!.split('\n').map(line=>prefix+line).join('\n');const sources={...fixture.sources,[fixture.main]:fixture.stackId==='php'?'<?php\n'+commented:commented};const store=await scanProjectFiles(files(sources));const analysis=await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser);
    expect(projectModuleDependency(store).edges.some(edge=>edge.sourceId===`module:${fixture.main}`)).toBe(false);
    expect(analysis.nodes.some(node=>node.path===fixture.main&&(node.kind==='model'||node.kind==='function'&&!node.attributes.initializer||node.kind==='entry'))).toBe(false);
  });
  it.each(languageCoverageFixtures)('$fixtureId retains two independently declared source owners',async fixture=>{
    const sources=Object.fromEntries(['a','b'].flatMap(prefix=>Object.entries(fixture.sources).map(([path,source])=>[`${prefix}/${path}`,source])));const store=await scanProjectFiles(files(sources));const graph=projectModuleDependency(store);
    for(const prefix of ['a','b'])expect(graph.edges.some(edge=>edge.sourceId===`module:${prefix}/${fixture.main}`&&edge.targetId===`module:${prefix}/${fixture.helper}`)).toBe(true);
    expect(graph.edges.some(edge=>edge.sourceId.startsWith('module:a/')&&edge.targetId.startsWith('module:b/')||edge.sourceId.startsWith('module:b/')&&edge.targetId.startsWith('module:a/'))).toBe(false);
    const usages=projectStackMap(store).nodes.filter(node=>node.metadata.dictionaryStackId===fixture.stackId);expect(usages.map(node=>node.metadata.scopePath)).toEqual(expect.arrayContaining(['a','b']));
  });
  it.each(languageCoverageFixtures)('$fixtureId preserves import/call/input/output/model ownership',async fixture=>{
    expect(stackSupportById.get(fixture.stackId)?.fixtureId).toBe(fixture.fixtureId);
    const store=await scanProjectFiles(files(fixture.sources));const input=semanticInput(store);const analysis=await analyzeSemanticSources(input,testLanguage,undefined,testParser);
    expect(projectStackMap(store).nodes.some(node=>node.metadata.dictionaryStackId===fixture.stackId)).toBe(true);
    const modules=projectModuleDependency(store);expect(modules.edges.some(edge=>edge.sourceId===`module:${fixture.main}`&&edge.targetId===`module:${fixture.helper}`)).toBe(true);
    const call=projectSemanticView(analysis,'function-call-flow');const main=analysis.nodes.find(node=>node.kind==='function'&&node.path===fixture.main&&node.attributes.name==='main')!;const save=analysis.nodes.find(node=>node.kind==='function'&&node.path===fixture.main&&node.attributes.name===fixture.save)!;
    expect(call.edges.some(edge=>edge.source===main.id&&edge.target===save.id&&edge.kind==='calls')).toBe(true);
    const direct=call.edges.find(edge=>edge.source===main.id&&edge.target===save.id&&edge.kind==='calls')!;expect(direct.evidence.some(at=>fixture.sources[at.path]!.slice(at.start,at.end).includes(fixture.stackId==='php'?'save($input)':'save(input)'))).toBe(true);
    expect(projectSemanticView(analysis,'runtime-flow').nodes.some(node=>node.id===main.id)).toBe(true);
    const data=projectSemanticView(analysis,'data-flow');expect(data.edges.some(edge=>edge.kind==='passes-to'||edge.kind==='argument')).toBe(true);expect(data.edges.some(edge=>/return/.test(edge.kind))).toBe(true);
    const model=projectSemanticView(analysis,'data-model').nodes.find(node=>node.label==='User')!;expect(model.fields?.some(field=>field.name===fixture.field)).toBe(true);
    const userField=model.fields!.find(field=>field.name===fixture.field)!;expect(userField.evidence?.some(at=>fixture.sources[at.path]!.slice(at.start,at.end).includes('id'))).toBe(true);
    expect(analysis.architecture?.nodes.some(node=>node.architecture?.files.includes(fixture.main))).toBe(true);
    for(const edge of analysis.edges){expect(analysis.nodes.some(node=>node.id===edge.source)).toBe(true);expect(analysis.nodes.some(node=>node.id===edge.target)).toBe(true);for(const at of edge.evidence){expect(at.start).toBeGreaterThanOrEqual(0);expect(at.end).toBeLessThanOrEqual(fixture.sources[at.path]!.length);}}
  });
});
