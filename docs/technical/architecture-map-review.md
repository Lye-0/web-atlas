# Architecture Map 検証記録

2026-09-09。基準HEADは`62a01861b3f1cd8ec5df8d019d989a8143dc1775`、開始時の作業ツリーはclean。タブ10のモデル・UI・連携を単独で実装し、サブエージェントは使用していない。設計・対応形式・限界は[Architecture Map](architecture-map.md)にまとめる。

## 実入力と独立した期待値

| 入力 | 固定HEAD | 静的入力数 | 照合結果 |
| --- | --- | ---: | --- |
| git-lines | `7a89625acba9cf64b1f0648fed64381330218184` | 112 | manifestのExtension Host、acquireVsCodeApiを使うWebview、build出力とhost panelが対応する双方向message、Gitのconstructor既定値を確認 |
| vehicle-management | `8211ee8145425ef85b7cf1156a55cd0adf0db088` | 214 | 名前付きWorker、Web、.NET/WPF・CLI等の実行単位、共有パッケージ、D1・storage・Auth・emulator設定、development/productionの違いを確認 |
| Web Atlas | 基準HEADと同じ | 219 | アプリはweb-atlas一つ。mainのないassets設定からAPIやDBを作らないことを確認 |

実装前に、manifest、Wrangler、Firebase設定、.csproj、GitRunner、Webviewパネルとbuild設定から期待値を作成した。解析出力のコピーを正解データにはしていない。原本の全追跡ファイル（git-lines 145、vehicle-management 345）のSHA-256、HEAD、差分が作業前後で同一であることを確認した。

原本のコード、MSBuild、設定スクリプト、install/build/test/migration/seedは実行していない。原本と計測ログはgitignoreされたローカル作業領域に置き、Gitや外部サービスへ送っていない。Web Atlas自身のローカル実行・ビルドと静的fixtureだけを実行した。

## 正確性

`architecture.test.ts`はT01–T15に対応する22テスト。アプリ/共有コード、名前だけのapi、Worker、mappingなしの相対fetch、明示mapping、依存宣言/import/callの分離、別channel・同一receiver・Webviewの送受信、DBライブラリとDB実体、環境・emulator、複数役割、種類/confidence別集約、非連続経路、補助コード、孤立/空入力、同名IDを扱う。

補足の負例には、コメント・文字列中のAPI例、別パッケージへのbinding漏出、同じ式を持つ別クラス、protocol-relative URL、不正なURL、assetsの除外パターンを含む。TOMLの環境別name、main継承、非継承bindings/varsも検証した。実入力は`architectureActualSource.test.ts`の3ケースで別途照合した。

確認した未知は、動的なHTTP URL、.NETのProcessStartInfo値、任意のproxy/factory/alias、MSBuildの条件・Import評価など。これらを無関係な内部APIや稼働中サービスへ結び付けていない。Worker/Firebaseの設定は観測済み通信とは表示しない。

## 修正と再検証

| ID | 確認した問題 | 修正・再検証 |
| --- | --- | --- |
| M01 | 大量のmember/Evidenceをspread引数に渡し、スタック上限を超えた | 反復による追加へ変更。実入力3件とブラウザーで再検証 |
| M02 | 親のWorkerが、より深い別パッケージのコードまで所有した | 宣言スコープの具体性を比較。別アプリのenv.DBを結ばない負例を追加 |
| M03 | 同じ動的プログラム式を持つ別クラスが同一視された | ソースと所有スコープをIDに含め、constructor既定値は変更可能な推定として分離 |
| M04 | 大きな初期2Dでは構成の一部だけが画面に入った | Architecture用の段階配置と初期Fitを追加。孤立ノードを保持し、実入力の全構成を確認 |
| M05 | Architectureの未解決先が、Cの未解決「呼び出し」集合へ入った | Architecture属性で既存call-only処理から分離。同じモデルの全ID・位置を2D/3Dで検証 |
| M06 | 元関係追加ごとに集約済み配列とEvidence集合を作り直し、初期表示が遅くなった | グループごとのMapへ一度ずつ追加する処理に変更。全provenanceを保持したまま再計測 |
| M07 | 閉じた専門View欄の投影と、識別情報の大きなJSONを選択ごとに計算した | 開いた場合だけ計算・描画。対応付き移動を再テストし、選択応答を再計測 |
| M08 | プロジェクト交換後に解析結果の保持が残った | 交換時のジョブ/Traceキャッシュ解放、Workerの完了・中止・失敗時のハンドラー解放を追加。2Dだけの交換で約540 MiBから約28 MiBへ解放 |
| M09 | 3Dを閉じた後、R3Fの最後のフレーム購読・RootStateからCanvasのrender経由で旧解析を保持した | moduleのフレーム参照セルをunmount時に空にし、未使用pointer wrapperを置換、XRのdisconnect後に転送先を空にする。ヒープの参照経路を確認し、通常の選択解除・3D復帰も再検証 |

