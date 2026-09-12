# タブ1〜5の3D実装・検証レポート

追記：この初回検証では、Scope等の選択時の実描画色と、Cとの操作欄・線・矢印の同一性の確認が不足していた。以下の結果だけで表示の統一を満たしたとは判断できない。指摘後の修正と追加検証は[描画・操作欄の修正検証](analyzer-3d-unification-review.md)を参照。

2026-09-11。サブエージェントを使わず、実装・実ブラウザ操作・照合・性能測定・再修正を実施した。機能と状態の境界は[技術仕様](analyzer-tabs-1-5-3d.md)、集計元は[検証metrics](../../reports/tabs-1-5-3d-20260911/metrics.json)を参照。

## 1. 対象版と変更範囲

基準HEADは `502194f8d67b8101f8ab9c6f3051bcad5139a116`、ブランチは `小規模修正２`。着手時はclean。実装は作業ツリー上で、コミット・push・本番デプロイはしていない。以前の調査HEADへ戻していない。依存追加・lockfile再生成はない。

追加は3D契約／決定的配置、共通3D stage、renderer初期化失敗アダプター、テスト。変更はAnalyzerPage、加算的Session、3D時の原文・圧縮Directory詳細、共通操作領域の測定、Bの利用不可時UI。2Dの配置・routing・import解析は変更していない。

## 2. タブ別の完成状況

| タブ | 2D | 3D | 主な操作・状態 |
|---|---|---|---|
| 1 Stack Map | 維持 | Scope包含と小型技術パネル | Scope／Usage選択、Evidence、Dictionary、mode別camera |
| 2 Workspace Flow | 維持 | 設定→pattern→packageの立体パネルフロー | 0一致・複数一致、同じpackageへの複数関係、詳細・Focus |
| 3 Command Flow | 維持 | rank／laneに沿う立体コマンドフロー | entry・branch共有、summary owner、原文コピー、無効選択解除 |
| 4 Package Dependency | 維持 | 内部・Technology・外部すべてを点で表示 | 全直接依存対象、表示内訳、手動開閉分離、自動省略ON／OFF |
| 5 Module Dependency | 固定地図を維持 | 独立XYZ packing＋階層の囲い | File／Region／import選択、手動開閉分離、元File座標保全 |

5タブの切り替え・選択・詳細・カメラ操作を実装し、両実入力で確認した。検証範囲内に動作を阻害する未解決不具合は確認していない。狭幅・大きなフローの読み方と未検証環境は§10に記載する。

## 3. 実装境界と再利用

`graph3D.ts` は元のNode／Region／edgeを保持する描画契約と、View固有の配置を提供する。`AnalyzerGraph3DStage` は正投影camera／OrbitControls、point batch、wire、screen-facingパネルと投影線を担当する。分析結果をSemanticGraphへ置き換えず、タブ1〜5用semantic Workerを追加しない。

既存のautoAggregation、表示安定化、原関係projection、AutoAggregationPanel、SpatialFlowParticles、SpatialParticleControl、useSpatialFlowMotion、useDisposableFrame、Canvas解放、fullscreen、検索結果行を再利用した。粒子OFF・非表示時は描画更新を止め、包含の構造線は静止させる。直接関係が多い場合は優先ラベルと詳細一覧を使う。

## 4. タブ4・5の立体配置

タブ4は2DのExternal閉鎖結果を入力にせず、内部package・Technology・外部packageの元対象を一つずつ配置する。外部summary／bundleは実体数へ混ぜず、共有外部依存も複製しない。元の宣言edgeと複数versionRange／dependencyTypeはそのまま詳細へ戻れる。

タブ5は2D座標を参照しない再帰的box packing。親直下Fileと子Directoryを親領域へ詰め、XYZの厚みを持たせる。全元File座標は選択・回転・filter・表示ownerの変更前に確保する。独立fixtureで三軸の広がり、親子包含、兄弟box非重複、IDの一意性を検証した。圧縮chain内の中間Directoryは、元Fact ID・完全なパス・親IDを3D詳細欄から確認できる。

## 5. 状態復元と2D保全

検索・filter・元Node／Region／edge選択・詳細開閉・Command entry／branchを共有する。2Dのcamera／手動状態を上書きせず、3D cameraと3D手動開閉を別保存する。旧Sessionには3D値を要求しない。3D cameraはschema・View・入力キーを検証し、再訪時に復元する。

両入力の全5タブで、2D→3D→回転／pan／zoom→2D→3Dを操作し、選択、2D camera、3D camera、2D手動状態の保持を確認した。A型の2Dカード・Scope座標が同じことを確認。B型は専用の確認も行い、File／Directory／線の50要素・54要素を往復前後で照合して一致した。3DでのDirectory選択が2D手動状態を開かないことも確認した。

tab4/5は3D手動閉鎖→自動省略OFF→mode往復で、手動集合を維持し自動集合だけが解除される。大量入力→別Project→空入力ではmodeが初期2Dへ戻り、旧3Dラベル・Canvas・旧Fileが残らない。全5タブの全画面／解除でも選択とcameraを保持した。

