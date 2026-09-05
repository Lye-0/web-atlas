import { normalizeRelativePath } from './fileDiscovery';
import { parseJsonc, type ParsedPackageJson } from './parsers';
import type { AnalyzerModuleDependencyKind, AnalyzerModuleImportReference } from './types';

export interface ModuleResolverSource {
  relativePath: string;
  source: string;
}

export interface ModuleResolverPackage extends ParsedPackageJson {
  packageId: string;
  isWorkspacePackage: boolean;
}

export interface ParsedModuleImport {
  kind: AnalyzerModuleDependencyKind;
  specifier: string;
  start: number;
  end: number;
  computed?: boolean;
}

export interface ResolvedModuleImport extends AnalyzerModuleImportReference {
  resolvedPath?: string;
}

export interface ResolvedModule {
  path: string;
  directoryPath: string;
  package?: ModuleResolverPackage;
  extension: string;
  language: string;
  imports: ResolvedModuleImport[];
}

export interface ModuleGraphResult {
  modules: ResolvedModule[];
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'] as const;

function isIdentifierCharacter(value: string | undefined): boolean {
  return Boolean(value && /[A-Za-z0-9_$]/.test(value));
}

function isWordAt(source: string, offset: number, word: string): boolean {
  return source.slice(offset, offset + word.length) === word
    && !isIdentifierCharacter(source[offset - 1])
    && !isIdentifierCharacter(source[offset + word.length]);
}

function skipQuoted(source: string, start: number, quote: string): { value: string; start: number; end: number } | undefined {
  let value = '';
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      value += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === quote) return { value, start: start + 1, end: index };
    value += character;
  }
  return undefined;
}

function skipTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index] ?? '')) {
      index += 1;
      continue;
    }
    if (source[index] === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index + 2);
      index = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (source[index] === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2);
      index = close < 0 ? source.length : close + 2;
      continue;
    }
    break;
  }
  return index;
}

function skipComment(source: string, start: number): number | undefined {
  if (source[start] === '/' && source[start + 1] === '/') {
    const newline = source.indexOf('\n', start + 2);
    return newline < 0 ? source.length : newline;
  }
  if (source[start] === '/' && source[start + 1] === '*') {
    const close = source.indexOf('*/', start + 2);
    return close < 0 ? source.length : close + 2;
  }
  return undefined;
}

function findQuotedAfter(source: string, start: number): { value: string; start: number; end: number; next: number } | undefined {
  const cursor = skipTrivia(source, start);
  const quote = source[cursor];
  if (quote !== '"' && quote !== "'") return undefined;
  const literal = skipQuoted(source, cursor, quote);
  return literal ? { ...literal, next: literal.end + 1 } : undefined;
}

function findFromSpecifier(source: string, start: number): { value: string; start: number; end: number; next: number } | undefined {
  let index = start;
  let braceDepth = 0;
  while (index < source.length) {
    const commentEnd = skipComment(source, index);
    if (commentEnd !== undefined) {
      index = commentEnd;
      continue;
    }
    const character = source[index];
    if (character === '"' || character === "'") {
      const literal = skipQuoted(source, index, character);
      index = literal ? literal.end + 1 : source.length;
      continue;
    }
    if (character === '{' || character === '(' || character === '[') braceDepth += 1;
    if (character === '}' || character === ')' || character === ']') braceDepth = Math.max(0, braceDepth - 1);
    if (braceDepth === 0 && character === ';') return undefined;
    if (isWordAt(source, index, 'from')) {
      const literal = findQuotedAfter(source, index + 4);
      if (literal) return literal;
      index += 4;
      continue;
    }
    index += 1;
  }
  return undefined;
}

function parseCallImport(source: string, keywordEnd: number, kind: AnalyzerModuleDependencyKind): ParsedModuleImport | undefined {
  const cursor = skipTrivia(source, keywordEnd);
  if (source[cursor] !== '(') return undefined;
  const argumentStart = skipTrivia(source, cursor + 1);
  const quote = source[argumentStart];
  if (quote === '"' || quote === "'") {
    const literal = skipQuoted(source, argumentStart, quote);
    if (!literal) return undefined;
    return { kind, specifier: literal.value, start: literal.start, end: literal.end };
  }
  if (source[argumentStart] === '`') {
    const literal = skipQuoted(source, argumentStart, '`');
    if (literal) {
      return {
        kind,
        specifier: literal.value,
        start: literal.start,
        end: literal.end,
        computed: true,
      };
    }
  }
  let close = argumentStart;
  let templateDepth = 0;
  while (close < source.length) {
    if (source[close] === '`') templateDepth += 1;
    if (source[close] === '`' && templateDepth > 0 && source[close - 1] !== '\\') templateDepth -= 1;
    if (source[close] === ')' && templateDepth === 0) break;
    close += 1;
  }
  if (close <= argumentStart) return undefined;
  return {
    kind,
    specifier: source.slice(argumentStart, close).trim(),
    start: argumentStart,
    end: close,
    computed: true,
  };
}

