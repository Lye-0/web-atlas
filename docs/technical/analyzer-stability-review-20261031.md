# Analyzer安定性修正の検証（2026-10-31）

対象は静的レビューの1〜7。ブランチは`安定性向上`。解析入力のスクリプト・設定コードは実行せず、外部送信、push、デプロイも行っていない。

## 修正対応

| 指摘 | 修正 | 確認 |
| --- | --- | --- |
| 1 読み込み競合 | Pickerの要求世代を導入。unmountで無効化し、列挙・scan・error/finallyの結果反映を照合 | 別mountの完了順逆転、同一mountの旧失敗、native picker遅延とキャンセル |
| 2 短絡・三項 | 独立した枝の状態を合流。&&/\|\|/??と各代入形を処理 | スキップ時の前値、三項両側の代入、conditional/inferred、全枝上書き時の旧値除外 |
| 3 プロパティの枝間漏洩 | 変数とプロパティ履歴を同時snapshot/restore。現在枝の書込みは前値を置換 | else読みにthenの書込みを接続しない、分岐後は両側の書込みを保持、nested分岐 |
| 4 UI同期準備 | UIからはserializable scan dataを送り、command catalogueをWorker内で展開。全rootで探索・Evidence索引を共有 | 単独entry投影の和集合とのID/target/call/Evidence照合、eager/deferredモデル一致、同期送信失敗後retry |
| 5 線の重複確認 | templateごとのedge ID Setへ変更 | 2000変数の直列関数で7000本超の線とID一意性、既存Data Flowテスト |
| 6 ファイル引数上限 | 子配列をpushへ引数展開せず、共有配列へ追加 | 160000子ファイルと親ファイルの順序・件数。build/compile_commands.json例外も保持 |
| 7 深いグラフ | Tarjan DFSを明示的なframe stackへ変更 | 50000ノード直列、循環・自己辺・diamond・非連結・欠落端点 |

入力例ではPython仮想環境配下が大量に含まれていたため、`.venv`/`venv`と標準的なPythonキャッシュをフォルダーAPI・directory upload双方から除外した。プロジェクト名による特別扱いはなく、通常のPython/C/C++ソースは維持する。

## 指定された実入力

`transformer-observatory`を読み取り専用で解析。標準除外のみの列挙は46753ファイルで、backend配下の仮想環境等が含まれていた。これは修正前ブラウザー障害の完全再現や唯一の原因の確定ではなく、静的調査で確認した負荷要因である。

修正後は19741ファイル列挙、239ファイル読み取り、構文解析対象42ファイル。依存環境のコードを解析していないことを確認。最終計測の一例は列挙861ms、scan3505ms、UI側入力準備1.3ms、semantic解析1978ms。Nodeテスト環境で他の回帰テストと並行した単回値であり、ブラウザーの表示時間ではない。

| View | ノード | 線 |
| --- | ---: | ---: |
| Runtime Flow | 706 | 727 |
| Function Call Flow | 2969 | 4970 |
| Data Flow | 26069 | 28771 |
| Data Model | 42 | 20 |
| Architecture Map（ルート投影） | 9 | 9 |

全ViewのノードID一意性と線端点の整合、Architectureの2D座標が有限であることを確認。実入力は変更せず、Git差分もない。未解決呼出し等は既存の静的解析の限界を保持し、解析成功を全対応付けの解決とは扱わない。

再確認は`WEB_ATLAS_STABILITY_REVIEW_ROOT`を入力ルートへ設定し、`pnpm exec vitest run src/analyzer/semantic/stabilityActual.test.ts`。テストは対象内でmkdir/write/実行を行わず、結果の件数だけをWeb Atlas側の無視対象`.cache/stability-review/actual.json`へ保存する。

## 性能比較

501scripts/11006Evidenceの合成入力で、scriptごとの繰り返し投影412ms、全コマンドカタログ収集23ms（単回計測）。前者は従来の準備工程の中心部分、後者は新しいArchitectureCommand収集全体。UI全体の速度改善率を示す数値ではない。結果が失われていないことは別の正確性テストで照合する。`WEB_ATLAS_STABILITY_BENCH=1`で`architectureCommands.test.ts`の比較ケースを有効化できる。

## 回帰結果と限界

- 最終の通常テスト：149ファイル成功、17ファイルskip。1527テスト成功、32skip（明示入力等が必要なopt-inケース）。
- 実入力テストは別途有効化して成功。コマンド比較も別途有効化して成功。
- typecheck / lint / production build / git diff --check：成功。
- ビルドにはTree-sitter由来のfs/path外部化・eval、および大きいchunkの警告が残る。
- 既存の選択・scope・カメラ・2D/3D・他Viewの回帰テストは通常スイートで成功。今回は実ブラウザーやGPU操作、native folder許可ダイアログを手操作で検証していない。
- 全入力のメモリ上限保証、任意の制御フロー・heap alias解決、描画アルゴリズム全体の再設計は実施していない。