## 操作と回帰

実Edge、1600×1000、DPR 1で操作した。追加で1280/1024/768/390pxと実breakpointの1101/1100、821/820、701/700、621/620pxを確認した。

- 初期の関係線、選択と内部を開くの分離、構成上のパンくず、親・project移動、2D/3Dの同一粒度を確認。
- API内部の関係をキーボードfocusで強調し、主選択を変えないことを確認。
- 粒子3段階、囲いON/OFF、3D空白での解除、2D復帰後の古い線・選択の除去を確認。
- タブ6–9では対応するmember範囲を開き、最初の一件を勝手に選ばない。戻ったタブ10のscopeと選択が一致した。
- タブ2–5は根拠ファイルに対応する候補を明示選択し、対象IDとrouteを確認。Dictionaryは既存Stackの正確なURLを確認。
- production/development切り替え後のresource IDが選択環境に属し、古い選択を解除することを確認。
- 全画面、Tab、Escape、各幅でのページ横はみ出しなしを確認。
- 40個の同名構成要素のfixtureで、検索Endキーから最後の候補へ到達。集約の内訳表示が主選択を変えず、OFFが40点を復元してID・座標・カメラ・選択を保持した。
- 空の入力へ交換して古い選択・3Dシーンを除去し、解析範囲に基づく空状態の説明を確認。
- AのExternalブロック展開/折りたたみ、Bのディレクトリのキーボード開閉と検索、Cのタブ6–9各ON/OFFを実操作。Cの解除後の経路は全8ケースで0本、重要点のラベル遮蔽と重複ラベルのチェックも通過した。

狭幅へのリサイズでカメラが元の倍率と図の中心を保つため、以前見えていた端が画面外へ移る場合がある。これは自動Fitとは区別し、Fit・パン・ズームを確認した。GPU描画性能や他機種での見え方を、この一台の結果で保証しない。

## 性能

同じWindowsホスト（Core i7-13700K、約95.7GiB RAM）、headless Edge、1600×1000、DPR 1、同じ固定入力で各3回。初期表示はページ移動から図の準備まで、操作はPlaywrightの操作と2回のRAF待機を含む時間。p95は有限サンプルの順位値であり、統計的な改善率の主張ではない。

旧タブ10はgit-linesで3対象/3関係、vehicle-managementで15対象/23関係。新しい論理構成は3対象/18関係、29対象/53関係で、意味と情報量が異なる。旧版との表はUX比較であり、同じrenderer/同じモデルの速度比較ではない。旧版に新しい構成階層・点群3Dと同一条件の操作はないため、その旧版比較はN/A。

| 項目（中央値 / p95、ms） | git-lines 旧版 | git-lines 改修後 | vehicle-management 旧版 | vehicle-management 改修後 |
| --- | ---: | ---: | ---: | ---: |
| 初期表示、各3回 | 3088 / 3199 | 3952 / 4012 | 15527 / 15811 | 19000 / 19511 |
| 選択、各15操作 | 67 / 100 | 65 / 113 | 66 / 75 | 65 / 93 |
| 内部を開く、各9操作 | N/A | 67 / 83 | N/A | 79 / 105 |
| 親へ、各9操作 | N/A | 67 / 69 | N/A | 100 / 100 |
| 3Dへ、初回と往復21操作 | N/A | 68 / 370 | N/A | 83 / 379 |
| 2Dへ、18操作 | N/A | 65 / 87 | N/A | 97 / 107 |
| 自動省略切り替え、各3操作 | N/A | 65 / 69 | N/A | 61 / 92 |

最終6回ではGit Linesの初期表示は旧版より約0.9秒、vehicle-managementは約3.5秒増えている。追加した構成解析のworker内時間の中央値は約231ms、vehicle-managementは約648msで、一度の解析結果へ保存する。初期表示全体との差を、この解析時間だけで説明できるとは断定しない。表示する役割・根拠・関係も増えており、全体が高速化したとは扱わない。

中間版ではvehicle-managementの初期表示中央値が24105ms、選択が331msになった。M06/M07の修正後の一回の測定組では初期15777ms、選択64msだったが、最終状態で取り直した上表を採用する。Git Linesの選択も中間版217msから65msへ戻った。有限の測定回数による変動を含む。

同じArchitectureモデルの3DでON/OFFを別々に測定した。回転は16ステップのドラッグで、操作全体の中央値は313–346ms。両入力・両設定でRAF間隔のp95は約16.8ms、測定区間の50ms超long taskは0件。これはmain-thread RAFの間隔で、GPU frame timeではない。

ラベル投影の平均CPUはGit LinesでON 0.182ms/OFF 0.192ms、vehicle-managementでON 0.324ms/OFF 0.376ms。最大0.6ms。回転中のArchitectureスコープ再計算は0回、ラベルIDの重複は0件。必要なラベル位置更新は維持される。実入力3回ずつの6往復で、2D復帰時の3D登録は0件だった。

