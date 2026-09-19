# ローカル開発CLI — Playwright MCP検証

2026-09-16、Chrome用Playwright MCPで実施。対象実装: `2d099a2`。アプリケーションコードは変更していない。

## 結果

今回の確認範囲で、追加した5 CLIに機能不具合は再現しなかった。200%ブラウザ拡大と3Dカメラの数値比較は未検証。全体の合格と未検証を混同しない。

| 項目 | 結果・根拠 |
| --- | --- |
| Dictionary Map | 53分類・147技術。新カテゴリと5 CLIが各1件表示。desktop/narrow用の非表示DOMは表示件数に含めない |
| 詳細・関連 | カテゴリから5 CLIすべてへクリックで遷移し、見出し・6説明セクション・カテゴリリンクを確認。ブラウザの戻るでカテゴリへ復帰 |
| 検索 | wrangler / vercel / netlify-cli / firebase-tools / supabase / Netlify Devを確認。パッケージ名・別名の一致表示が正しい。firebase-toolsからEnterでFirebase CLIへ移動、Escapeで候補を閉じる |
| Stacks絞り込み | 「開発と配信」で31件、5 CLIを含む。メニュー外の見出しをクリックすると閉じる |
| Map幅 | viewport実測360 /390 /768 /1024 /1440px。client幅とscroll幅はそれぞれ350 /380 /758 /1014 /1430pxで一致し、横はみ出しなし |
| Mapの画像 | 全5幅を取得。360px・1440px画像を目視確認し、5 CLIの文字・線・余白に重複なし。リンク幅は約85〜118pxで、行全体には広がらない |
| 通常の解析入口 | productionのdirectory file inputへ16ファイルの合成fixtureを選択。16 files /53 facts /53 evidence。アプリ状態を直接注入せず解析 |
| Stack Map | 5 CLIが独立したStackとして表示される |
| Command Flow | 5 entry scriptすべてで対応するCLI Technologyを確認。Firebase CLI・Auth Emulator・Emulator Suiteは別対象 |
| Architecture | 8構成要素・2表示線。CLIだけを理由にサービスブロックを追加しない。Wranglerは開発支援欄に表示され、Dictionaryリンクあり |
| 2D選択 | 通常選択前後でscope=project、8ノードのID・translate、カメラX/Y/scaleが一致。測定例: X=330.1151539160281、Y=385.70847554109537、scale=1.0163994905899982 |
| 2D線hover | 未選択の曲線上へ実マウスを移動。全ノードのopacity・座標・カメラ情報が不変 |
| 2D/3D内部移動 | local-workerを単クリックすると選択、ダブルクリックするとwrangler/package.jsonのscopeへ移動。「プロジェクトへ」で復帰 |
| 3D表示 | canvasとラベル、選択詳細、Wranglerへのリンクを確認。スクリーンショットを目視確認 |
| 全画面・小画面 | 3Dでdocument.fullscreenElementを確認、Escapeで解除。390px時にclient/scroll幅380pxで横はみ出しなし |
| 他タブの基本回帰 | Workspace Flow / Package Dependency / Module Dependency / Runtime Flow / Function Call Flow / Data Flow / Data Modelへ遷移し、見出しとalert無しを確認。全操作を網羅した意味ではない |

## 誤検出防止

別の3ファイルfixtureを通常入力から読み込み、Command Flowで次を確認した。

| コマンド | CLIへの線 | 実行環境への線 |
| --- | --- | --- |
| wrangler dev | uses | Cloudflare Workersへstarts |
| wrangler dev --remote | uses | Cloudflare Workersへstarts |
| wrangler deploy | uses | Cloudflare Workersへuses |
| wrangler dev --help | uses | なし |
| wrangler dev --config $FILE | uses | なし |
| wrangler dev --config missing.jsonc | uses | なし |

依存宣言のみ、同名PyPI SDK、別workspaceの明示config、設定だけからCLIを推定しないケースは既存自動テストで再確認した。これら全ケースのブラウザ再実行までは行っていない。

`pnpm exec vitest run src/analyzer/localDevelopmentCli.test.ts src/components/analyzer/architectureSummary.test.tsx`: 22件成功・失敗0。コード変更がないため全体suiteは再実行していない。

## Playwright MCPの確認と制約

- ページ移動、snapshot、入力、Enter/Escape、クリック、ダブルクリック、戻る、select、viewport設定、画像保存、DOM測定、console/network取得、directory inputへのファイル選択が動作した。
- MCP run_codeでPlaywrightのsetInputFilesを使用。専用browser_file_uploadツールやOSのshowDirectoryPickerダイアログの操作は未検証。
- 曖昧なheader指定はstrict modeエラーとなる。一意な対象に修正して成功。
- カテゴリのリンクには説明も含まれるため、名称完全一致だけでは見つからない。確認済みhrefへ指定を直して成功。
- 3Dのaccessible nameは選択後に補足情報が加わる。古い完全一致指定はタイムアウトするが、新しいsnapshot参照を取得するとダブルクリックが成功。
- SVG曲線の通常hoverは、外接矩形の中心が曲線上にないためタイムアウトした。getPointAtLengthとgetScreenCTMで曲線上の点を求め、実マウスを移動して検証した。イベントの直接dispatchで代用していない。
- ページの遅延描画には対象のwaitForを使用。操作直後のcanvas数0だけで描画失敗と判定しない。
- 200%拡大: Control++ / Control+=はviewportとdevicePixelRatioを変えなかった。CSS zoomやpage scaleで代用せず未検証とした。
- 3Dカメラ座標・行列の数値比較は未実施。2Dのdata-camera属性を3Dの測定結果として流用しない。

## エラー・残件

- console errorは `/favicon.ico` の404が1件。今回追加したCLI機能の例外は検出されなかった。
- 取得した非静的network一覧はローカルWASMの200応答。実プロジェクトを使わず、CLI起動・クラウドアクセス・push・デプロイは実行していない。
- 検索クリアボタンのクリックとショートカット表示の重なり、全タブの線hover、3Dカメラ数値、200%拡大は今回の残りの確認項目。クリアは入力値を空にする操作まで確認した。
- MCP専用ツールすべての適合性試験ではなく、今回のアプリ検証に必要な操作の試験である。

画像: `.cache/cli-map-{360,390,768,1024,1440}.png`、`.cache/cli-architecture-3d.png`、`.cache/cli-3d-mobile.png`。合成入力: `.cache/cli-mcp-fixture`、`.cache/cli-mcp-edgecases`。これらはローカルの一時検証資料。