function parseKeywordImport(source: string, start: number): { item?: ParsedModuleImport; next: number } {
  const keywordEnd = start + 6;
  const call = parseCallImport(source, keywordEnd, 'dynamic-import');
  if (call) return { item: call, next: call.end + 1 };
  const cursor = skipTrivia(source, keywordEnd);
  const sideEffect = findQuotedAfter(source, cursor);
  if (sideEffect) {
    return {
      item: { kind: 'import', specifier: sideEffect.value, start: sideEffect.start, end: sideEffect.end },
      next: sideEffect.next,
    };
  }
  const from = findFromSpecifier(source, cursor);
  if (!from) return { next: keywordEnd };
  const typeOnly = /^\s*type(?:\s|{)/.test(source.slice(cursor, Math.min(from.start, cursor + 12)));
  return {
    item: { kind: typeOnly ? 'import-type' : 'import', specifier: from.value, start: from.start, end: from.end },
    next: from.next,
  };
}

function parseKeywordExport(source: string, start: number): { item?: ParsedModuleImport; next: number } {
  const from = findFromSpecifier(source, start + 6);
  if (!from) return { next: start + 6 };
  return {
    item: { kind: 're-export', specifier: from.value, start: from.start, end: from.end },
    next: from.next,
  };
}

function parseKeywordRequire(source: string, start: number): { item?: ParsedModuleImport; next: number } {
  const call = parseCallImport(source, start + 7, 'require');
  if (call) return { item: call, next: call.end + 1 };
  return { next: start + 7 };
}

/** Conservative lexical parser for static JS/TS module references. */
export function parseModuleImports(source: string): ParsedModuleImport[] {
  const imports: ParsedModuleImport[] = [];
  let index = 0;
  while (index < source.length) {
    const commentEnd = skipComment(source, index);
    if (commentEnd !== undefined) {
      index = commentEnd;
      continue;
    }
    const character = source[index];
    if (character === '"' || character === "'") {
      const literal = skipQuoted(source, index, character);
      index = literal ? literal.end + 1 : source.length;
      continue;
    }
    if (character === '`') {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === '\\') {
          end += 2;
          continue;
        }
        if (source[end] === '`') {
          end += 1;
          break;
        }
        end += 1;
      }
      index = end;
      continue;
    }
    const parsed = isWordAt(source, index, 'import')
      ? parseKeywordImport(source, index)
      : isWordAt(source, index, 'export')
        ? parseKeywordExport(source, index)
        : isWordAt(source, index, 'require')
          ? parseKeywordRequire(source, index)
          : undefined;
    if (parsed) {
      if (parsed.item) imports.push(parsed.item);
      index = Math.max(index + 1, parsed.next);
      continue;
    }
    index += 1;
  }
  return imports;
}

function directoryPath(filePath: string): string {
  const normalized = normalizeRelativePath(filePath);
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? normalized.slice(0, slash) : '.';
}

function normalizedPackagePath(packagePath: string): string {
  return packagePath === '.' ? '' : normalizeRelativePath(packagePath);
}

function safeJoin(basePath: string, childPath: string): string | undefined {
  const parts = [...(basePath === '.' ? [] : basePath.split('/')), ...childPath.replaceAll('\\', '/').split('/')];
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (resolved.length === 0) return undefined;
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.length > 0 ? resolved.join('/') : '.';
}

function candidatePaths(basePath: string): string[] {
  const normalized = normalizeRelativePath(basePath);
  const hasSourceExtension = SOURCE_EXTENSIONS.some((extension) => normalized.toLowerCase().endsWith(extension));
  const candidates = [normalized];
  if (!hasSourceExtension) {
    SOURCE_EXTENSIONS.forEach((extension) => candidates.push(`${normalized}${extension}`));
    SOURCE_EXTENSIONS.forEach((extension) => candidates.push(`${normalized}/index${extension}`));
  }
  return [...new Set(candidates)];
}

