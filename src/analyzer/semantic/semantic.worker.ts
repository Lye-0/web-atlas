import { Parser, Language } from 'web-tree-sitter';
import LegacyParser from 'web-tree-sitter-legacy/tree-sitter.js';
import { analyzeSemanticSources } from './analyze';
import { grammarUrls, parserRuntimeUrl, legacyParserRuntimeUrl } from './grammarAssets';
import type { SemanticInput } from './types';

const languages = new Map<string, Promise<Language>>();
let legacyInitialization: Promise<void> | undefined;
const isLegacy = (name: string) => name === 'kotlin' || name === 'scala';
const initialization = fetch(parserRuntimeUrl).then(response => {
  if (!response.ok) throw new Error('解析エンジンを読み込めませんでした');
  return response.arrayBuffer();
}).then(wasmBinary => Parser.init({ wasmBinary }));

self.onmessage = async (event: MessageEvent<SemanticInput>) => {
  try {
    await initialization;
    const analysis = await analyzeSemanticSources(event.data, name => {
      let language = languages.get(name);
      if (!language) {
        const url = grammarUrls[name]; if (!url) throw new Error(`${name}の構文定義がありません`);
        if (isLegacy(name)) {
          legacyInitialization ??= fetch(legacyParserRuntimeUrl).then(response => response.arrayBuffer()).then(wasmBinary => LegacyParser.init({ wasmBinary }));
          // The legacy grammar ABI exposes the same read-only tree API used by the extractors.
          language = legacyInitialization.then(() => LegacyParser.Language.load(url) as unknown as Language);
        } else language = Language.load(url);
        languages.set(name, language);
      }
      return language;
    }, (done, total) => self.postMessage({ type: 'progress', done, total }), name => isLegacy(name) ? new LegacyParser() as unknown as Parser : new Parser());
    self.postMessage({ type: 'complete', analysis });
  } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
};
