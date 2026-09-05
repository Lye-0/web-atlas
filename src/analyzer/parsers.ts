import { normalizeRelativePath } from './fileDiscovery';
import type { OffsetRange } from './evidence';

export interface JsonPropertyRange extends OffsetRange {
  valueStart: number;
  valueEnd: number;
}

export interface ParsedScript {
  name: string;
  command: string;
  propertyRange: OffsetRange;
  commandStartOffset: number;
  commandEndOffset: number;
}

export interface ParsedPackageDependency {
  packageName: string;
  versionRange: string;
  dependencyType: 'dependency' | 'devDependency' | 'peerDependency' | 'optionalDependency';
  propertyRange: OffsetRange;
  valueStartOffset: number;
  valueEndOffset: number;
}

export interface ParsedPackageJson {
  filePath: string;
  packagePath: string;
  name?: string;
  nameRange?: OffsetRange;
  packageManager?: string;
  packageManagerRange?: OffsetRange;
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  exports?: Record<string, string>;
  scripts: ParsedScript[];
  dependencies: ParsedPackageDependency[];
}

export interface ParsedWorkspacePattern {
  pattern: string;
  range: OffsetRange;
}

export interface ParsedPnpmWorkspace {
  filePath: string;
  patterns: ParsedWorkspacePattern[];
}

export interface ParsedD1Binding {
  binding?: string;
  databaseName?: string;
  databaseId?: string;
  range: OffsetRange;
}

export interface ParsedWranglerConfig {
  workerName?: string;
  main?: string;
  workerNameRange?: OffsetRange;
  mainRange?: OffsetRange;
  d1Bindings: ParsedD1Binding[];
  b2KeyRanges: Array<{ key: string; range: OffsetRange }>;
}

export interface ParsedFirebaseConfig {
  projectId?: string;
  projectIdRange?: OffsetRange;
  authEmulatorRange?: OffsetRange;
}

export interface ParsedDotnetProject {
  projectName?: string;
  projectNameRange?: OffsetRange;
  useWpf: boolean;
  useWpfRange?: OffsetRange;
  projectReferences: Array<{ include: string; range: OffsetRange }>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function skipWhitespace(source: string, offset: number): number {
  let current = offset;
  while (current < source.length && /\s/.test(source[current])) current += 1;
  return current;
}

function findStringEnd(source: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (source[index] === '\\') {
      escaped = true;
      continue;
    }
    if (source[index] === '"') return index;
  }
  return source.length;
}

export function findMatchingDelimiter(source: string, start: number): number | undefined {
  const opener = source[start];
  const closer = opener === '{' ? '}' : opener === '[' ? ']' : undefined;
  if (!closer) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (character === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (character === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === opener) depth += 1;
    if (character === closer) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

export function stripJsonComments(source: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (inLineComment) {
      if (character === '\n') {
        inLineComment = false;
        result += character;
      } else result += character === '\r' ? '\r' : ' ';
      continue;
    }
    if (inBlockComment) {
      if (character === '*' && next === '/') {
        result += '  ';
        inBlockComment = false;
        index += 1;
      } else result += character === '\n' || character === '\r' ? character : ' ';
      continue;
    }
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '/' && next === '/') {
      result += '  ';
      inLineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      result += '  ';
      inBlockComment = true;
      index += 1;
      continue;
    }
    result += character;
    if (character === '"') inString = true;
  }
  return result;
}

function stripTrailingCommas(source: string): string {
  return source.replace(/,(\s*)(?=[}\]])/g, (_match, whitespace: string) => ` ${whitespace}`);
}

export function parseJsonc(source: string): unknown {
  return JSON.parse(stripTrailingCommas(stripJsonComments(source))) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(exportTarget).find((entry): entry is string => Boolean(entry));
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of ['import', 'require', 'default', 'types']) {
    const target = exportTarget(record[key]);
    if (target) return target;
  }
  return undefined;
}

