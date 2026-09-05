import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Parser, Language } from 'web-tree-sitter';
import LegacyParser from 'web-tree-sitter-legacy/tree-sitter.js';
const require = createRequire(import.meta.url);
const languages = new Map<string, Language>();
export async function initializeTestParser() { await Parser.init({ wasmBinary: await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')) }); await LegacyParser.init(); }
export async function testLanguage(name: string) {
  let language = languages.get(name);
  if (!language) {
    const pkg = ['kotlin', 'scala'].includes(name) ? 'tree-sitter-wasms' : '@repomix/tree-sitter-wasms';
    const bytes = await readFile(require.resolve(`${pkg}/out/tree-sitter-${name}.wasm`));
    language = pkg === 'tree-sitter-wasms' ? await LegacyParser.Language.load(bytes) as unknown as Language : await Language.load(bytes);
    languages.set(name, language);
  }
  return language;
}
export const testParser = (name: string) => ['kotlin', 'scala'].includes(name) ? new LegacyParser() as unknown as Parser : new Parser();
