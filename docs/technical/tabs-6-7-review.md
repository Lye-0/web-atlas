# Runtime Flow / Function Call Flow 改善・検証報告

2026-09-06。タブ6・7の実装と差し戻し修正を行い、対象内で確認した不具合を再検証した。正確性レビューはPASS。操作性は下記の実施範囲を受け入れ、実行データのファイル受渡しなどの未検証項目を残す。全必須項目を無条件にPASSとはしていない。

## 担当と最終コード

| 担当 | 実際の実行単位 | モデル・設定 | 担当範囲 |
| --- | --- | --- | --- |
| 実装 | `/root/implementation` | gpt-6-astra / xhigh | 製品コード、回帰テスト、技術文書 |
| 操作性・視認性 | `/root/ux_review` | gpt-6-astra / max | 独立した実ブラウザ操作、画像、幅・時間計測 |
| 正確性 | `/root/correctness_review` | gpt-6-astra / max | 原本から先に固定した期待値、解析・反例・実UI/Evidence照合 |
| 親 | `/root` | 統括 | 要件・境界判断、差し戻し、版の固定、代表操作、全体チェック、統合 |

開始ブランチは `タブ６以降の作成`、開始HEADは `2198be343bc93ce25f5805bd1c5b37747a22e031`、開始時の作業ツリーはclean。製品の書き手を実装担当に限定し、レビュー担当は専用の検証資料とfixtureを作成した。

最終製品コードは **cp-006**。未追跡の新規ファイルも含む144個のsrcファイルを固定し、親・独立検証コピー・作業ツリーのhash/サイズ一致を確認した。src manifestの集約SHA256は `6702912369077898f412a023fde50628ee3b4d7a18a61cb8dc67e0b4e5d02c90`。ローカルコミットは本報告とともに作成し、ハッシュは引き渡し時の応答に記載する。

## 変更した動作

- タブ5〜7の見出し、検索、結果帯を共有。タブ6・7の常設OBJECTS一覧を外し、検索・グラフ・関係詳細から対象へ移動する構成にした。
- 検索結果は高さ86pxの1行横スクロール。全候補を保持して仮想表示し、狭幅ではカードとフォーカス枠を結果欄に収める。Home/End/矢印/Enterで先頭・中間・末尾へ到達する。
- 名前・定義パス・所属等の許可フィールドを検索し、複数語をANDで扱う。入力は候補と強調を更新し、明示的な選択でフォーカスする。検索解除で選択とカメラを消さない。
- 分類2Dと一覧3Dを同じ意味データから生成。表示上の集約でも元対象・関係ID・種類・確度・Evidenceを保持する。カメラはViewと表示モードごとに保存する。
- 出る関係を青、入る関係を琥珀色に統一。粒子の通常・控えめ・オフを設け、オフでも矢印と関係文言を残す。往復・自己参照・異なる種類を保持し、多数辺の曲がり幅とFitを修正した。
- 不明なreceiverの同名関数への誤接続、字句scope/クラス文脈、名前付きcallback、登録元→イベント入口、Runtime分岐・合流の来歴欠落、schemaの根拠終端行、実行記録の元時刻を修正した。
- モデルのFieldsと他Viewへの文脈移動を維持。フィルター解除では文脈制限と補助定義も初期状態に戻し、検索・選択・カメラを保持する。

## 要件ごとの受け入れ

PASSは実施して期待値と一致した範囲。BLOCKEDは操作環境の制約、NOT_RUNは未実施を示す。補足の制約はこの表のPASSへ代入しない。