function resolveCandidatePaths(candidates: readonly string[], filePaths: ReadonlySet<string>): { path?: string; reason?: 'unresolved' | 'ambiguous' } {
  const matches = [...new Set(candidates.flatMap((candidate) => {
    const path = normalizeRelativePath(candidate);
    // TypeScript source commonly uses the emitted runtime extension (Node ESM).
    // Resolve that extension in compiler order, retaining ambiguity between
    // separate alias/index candidates rather than inventing an edge.
    const extensions = path.endsWith('.js') ? ['.ts', '.tsx', '.d.ts', '.js', '.jsx']
      : path.endsWith('.mjs') ? ['.mts', '.d.mts', '.mjs']
        : path.endsWith('.cjs') ? ['.cts', '.d.cts', '.cjs'] : undefined;
    const resolved = extensions
      ? extensions.map((extension) => path.slice(0, path.lastIndexOf('.')) + extension).find((item) => filePaths.has(item))
      : filePaths.has(path) ? path : undefined;
    return resolved ? [resolved] : [];
  }))];
  if (matches.length === 1) return { path: matches[0] };
  return matches.length > 1 ? { reason: 'ambiguous' } : { reason: 'unresolved' };
}

interface AliasConfig {
  basePath: string;
  aliases: Array<{ pattern: string; targets: string[] }>;
}

function aliasConfigs(sources: readonly ModuleResolverSource[]): AliasConfig[] {
  return sources
    .filter((source) => /^tsconfig[^/]*\.json$/i.test(source.relativePath.split('/').at(-1) ?? ''))
    .flatMap((source) => {
      try {
        const root = parseJsonc(source.source);
        if (!root || typeof root !== 'object' || Array.isArray(root)) return [];
        const compilerOptions = (root as Record<string, unknown>).compilerOptions;
        if (!compilerOptions || typeof compilerOptions !== 'object' || Array.isArray(compilerOptions)) return [];
        const options = compilerOptions as Record<string, unknown>;
        const paths = options.paths;
        if (!paths || typeof paths !== 'object' || Array.isArray(paths)) return [];
        const configDirectory = directoryPath(source.relativePath);
        const baseUrl = typeof options.baseUrl === 'string'
          ? safeJoin(configDirectory, options.baseUrl)
          : configDirectory;
        if (!baseUrl) return [];
        const aliases = Object.entries(paths)
          .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]) && entry[1].every((value) => typeof value === 'string'))
          .map(([pattern, targets]) => ({ pattern, targets: targets as string[] }))
          .sort((first, second) => second.pattern.length - first.pattern.length || first.pattern.localeCompare(second.pattern));
        return aliases.length > 0 ? [{ basePath: baseUrl, aliases }] : [];
      } catch {
        return [];
      }
    })
    .sort((first, second) => second.basePath.length - first.basePath.length);
}

function nearestAliasConfig(sourcePath: string, configs: readonly AliasConfig[]): AliasConfig | undefined {
  const sourceDirectory = directoryPath(sourcePath);
  return configs
    .filter((config) => config.basePath === '.' || sourceDirectory === config.basePath || sourceDirectory.startsWith(`${config.basePath}/`))
    .sort((first, second) => second.basePath.length - first.basePath.length)[0];
}

function resolveAlias(
  specifier: string,
  sourcePath: string,
  configs: readonly AliasConfig[],
  filePaths: ReadonlySet<string>,
): { path?: string; reason?: 'unresolved' | 'ambiguous' } | undefined {
  const config = nearestAliasConfig(sourcePath, configs);
  if (!config) return undefined;
  for (const alias of config.aliases) {
    const wildcard = alias.pattern.indexOf('*');
    const matches = wildcard >= 0
      ? specifier.startsWith(alias.pattern.slice(0, wildcard))
        && specifier.endsWith(alias.pattern.slice(wildcard + 1))
      : specifier === alias.pattern;
    if (!matches) continue;
    const wildcardValue = wildcard >= 0
      ? specifier.slice(alias.pattern.slice(0, wildcard).length, specifier.length - alias.pattern.slice(wildcard + 1).length)
      : '';
    const candidates = alias.targets.flatMap((target) => {
      const replaced = target.replaceAll('*', wildcardValue);
      const joined = safeJoin(config.basePath, replaced);
      return joined ? candidatePaths(joined) : [];
    });
    return resolveCandidatePaths(candidates, filePaths);
  }
  return undefined;
}

function packageRootForSpecifier(specifier: string, packages: readonly ModuleResolverPackage[]): { package: ModuleResolverPackage; subpath: string } | undefined {
  return packages
    .filter((candidate) => candidate.isWorkspacePackage && candidate.name)
    .sort((first, second) => (second.name?.length ?? 0) - (first.name?.length ?? 0) || first.packagePath.localeCompare(second.packagePath))
    .map((candidate) => {
      const name = candidate.name!;
      if (specifier === name) return { package: candidate, subpath: '' };
      if (specifier.startsWith(`${name}/`)) return { package: candidate, subpath: specifier.slice(name.length + 1) };
      return undefined;
    })
    .find((candidate): candidate is { package: ModuleResolverPackage; subpath: string } => Boolean(candidate));
}

