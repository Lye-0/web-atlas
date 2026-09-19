// @vitest-environment node
import{beforeAll,describe,expect,it}from'vitest';
import{uiCoverageFixtures}from'../fixtures/stack-coverage/ui';
import{stackSupportById}from'../stackRegistry';
import{scanProjectFiles}from'../scan';
import{semanticInput}from'./client';
import{analyzeSemanticSources}from'./analyze';
import{initializeTestParser,testLanguage,testParser}from'./testRuntime';
import{projectSemanticView}from'./project';
beforeAll(initializeTestParser);
describe('UI registry fixtures: component/event → handler → processing and explicit fields',()=>{
  it.each(uiCoverageFixtures)('$fixtureId ignores source/template comments as event registrations',async fixture=>{
    const sources=Object.fromEntries(Object.entries(fixture.sources).map(([path,source])=>[path,/\.(?:html|vue|svelte|astro|xaml)$/.test(path)?`<!-- ${source} -->`:/\.(?:ts|tsx|jsx|js|cs)$/.test(path)?source.split('\n').map(line=>'// '+line).join('\n'):source]));const store=await scanProjectFiles(Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source})));const analysis=await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser);
    expect(analysis.edges.some(edge=>edge.kind==='handles'||edge.kind==='uses-style'||edge.kind==='hydrates-island')).toBe(false);
  });
  it.each(uiCoverageFixtures)('$fixtureId keeps matching names within their own project',async fixture=>{
    const sources=Object.fromEntries(['a','b'].flatMap(prefix=>Object.entries(fixture.sources).map(([path,source])=>[`${prefix}/${path}`,source])));const store=await scanProjectFiles(Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source})));const analysis=await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser);
    for(const prefix of ['a','b']){const targets=analysis.edges.filter(edge=>['handles','uses-style','renders-island'].includes(edge.kind)&&analysis.nodes.find(node=>node.id===edge.source)?.path?.startsWith(prefix+'/'));expect(targets.length).toBeGreaterThan(0);expect(targets.every(edge=>analysis.nodes.find(node=>node.id===edge.target)?.path?.startsWith(prefix+'/'))).toBe(true);}
  });
  it.each(uiCoverageFixtures)('$fixtureId preserves its supported UI primitives',async fixture=>{
    expect(stackSupportById.get(fixture.stackId)?.fixtureId).toBe(fixture.fixtureId);const store=await scanProjectFiles(Object.entries(fixture.sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source})));const analysis=await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser);
    expect(store.facts.some(fact=>fact.kind==='technology'&&fact.dictionaryStackId===fixture.stackId)).toBe(true);
    if(fixture.handler){const handler=analysis.nodes.find(node=>node.kind==='function'&&node.attributes.name===fixture.handler)!;expect(handler).toBeDefined();expect(analysis.edges.some(edge=>edge.kind==='handles'&&edge.target===handler.id)).toBe(true);expect(projectSemanticView(analysis,'function-call-flow').edges.some(edge=>edge.source===handler.id&&analysis.nodes.find(node=>node.id===edge.target)?.attributes.name===fixture.processing)).toBe(true);expect(projectSemanticView(analysis,'data-flow').nodes.some(node=>node.data?.role==='return'||node.attributes.returnValue)).toBe(true);}
    if(fixture.field)expect(projectSemanticView(analysis,'data-model').nodes.some(node=>node.fields?.some(field=>field.name===fixture.field))).toBe(true);
    if(fixture.fileRoute)expect(analysis.nodes.some(node=>node.attributes.dictionaryStackId===fixture.stackId&&node.attributes.fileRoute&&node.attributes.endpoint===fixture.fileRoute)).toBe(true);
    if(fixture.stackId==='bootstrap'){expect(projectSemanticView(analysis,'runtime-flow').edges.some(edge=>edge.kind==='uses-style')).toBe(true);expect(analysis.nodes.some(node=>node.kind==='model'&&node.attributes.dictionaryStackId==='bootstrap')).toBe(false);}
    if(fixture.stackId==='astro')expect(analysis.edges.some(edge=>edge.kind==='hydrates-island')).toBe(true);
    if(fixture.stackId==='nuxt'){const response=projectSemanticView(analysis,'data-flow').nodes.filter(node=>node.path==='server/api/users.get.ts'&&node.data?.role==='return');expect(response).toHaveLength(1);expect(response[0]!.attributes.generated).not.toBe(true);expect(response[0]!.group).not.toBe('Tests');}
    if(['radix-ui','mui'].includes(fixture.stackId)){const events=analysis.nodes.filter(node=>node.kind==='entry'&&node.attributes.event&&node.attributes.dictionaryStackId===fixture.stackId);expect(events).toHaveLength(1);const range=events[0]!.evidence[0]!;expect(analysis.nodes.filter(node=>node.kind==='entry'&&node.attributes.event&&node.path===range.path&&node.evidence.some(at=>at.start===range.start&&at.end===range.end))).toHaveLength(1);}
  });
});
