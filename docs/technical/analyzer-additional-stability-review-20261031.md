# Analyzer追加6件の修正と検証（2026-10-31）

ブランチ`安定性向上`。先行7件の修正を維持した追加作業。検証用テストを先に追加し、5ファイルで21ケースの修正前失敗を確認してから修正した。

## 対応

| 項目 | 修正 | 回帰確認 |
| --- | --- | --- |
| 1 import解決の反復計算 | Module resolverのfile Setを入力単位で共有。Data Compilerのfrom/specifier索引を作成 | 400ファイル・800参照のpathアクセス数に上限を設定。300 supplied importsは従来45150回のfromアクセスで失敗していた上限3000回の検証を通過。重複keyは最初の対応を保持 |
| 2 baseUrlと設定範囲 | configDirectoryと参照基準basePathを分離 | src外のtests、nested設定、共有baseUrlが設定範囲を拡張しない負例 |
| 3 ++ / -- | 更新操作→代入→後続read。後置式は前値、前置式は更新値 | 全4形、代入式としての結果、条件付きproperty更新、receiverの一度評価 |
| 4 require/importメソッド | 前の有効tokenがdotならmodule keyword扱いしない | 空白・コメント・optional access、通常のmodule参照の正例、実scanで偽React/Vue使用が生成されない |
| 5 多段引数転送 | 不変の宣言から呼出別copyを作り、queueで末端へ伝播。calls/argvと並列子の参照を独立化 | production/stagingの兄弟分離、元scriptの保持、複数shell commandの最後だけへ引数追加、循環・動的引数・展開上限、Architectureの実環境反映 |
| 6 concurrently option | argvで値付きoptionを除外してから子コマンド抽出 | --names/-n、prefix/color/length、=形式、内側quote、bare command、未知optionと元範囲 |

元データを変更して見た目だけ整える処理は追加していない。通常の選択、scope、配置、カメラの処理は変更していない。

## 検証結果

- 通常スイート：151ファイル成功、17ファイルskip。1556テスト成功、32skip。
- typecheck、lint、本番build、git diff --check：成功。
- Tree-sitter由来のfs/path外部化・evalと大きいchunkのビルド警告は残る。
- 修正済み7件の回帰、Command Flow、Architecture、2D/3D、各Viewの既存テストも通常スイートで成功。

## 実入力

`WEB_ATLAS_STABILITY_REVIEW_ROOT`で`transformer-observatory`を読み取り専用で解析し、5Viewの生成、ID一意性、線端点、Architecture 2D座標の有限性を確認。19741ファイル列挙、239ファイル読み取り。原本の変更・実行・外部送信はなく、入力側Git差分もない。

| View | ノード | 線 |
| --- | ---: | ---: |
| Runtime Flow | 706 | 727 |
| Function Call Flow | 2969 | 4970 |
| Data Flow | 26091 | 28796 |
| Data Model | 42 | 20 |
| Architecture Mapルート | 9 | 9 |

先行検証よりData Flowは22ノード・25線増加。今回追加した更新式の代入と呼出別の値経路が含まれる。他Viewの上記件数は維持した。個別の全元ID差分を実入力上で網羅比較したという意味ではない。

## 実ブラウザー

既存のEdgeをPlaywrightでheadless起動。Web Atlas自身の開発サーバーと合成入力だけを使用し、localhost以外の通信を遮断。ブラウザー内で実際のWorkerを起動して解析し、84ノード・62線、Architecture17対象を取得した。

- baseUrl外のtestファイルから`src/counter.ts`へaliasを解決。
- 独自requireメソッドからVue使用が生成されない。
- 更新式の代入が定義と呼出別contextに存在。
- 多段転送したproduction/stagingが実際のbuild操作へ反映。
- 2D単クリックで選択し、scopeはprojectを維持。
- 3D canvasを生成して2Dへ戻り、同じ選択・scopeを復元。
- pageerrorは0件。2D/3Dのスクリーンショットも確認。

ローカル結果は無視対象の`.cache/stability-review/browser.json`と`after-2d.png`/`after-3d.png`。ブラウザーharnessも同directoryにある。手動のpan/zoom、GPUの端末別負荷、native folder permissionダイアログ、production Workerの配信経路はこのsmokeでは確認していない。buildと開発Workerの検証を区別する。

## 残る範囲

Module解析は既存の字句ベースであり、任意の名前束縛や全tsconfig継承・動的shellを解くものではない。引数転送の循環・動的値・深さ32・追加context10000個は明示的な警告で止める。全データサイズ・すべての環境の速度やメモリ使用量を保証する検証ではない。push・デプロイは行っていない。
