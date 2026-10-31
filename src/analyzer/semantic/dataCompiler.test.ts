// @vitest-environment node
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
import {createDataCompiler,sourceEvidence,visitSource} from './dataCompiler';
import type {SemanticInput} from './types';

const input=(sources:Record<string,string>,imports:SemanticInput['imports']=[]):SemanticInput=>({sources,imports,resources:[]});
const component=(extension:string,script:string)=>extension==='astro'?`---\n${script}\n---\n<div>Template is not TypeScript</div>`:`<script lang="ts">\n${script}\n</script>\n<div>Template is not TypeScript</div>`;

describe('data compiler component module resolution',()=>{
 it.each(['astro','vue','svelte','html'])('resolves a supplied .%s module without renaming source paths',extension=>{
  const path=`components/Formula.${extension}`,source=component(extension,'export interface Formula { label: string; value: number }');
  const compiler=createDataCompiler(input({[path]:source,'consumer.ts':`import type { Formula } from './components/Formula.${extension}'; export interface Props { formula: Formula }`},[{from:'consumer.ts',to:path,specifier:`./components/Formula.${extension}`}]))
  const file=compiler.files.get('consumer.ts')!;let reference:ts.Identifier|undefined;
  visitSource(file,n=>{if(ts.isTypeReferenceNode(n)&&ts.isIdentifier(n.typeName))reference=n.typeName;});
  const target=compiler.symbol(reference!)?.declarations?.[0];expect(target).toBeDefined();expect(target!.getSourceFile().fileName).toBe(path);
  const evidence=sourceEvidence(target!,'original definition');expect(evidence.path).toBe(path);expect(evidence.line).toBe(2);expect(source.slice(evidence.start,evidence.end)).toBe('export interface Formula { label: string; value: number }');
  for(const sourceFile of compiler.files.values())expect(compiler.syntacticDiagnostics(sourceFile)).toEqual([]);
 });
 it('resolves explicit relative component imports even without a supplied graph edge',()=>{
  const compiler=createDataCompiler(input({'Panel.astro':component('astro',"import type { Model } from './Model.astro'; export interface Props extends Model {}"),'Model.astro':component('astro','export interface Model { title: string }')}));
  let reference:ts.Node|undefined;visitSource(compiler.files.get('Panel.astro')!,n=>{if(ts.isExpressionWithTypeArguments(n))reference=n.expression;});expect(compiler.symbol(reference!)?.declarations?.[0]?.getSourceFile().fileName).toBe('Model.astro');
 });
 it('keeps missing and external component imports unresolved',()=>{
  const compiler=createDataCompiler(input({'consumer.ts':"import type { Missing } from './Missing.astro'; import type { External } from 'external-components'; export interface Props { a: Missing; b: External }"}));
  expect([...compiler.files.keys()]).toEqual(['consumer.ts']);expect(compiler.syntacticDiagnostics(compiler.files.get('consumer.ts')!)).toEqual([]);
 });
 it('handles a component reference cycle and retains native TS/JS imports',()=>{
  const compiler=createDataCompiler(input({'A.astro':component('astro',"import type { B } from './B.astro'; import type { Value } from './native.js'; export interface A { b: B; value: Value }"),'B.astro':component('astro',"import type { A } from './A.astro'; export interface B { a?: A }"),'native.ts':'export interface Value { count: number }'}));
  const paths=new Set<string>();visitSource(compiler.files.get('A.astro')!,n=>{if(ts.isTypeReferenceNode(n)){const declaration=compiler.symbol(n.typeName)?.declarations?.[0];if(declaration)paths.add(declaration.getSourceFile().fileName);}});expect(paths).toEqual(new Set(['B.astro','native.ts']));
 });
});

it('indexes supplied imports once and preserves the first mapping for duplicate keys', () => {
  let reads = 0;
  const sources = Object.fromEntries(Array.from({length:300}, (_, i) => [`file${i}.ts`, `import {value} from 'mapped'; export const value = ${i};`]));
  const imports = Array.from({length:300}, (_, i) => ({get from() { reads++; return `file${i}.ts`; }, specifier:'mapped', to:`file${(i+1)%300}.ts`}));
  imports.push({from:'file0.ts',specifier:'mapped',to:'file2.ts'});
  const compiler = createDataCompiler(input(sources,imports));
  const imported = compiler.files.get('file0.ts')!.statements[0] as ts.ImportDeclaration;
  expect(compiler.symbol((imported.importClause!.namedBindings as ts.NamedImports).elements[0]!.name)?.declarations?.[0]?.getSourceFile().fileName).toBe('file1.ts');
  expect(reads).toBeLessThan(3000);
});
