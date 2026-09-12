import type { AnalyzerSourceFile } from './types';
import { semanticLanguage } from './semantic/languages';

export function isAnalyzerSemanticSourcePath(path: string): boolean {
  return !isExcludedPath(path) && !isSensitivePath(path) && Boolean(semanticLanguage(path));
}

const excludedDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.wrangler',
  '.next',
  '.vite',
  '.cache',
  'tmp',
  'temp',
  'bin',
  'obj',
]);

const sensitiveExtensions = new Set(['.pem', '.key', '.p12', '.pfx', '.jks']);
const usageSourceExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);

interface DirectoryEntryLike {
  kind: 'file' | 'directory';
  name: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncIterableIterator<DirectoryEntryLike>;
}

export interface DirectoryHandleLike extends DirectoryEntryLike {
  kind: 'directory';
  values: () => AsyncIterableIterator<DirectoryEntryLike>;
}

export function normalizeRelativePath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.length > 0 ? parts.join('/') : '.';
}

function fileNameForPath(path: string): string {
  return path.split('/').at(-1) ?? path;
}

function extensionForPath(path: string): string {
  const name = fileNameForPath(path).toLowerCase();
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex) : '';
}

function sourceFileFromFile(file: File, relativePath: string): AnalyzerSourceFile {
  let textCache: string | undefined;
  const normalizedPath = normalizeRelativePath(relativePath);
  return {
    relativePath: normalizedPath,
    name: fileNameForPath(normalizedPath),
    extension: extensionForPath(normalizedPath),
    size: file.size,
    readText: async () => {
      if (textCache === undefined) textCache = await file.text();
      return textCache;
    },
  };
}

function removeCommonInputRoot(paths: string[]): string[] {
  const firstSegments = paths.map((path) => path.split('/')[0]).filter(Boolean);
  if (firstSegments.length !== paths.length || firstSegments.length === 0) return paths;
  if (paths.length === 1 && !paths[0].includes('/')) return paths;
  const commonRoot = firstSegments[0];
  if (!commonRoot || !firstSegments.every((segment) => segment === commonRoot)) return paths;
  return paths.map((path) => path.slice(commonRoot.length + 1) || '.');
}

export function sourceFilesFromInput(files: FileList | File[]): AnalyzerSourceFile[] {
  const inputFiles = Array.from(files);
  const paths = inputFiles.map((file) => normalizeRelativePath(file.webkitRelativePath || file.name));
  const relativePaths = removeCommonInputRoot(paths);
  return inputFiles
    .map((file, index) => sourceFileFromFile(file, relativePaths[index]))
    .filter((file) => !isExcludedPath(file.relativePath));
}

async function collectDirectoryFiles(directory: DirectoryHandleLike, parentPath = ''): Promise<AnalyzerSourceFile[]> {
  const files: AnalyzerSourceFile[] = [];
  for await (const entry of directory.values()) {
    const relativePath = normalizeRelativePath(parentPath ? `${parentPath}/${entry.name}` : entry.name);
    if (entry.kind === 'directory') {
      if (isExcludedDirectory(entry.name)) {
        if(entry.name.toLowerCase()==='build'&&entry.values)for await(const config of entry.values())if(config.kind==='file'&&config.name==='compile_commands.json'&&config.getFile)files.push(sourceFileFromFile(await config.getFile(),`${relativePath}/${config.name}`));
        continue;
      }
      if (!entry.values) continue;
      files.push(...await collectDirectoryFiles(entry as DirectoryHandleLike, relativePath));
      continue;
    }
    if (!entry.getFile || isExcludedPath(relativePath)) continue;
    const file = await entry.getFile();
    files.push(sourceFileFromFile(file, relativePath));
  }
  return files;
}

export function filesFromDirectoryHandle(directory: DirectoryHandleLike): Promise<AnalyzerSourceFile[]> {
  return collectDirectoryFiles(directory);
}

export function isExcludedDirectory(directoryName: string): boolean {
  return excludedDirectories.has(directoryName.toLowerCase());
}

export function isExcludedPath(path: string): boolean {
  const parts = normalizeRelativePath(path).split('/');
  if(parts.at(-1)==='compile_commands.json'&&parts.slice(0,-1).filter(isExcludedDirectory).every(part=>part.toLowerCase()==='build'))return false;
  return parts.slice(0, -1).some(isExcludedDirectory);
}

export function isSensitivePath(path: string): boolean {
  const name = fileNameForPath(path).toLowerCase();
  return name.startsWith('.env') || sensitiveExtensions.has(extensionForPath(path))
    || /(?:^|[-_.])(?:credentials?|secrets?|kubeconfig)(?:$|[-_.])/.test(name) || /\.tfstate(?:\.|$)/.test(name);
}

export function isAnalyzerSourcePath(path: string): boolean {
  if (isExcludedPath(path) || isSensitivePath(path)) return false;
  const name = fileNameForPath(path).toLowerCase();
  return name === 'package.json'
    || name === 'pnpm-workspace.yaml'
    || name === 'pnpm-workspace.yml'
    || name === 'firebase.json'
    || name === '.firebaserc'
    || name === 'wrangler.json'
    || name === 'wrangler.jsonc'
    || name === 'wrangler.toml'
    || name.startsWith('vite.config.')
    || name.startsWith('vitest.config.')
    || (name.startsWith('tsconfig') && name.endsWith('.json'))
    || name.endsWith('.slnx')
    || name.endsWith('.sln')
    || name.endsWith('.csproj')
    || ['gemfile.lock','pubspec.lock','package.resolved'].includes(name)
    || /^(?:pyproject\.toml|requirements[^/]*\.txt|setup\.cfg|uv\.lock|pip\.(?:conf|ini)|pytest\.ini|pom\.xml|(?:build|settings)\.gradle(?:\.kts)?|build\.sbt|libs\.versions\.toml|directory\.(?:build|packages)\.props|global\.json|nuget\.config|go\.(?:mod|work)|cargo\.(?:toml|lock)|composer\.(?:json|lock)|gemfile|pubspec\.yaml|package\.swift|deno\.(?:jsonc?|lock)|bun\.(?:lock|lockb)|bunfig\.toml|yarn\.lock|\.yarnrc\.yml|netlify\.toml|nginx\.conf|httpd\.conf|apache2\.conf|\.gitlab-ci\.yml)$/.test(name)
    || /\.(?:gemspec|tf|json|jsonc|ya?ml|xaml|html|astro|vue|svelte|css)$/.test(name)
    || /^(?:webpack|jest|cypress|nuxt|astro|svelte)\.config\./.test(name);
}

/**
 * Returns source files that may provide conservative Stack Usage Evidence.
 * This intentionally covers module imports only; it is not a general source
 * code or dependency graph scan.
 */
export function isAnalyzerUsageSourcePath(path: string): boolean {
  if (isExcludedPath(path) || isSensitivePath(path)) return false;
  return usageSourceExtensions.has(extensionForPath(path)) || /\.(?:vue|svelte|astro|html|xaml)$/.test(path);
}
