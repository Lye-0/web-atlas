# タブ10：経路・環境対応・識別表示の仕上げ

2026-09-16。着手HEAD `d7e39d2`、ブランチ「小規模修正３」、着手時clean。依頼添付のF1〜F6をCodex単独で実装・確認した。実プロジェクトは読み取り専用。プロジェクトのコマンド実行、外部送信、push、デプロイは行っていない。

実装・テストのコミット: `327ab0f`。canonical技術文書と既存repository-memoryも更新し、memoryの検証・index再生成を実施した。

## F1〜F6の結果

| 項目 | 確認した原因 | 変更・確認結果 |
| --- | --- | --- |
| F1 配置 | 環境単位で縦に積み、コード・操作・成果物の間に長い空白が生じる | 関係の連結成分・深さ・隣接順位による決定的な配置。2D/3Dとも選択入力から分離。全対象を保持して縦長を削減。全ての辺が短くなる最適化ではない |
| F2 環境との対応 | 論理定義と環境別構成の説明が弱く、空の環境を共通と一括表記 | 論理定義、根拠のある共有入力、明示環境、既定設定、未特定を分離。元の所有IDから構造上の対応線を追加。探索の実行経路の中継から除外 |
| F3 同名使用 | 用途が同じCLIの補足が環境・名前中心 | 所有package/script/上位呼出/ソース箇所を図・検索・相手・詳細に共通表示。同一行などで衝突する場合は全呼出箇所の範囲・引数・設定を補足。完全コマンドのコピー成功を実操作で確認 |
| F4 関係の説明 | 操作線の常時ラベルが多く、通信・設定線の両端と意味を読みづらい | 選択・hover/focusの両端＋意味を共通欄へ表示。2Dのカードに重なる補足を抑制。複数種別の集約を代表一種へ誤要約しない。元の方向・Evidenceの詳細は維持 |
| F5 3Dラベル | 未観測などの定型文が繰り返され、識別情報を圧迫 | 名称・種類・使用文脈を短く表示。重複する補足を抑制。推定、未特定、同一性未確認は保持。既存の優先度・集約・ラベル更新機構を使用 |
| F6 操作対象 | targetPlace未確認を、対応済みの操作対象と混同 | CLI実行場所、具体的な対象、対象環境、DBのlocal/remote指定を分離。production公開は対象APIと設定パスを示し、実行場所のみ未確認と表示 |

論理アプリと実行構成の関係は設定上の対応であり、環境間通信や実行成功を示さない。設定を所有するpackageと、その開発サーバーが実行する論理アプリの同一性も自動的には等置しない。

## 元の記述との照合

vehicle-managementのroot/apps/api/apps/webのpackage.jsonを読み取り、解析結果から期待値を逆算せず以下のscriptを照合した。設定のパスは固定されたマスク済みstoreとも照合した。

- rootのdevからauth/api/web。Firebase emulators:start、Wrangler dev、Vite devの使用文脈を同じキャンバスに表示。
- apps/apiのdev/startはそれぞれdb:migrate:localの後に `&& wrangler dev --env development`。同じラベルでも別script・元コマンドIDなので別使用として保持。呼出関係は成功条件の記述であり、実行結果ではない。
- rootのprodからbuild:production、deploy:production。Vite `--mode production`、Wrangler `--env production`を照合。Vite出力とWrangler assetsの `../web/dist` の対応を保持する。
- `drizzle.config.ts` のschema `../../packages/database/src/schema.ts`、out `./migrations`、Wranglerのmigrations_dirを照合。スキーマ→SQL生成→migration成果物→適用の対応を保持。
- `db:migrate:local` の `--local --env development`、`db:migrate:production` の `--remote --env production` を区別。ローカル指定をCLI自体の実行場所の証明にしない。
- APIの元DBアクセス・HTTP要求・認証要求も同じ図に残す。新しい実行構成に対応する元Evidence・confidenceを維持。動的な接続先は未特定のまま。

git-linesも固定storeと既存の実入力テストで確認。独自nodeスクリプトの内部実行を推論してWrangler/D1経路を作らない。入力にはartifacts配下の既存コピーを含み、ファイルパスの異なる使用は保持する。

