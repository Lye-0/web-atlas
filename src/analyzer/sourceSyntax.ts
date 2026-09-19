import { parseModuleImports } from './moduleResolver';
import type { AnalyzerModuleImportReference } from './types';
import type {ManifestProject}from'./manifestAdapters';
import {directoryFor,localPath}from'./projectPaths';
import { templateElements } from './templateSyntax';

export interface SourceLiteral { value: string; start: number; end: number; quote: string }
/** Offset-preserving lexical mask. Quoted examples and comments never become code signals. */
export function sourceSyntax(source: string, language: string): { code: string; literals: SourceLiteral[] } {
  const characters = source.split(''); const literals: SourceLiteral[] = [];
  const blank = (start: number, end: number) => { for (let i = start; i < end; i++) if (characters[i] !== '\n' && characters[i] !== '\r') characters[i] = ' '; };
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (c === '/' && source[i + 1] === '/' || c === '#' && ['python', 'ruby', 'php', 'toml', 'yaml'].includes(language)) {
      const end = source.indexOf('\n', i); const limit = end < 0 ? source.length : end; blank(i, limit); i = limit - 1; continue;
    }
    if (c === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); const limit = end < 0 ? source.length : end + 2; blank(i, limit); i = limit - 1; continue; }
    if (c !== '"' && c !== "'" && c !== '`') continue;
    // Rust lifetimes are identifiers, not quote-delimited strings.
    if (language === 'rust' && c === "'" && /^'[a-zA-Z_]\w*(?!')/.test(source.slice(i)) && source[i + 2] !== "'") continue;
    const triple = source.slice(i, i + 3) === c.repeat(3); const delimiter = triple ? c.repeat(3) : c; const begin = i; let end = i + delimiter.length; let escaped = false;
    for (; end < source.length; end++) { if (escaped) { escaped = false; continue; } if (source[end] === '\\') { escaped = true; continue; } if (source.slice(end, end + delimiter.length) === delimiter) break; }
    if (end < source.length) literals.push({ value: source.slice(begin + delimiter.length, end), start: begin, end: end + delimiter.length, quote: delimiter });
    blank(begin, Math.min(source.length, end + delimiter.length)); i = end + delimiter.length - 1;
  }
  return { code: characters.join(''), literals };
}
export function scriptSource(path: string, source: string): string {
  if (!/\.(?:vue|svelte|astro|html|xaml)$/i.test(path)) return source;
  const characters: string[] = source.split('').map(c => c === '\n' || c === '\r' ? c : ' ');
  const copy = (start: number, value: string) => { for (let i = 0; i < value.length; i++) characters[start + i] = value[i]!; };
  const frontmatter=/\.astro$/i.test(path)?source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/):undefined;
  const template=frontmatter?source.slice(0,frontmatter[0].length).replace(/[^\r\n]/g,' ')+source.slice(frontmatter[0].length):source;
  for(const element of templateElements(template).filter(element=>element.name==='script')){
    const open=source.indexOf('>',element.start)+1;const close=source.lastIndexOf('</script',element.end);if(open>0&&close>=open)copy(open,source.slice(open,close));
  }
  if(frontmatter)copy(frontmatter[0].indexOf(frontmatter[1]!),frontmatter[1]!);
  return characters.join('');
}
const languageByExtension: Record<string, string> = { py:'python',pyi:'python',java:'java',cs:'csharp',go:'go',rs:'rust',rb:'ruby',php:'php',c:'c',h:'header',cpp:'cpp',cc:'cpp',cxx:'cpp',hpp:'cpp',hxx:'cpp',hh:'cpp',swift:'swift',kt:'kotlin',kts:'kotlin',scala:'scala',dart:'dart',vue:'vue',svelte:'svelte',astro:'astro',xaml:'wpf',html:'html',sql:'sql',graphql:'graphql',gql:'graphql' };
export function sourceLanguage(path: string): string | undefined { return languageByExtension[path.split('.').at(-1)?.toLowerCase() ?? '']; }

