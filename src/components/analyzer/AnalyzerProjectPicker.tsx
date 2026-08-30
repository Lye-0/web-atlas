import { useRef, useState, type ChangeEvent } from 'react';
import { filesFromDirectoryHandle, scanProjectFiles, sourceFilesFromInput, type DirectoryHandleLike } from '../../analyzer';
import type { AnalyzerProjectStore } from '../../analyzer';

interface AnalyzerProjectPickerProps {
  onScanned: (store: AnalyzerProjectStore) => void;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<DirectoryHandleLike>;
}

export function AnalyzerProjectPicker({ onScanned }: AnalyzerProjectPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const scanFiles = async (files: ReturnType<typeof sourceFilesFromInput>) => {
    if (files.length === 0) {
      setError('解析できるファイルが選択されていません。');
      return;
    }
    setError(undefined);
    setIsScanning(true);
    try {
      onScanned(await scanProjectFiles(files));
    } catch {
      setError('プロジェクトを解析できませんでした。別のフォルダを選択してください。');
    } finally {
      setIsScanning(false);
    }
  };

  const openDirectoryPicker = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      inputRef.current?.click();
      return;
    }
    setError(undefined);
    setIsScanning(true);
    try {
      const directory = await picker();
      await scanFiles(await filesFromDirectoryHandle(directory));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        setIsScanning(false);
        return;
      }
      setError('プロジェクトフォルダを読み取れませんでした。');
      setIsScanning(false);
    }
  };

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) await scanFiles(sourceFilesFromInput(event.target.files));
    event.target.value = '';
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