| 要件 | 実装・検証結果 | 親判定 |
| --- | --- | --- |
| UI-01 共通枠 | 5/6/7で見出し・タブ・検索・結果帯・グラフの順序と位置を実測 | PASS |
| UI-02 左一覧の廃止 | 6/7の一覧なし。検索、関係、選択後の詳細へ到達 | PASS |
| UI-03 固有機能維持 | フィルター、設定、近傍、再解析等は実操作。Traceファイル受渡しは下記制約 | 一部BLOCKED |
| SR-01 固定高・1行 | 3View×空/1件/多数/0件/消去でグラフ上端差0.001px未満 | PASS |
| SR-02 検索対象・順位・全件到達 | 独立検索17判定、10,000件回帰、3Viewの末尾・中間・狭幅・resize focus | PASS（実OS IMEは別枠） |
| SR-03 入力・選択・絞り込みの分離 | 入力で自動選択しない。解除後も選択・camera保持。文脈制限解除も再検証 | PASS |
| SR-04 安定したグラフ | 検索だけでは対象集合・配置・cameraを変更しない | PASS |
| MD-01 分類2D・一覧3D | 実2入力×2Viewの同一関係・根拠、集約前後のID/来歴を照合 | PASS |
| MD-02 状態共有・モード別camera | 検索/選択/根拠保持、2D/3Dの個別camera往復を実測 | PASS |
| ED-01 入る・出る方向 | 色、矢印、関係文言、往復・自己参照・同pairの別kindを確認 | PASS |
| ED-02 粒子3設定 | 通常/控えめ/オフ、実画像で進行方向確認。真の非表示タブは未検証 | 一部BLOCKED |
| DT-01 意味・Evidence・集約 | 57代表関係、26反例、81,714 Evidence範囲、実UI57関係を照合 | PASS（下記の解析範囲内） |
| RG-01 既存回帰 | Dictionary、実URL/履歴、View8〜10、再解析、330 tests等。補足の未実施項目あり | 実施範囲PASS |

## 差し戻しと指摘者による再検証

| 指摘 | 内容 | 修正・閉じ方 |
| --- | --- | --- |
| UX-001〜005 | 共通枠、検索帯、検索による再配置、3D、方向操作 | cp-001で実装。最終版までの同一hash監査と実操作で受け入れ |
| UX-006 | 仮想結果帯が縮みEndでfocus喪失 | cp-002修正。UXが末尾・中間・手動scroll後のTabを再検証 |
| UX-007 | 多数の同pair辺が画面外へ膨らむ | cp-002修正。cp-006の2node/130辺fixtureで130/130辺がFit内、削減なし |
| UX-008 | 390px幅で固定256px候補が見切れる | cp-006修正。row229.51pxにcard221.99px、focus余白3.36〜4.16px。resize後も同じ候補を保持 |
| PARENT-001 | 自己参照線が対象から離れる | cp-001修正。親の2D/3Dと独立UXで確認。以後renderer同一hash |
| PARENT-002 | 文脈制限がフィルター解除後も残る | cp-005修正。親の同手順で2→4対象・1→3関係、検索/選択/camera全値保持 |
| COR-001 | 集約でkind・確度・根拠・元関係を喪失 | cp-001/002、固定期待値で全来歴保持を独立再検証 |
| COR-002 | 不明receiver・同名・scope・クラスの誤解決 | cp-002、独立反例を同じ期待値で再検証 |
| COR-003/004 | 名前付きcallback、登録元→イベント入口の欠落 | cp-002、fixtureと実プロジェクトで再検証 |
| COR-005/006 | schema根拠終端行、実行記録の元時刻 | cp-002、範囲監査と元時計値/単位の固定期待値で再検証 |
| COR-008 | Runtime合流で経路・Evidence欠落 | cp-002、分岐/cycle/diamondの来歴保持を再検証 |
| IMPL-08/09 | Fields・文脈移動、通常3DのEsc | cp-003/004。独立12判定、実モデル往復、実WebGLのEscで再検証 |

## 実プロジェクト照合

原本を読み取り専用で扱い、アプリ実行・install・migrationを行っていない。解析結果を読む前に原本から期待値を固定した。ソース本文・秘密値は本報告へ収録しない。

| 入力 | 読込候補 / 構文解析ファイル | Runtime一致関係 | Function Call一致関係 | 反例 | Evidence範囲監査 |
| --- | ---: | ---: | ---: | ---: | ---: |
| git-lines | 111 / 107 | 16 | 12 | 12 PASS | 15,723出現、不整合0 |
| vehicle-management | 215 / 192 | 17 | 12 | 14 PASS | 65,991出現、不整合0 |

57件は重複を除いた代表関係。選定関係と26反例では誤検出、対応範囲内の欠落、方向/種類/同一性の誤りを検出しなかった。81,714件はEvidence出現数のpath/offset/line監査であり、全関係の意味を全件検証した数値ではない。

| 入力 | Runtime canonical nodes / edges | Function Call canonical nodes / edges |
| --- | ---: | ---: |
| git-lines | 135 / 140 | 4,793 / 10,691 |
| vehicle-management | 4,591 / 11,459 | 16,461 / 33,496 |

