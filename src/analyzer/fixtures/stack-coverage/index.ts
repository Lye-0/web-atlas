import{languageCoverageFixtures}from'./languages';
import{frameworkCoverageFixtures}from'./frameworks';
import{uiCoverageFixtures}from'./ui';
import{dataCoverageFixtures}from'./data';
import{queryCoverageFixtures}from'./queries';
import{toolCoverageFixtures}from'./tooling';
import{providerCoverageFixtures}from'./providers';

/** Fixture presence is separate from full primitive/View acceptance. */
export const stackCoverageFixtures=[
 ...languageCoverageFixtures.map(fixture=>({...fixture,family:'language',testFile:'semantic/stackCoverage.test.ts'})),
 ...frameworkCoverageFixtures.map(fixture=>({...fixture,family:'framework',testFile:'semantic/frameworkCoverage.test.ts'})),
 ...uiCoverageFixtures.map(fixture=>({...fixture,family:'ui',testFile:'semantic/uiCoverage.test.ts'})),
 ...dataCoverageFixtures.map(fixture=>({...fixture,family:'data',testFile:'semantic/dataCoverage.test.ts'})),
 ...queryCoverageFixtures.map(fixture=>({...fixture,family:'query',testFile:'semantic/queryCoverage.test.ts'})),
 ...toolCoverageFixtures.map(fixture=>({...fixture,family:'tooling',testFile:'toolCoverage.test.ts'})),
 ...providerCoverageFixtures.map(fixture=>({...fixture,family:'provider',testFile:'providerCoverage.test.ts'})),
];
