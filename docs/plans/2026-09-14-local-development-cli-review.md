# ローカル開発・検証CLIの実装・検証記録

対象計画: [追加計画](2026-09-14-local-development-cli-expansion.md)。Codex単独で実装・検証。

## 実装内容

- Wrangler、Vercel CLI、Netlify CLI、Firebase CLI、Supabase CLIを追加。Dictionaryは147技術・53分類。
- 新規カテゴリ「ローカル開発・検証CLI」を「開発と配信」に配置。既存のMapレスポンシブ表示を使用し、カテゴリ・技術の相互関連リンクを追加。
- 各詳細にローカル開発、公開・管理、実行環境との違い、関連技術、公式資料を記載。Firebase Local Emulator Suiteは独立項目を維持。Netlify DevはNetlify CLIの機能として説明。
- npmのwrangler / vercel / netlify-cli / firebase-tools / supabaseをCLIに対応。Vercel・Netlifyのサービス項目からCLIパッケージ名を移管。同名PyPI Supabase SDKは別扱い。
- 依存宣言と静的コマンド使用を区別し、Stack Map・依存関係・Command Flowに反映。コマンドにはlocal / remote / deploy / toolの目的と未観測状態を保持。
- 操作対象は選択された設定ファイルと元Factから解決。明示config・workspaceを尊重し、動的config・存在しないconfig・複数候補は任意の対象へ結び付けない。
- Command FlowはCLIへのusesと実行環境へのstartsを分離。WranglerのD1操作は明示binding / databaseNameに照合し、従来の主対象の順番を維持。
- Architectureは所属構成の技術欄へ開発支援として表示。CLIだけを理由に外部サービスや実行ブロックを追加しない。元ファイル・範囲のEvidenceをworkerへ引き継ぐ。

## 自動検証

- 全体: 121ファイル成功・4ファイルスキップ、1,307テスト成功・8テストスキップ、失敗0。
- CLIと既存Analyzerの重点確認: 44テスト成功。CLI・コマンド・semantic clientの重点確認: 31テスト成功（全体と重複するため合算しない）。
- 最後の技術欄見出し修正後: architectureSummaryの9テストとtypecheck成功。
- lint、typecheck、production build成功。buildには既存のtree-sitter eval、Node標準モジュールの外部化、chunkサイズの警告が残る。
- 新規5件のfixtureでパッケージ識別、関連リンク、Command Flow、Architectureの開発支援、Evidence、余分なサービスを生成しないことを検証。追加ケースでhelp/login、local/remote/deploy、設定参照、依存宣言のみ、同名SDKを検証。

## 実ブラウザ確認

ローカルViteと合成した16ファイルのfixtureを使用。実プロジェクトのCLIは実行していない。

- Dictionary: Mapの53分類・147技術、新カテゴリと5技術、カテゴリ詳細、Wrangler/Firebase CLI詳細、firebase-toolsの検索と遷移を確認。
- Map: viewport指定360 / 390 / 768 / 1024 / 1440pxを確認。ブラウザの90%拡大率によりDOMでの実幅は388 / 422 / 842 / 1126 / 1588 CSS px。各幅で5技術が表示され、documentの横はみ出しなし。desktopの配置も画像で確認。
- Architecture 2D: local-workerを選択し、現在地・既存座標・カメラの診断値が変わらないことを確認。Wranglerは開発支援欄からDictionaryへ移動できる。
- Architecture 3D: 同じ選択と技術詳細、8構成要素の表示を確認。CLI追加だけでサービスブロックが増えない。小画面で詳細と縮約ツールバーを確認。
- Command Flow: 5 CLIすべてのentry scriptを選択し、それぞれのCLIがTechnologyとして表示されることを確認。FirebaseではCLIのusesとSuite/Auth Emulatorのstartsを確認。
- Analyzerのブラウザconsole errorは0件。

## 制約・未検証

- 200%拡大は自動操作が反映されず未検証。小画面のスクリーンショットには取得失敗・重複描画があり、全幅の画像による比較は完了していない。上記DOM幅測定と通常幅の画像確認を区別する。
- 3Dカメラの数値比較は未実施。今回は表示・選択・技術詳細を確認した。
- コマンド解析は静的な有限形式。任意のshell展開、CLIの全オプション、全バージョンの挙動を保証しない。Vercel/Supabaseの設定だけからローカル実行環境一式を生成しない。Firebase deployのHosting指定はサービス単位で扱い、hosting:targetの全解決は対象外。
- ローカル実行成功・クラウド通信・デプロイは観測していない。実プロジェクト原本の変更・実行・外部送信、push、本番デプロイは行っていない。
