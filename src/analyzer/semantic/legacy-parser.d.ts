/** Avoid the old package's ambient declaration merging into the current Tree-sitter API. */
declare module 'web-tree-sitter-legacy/tree-sitter.js' {
  import type { Language, Tree } from 'web-tree-sitter';
  export default class LegacyParser {
    static init(options?: Record<string, unknown>): Promise<void>;
    static Language: { load(input: string | Uint8Array): Promise<Language> };
    setLanguage(language: Language): this;
    parse(source: string): Tree;
    delete(): void;
  }
}