function parsePackageExports(value: unknown): Record<string, string> | undefined {
  if (typeof value === 'string' || Array.isArray(value)) {
    const target = exportTarget(value);
    return target ? { '.': target } : undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  const entries = Object.keys(record).some((key) => key.startsWith('.'))
    ? Object.entries(record)
    : [['.', value] as const];
  const exports = Object.fromEntries(entries
    .map(([key, entry]) => {
      const target = exportTarget(entry);
      return target ? [key, target] as const : undefined;
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry)));
  return Object.keys(exports).length > 0 ? exports : undefined;
}

function findValueEnd(source: string, valueStart: number): { valueEnd: number; contentStart: number } {
  const first = source[valueStart];
  if (first === '"') {
    const stringEnd = findStringEnd(source, valueStart);
    return { valueEnd: Math.min(source.length, stringEnd + 1), contentStart: valueStart + 1 };
  }
  if (first === '{' || first === '[') {
    const close = findMatchingDelimiter(source, valueStart);
    return { valueEnd: close === undefined ? source.length : close + 1, contentStart: valueStart };
  }

  let valueEnd = valueStart;
  while (valueEnd < source.length && !',}\n\r'.includes(source[valueEnd])) valueEnd += 1;
  while (valueEnd > valueStart && /\s/.test(source[valueEnd - 1])) valueEnd -= 1;
  return { valueEnd, contentStart: valueStart };
}

export function findJsonPropertyValueRange(
  source: string,
  propertyName: string,
  scopeStart = 0,
  scopeEnd = source.length,
): JsonPropertyRange | undefined {
  const pattern = new RegExp(`"${escapeRegExp(propertyName)}"\\s*:`, 'g');
  pattern.lastIndex = scopeStart;
  const match = pattern.exec(source);
  if (!match || match.index >= scopeEnd) return undefined;
  const colonIndex = match.index + match[0].lastIndexOf(':');
  const valueStart = skipWhitespace(source, colonIndex + 1);
  const { valueEnd, contentStart } = findValueEnd(source, valueStart);
  return {
    start: match.index,
    end: Math.min(valueEnd, scopeEnd),
    valueStart: contentStart,
    valueEnd: Math.min(valueEnd - (source[valueStart] === '"' ? 1 : 0), scopeEnd),
  };
}

function findJsonObjectRange(source: string, propertyName: string, scopeStart = 0, scopeEnd = source.length): OffsetRange | undefined {
  const property = findJsonPropertyValueRange(source, propertyName, scopeStart, scopeEnd);
  if (!property) return undefined;
  const objectStart = skipWhitespace(source, source.indexOf(':', property.start) + 1);
  if (source[objectStart] !== '{') return undefined;
  const objectEnd = findMatchingDelimiter(source, objectStart);
  return objectEnd === undefined ? undefined : { start: objectStart, end: objectEnd + 1 };
}

function readStringMembers(
  source: string,
  objectRange: OffsetRange | undefined,
  values: Record<string, unknown> | undefined,
): Array<{ name: string; value: string; range: JsonPropertyRange }> {
  if (!objectRange || !values) return [];
  return Object.entries(values)
    .map(([name, value]) => {
      const range = findJsonPropertyValueRange(source, name, objectRange.start + 1, objectRange.end);
      const stringValue = asString(value);
      return stringValue !== undefined && range ? { name, value: stringValue, range } : undefined;
    })
    .filter((entry): entry is { name: string; value: string; range: JsonPropertyRange } => Boolean(entry));
}

export function parsePackageJson(filePath: string, source: string): ParsedPackageJson {
  const data = asRecord(parseJsonc(source));
  if (!data) throw new Error('package.json must contain a JSON object');
  const packagePath = normalizeRelativePath(filePath.replace(/\/package\.json$/i, '').replace(/^package\.json$/i, ''));
  const name = asString(data.name);
  const packageManager = asString(data.packageManager);
  const main = asString(data.main);
  const module = asString(data.module);
  const types = asString(data.types);
  const typings = asString(data.typings);
  const exports = parsePackageExports(data.exports);
  const nameProperty = findJsonPropertyValueRange(source, 'name');
  const packageManagerProperty = findJsonPropertyValueRange(source, 'packageManager');
  const scriptsObject = asRecord(data.scripts);
  const scriptsRange = findJsonObjectRange(source, 'scripts');
  const scripts = readStringMembers(source, scriptsRange, scriptsObject).map(({ name: scriptName, value, range }) => ({
    name: scriptName,
    command: value,
    propertyRange: { start: range.start, end: range.end },
    commandStartOffset: range.valueStart,
    commandEndOffset: range.valueEnd,
  }));

  const dependencySections = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const;
  const dependencyTypeMap = {
    dependencies: 'dependency',
    devDependencies: 'devDependency',
    peerDependencies: 'peerDependency',
    optionalDependencies: 'optionalDependency',
  } as const;
  const dependencies = dependencySections.flatMap((dependencyType) => {
    const objectRange = findJsonObjectRange(source, dependencyType);
    return readStringMembers(source, objectRange, asRecord(data[dependencyType])).map(({ name: packageName, value, range }) => ({
      packageName,
      versionRange: value,
      dependencyType: dependencyTypeMap[dependencyType],
      propertyRange: { start: range.start, end: range.end },
      valueStartOffset: range.valueStart,
      valueEndOffset: range.valueEnd,
    }));
  });

  return {
    filePath,
    packagePath,
    ...(name ? { name } : {}),
    ...(nameProperty ? { nameRange: { start: nameProperty.start, end: nameProperty.end } } : {}),
    ...(packageManager ? { packageManager } : {}),
    ...(packageManagerProperty ? { packageManagerRange: { start: packageManagerProperty.start, end: packageManagerProperty.end } } : {}),
    ...(main ? { main } : {}),
    ...(module ? { module } : {}),
    ...(types ? { types } : {}),
    ...(typings ? { typings } : {}),
    ...(exports ? { exports } : {}),
    scripts,
    dependencies,
  };
}

function stripYamlComment(value: string): string {
  let quote: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if ((character === '"' || character === "'") && (!quote || quote === character)) quote = quote ? undefined : character;
    if (character === '#' && !quote && (index === 0 || /\s/.test(value[index - 1]))) return value.slice(0, index);
  }
  return value;
}

