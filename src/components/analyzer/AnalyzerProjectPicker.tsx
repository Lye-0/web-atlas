import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { filesFromDirectoryHandle, scanProjectFiles, sourceFilesFromInput, type DirectoryHandleLike } from '../../analyzer';
import type { AnalyzerProjectStore } from '../../analyzer';

interface AnalyzerProjectPickerProps {
  onScanned: (store: AnalyzerProjectStore, folderHandle?: DirectoryHandleLike) => void;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<DirectoryHandleLike>;
}

export function AnalyzerProjectPicker({ onScanned }: AnalyzerProjectPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // A route change invalidates the old picker, even if its scan finishes later.
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const beginScan = () => {
    const id = ++request.current;
    setError(undefined);
    setIsScanning(true);
    return id;
  };
  const scanFiles = async (files: ReturnType<typeof sourceFilesFromInput>, id: number, folderHandle?: DirectoryHandleLike) => {
    try {
      if (!files.length) {
        if (id === request.current) setError('解析できるファイルが選択されていません。');
        return;
      }
      const store = await scanProjectFiles(files);
      if (id === request.current) onScanned(store, folderHandle);
    } catch {
      if (id === request.current) setError('プロジェクトを解析できませんでした。別のフォルダを選択してください。');
    } finally {
      if (id === request.current) setIsScanning(false);
    }
  };

  const openDirectoryPicker = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) { inputRef.current?.click(); return; }
    const id = beginScan();
    try {
      const directory = await picker();
      if (id !== request.current) return;
      const files = await filesFromDirectoryHandle(directory);
      if (id === request.current) await scanFiles(files, id, directory);
    } catch (reason) {
      if (id === request.current && !(reason instanceof DOMException && reason.name === 'AbortError'))
        setError('プロジェクトフォルダを読み取れませんでした。');
    } finally {
      if (id === request.current) setIsScanning(false);
    }
  };

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files && sourceFilesFromInput(event.target.files);
    event.target.value = '';
    if (files) await scanFiles(files, beginScan());
  };

  return (
    <div className="analyzer-project-picker">
      <button type="button" className="analyzer-primary-button" onClick={() => void openDirectoryPicker()} disabled={isScanning}>
        {isScanning ? '解析中…' : 'プロジェクトフォルダを選択'}
      </button>
      <input
        ref={inputRef}
        className="analyzer-folder-input"
        type="file"
        multiple
        onChange={(event) => void handleInputChange(event)}
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        aria-label="プロジェクトフォルダのファイル"
      />
      <span className="analyzer-privacy-note">sourceはこのBrowser内だけで解析します。</span>
      {error && <p className="analyzer-picker-error" role="alert">{error}</p>}
    </div>
  );
}
