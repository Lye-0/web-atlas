import ts from 'typescript';
import type { SemanticEvidence, SemanticInput } from './types';
import { scriptSource } from '../sourceSyntax';

export const dataScriptPath = (path: string) => /\.(?:[cm]?[jt]sx?|vue|svelte|astro|html)$/.test(path);
const normalize = (path: string) => {
  const parts: string[] = [];
  for (const part of path.replaceAll('\\', '/').split('/')) { if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part); }
  return parts.join('/');
};

/** A closed, in-memory compiler host. Never reads disk, executes configuration, or loads target packages. */
export function createDataCompiler(input: SemanticInput) {
  const files = new Map(Object.entries(input.sources).filter(([path]) => dataScriptPath(path)).map(([path, source]) =>
    [path, ts.createSourceFile(path, scriptSource(path,source), ts.ScriptTarget.Latest, true, /x$/.test(path) ? ts.ScriptKind.TSX : /\.([cm]?js)$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS)]));
  const options: ts.CompilerOptions = { noLib: true, allowJs: true, allowNonTsExtensions: true, checkJs: false, noEmit: true, target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext, strictNullChecks: true };
  const resolve = (specifier: string, from: string) => {
    const supplied = input.imports.find(item => item.from === from && item.specifier === specifier)?.to;
    if (supplied && files.has(supplied)) return supplied;
    if (!specifier.startsWith('.')) return undefined;
    const base = normalize(`${from.split('/').slice(0, -1).join('/')}/${specifier}`).replace(/\.js$/, '');
    return [base, ...['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '/index.ts', '/index.tsx', '/index.js'].map(ext => base + ext)].find(path => files.has(path));
  };
  const host: ts.CompilerHost = {
    getSourceFile: name => files.get(name), getDefaultLibFileName: () => '', writeFile: () => undefined,
    getCurrentDirectory: () => '', getDirectories: () => [], fileExists: name => files.has(name), readFile: name => files.get(name)?.text,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    resolveModuleNames: (names, from) => names.map(name => { const resolvedFileName = resolve(name, from); return resolvedFileName ? { resolvedFileName } : undefined; }),
  };
  const program = ts.createProgram([...files.keys()], options, host), checker = program.getTypeChecker();
  const symbol = (node: ts.Node) => {
    let found = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
    if (found && found.flags & ts.SymbolFlags.Alias) { try { found = checker.getAliasedSymbol(found); } catch { return undefined; } }
    return found;
  };
  return { files, checker, symbol, syntacticDiagnostics: (file: ts.SourceFile) => program.getSyntacticDiagnostics(file) };
}
export type DataCompiler = ReturnType<typeof createDataCompiler>;
export function sourceEvidence(node: ts.Node, description: string): SemanticEvidence {
  const file = node.getSourceFile(), start = node.getStart(file), end = node.getEnd();
  return { path: file.fileName, start, end, line: file.getLineAndCharacterOfPosition(start).line + 1, endLine: file.getLineAndCharacterOfPosition(end).line + 1, description };
}
export function visitSource(node: ts.Node, visit: (node: ts.Node) => void) {
  const pending = [node];
  while (pending.length) { const current = pending.pop()!; visit(current); const children: ts.Node[] = []; current.forEachChild(child => { children.push(child); }); for (let index = children.length - 1; index >= 0; index--) pending.push(children[index]!); }
}
export const modifier = (node: ts.Node, kind: ts.SyntaxKind) => ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some(item => item.kind === kind));