function resolvePackageImport(
  specifier: string,
  packages: readonly ModuleResolverPackage[],
  filePaths: ReadonlySet<string>,
): { path?: string; reason?: 'external' | 'unresolved' | 'ambiguous' } {
  const packageRoot = packageRootForSpecifier(specifier, packages);
  if (!packageRoot) return { reason: 'external' };
  const packagePath = normalizedPackagePath(packageRoot.package.packagePath);
  const entryFields = [
    packageRoot.package.types,
    packageRoot.package.typings,
    packageRoot.package.module,
    packageRoot.package.main,
  ].filter((value): value is string => Boolean(value));
  const exportKey = packageRoot.subpath ? `./${packageRoot.subpath}` : '.';
  const exportedEntry = packageRoot.package.exports?.[exportKey];
  const exportCandidates = exportedEntry
    ? candidatePaths(safeJoin(packagePath || '.', exportedEntry) ?? '')
    : [];
  const candidates = exportedEntry
    ? exportCandidates
    : packageRoot.subpath
      ? [
        ...candidatePaths(safeJoin(packagePath || '.', packageRoot.subpath) ?? ''),
        ...candidatePaths(safeJoin(packagePath || '.', `src/${packageRoot.subpath}`) ?? ''),
      ]
    : entryFields.flatMap((entry) => {
      const joined = safeJoin(packagePath || '.', entry);
      return joined ? candidatePaths(joined) : [];
    }).concat(
      candidatePaths(`${packagePath ? `${packagePath}/` : ''}src/index`),
      candidatePaths(`${packagePath ? `${packagePath}/` : ''}index`),
    );
  return resolveCandidatePaths(candidates, filePaths);
}

function resolveSpecifier(
  sourcePath: string,
  specifier: string,
  sources: readonly ModuleResolverSource[],
  packages: readonly ModuleResolverPackage[],
  configs: readonly AliasConfig[],
): { path?: string; reason?: 'external' | 'unresolved' | 'ambiguous' } {
  const filePaths = new Set(sources.map((source) => normalizeRelativePath(source.relativePath)));
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    if (specifier.startsWith('/')) return { reason: 'unresolved' };
    const base = safeJoin(directoryPath(sourcePath), specifier);
    return base ? resolveCandidatePaths(candidatePaths(base), filePaths) : { reason: 'unresolved' };
  }
  if (specifier.startsWith('node:') || /^[a-z]+:\/\//i.test(specifier)) return { reason: 'external' };
  const alias = resolveAlias(specifier, sourcePath, configs, filePaths);
  if (alias) return alias;
  return resolvePackageImport(specifier, packages, filePaths);
}

function languageForExtension(extension: string): string {
  return extension.toLowerCase() === '.ts' || extension.toLowerCase() === '.tsx' || extension.toLowerCase() === '.mts' || extension.toLowerCase() === '.cts'
    ? 'TypeScript'
    : 'JavaScript';
}

function extensionForPath(path: string): string {
  const name = path.split('/').at(-1) ?? path;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

export function resolveModuleGraph(
  sources: readonly ModuleResolverSource[],
  packages: readonly ModuleResolverPackage[] = [],
  configSources: readonly ModuleResolverSource[] = [],
): ModuleGraphResult {
  const sortedSources = [...sources].sort((first, second) => normalizeRelativePath(first.relativePath).localeCompare(normalizeRelativePath(second.relativePath)));
  const configs = aliasConfigs([...sortedSources, ...configSources]);
  const modules = sortedSources.map((source): ResolvedModule => {
    const path = normalizeRelativePath(source.relativePath);
    const packageFact = packages
      .filter((candidate) => candidate.isWorkspacePackage)
      .sort((first, second) => second.packagePath.length - first.packagePath.length || first.packagePath.localeCompare(second.packagePath))
      .find((candidate) => candidate.packagePath === '.' || path.startsWith(`${candidate.packagePath}/`));
    const imports = parseModuleImports(source.source).map((parsed): ResolvedModuleImport => {
      if (parsed.computed) return { ...parsed, reason: 'computed' };
      const resolved = resolveSpecifier(path, parsed.specifier, sortedSources, packages, configs);
      return { ...parsed, ...(resolved.path ? { resolvedPath: resolved.path } : {}), ...(resolved.reason ? { reason: resolved.reason } : {}) };
    });
    return {
      path,
      directoryPath: directoryPath(path),
      ...(packageFact ? { package: packageFact } : {}),
      extension: extensionForPath(path),
      language: languageForExtension(extensionForPath(path)),
      imports,
    };
  });
  return { modules };
}

export function moduleIdForPath(path: string): string {
  return `module:${normalizeRelativePath(path)}`;
}

export function moduleDirectoryId(packageId: string | undefined, path: string): string {
  return `module-directory:${packageId ?? 'project:root'}:${normalizeRelativePath(path)}`;
}