export function languageImports(path: string, source: string): AnalyzerModuleImportReference[] {
  const language = sourceLanguage(path); if (!language || ['vue', 'svelte', 'astro', 'html'].includes(language)) return parseModuleImports(scriptSource(path, source));
  const { code, literals } = sourceSyntax(source, language); const result: AnalyzerModuleImportReference[] = [];
  const add = (specifier: string, start: number, end: number, kind: AnalyzerModuleImportReference['kind'] = 'import') => { if (specifier) result.push({ kind, specifier, start, end }); };
  if (language === 'python') {
    for (const match of code.matchAll(/^\s*from\s+([\w.]+)\s+import\s+([^\n]+)/gm)) {
      const base = match[1]!; const names = match[2]!.replace(/[()]/g, '').split(',').map(value => value.trim().split(/\s+as\s+/)[0]!).filter(Boolean);
      if (/^\.+$/.test(base)) for (const name of names) add(base + name, match.index!, match.index! + match[0].length); else add(base, match.index!, match.index! + match[0].length);
    }
    for (const match of code.matchAll(/^\s*import\s+([^\n]+)/gm)) for (const item of match[1]!.split(',')) add(item.trim().split(/\s+as\s+/)[0]!, match.index!, match.index! + match[0].length);
  } else if (['java', 'kotlin', 'scala'].includes(language)) {
    for (const match of code.matchAll(/^\s*import\s+(?:static\s+)?([\w.*]+)(?:\{([^}]+)\})?/gm)) {
      if (match[2]) for (const name of match[2].split(',')) add(match[1]!.replace(/\.$/, '') + '.' + name.trim().split(/\s*(?:=>|as)\s*/)[0], match.index!, match.index! + match[0].length);
      else add(match[1]!, match.index!, match.index! + match[0].length);
    }
  } else if (language === 'csharp') { for (const match of code.matchAll(/^\s*(?:global\s+)?using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)\s*;/gm)) add(match[1]!, match.index!, match.index! + match[0].length); }
  else if (language === 'rust') {
    for (const match of code.matchAll(/\b(?:pub\s+)?mod\s+(\w+)\s*;/g)) add(`mod:${match[1]}`, match.index!, match.index! + match[0].length);
    for (const match of code.matchAll(/\buse\s+([\w:]+)(?:\{[^}]*\})?/g)) add(match[1]!.replace(/::$/, ''), match.index!, match.index! + match[0].length);
  } else if (language === 'php') { for (const match of code.matchAll(/\buse\s+([\w\\]+)(?:\s+as\s+\w+)?\s*;/g)) add(match[1]!, match.index!, match.index! + match[0].length); }
  else if (language === 'swift') { for (const match of code.matchAll(/^\s*(?:@testable\s+)?import\s+(\w+)/gm)) add(match[1]!, match.index!, match.index! + match[0].length); }
  for (const literal of literals) {
    if (literal.quote.length > 1 || literal.value.includes('\n')) continue;
    const prefix = code.slice(Math.max(0, literal.start - 100), literal.start);
    if(language==='go'){
      const before=code.slice(0,literal.start);const direct=/\bimport\s+(?:[\w.]+\s+)?$/.test(prefix);
      const block=[...before.matchAll(/\bimport\s*\(/g)].at(-1);const inside=block&&before.slice(block.index!+block[0].length).indexOf(')')<0;
      if(direct||inside&&/^\s*(?:[\w.]+\s*)?$/.test(before.slice(before.lastIndexOf('\n')+1)))add(literal.value,literal.start,literal.end);
    }
    if (language === 'ruby' && /\b(require|require_relative)\s*\(?\s*$/.test(prefix)) add((/require_relative/.test(prefix) ? './' : '') + literal.value, literal.start, literal.end, 'require');
    if (language === 'dart' && /\b(import|export|part)\s*$/.test(prefix)) add(literal.value, literal.start, literal.end);
    if (['c', 'cpp','header'].includes(language) && /#\s*include\s*$/.test(prefix)) add(literal.value, literal.start, literal.end);
    if (language === 'php' && /\b(?:require|include)(?:_once)?\s*\(?\s*$/.test(prefix)) add(literal.value, literal.start, literal.end, 'require');
  }
  if (['c', 'cpp','header'].includes(language)) for (const match of code.matchAll(/^\s*#\s*include\s*<([^>]+)>/gm)) add(match[1]!, match.index!, match.index! + match[0].length);
  return result;
}

export function resolveLanguageImports(path: string, source: string, sources: ReadonlyMap<string, string>, projects: ManifestProject[]): AnalyzerModuleImportReference[] {
  const language = sourceLanguage(path); const owner = projects.filter(project => project.directory === '.' || path.startsWith(`${project.directory}/`)).sort((a, b) => b.directory.length - a.directory.length)[0];
  const root = owner?.directory ?? '.'; const directory = directoryFor(path);
  const visibleProjects=new Set<ManifestProject>();if(owner)visibleProjects.add(owner);
  for(const reference of owner?.projectReferences??[]){const resolved=localPath(owner!.directory,reference);for(const project of projects)if(project.path===resolved||project.directory===resolved)visibleProjects.add(project);}
  const candidates=[...sources.keys()].filter(candidate=>{const candidateOwner=projects.filter(project=>project.directory==='.'||candidate.startsWith(`${project.directory}/`)).sort((a,b)=>b.directory.length-a.directory.length)[0];return candidateOwner?visibleProjects.has(candidateOwner):!owner;});
  return languageImports(path, source).map(reference => {
    const name = reference.specifier; const possible = new Set<string>(); const add = (value: string | undefined) => { if (value && sources.has(value) && value !== path) possible.add(value); };
    const variants = (base: string | undefined, extensions: string[], index = '') => { if (!base) return; add(base); for (const ext of extensions) { add(`${base}.${ext}`); if (index) add(`${base}/${index}.${ext}`); } };
    if (language === 'python') {
      const relative = name.match(/^(\.+)(.*)/); let base = directory;
      if (relative) { for (let i = 1; i < relative[1]!.length; i++) base = directoryFor(base); variants(localPath(base, relative[2]!.replaceAll('.', '/')), ['py', 'pyi'], '__init__'); }
      else { variants(localPath(root, name.replaceAll('.', '/')), ['py', 'pyi'], '__init__'); variants(localPath(root, `src/${name.replaceAll('.', '/')}`), ['py', 'pyi'], '__init__'); }
    } else if (['java', 'kotlin', 'scala', 'csharp'].includes(language ?? '')) {
      for (const candidate of candidates.filter(candidate => sourceLanguage(candidate) === language)) {
        const code = sourceSyntax(sources.get(candidate)!, language!).code;
        const namespace = code.match(language === 'csharp' ? /\bnamespace\s+([\w.]+)/ : /\bpackage\s+([\w.]+)/)?.[1] ?? '';
        const names = [...code.matchAll(/\b(?:class|interface|object|enum|record|struct|trait)\s+(\w+)/g)].map(match => `${namespace ? namespace + '.' : ''}${match[1]}`);
        if (names.includes(name) || name === namespace || name === `${namespace}.*`) add(candidate);
      }
    } else if (language === 'rust') {
      const parts = name.replace(/^mod:/, '').split('::'); const relative = name.startsWith('mod:');
      let base = relative ? /\/(?:mod|lib|main)\.rs$/.test(path) || !path.includes('/') ? directory : path.replace(/\.rs$/, '') : root;
      if (parts[0] === 'crate') { parts.shift(); base = localPath(root, 'src') ?? root; } else if (parts[0] === 'self') { parts.shift(); base = directory; } else if (parts[0] === 'super') { parts.shift(); base = directoryFor(directory); }
      for (let count = parts.length; count > 0 && !possible.size; count--) variants(localPath(base, parts.slice(0, count).join('/')), ['rs'], 'mod');
    } else if (language === 'go') {
      const module = [...visibleProjects].find(project => project.ecosystem === 'go' && name.startsWith(String(project.attributes.modulePath) + '/'));
      const target = module ? localPath(module.directory, name.slice(String(module.attributes.modulePath).length + 1)) : undefined;
      if (target) candidates.filter(candidate => directoryFor(candidate) === target && candidate.endsWith('.go') && !candidate.endsWith('_test.go')).forEach(add);
    } else if (language === 'php') {
      if (name.includes('\\')) {
        for (const candidate of candidates.filter(candidate => candidate.endsWith('.php'))) { const code = sourceSyntax(sources.get(candidate)!, 'php').code; const namespace = code.match(/\bnamespace\s+([\w\\]+)/)?.[1] ?? ''; if ([...code.matchAll(/\b(?:class|interface|trait|enum)\s+(\w+)/g)].some(match => `${namespace ? namespace + '\\' : ''}${match[1]}` === name)) add(candidate); }
      } else variants(localPath(directory, name), ['php']);
    } else if (language === 'ruby') { variants(localPath(directory, name), ['rb']); if (!name.startsWith('.')) variants(localPath(root, `lib/${name}`), ['rb']); }
    else if (language === 'dart') {
      const packageImport = name.match(/^package:([^/]+)\/(.*)/); const project = packageImport ? [...visibleProjects].find(project => project.ecosystem === 'dart' && project.name === packageImport[1]) : undefined;
      if (project) add(localPath(project.directory, `lib/${packageImport![2]}`)); else add(localPath(directory, name));
    } else if (language === 'swift') {
      const project = [...visibleProjects].find(project => project.ecosystem === 'swift' && (project.name === name||Array.isArray(project.attributes.swiftTargets)&&project.attributes.swiftTargets.includes(name))); if (project) candidates.filter(candidate => candidate.endsWith('.swift') && candidate.startsWith(`${project.directory === '.' ? '' : project.directory + '/'}Sources/${name}/`)).forEach(add);
    } else if (['c', 'cpp','header'].includes(language ?? '')) { add(localPath(directory, name)); add(localPath(root, name)); add(localPath(root, `include/${name}`)); }
    else if (name.startsWith('.')) variants(localPath(directory, name), ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro'], 'index');
    const matches = [...possible]; return matches.length === 1 ? { ...reference, resolvedPath: matches[0] } : { ...reference, reason: matches.length > 1 ? 'ambiguous' : name.startsWith('.') || /^(?:crate|self|super)::|^mod:/.test(name) ? 'unresolved' : 'external' };
  });
}