4グラフでID一意性とendpoint存在を確認。独立検索17判定、表示adapter/provenance36判定、Runtime分岐・cycle・diamond3ケースもPASS。

同じ57関係を実UIでも選択し、関係詳細から61件のEvidenceを展開した。表示コード397行を対応入力と照合して不一致・根拠行の欠落0。各入力×Viewの代表関係4件では2D→3Dで同じedge ID/kind/確度/Evidenceを確認した。実モデルではRuntimeのcombined→Data Modelのsource→Runtimeのsourceで同一IDと6 Fieldsを維持した。

解析の実行版はcp-002、57関係のUI操作版はcp-004。cp-006までの変更を独立監査した。解析・検索・投影・mask等11主要ファイルはcp-002以来同一hash、navigation/Detail/Stage/2D/3Dもcp-004と同一。変更したfilter resetと検索帯の表示・focusは別途再検証した。57件をcp-006で最初から操作し直したという意味ではない。navigation/Detailの独立12判定はcp-006で再実行してPASS。

## 実画面と性能

Windows / Edge152でCUAを使用。広幅・中間幅・狭幅はclient390/767/1024/1280/1600px等、CSS分岐はinner1101/1100、821/820、701/700、621/620を確認した。ページ全体の横overflowなし。390pxでも2D/3D、全画面と復帰、検索末尾・Enter・詳細、タブ5〜7に到達した。

1440×900相当の共通枠では結果帯85.9896px、グラフのdocument上端595.0521px。検索5状態で位置を維持。候補末尾はModule index25、Runtime259、Function Call129へ到達し、消去後も選択/cameraを保持した。正常な3D全画面で最初のEscは全画面終了、通常canvasのEscは選択解除だった。

cp-006で実際のWebGL context lossを起こすと検索・選択・Evidenceを保って2Dへ戻り、3D再試行も成功。再解析では新scanへ進み、旧選択/詳細を消して置換後のソースに対応した新しい根拠を表示した。通常18粒子→控えめ6→オフ0でも11矢印を保持する合成例を確認した。

検索はinputイベントから、そのqueryが製品sessionと結果帯のDOMに反映されるまでを受動計測した。旧表示や入力欄のvalueだけを完了としない。32サンプルすべてが暫定目安500ms以内だった。これは描画完了時間やFPSの保証ではない。

| 入力 / View | 回数 | 最小 / 中央 / 最大 ms |
| --- | ---: | ---: |
| 合成130件 / Function Call | 8 | 11.3 / 14.0 / 92.9 |
| git-lines / Function Call | 8 | 29.8 / 38.2 / 56.0 |
| git-lines / Runtime | 4 | 32.2 / 35.8 / 44.1 |
| vehicle-management / Function Call | 8 | 108.3 / 123.7 / 202.8 |
| vehicle-management / Runtime | 4 | 48.9 / 54.2 / 65.1 |

最大14,892件一致でも総件数を保持し、描画する候補は窓内の8件だった。性能計測時のclient幅1440〜1457、高さ884〜900、DPR約0.9、visualViewport scale1、reduced-motion=false。親の重いCLI処理と他担当の描画は停止して計測した。変更前との同条件の速度比較や絶対性能保証はしていない。

初回の2-rAF方式は1115/1643msの2サンプルしか取れず、待機原因を切り分けられなかったため検索DOM反映の指標に採用していない。値と方式変更を隠さず、paint/FPSの未検証と分離する。

## 全体チェックと既存回帰

| チェック | cp-006の結果 |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | 330 PASS / 2 opt-in SKIP、34 files PASS / 1 SKIP |
| `pnpm build` | PASS |
| `git diff --check` | PASS |
| `pnpm exec wrangler deploy --dry-run --outdir (専用cache)` | PASS、assets33、公開なし |

Node24.18.0、pnpm11.24.0、Vite7.3.6、Vitest3.2.7、ESLint9.39.5、Wrangler4.127.0。依存変更がないためinstallとlockfile更新は不要だった。既存Tree-sitterのeval/browser-external、500KB超chunk警告は残る。dry-runは本番稼働の確認ではない。