function unquoteYaml(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parsePnpmWorkspace(filePath: string, source: string): ParsedPnpmWorkspace {
  const patterns: ParsedWorkspacePattern[] = [];
  const lines = source.split('\n');
  let offset = 0;
  let packagesLineIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index].replace(/\r$/, '');
    const match = /^\s*packages\s*:\s*(.*)$/.exec(rawLine);
    if (match) {
      packagesLineIndex = index;
      const inline = stripYamlComment(match[1]).trim();
      if (inline.startsWith('[') && inline.endsWith(']')) {
        const contentStart = rawLine.indexOf('[') + 1;
        inline.slice(1, -1).split(',').map(unquoteYaml).filter(Boolean).forEach((pattern) => {
          const localStart = rawLine.indexOf(pattern, contentStart);
          if (localStart >= 0) patterns.push({ pattern, range: { start: offset + localStart, end: offset + localStart + pattern.length } });
        });
      }
      break;
    }
    offset += lines[index].length + 1;
  }

  if (packagesLineIndex >= 0) {
    offset = lines.slice(0, packagesLineIndex + 1).reduce((total, line) => total + line.length + 1, 0);
    for (let index = packagesLineIndex + 1; index < lines.length; index += 1) {
      const rawLine = lines[index].replace(/\r$/, '');
      const item = /^\s*-\s*(.+?)\s*$/.exec(rawLine);
      if (!item) {
        if (rawLine.trim() && !/^\s*#/.test(rawLine)) break;
        offset += lines[index].length + 1;
        continue;
      }
      const rawValue = stripYamlComment(item[1]).trim();
      const pattern = unquoteYaml(rawValue);
      if (pattern) {
        const localStart = rawLine.indexOf(rawValue, rawLine.indexOf('-') + 1);
        const valueStart = localStart >= 0 ? localStart + (rawValue.startsWith('"') || rawValue.startsWith("'") ? 1 : 0) : 0;
        patterns.push({ pattern, range: { start: offset + valueStart, end: offset + valueStart + pattern.length } });
      }
      offset += lines[index].length + 1;
    }
  }

  return { filePath, patterns };
}