## 6. 画像と再現操作

各画像は1440×1100のEdgeで代表対象を選択し、元Evidenceまたは詳細へ接続した状態。

| タブ | git-lines | vehicle-management |
|---|---|---|
| 1 Stack Map | [2D](../../reports/tabs-1-5-3d-20260911/git-lines-architecture-2d-selected.png) / [3D](../../reports/tabs-1-5-3d-20260911/git-lines-architecture-3d-selected.png) | [2D](../../reports/tabs-1-5-3d-20260911/vehicle-management-architecture-2d-selected.png) / [3D](../../reports/tabs-1-5-3d-20260911/vehicle-management-architecture-3d-selected.png) |
| 2 Workspace Flow | [2D](../../reports/tabs-1-5-3d-20260911/git-lines-workspace-2d-selected.png) / [3D](../../reports/tabs-1-5-3d-20260911/git-lines-workspace-3d-selected.png) | [2D](../../reports/tabs-1-5-3d-20260911/vehicle-management-workspace-2d-selected.png) / [3D](../../reports/tabs-1-5-3d-20260911/vehicle-management-workspace-3d-selected.png) |
| 3 Command Flow | [2D](../../reports/tabs-1-5-3d-20260911/git-lines-command-2d-selected.png) / [3D](../../reports/tabs-1-5-3d-20260911/git-lines-command-3d-selected.png) | [2D](../../reports/tabs-1-5-3d-20260911/vehicle-management-command-2d-selected.png) / [3D](../../reports/tabs-1-5-3d-20260911/vehicle-management-command-3d-selected.png) |
| 4 Package Dependency | [2D](../../reports/tabs-1-5-3d-20260911/git-lines-dependencies-2d-selected.png) / [3D](../../reports/tabs-1-5-3d-20260911/git-lines-dependencies-3d-selected.png) | [2D](../../reports/tabs-1-5-3d-20260911/vehicle-management-dependencies-2d-selected.png) / [3D](../../reports/tabs-1-5-3d-20260911/vehicle-management-dependencies-3d-selected.png) |
| 5 Module Dependency | [2D](../../reports/tabs-1-5-3d-20260911/git-lines-module-dependency-2d-selected.png) / [3D](../../reports/tabs-1-5-3d-20260911/git-lines-module-dependency-3d-selected.png) | [2D](../../reports/tabs-1-5-3d-20260911/vehicle-management-module-dependency-2d-selected.png) / [3D](../../reports/tabs-1-5-3d-20260911/vehicle-management-module-dependency-3d-selected.png) |

1. ローカル入力を読み込み、2Dで検索結果から対象を選ぶ。
2. 3Dへ切り替え、同じ対象・Evidenceを確認する。通常クリックではcameraは移動しない。
3. 回転・ズーム後に2Dへ戻り、再び3Dへ戻る。各modeのcameraが別々に復元される。
4. tab4/5の「所属の開閉」で手動閉鎖し、自動省略OFFとmode往復を行う。
5. Commandのsummaryを選び右詳細のExpandで枝を開く。別entryへ切り替え、原文コピーと無効選択解除を確認する。
6. Moduleの「領域詳細」から深いDirectoryへ進み、圧縮chain内の元Directoryを確認する。

狭幅例：[390px Command](../../reports/tabs-1-5-3d-20260911/narrow-390-command.png)、[390px Module](../../reports/tabs-1-5-3d-20260911/narrow-390-module-dependency.png)、[1024px Stack](../../reports/tabs-1-5-3d-20260911/narrow-1024-architecture.png)。[1200 FileのOFF表示](../../reports/tabs-1-5-3d-20260911/large-1200-off.png)、[WebGL利用不可](../../reports/tabs-1-5-3d-20260911/webgl-failure.png)も保存した。操作録画は作成していない。

## 7. 入力・データ照合

前回調査で保存した、資格情報値をマスク済みの読み取り専用スナップショットを使用した。原本のアプリ・script・migrationを実行していない。

| 入力 | 入力HEAD | 採用ファイル | 原本追跡ファイルの確認 |
|---|---|---:|---|
| git-lines | 8178ad742b45768e779b413b9d995e1e4d9c4041 | 116 | 149ファイルのhash一致・HEAD一致・clean |
| vehicle-management | 8211ee8145425ef85b7cf1156a55cd0adf0db088 | 214 | 345ファイルのhash一致・HEAD一致・clean |

| View | git-linesの元対象／関係 | vehicle-managementの元対象／関係 |
|---|---|---|
| Stack | 7／3、Region 3 | 16／5、Region 6 |
| Workspace | 3／2 | 10／9 |
| Command初期entry | 9／8 | 23実体＋3表示summary／25 |
| Dependency | 13／12 | 26／28 |
| Module | 111 File／329 import、Region 18 | 131 File／366 import、Region 22 |