独立fixtureでは、共有/未特定/既定設定、devからremote binding、異なるDB ID、成果物パスの一致/不一致、設定のみ/依存のみ、転送引数、同名の別scriptと同じ宣言の異なる呼出範囲、混合関係、構造線を経路の橋にしないことを検証した。表示を整える目的で実体を統合・複製していない。

## 件数と同一性

比較は同じ固定マスク済みstore、同じ補助コード非表示、全環境のルート図。入力sourcesのSHA-256とノードEvidence集合のSHA-256が前後で一致する。元ノードID集合は完全一致、元関係IDの削除0。追加関係は所有・定義と構成の対応のみ。

| 入力 | canonicalノード | canonical関係 | ルート表示ノード | ルート表示線 |
| --- | ---: | ---: | ---: | ---: |
| vehicle-management | 375 → 375 | 15,307 → 15,313 | 59 → 59 | 102 → 108 |
| git-lines | 78 → 78 | 18,213 → 18,215 | 54 → 54 | 34 → 36 |

vehicle-managementの画面の実体52と未特定要求94は、表示ノード59（要求集合を含む）とは別の件数。今回も表示集合を実体数へ足していない。元の関係Evidenceは変更せず、構造線に元の所有・コード/設定のEvidenceを付加した。flow-configuresの意味をstructuralとして明示したが、元ID・端点を保持する。

入力hash: vehicle-management `e11daf1582d7a85ca04444b046e1dddb5ad085a3f91bc6be4bae070523ae8758`、git-lines `93dacb00abbe6c2bddbde119984af47cd91de6c0477826edc1c5f0686ee067e4`。再測定用のopt-inは `WEB_ATLAS_POLISH_REVIEW` と `architecturePolishReview.test.ts`。必要なローカルstoreがない環境では通常suiteからスキップする。

## 配置・性能の比較

修正前はgit archiveした着手HEADのソースで計測し、作業中の製品ソースを巻き戻していない。カメラの倍率ではなく同じ2D座標単位で測る。カード寸法248×108を含む外接範囲。

| 指標 | vehicle-management 前 → 後 | git-lines 前 → 後 |
| --- | ---: | ---: |
| 幅 × 高さ | 2,408×3,980 → 3,856×1,652 | 968×6,302 → 1,464×5,520 |
| 同じ元端点・種別の経路の平均距離 | 1,526 → 996（75組） | 2,320 → 373（28組） |
| うち操作関係の平均距離 | 1,598 → 1,146（46組） | 2,320 → 373（28組） |
| 初回の投影＋配置 | 48.59 → 64.20ms | 40.88 → 65.50ms |
| 選択100回の投影＋2D座標取得 | 0.787 → 0.697ms | 0.497 → 0.542ms |
| semantic解析 | 26.56 → 27.00秒 | 55.48 → 63.81秒 |

距離比較は新しい構造線を除き、前後ともルートに存在する同じ元の端点・関係種別を一組ずつ数えた。ソースに同じ端点の参照が多数ある場合に、その数だけ距離の重みを増やしていない。全表示線の平均はvehicle-management 1,605→970、git-lines 2,068→383だが、これは追加構造線を含み母数が異なる参考値。

全ての経路が短くなったわけではない。例えばproductionの公開操作→API構成は392→381、productionのdist→公開は392→357、migration成果物→local適用は1,619→357。一方、local適用→DBは1,091→1,659、共有APIコード→production公開は1,582→1,962。環境と元の所有関係を保持し、縦長・全体平均を改善した配置であり、全線最短や交差ゼロを保証しない。

初回の配置は追加計算により増加した。選択では準備済み座標/モデルを使う。単回測定で、一部は別の検証と同時実行のため厳密な速度比ではない。選択100回の値は純粋な投影処理であり、DOM描画・入力遅延・FPSを含まない。解析速度やGPU性能が改善したとは断定しない。

ローカル比較画像（git対象外の検証生成物）:

