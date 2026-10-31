import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalyzerProjectPicker } from './AnalyzerProjectPicker';
import { scanProjectFiles, filesFromDirectoryHandle } from '../../analyzer';
import type { AnalyzerProjectStore } from '../../analyzer';

vi.mock('../../analyzer', () => ({ scanProjectFiles: vi.fn(), filesFromDirectoryHandle: vi.fn(), sourceFilesFromInput: () => [{}] }));
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const store = (name: string) => ({ scannedAt: name }) as AnalyzerProjectStore;
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
const choose = () => act(async () => { const input = host.querySelector('input')!; Object.defineProperty(input, 'files', { configurable: true, value: [{}] }); input.dispatchEvent(new Event('change', { bubbles: true })); });
it('ignores an old picker result after navigating away and loading a newer project', async () => {
  const first = deferred<AnalyzerProjectStore>(), second = deferred<AnalyzerProjectStore>(), onScanned = vi.fn();
  vi.mocked(scanProjectFiles).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await act(async () => root.render(<AnalyzerProjectPicker key="a" onScanned={onScanned} />)); await choose();
  await act(async () => root.render(<AnalyzerProjectPicker key="b" onScanned={onScanned} />)); await choose();
  const latest = store('latest'); await act(async () => second.resolve(latest)); await act(async () => first.resolve(store('old')));
  expect(onScanned).toHaveBeenCalledExactlyOnceWith(latest, undefined);
  expect(host.querySelector('button')!.disabled).toBe(false);
});
it('keeps a newer request busy and ignores an earlier failure on the same picker', async () => {
  const first = deferred<AnalyzerProjectStore>(), second = deferred<AnalyzerProjectStore>(), onScanned = vi.fn();
  vi.mocked(scanProjectFiles).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await act(async () => root.render(<AnalyzerProjectPicker onScanned={onScanned} />)); await choose(); await choose();
  await act(async () => first.reject(new Error('old failure')));
  expect(host.querySelector('button')!.disabled).toBe(true); expect(host.querySelector('[role="alert"]')).toBeNull();
  await act(async () => second.resolve(store('latest'))); expect(onScanned).toHaveBeenCalledTimes(1);
});
it('does not enumerate a directory returned after the picker unmounts', async () => {
  const selection = deferred<import('../../analyzer').DirectoryHandleLike>();
  vi.stubGlobal('showDirectoryPicker', () => selection.promise);
  await act(async () => root.render(<AnalyzerProjectPicker onScanned={vi.fn()} />));
  await act(async () => host.querySelector('button')!.click()); await act(async () => root.render(null));
  await act(async () => selection.resolve({} as import('../../analyzer').DirectoryHandleLike));
  expect(filesFromDirectoryHandle).not.toHaveBeenCalled(); expect(scanProjectFiles).not.toHaveBeenCalled();
});
it('restores the button after cancelling the native directory picker', async () => {
  vi.stubGlobal('showDirectoryPicker', () => Promise.reject(new DOMException('cancel', 'AbortError')));
  await act(async () => root.render(<AnalyzerProjectPicker onScanned={vi.fn()} />)); await act(async () => host.querySelector('button')!.click());
  expect(host.querySelector('button')!.disabled).toBe(false); expect(host.querySelector('[role="alert"]')).toBeNull();
});
