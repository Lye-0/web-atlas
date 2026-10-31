// @vitest-environment node
import { expect, it } from 'vitest';
import { scanProjectFiles } from './scan';
const scan = (code: string) => scanProjectFiles([{relativePath:'main.ts',name:'main.ts',extension:'.ts',size:code.length,readText:async()=>code}]);
it('does not create technology usage from a require-named member method', async () => {
  const store = await scan("const checker = {require(value: string) { return !!value; }}; checker.require('react'); checker?. /* note */ require('vue');");
  expect(store.facts.some(f => f.kind === 'technology' && ['react','vue'].includes(f.dictionaryStackId ?? ''))).toBe(false);
});
it('still records real module imports as technology usage', async () => {
  const store = await scan("import React from 'react'; const Vue = require('vue');");
  expect(store.facts.some(f => f.kind === 'technology' && f.dictionaryStackId === 'react')).toBe(true);
  expect(store.facts.some(f => f.kind === 'technology' && f.dictionaryStackId === 'vue')).toBe(true);
});