親は実App/BrowserRouterでDictionaryのMap/Categories/Stacks、48→7件のfilter、React検索→Enter詳細、分類→Node.js詳細と戻る/進む/reloadを確認した。AnalyzerのRuntime直接URL、Function Callタブ移動と履歴も一致。View8〜10では所有値7対象と所有元への復帰、3 Fieldsとoptional、Architectureの所属対象の引き継ぎを確認した。最終cp-006でも検索→選択→3D→Runtime文脈移動→filter解除を通し、表示と根拠を再確認した。

## 未検証・既存の制約

- **BLOCKED: Traceの実ファイル受渡しと、それに依存するobserved/combined/削除の実操作。** 正規filechooser経路を2回試行。再試行は全体20秒・各操作6秒指定でもsetFilesから成功/エラーが返らず、親が少なくとも59秒の無応答を確認して中断した。原因は不明。Trace parser/時刻/ページ連携の回帰成功を、この実操作のPASSへ代入しない。
- **BLOCKED: 真の非表示タブとpaint/FPS。** 専用別タブを作成してもdocumentがvisibleのままで、親の実visibilitychange履歴にもイベントが発生しなかった。粒子の方向は実画像で確認したが、精密フレーム時間の合格とはしない。
- **BLOCKED: 実OSのIME、OS reduced-motion設定変更。** 有効なCUA APIに正規のOS操作手段がない。Unicode検索、composition/229ガード、UIの粒子設定は別の確認として扱う。
- **NOT_RUN: 長時間のheap/GPUメモリ/描画ループ残留測定、全フィルター組合せ。** 代表操作、canvasのmount/unmount、cleanup実装や回帰と区別する。
- Git LinesのEventEmitter `.on`登録5確認行は現対応外。名前変更を伴う一部re-exportも未解決として扱い、同名別対象へ接続しない。
- Vehicleの192構文解析ファイルのうち11はcompanionのC#にpartialあり。Web/APIの選定関係を照合したが、companion全動作を検証していない。
- **COR-007は未修正FAIL・主対象境界外。** 既存external-packageのversionRange集約不整合。今回のsemantic入力に使われず、変更した共有境界を通らないことを確認した。
- 静的解析と粒子は実行順・到達可能性・処理成功を保証しない。未知のdispatch、動的receiver、未対応構文等は解決できない場合がある。

## 原本・プライバシー・片付け

| 入力 | 開始・終了HEAD | 入力内容manifest SHA256 |
| --- | --- | --- |
| git-lines | `7a89625acba9cf64b1f0648fed64381330218184` | `885ad0da0b4405cfa98031adccf5648ba04aaef8f0271b3e6c7cf14620def26b` |
| vehicle-management | `8211ee8145425ef85b7cf1156a55cd0adf0db088` | `9580847d5b350ca2ce213807f98bb9b3ad5d2fa6e65db8cb65483b8d01f7e564` |

終了確認は2026-09-06 07:46 UTC。HEAD、Git状態、111/215対象ファイルの内容hashが開始時と一致した。秘密ファイル、依存・生成出力、symlinkを除外。Vehicleのsecurity-reports内1ディレクトリはOS拒否で未読だが、対象アプリのソースは取得した。

3入力で観測したmain-document resource originsは専用localhostのみ。製品の静的確認でも解析経路の明示fetchは同梱WASM取得だった。全Worker通信とpayloadの動的監査は観測手段の制約によるBLOCKEDであり、実測した保証ではない。

比較入力本文と本文を含む派生成果物は専用のGit対象外cacheへ限定し、確認タブを閉じて利用を終えてから既知30ファイル・490,853,960 bytesを削除した。対象パスとhashを先に確認し、原本を削除対象にしていない。削除対象残存0。本文を除いた集計/hash、独立期待値、合成入力画像、削除記録を保持した。専用5186検証サーバーも起動情報とportを照合して停止した。

push・merge・本番デプロイ・Cloudflare設定変更は行っていない。

ローカルの詳細証拠は `.cache/tabs-6-7-review` の `ux-review.md`、`correctness-review.md`、`implementation-cp-006.md`、`acceptance.md`、`parent/checks-cp-006.md`、`parent/cp-006/parent-ui-final.json`、`correctness/ui-summary.json`、`ux/cp-006/performance-summary.json`、親のcleanup記録に整理した。本文付き画像/DOMの元記録は検証後に削除済みで、Gitには含めない。
