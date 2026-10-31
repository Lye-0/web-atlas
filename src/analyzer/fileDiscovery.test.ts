// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { filesFromDirectoryHandle, sourceFilesFromInput, isAnalyzerSemanticSourcePath, type DirectoryHandleLike } from './fileDiscovery';
const file = { size: 1, text: async () => 'x' } as File;
const entry = (name: string) => ({ kind: 'file' as const, name, getFile: async () => file });
it('collects 160000 children without argument spreading and preserves DFS order', async () => {
  const child: DirectoryHandleLike = { kind: 'directory', name: 'large', async *values() { for (let i = 0; i < 160000; i++) yield entry(`${i}.ts`); } };
  const root: DirectoryHandleLike = { kind: 'directory', name: 'root', async *values() { yield child; yield entry('last.ts'); } };
  const files = await filesFromDirectoryHandle(root);
  expect(files).toHaveLength(160001); expect(files[0]!.relativePath).toBe('large/0.ts');
  expect(files[159999]!.relativePath).toBe('large/159999.ts'); expect(files.at(-1)!.relativePath).toBe('last.ts');
}, 30000);
it('excludes Python environments/caches for both folder APIs while keeping authored source and build configuration', async () => {
  const read = vi.fn(async () => file);
  const names = ['.venv', 'venv', '__pycache__', '.pytest_cache', '.ruff_cache', '.mypy_cache'];
  const root: DirectoryHandleLike = { kind: 'directory', name: 'root', async *values() {
    for (const name of names) yield { kind: 'directory' as const, name, async *values() { yield { ...entry('dependency.py'), getFile: read }; } };
    yield { kind: 'directory' as const, name: 'src', async *values() { yield entry('main.py'); yield entry('native.h'); } };
    yield { kind: 'directory' as const, name: 'build', async *values() { yield entry('compile_commands.json'); yield entry('ignored.cpp'); } };
  } };
  expect((await filesFromDirectoryHandle(root)).map(file => file.relativePath)).toEqual(['src/main.py', 'src/native.h', 'build/compile_commands.json']); expect(read).not.toHaveBeenCalled();
  const input = [...names.map(name => `project/${name}/dependency.py`), 'project/src/main.py'].map(webkitRelativePath => ({ ...file, name: 'file.py', webkitRelativePath }) as File);
  expect(sourceFilesFromInput(input).map(file => file.relativePath)).toEqual(['src/main.py']);
  for (const name of names) expect(isAnalyzerSemanticSourcePath(`${name}/dependency.py`)).toBe(false);
  expect(isAnalyzerSemanticSourcePath('src/native.h')).toBe(true);
});
