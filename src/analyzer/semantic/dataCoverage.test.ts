// @vitest-environment node
import{beforeAll,describe,expect,it}from'vitest';
import{dataCoverageFixtures}from'../fixtures/stack-coverage/data';
import{stackSupportById}from'../stackRegistry';
import{scanProjectFiles}from'../scan';
import{semanticInput}from'./client';
import{analyzeSemanticSources}from'./analyze';
import{initializeTestParser,testLanguage,testParser}from'./testRuntime';
import{projectSemanticView}from'./project';
beforeAll(initializeTestParser);
async function analyze(sources:Record<string,string>){const store=await scanProjectFiles(Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source})));return{store,analysis:await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser)};}
describe('D registry fixtures: bound operation / model / resource forms',()=>{
  it.each(dataCoverageFixtures)('$fixtureId emits its concrete operation/model edges and original field ranges',async fixture=>{
    expect(stackSupportById.get(fixture.stackId)?.fixtureId).toBe(fixture.fixtureId);const{store,analysis}=await analyze(fixture.sources);expect(store.facts.some(fact=>fact.kind==='technology'&&fact.dictionaryStackId===fixture.stackId)).toBe(true);
    for(const kind of fixture.edges){const edges=analysis.edges.filter(edge=>edge.kind===kind);expect(edges.length,kind).toBeGreaterThan(0);for(const edge of edges)for(const at of edge.evidence){const source=fixture.sources[at.path]!;expect(source).toBeDefined();expect(at.end).toBeGreaterThan(at.start);expect(source.slice(0,at.start).split('\n').length).toBe(at.line);}}
    const model=projectSemanticView(analysis,'data-model').nodes.find(node=>node.fields?.some(field=>field.name===fixture.field))!;expect(model).toBeDefined();const field=model.fields!.find(field=>field.name===fixture.field)!;expect(field.evidence?.some(at=>fixture.sources[at.path]!.slice(at.start,at.end).includes(fixture.field))).toBe(true);
    expect(projectSemanticView(analysis,'runtime-flow').nodes.some(node=>node.kind==='operation'&&node.attributes.dictionaryStackId===fixture.stackId)).toBe(true);expect(projectSemanticView(analysis,'data-flow').edges.some(edge=>fixture.edges.includes(edge.kind))).toBe(true);
    for(const operation of analysis.nodes.filter(node=>node.kind==='operation'&&node.attributes.dictionaryStackId===fixture.stackId&&node.attributes.callee&&!node.data?.contextId)){const at=operation.evidence[0]!;expect(analysis.nodes.filter(node=>node.kind==='operation'&&!node.data?.contextId&&node.path===operation.path&&node.attributes.callee===operation.attributes.callee&&node.evidence.some(other=>other.start===at.start&&other.end===at.end))).toHaveLength(1);}
    if(fixture.resource)expect(analysis.architecture?.nodes.some(node=>['external-service','resource'].includes(node.architecture?.kind??'')&&node.attributes.dictionaryStackId===fixture.stackId)).toBe(true);
    if(['clerk','auth0'].includes(fixture.stackId))expect(model.attributes.dictionaryStackId).toBeUndefined();
  });
  it.each(dataCoverageFixtures)('$fixtureId does not produce product operations from comments',async fixture=>{
    const sources=Object.fromEntries(Object.entries(fixture.sources).map(([path,source])=>[path,/\.(?:ts|cs)$/.test(path)?source.split('\n').map(line=>'// '+line).join('\n'):path.endsWith('.py')?source.split('\n').map(line=>'# '+line).join('\n'):source]));const{analysis}=await analyze(sources);expect(analysis.nodes.some(node=>node.kind==='operation'&&node.attributes.dictionaryStackId===fixture.stackId)).toBe(false);expect(analysis.edges.some(edge=>fixture.edges.includes(edge.kind))).toBe(false);
  });
  it.each(dataCoverageFixtures)('$fixtureId keeps same-name models and instances in independent projects',async fixture=>{
    const sources=Object.fromEntries(['a','b'].flatMap(prefix=>Object.entries(fixture.sources).map(([path,source])=>[`${prefix}/${path}`,source])));const{analysis}=await analyze(sources);for(const prefix of ['a','b']){const edges=analysis.edges.filter(edge=>fixture.edges.includes(edge.kind)&&analysis.nodes.find(node=>node.id===edge.source)?.path?.startsWith(prefix+'/'));expect(edges.length).toBeGreaterThan(0);expect(edges.every(edge=>analysis.nodes.find(node=>node.id===edge.target)?.kind==='resource'||analysis.nodes.find(node=>node.id===edge.target)?.path?.startsWith(prefix+'/'))).toBe(true);}
  });
});