function objectSpansInArray(source: string, arrayRange: OffsetRange): OffsetRange[] {
  const spans: OffsetRange[] = [];
  let index = arrayRange.start + 1;
  while (index < arrayRange.end - 1) {
    if (source[index] === '{') {
      const end = findMatchingDelimiter(source, index);
      if (end === undefined || end >= arrayRange.end) break;
      spans.push({ start: index, end: end + 1 });
      index = end + 1;
    } else index += 1;
  }
  return spans;
}

function readJsonString(source: string, range: JsonPropertyRange | undefined): string | undefined {
  if (!range) return undefined;
  const quoteStart = source.lastIndexOf('"', range.valueStart - 1);
  return quoteStart >= 0 && quoteStart < range.valueStart ? source.slice(range.valueStart, range.valueEnd) : undefined;
}

function findB2Keys(source: string): Array<{ key: string; range: OffsetRange }> {
  const ranges: Array<{ key: string; range: OffsetRange }> = [];
  const pattern = /["']?(B2_(?:ENDPOINT|BUCKET|REGION|KEY_ID|APPLICATION_KEY))["']?\s*[:=]/gi;
  let match = pattern.exec(source);
  while (match) {
    ranges.push({ key: match[1], range: { start: match.index, end: match.index + match[0].length } });
    match = pattern.exec(source);
  }
  return ranges;
}

export function parseWranglerConfig(filePath: string, source: string): ParsedWranglerConfig {
  const lowerPath = filePath.toLowerCase();
  const d1Bindings: ParsedD1Binding[] = [];
  let workerName: string | undefined;
  let main: string | undefined;
  let workerNameRange: OffsetRange | undefined;
  let mainRange: OffsetRange | undefined;

  if (lowerPath.endsWith('.toml')) {
    const lines = source.split('\n');
    let offset = 0;
    let inD1 = false;
    let currentBinding: { binding?: string; databaseName?: string; databaseId?: string; start: number } | undefined;
    const flushBinding = () => {
      if (currentBinding) d1Bindings.push({ ...currentBinding, range: { start: currentBinding.start, end: offset } });
      currentBinding = undefined;
    };
    lines.forEach((lineWithEnd) => {
      const line = lineWithEnd.replace(/\r$/, '');
      if (/^\s*\[\[d1_databases\]\]/.test(line)) {
        flushBinding();
        inD1 = true;
      } else if (/^\s*\[\[/.test(line) && !/^\s*\[\[d1_databases\]\]/.test(line)) {
        flushBinding();
        inD1 = false;
      }
      const stringProperty = /^\s*(name|main|binding|database_name|database_id)\s*=\s*["']([^"']*)["']/.exec(line);
      if (stringProperty) {
        const valueStart = offset + line.indexOf(stringProperty[2], line.indexOf('=') + 1);
        const range = { start: offset + stringProperty.index, end: valueStart + stringProperty[2].length };
        if (stringProperty[1] === 'name' && !inD1) {
          workerName = stringProperty[2];
          workerNameRange = range;
        } else if (stringProperty[1] === 'main' && !inD1) {
          main = stringProperty[2];
          mainRange = range;
        } else if (inD1) {
          currentBinding ??= { start: offset + stringProperty.index };
          if (stringProperty[1] === 'binding') currentBinding.binding = stringProperty[2];
          if (stringProperty[1] === 'database_name') currentBinding.databaseName = stringProperty[2];
          if (stringProperty[1] === 'database_id') currentBinding.databaseId = stringProperty[2];
        }
      }
      offset += lineWithEnd.length;
    });
    flushBinding();
  } else {
    const data = asRecord(parseJsonc(source));
    const nameProperty = findJsonPropertyValueRange(source, 'name');
    const mainProperty = findJsonPropertyValueRange(source, 'main');
    workerName = asString(data?.name) ?? readJsonString(source, nameProperty);
    main = asString(data?.main) ?? readJsonString(source, mainProperty);
    workerNameRange = nameProperty ? { start: nameProperty.start, end: nameProperty.end } : undefined;
    mainRange = mainProperty ? { start: mainProperty.start, end: mainProperty.end } : undefined;

    const d1Property = findJsonPropertyValueRange(source, 'd1_databases');
    if (d1Property) {
      const arrayStart = source.indexOf('[', d1Property.start);
      const arrayEnd = arrayStart >= 0 ? findMatchingDelimiter(source, arrayStart) : undefined;
      if (arrayStart >= 0 && arrayEnd !== undefined) {
        objectSpansInArray(source, { start: arrayStart, end: arrayEnd + 1 }).forEach((objectRange) => {
          const bindingRange = findJsonPropertyValueRange(source, 'binding', objectRange.start, objectRange.end);
          const databaseNameRange = findJsonPropertyValueRange(source, 'database_name', objectRange.start, objectRange.end);
          const databaseIdRange = findJsonPropertyValueRange(source, 'database_id', objectRange.start, objectRange.end);
          d1Bindings.push({
            binding: readJsonString(source, bindingRange),
            databaseName: readJsonString(source, databaseNameRange),
            databaseId: readJsonString(source, databaseIdRange),
            range: { start: objectRange.start, end: objectRange.end },
          });
        });
      }
    }
  }

  return { workerName, main, workerNameRange, mainRange, d1Bindings, b2KeyRanges: findB2Keys(source) };
}

export function parseFirebaseConfig(source: string): ParsedFirebaseConfig {
  const data = asRecord(parseJsonc(source));
  const projectIdRange = findJsonPropertyValueRange(source, 'projectId');
  const projectId = asString(data?.projectId) ?? readJsonString(source, projectIdRange);
  const emulatorsRange = findJsonObjectRange(source, 'emulators');
  const authEmulatorRange = emulatorsRange ? findJsonPropertyValueRange(source, 'auth', emulatorsRange.start, emulatorsRange.end) : undefined;
  return {
    ...(projectId ? { projectId } : {}),
    ...(projectIdRange ? { projectIdRange: { start: projectIdRange.start, end: projectIdRange.end } } : {}),
    ...(authEmulatorRange ? { authEmulatorRange: { start: authEmulatorRange.start, end: authEmulatorRange.end } } : {}),
  };
}

export function parseDotnetProject(source: string): ParsedDotnetProject {
  const assemblyMatch = /<AssemblyName\b[^>]*>([^<]+)<\/AssemblyName>/i.exec(source);
  const useWpfMatch = /<UseWPF\b[^>]*>\s*true\s*<\/UseWPF>/i.exec(source);
  const projectReferences: Array<{ include: string; range: OffsetRange }> = [];
  const projectReferencePattern = /<ProjectReference\b[^>]*\bInclude\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/gi;
  let projectReferenceMatch = projectReferencePattern.exec(source);
  while (projectReferenceMatch) {
    projectReferences.push({
      include: projectReferenceMatch[1],
      range: { start: projectReferenceMatch.index, end: projectReferenceMatch.index + projectReferenceMatch[0].length },
    });
    projectReferenceMatch = projectReferencePattern.exec(source);
  }
  return {
    ...(assemblyMatch ? { projectName: assemblyMatch[1].trim(), projectNameRange: { start: assemblyMatch.index, end: assemblyMatch.index + assemblyMatch[0].length } } : {}),
    useWpf: Boolean(useWpfMatch),
    ...(useWpfMatch ? { useWpfRange: { start: useWpfMatch.index, end: useWpfMatch.index + useWpfMatch[0].length } } : {}),
    projectReferences,
  };
}