- [前：2D全体Fit](../../.cache/context-polish/before-2d.png) / [後：2D全体Fit](../../.cache/context-polish/after-2d-overview.png)
- [前：操作詳細](../../.cache/context-polish/before-tool.png) / [後：操作詳細](../../.cache/context-polish/after-2d-final.png)
- [前：3D](../../.cache/context-polish/before-3d.png) / [後：3D](../../.cache/context-polish/after-3d-final.png)
- [390px幅の詳細](../../.cache/context-polish/after-narrow.png)

Fitは全体の外形を比較する画像で、全ラベルを同時に読める倍率ではない。既存の意味的ズーム・選択・検索で識別する。画像のカメラだけを引いて改善したという比較にはしていない。

## 実ブラウザと回帰

Chrome Playwright MCP、1600×1000/390×844。Web Atlasのproductionコンポーネント・Workerへマスク済みstoreを渡すローカル検証入口を使用。

- 2Dの別対象選択、詳細を閉じる/開く：scope・全座標・カメラ一致。
- 3Dの通常選択・再クリック：scope・全座標・カメラ一致。最終の奥行き調整後にも再確認。
- 内部を開いた状態で外側APIを選択：内部のscopeと座標・カメラを維持。戻るでprojectへ復帰。
- 2DのHTTP/リソース操作/接続設定の関係をキーボード選択し、両端＋意味を表示。3Dへ切り替えて同じ説明を維持。hover解除、モード離脱後に古い説明を残さない。
- 検索結果の6つのWrangler使用をscript・環境で区別。production公開の詳細で、既知の対象と未確認の実行場所を分けて表示。コマンドのコピー成功メッセージを確認。
- 3Dのドラッグ回転、全画面/通常、囲い・自動省略ON/OFF、2Dへの復帰を確認。復帰後canvas=0、3Dラベル=0、古い関係読取欄=0。
- 390pxでdocumentのclientWidth/scrollWidthが390/390、詳細が363/363。reduced-motion条件も確認。
- Runtime Flow、Function Call Flow、Data Flow、Data Model、Command Flowへの往復を実操作。専用の関係説明の残留なし。全体suiteでも他タブ・選択・階層・集合・カメラの契約を確認。
- 最終ブラウザconsole error=0。全てのモード・集合・入力操作の組合せをGUIで網羅した意味ではない。

## テスト・検証

- 全体 `pnpm test`: **123 files / 1,320 tests成功、6 files / 10 testsスキップ**。スキップは既存・opt-inの重い実入力等。成功件数に含めない。
- 全体実行後の最後の環境表示/奥行き/詳細メモ化に対する重点回帰: **7 files / 44 tests成功**。上記との重複を合算しない。
- `pnpm build` / `pnpm typecheck` / `pnpm lint` / `git diff --check`: 成功。
- build/testの一度目はサンドボックス内のesbuild設定読み取りでAccess denied。許可された通常権限のローカル実行で成功した。コードの失敗や未実施として隠していない。
- buildのtree-sitter eval/fs/path外部化・大きなchunk警告、3Dのjsdomテストの未認識tag警告は残る。今回新しい実行時例外は確認していない。
- 旧テストの「相手2つ」固定値は、元の非構造関係2つを維持することと新しいstructuralな対応線を別に検証するよう修正。

## 残る範囲

- **対象外**: 個々の2D線の回り込み、自動省略方式、全関係線の粒子量の再設計。
- **未対応**: 任意shell/動的設定/全CLIサブコマンド/独自buildスクリプト内部など、従来の静的解析の対応外。今回のF1〜F6で解析対象を実行して補完していない。
- **未特定**: 動的接続先、安定IDを確認できない同一性、根拠のない環境帰属。既存の未特定要求とEvidenceを維持。
- **未観測**: 起動/生成/公開/DB適用の成功、CLIの実際の実行場所、実際の通信とクラウド稼働。
- **未検証**: 長時間heap/GPU/FPS、200%拡大、全実プロジェクトの全GUI操作、各集合の全件取り出し組合せ、モバイル実機。添付本文で参照された動画ファイルは利用可能なDownloadsに見つからず、動画を見たとは扱っていない。
- **配置の限界**: 一部の元経路は長くなる。全体Fitでは既存の表示省略が働き、全名称を同時に読むには拡大が必要。未観測の実行経路を加えたり実体を統合して解消しない。