件数は現行projectorの結果であり、旧REPORTの概数へ合わせて対象を削っていない。全10入力×ViewケースでFact／Relation／Evidenceのシリアライズ内容と3D座標のhashが操作前後で一致した。独立fixtureでは0一致・二つのpatternから同じpackageへの一致、共有外部packageの3宣言と3versionRange、深いDirectory、跨るimport、手動ownerの完全な分割、選択両端保護を確認した。

Commandの原文コピーは、引用符・空白・`&&`を含む57文字の独立期待値と一致した。原本のコマンド実行を行う操作は実装していない。

## 8. 性能・端点・解放・失敗

Windows／Edge headless、1440×1100、同一入力vehicle-managementで比較。操作時間はPlaywright操作開始から対象表示までの経過時間を含み、renderer内部のCPU時間だけではない。短い単発測定であり、GPU描画FPSの保証ではない。

| View | 2D選択：追加前／後 | 選択中RAF間隔p95：前／後 | 2Dで新3D chunkを取得 |
|---|---|---|---:|
| 1 Stack Map | 167 / 140 ms | 16.8 / 16.8 ms | 0 |
| 2 Workspace Flow | 182 / 166 ms | 16.8 / 16.8 ms | 0 |
| 3 Command Flow | 483 / 483 ms | 16.8 / 16.8 ms | 0 |
| 4 Package Dependency | 1073 / 1067 ms | 16.8 / 16.8 ms | 0 |
| 5 Module Dependency | 217 / 183 ms | 16.8 / 16.8 ms | 0 |

| View | 3D初回の対象表示 | 再訪の対象表示 | RAF間隔p95：ON／OFF |
|---|---:|---:|---|
| 1 Stack Map | 818 ms | 113 ms | 16.8 / 16.8 ms |
| 2 Workspace Flow | 851 ms | 127 ms | 16.8 / 16.8 ms |
| 3 Command Flow | 432 ms | 115 ms | 16.8 / 16.8 ms |
| 4 Package Dependency | 530 ms | 227 ms | 16.8 / 16.8 ms |
| 5 Module Dependency | 818 ms | 252 ms | 16.9 / 16.8 ms |

1200 FileではONが30組・1200対象、OFFが1200個別点・自動集合0。ラベルは全点のDOM化を避け、点のbatch描画とhit判定を維持した。OFFで1200点を表示した状態の回転も計測した。

独立した投影計算で、Workspaceの線端点はFit・回転・近距離でパネル外周から約2px、Moduleの個別import端点は元File投影座標との差0pxだった。線・矢印と共通particle pathは同じ確定経路を使う。

20往復後、退出した新3D Canvas・ラベルは毎回0。Moduleの2D Canvas 1件は正しく残る。選択して粒子を動かした3Dではgeometry 3、texture 1、program 3から、退出後すべて0へ戻った。OFFとdocument非表示でWebGL render frame番号が増えないことも確認した。

40往復のGC後JS heapは約11.5MB→13.9MB。最初の10往復後は約13.4MB、そこから40往復までは約0.5MB増加した。GPU資産とCanvasの解放は確認済みだが、この短期観測だけでJS heap全体の長時間挙動を断定しない。

context lossからの2D復帰と明示再試行、lazy chunk読込失敗からの2D復帰、WebGL全体利用不可時の説明・検索・再試行を確認。さらにWebGL失敗を6回繰り返し、各回のR3F登録root数0・Canvas数0・未捕捉例外0を確認した。

## 9. テストとビルド

- 基準：706 testsのうち692成功、6失敗、8skip。6失敗はDataExplorerPageテストの装飾Canvas／matchMedia環境不足だった。
- 当該テストへ他ページと同じEmptyOrbit mockを追加。製品の2D描画は変更せず、テストを削除・skip化していない。
- 完成版：709成功、8skip、失敗0。86 files中82成功・4skip。外部入力等の既存optional skipは維持。
- typecheck、lint、通常build、git diff checkが成功。既存の大きなchunk警告は残る。
- Wrangler 4.127.0の`deploy --dry-run --outdir ...`が成功。アップロード・本番公開はしていない。[dry-runの公式定義](https://developers.cloudflare.com/workers/wrangler/commands/workers/)。

## 10. 他タブと残る制約

タブ6〜10の全5Viewで3D選択、ON／OFF、囲い、Fit／Focus、回転、2D往復を実操作し、選択保持・旧3D Canvas除去・例外0を確認した。Stack詳細からDictionaryへ移動して戻る操作でも、選択・3D camera・scanVersionが保持された。

未検証・制約：物理タッチ端末、Safari／Firefox、長時間連続利用、1200 Fileを大幅に超える入力は未実測。390pxや長いコマンドフローを全体Fitしたときはパネル幅が狭くなり名称が省略されるため、Zoom／Focus・検索・右詳細を併用する。画面外・省略されたラベルは元データから削除せず、関係一覧で確認できる。

WebGL失敗処理はR3F 9.7の初期化／unmount順序に合わせた小さなアダプターを持つため、R3F更新時は正常生成と失敗root解放を再検証する。テスト記録は機能操作・元データ照合・実測を分けて保存した。