別の保持確認ではvehicle-managementを読み、各回3D初期化とR3Fの遅延終了を待って8回の状態を採取した（表示往復とON/OFF、各回GC後）。heapは543.53→544.91 MiBで増分が収束し、イベントlistenerは全回265、DOM nodeは初回2003・以後2005、canvasは1だった。空プロジェクトへ交換すると30.18 MiB、listener 238、canvas 0へ戻った。再描画後30.19 MiB、Dictionaryへ離れた後30.70 MiB。異なる画面のlistener数は画面自身の要素を含むため、同一画面の反復と区別する。無期限・全機種での漏れ不在を証明する試験ではない。

数値集計と保持測定は[測定データ](architecture-map-metrics.json)に保存。大きなヒープsnapshot、実入力コピー、操作用ハーネスはローカルの非追跡検証領域に置き、公開物には含めない。

## コマンド

`pnpm install --frozen-lockfile`は既存lockfileのまま成功。新しい依存は追加していない。`pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`git diff --check`、`pnpm exec wrangler deploy --dry-run`は成功。repository-memoryもindexを再生成し、検証0警告。

全体テストは634成功・8skip（72ファイル成功・4ファイルskip）。Worker解放3件、フレーム解放1件、Canvas/XR終了処理1件を含む。skipは既存の任意のローカルsnapshotに依存するケースで、今回の独立fixtureと実入力3件は実行した。

Wrangler 4.127.0のdry-runでは静的assetsを読み、`No bindings found`、`--dry-run: exiting now`を確認した。アップロード・本番公開はしていない。buildに残るtree-sitter依存のeval/externalizationと大きいchunkの警告は、対象プロジェクトのコードを実行したという意味ではない。

## 受け入れ表

| ID | 結果 | 実装・検証と範囲 |
| --- | --- | --- |
| A10-01 | PASS | architecture.tsの実体種別。T01/02/03/08/15、実入力3件 |
| A10-02 | PASS | manifest/入口/.csproj/具体的役割、configurationVariants、Detail。役割未判定も明示 |
| A10-03 | PASS | entity confidenceとrole confidence/reason/Evidence、relation confidenceを分離。T10/11 |
| A10-04 | PASS | ライブラリ・モデルをDBへ変換しない。T08、静的配信の実入力 |
| A10-05 | PASS | 種類/confidence/環境で集約しprovenance保持。T06/07/11、関係focus/詳細 |
| A10-06 | PASS | 集合による重複排除・self-loop保持・偽経路を生成しない。T10–12 |
| A10-07 | PASS | main/nameの継承・上書き、非継承bindings/vars、emulator・aliasを区別。T05/09、環境別IDの実操作。未対応形式は能力表に記載 |
| A10-08 | PASS | 構成図用配置と初期Fit。実入力と40要素fixtureで選択前の関係を表示 |
| A10-09 | PASS | クリック/Enter選択と内部を開くを分離。Page testと実操作 |
| A10-10 | PASS | 構成親によるscope、visit、外部文脈。階層・親・モード・専門Viewからの復帰 |
| A10-11 | PASS | Cのheading/search/navigation/stage/hoverを共有。全候補・End到達とbreakpoint確認 |
| A10-12 | PASS | 同じArchitecture scopeの2D/点群3D。元Factを大量に再表示しない。21番目の粒度fixtureと実操作 |
| A10-13 | PASS | 共通ラベル/方向/粒子/囲い。実入力のfocus・解除、既存C8ケースの端点遮蔽検査 |
| A10-14 | PASS | 40要素の集約・内訳・明示選択・OFFを確認。ID/座標/カメラ/主選択を保持 |
| A10-15 | PASS | 3D空白解除、2D復帰、環境/入力交換。古い選択・線・シーン登録を除去 |
| A10-16 | PASS | 表示範囲の関係数と全ファイル/member数を分け、補助コード・未知・空入力を注記。T13/14 |
| A10-17 | PASS | 2–5の明示候補、6–9の所属範囲、Dictionary stable URL、復帰を実操作 |
| A10-18 | PASS | T01–15と補足22テスト、固定実入力3件。未対応を能力表に限定列挙 |
| A10-19 | PASS | 同じ入力で初期/操作/CPU/RAF/6往復と8状態のGC後heapを測定。旧project解放を確認。初期表示増加と機種・回数の限界は上記 |
| A10-20 | PASS | A/B/C/Dictionary回帰、原本hash不変、単独実行、未公開。build/lint/typecheck/test/dry-run成功 |

## 参照

Wranglerの継承区分とassets形式は[公式設定リファレンス](https://developers.cloudflare.com/workers/wrangler/configuration/)も確認した。main/name/assetsは継承可能、bindings/varsは非継承として扱い、assetsの除外パターンを正のmappingより優先する。配置や配備名の宣言は、実際の本番稼働とは区別する。
