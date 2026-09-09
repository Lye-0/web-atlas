import type { ArchitectureSyntax } from './architectureSyntax';
import type { ArchitectureEntity } from './architecture';

/** Narrow, explainable role annotations. These never create an execution unit. */
export function architectureRole(path: string, source: string, owner: ArchitectureEntity, syntax?: ArchitectureSyntax): { label: string; reason: string } | undefined {
  if (syntax?.calls.some(call => call.callee.endsWith('.createWebviewPanel')) || owner.context.includes('Extension Host') && /(?:^|\/)webview\//i.test(path)) return { label: 'Webviewホスト連携', reason: 'Webviewパネルの生成式、またはExtension Host内のwebview配置規約' };
  if (syntax?.calls.some(call => /(?:^|\.)acquireVsCodeApi$/.test(call.callee))) return { label: 'Webview通信', reason: 'Webview側のVS Code API取得式' };
  if (/(?:^|\/)git\//i.test(path)) return { label: 'Git操作', reason: 'gitディレクトリの配置規約。個々のGitコマンド実行は別の関係で確認' };
  if (owner.kind === 'application' && owner.context.some(context => context.startsWith('.NET')) && /(?:^|\/)Program\.cs$/.test(path)) return { label: 'プロセス入口', reason: '.NET実行プロジェクトのProgram.cs規約。起動設定の追加評価は行わない' };
  if (owner.context.includes('.NET / WPF') && /\.xaml\.cs$/.test(path)) return { label: 'UI', reason: 'WPFプロジェクトのXAML code-behind配置規約' };
  if (/^\s*using\s+System\.IO\.Pipes\s*;/m.test(source)) return { label: 'ローカルIPC', reason: 'System.IO.Pipesの参照宣言。通信相手は別の接続根拠が必要' };
  if (syntax?.imports.has('node:fs') || syntax?.imports.has('node:fs/promises')) return { label: 'ファイル操作', reason: 'Node.jsファイルシステムAPIのimport宣言' };
  return undefined;
}
