# Architecture Map

タブ10は、実行単位・共有コード・内部コンポーネント・外部の相手を読む構成図です。`FlowAnalyzerPage`とCの操作基盤を共有しますが、2Dは選択前から関係を表示する構成図です。タブ6–9のファイル一覧型の2Dエクスプローラーとは投影を分けます。

## モデルと境界

`analyzeSemanticSources`の最後に`buildArchitectureModel`を実行し、同じ`SemanticAnalysis`へ`architecture`を追加します。関数・値・モデルのcanonical node/edgeを改名・移動・削除しません。タブ6–9は従来の投影を使用します。設定やソースは静的に読み、対象プロジェクトを実行しません。

`ArchitectureEntity`は次を区別します。

- `application`: manifestや設定が示す実行単位。packageの存在だけでは生成しない。
- `shared-code`: ライブラリや、独立実行の根拠がないコードの所属。
- `component`: 上記の内部構成。パス規約・具体的な構文から役割を推定する。
- `resource`: 名前付きのDB・storageなどの設定対象。型やDBライブラリをリソースへ変換しない。
- `external-service` / `external-program`: 設定・使用コードで確認した外部の相手。稼働中であることは表さない。
- `unresolved`: 接続先・起動先を特定できない要求。判明している式とEvidenceを保持する。

IDはkindだけや表示名だけで作らず、宣言ファイル、親のID、設定環境などのnamespaceを含む。動的なプログラム式はソース・所有スコープも含む。子は一つの親を持つ。複数の役割を別の実体に複製せず、役割ごとのconfidence、reason、Evidenceを属性として持つ。

一つの拡張パッケージでもExtension HostとWebviewは別の実行単位になる。`src/webview`のホストコードを、ディレクトリ名だけでブラウザー側へ移さない。最も具体的な実行単位・パッケージにファイルを所属させる。

## 入力・検出能力

| 入力・detector | 読み取る根拠 | 対応範囲・限界 |
| --- | --- | --- |
| package.json | name/displayName、engines.vscode、main/browser/bin、Webの起動・ビルドscripts、dependencies | Extension Host、CLI、vite/next/nuxt/astroのWeb、workspace内の宣言依存。パッケージ名やapiフォルダーだけではAPIにしない。任意のscriptsの実行内容を評価しない |
| JS/TS AST | export function activate、createRoot/hydrateRoot、acquireVsCodeApi、import、呼び出し・property access | コメント・文字列を呼び出しと混同しない。import alias、heap alias、任意のfactory、動的な設定式の完全な追跡はしない |
| .csproj | AssemblyName、OutputType、UseWPF、Web SDK、ProjectReference | .NETの実行プロジェクトとライブラリを区別。MSBuildの条件式・外部Import・Directory.Build.propsは実行・評価しない。条件付き設定は解析範囲に注記 |
| wrangler.json/jsonc | name、main、env、D1/R2/KV/service bindings、assets、指定した接続先vars | 名前付きWorker、resource、配信設定。mainのない静的assets設定からAPIサーバーを生成しない。queues、Durable Objects、任意のvars契約は未対応 |
| wrangler.toml | 単一行の文字列・数値・真偽値・配列、table / array of tables | 上記の宣言を同じモデルへ変換。multiline値、inline table、quoted/dotted keyの完全なTOML文法には非対応。認識しなかった値は推測せず解析範囲へ表示 |
| Firebase設定 | firebase.jsonのemulators、.firebasercのproject aliases、明示されたAuth設定 | ローカルemulator設定とCLI aliasを保存。aliasを配置環境や稼働中の本番と同一視しない |
| Firebase Auth使用 | firebase/auth importとgetAuth/signInWith等、connectAuthEmulator | 使用コードとemulator接続式を保存。動的なproject/URLは未解決のまま。SDK依存の存在だけではDBを生成しない |
| HTTP要求 | canonical requestの呼び出し箇所、ASTの先頭引数 | literalの絶対URLはoriginへ、動的・相対URLは未解決先へ。useQuery/useMutationのquery名をHTTP URLにしない |
| 明示HTTP mapping | Wrangler assets.directoryとrun_worker_first、Web packageの位置 | その配信設定がある環境だけで相対要求をWorkerへ対応付ける。URLのパス一致だけのRuntime推定を転用しない。任意のproxy/base URL式は未対応 |
| message | 同一ファイル・同一receiver・同一lexical scopeのemit/on/once、またはWebviewのbuild出力とhost panelの対応 | 前者は同一receiverを根拠とした推定。後者はvite root/outDirとcreateWebviewPanelのlocalResourceRootsを照合し、対応する送受信APIを保持。同名event/typeだけでは結ばない。任意のMessagePort/channel aliasの追跡は未対応 |
| DB/storageアクセス | 対応するWorker所有コードのenv/bindings property access | 設定bindingへの対応は推定で表示。読み・書き・削除の実行を、property accessだけから断定しない |
| process | spawn/execFile/Process.Startの静的呼び出し | literal、または同じクラスのconstructor引数の既定値を区別。既定値は変更可能な推定として表示。ProcessStartInfoや動的な式の完全な値解決はしない |
| 内部役割 | 従来のパス規約、Git、Webview、.NET Program.cs、WPF code-behind、System.IO.Pipes、node:fsの参照 | 役割は推定。役割未判定でも所属・元ファイルは残す。機能の実装完了や安全性を保証する分類ではない |

既存Fact Storeのパッケージ・import・resource情報とsemantic factを利用し、不足する設定構造を追加で読みます。原本のinstall/build/import/require/evalは不要です。`.env`を構成解決のために読みません。

## 環境と関係

環境selectorは読み取ったWranglerのenv名がある場合だけ表示する。「論理構成・全設定」では全設定を見せ、具体的な環境では対応するresource/edgeを選ぶ。mainは上位から継承する。bindings/varsは環境ごとに再宣言する。assetsは環境の宣言を優先し、なければ上位設定を使う。同じservice名でも宣言環境の違うIDを合併しない。

Firebaseのemulator宣言とCLI aliasは別の設定情報であり、Wrangler環境への対応を名前だけで作らない。環境を確定できない使用コードは残す。配置設定も静的な使用コードも、実際の通信・保存・稼働の観測ではない。タブ10ではTraceを混ぜない。

`configurationVariants`は環境別のname/mainと継承の有無、根拠を保持する。表示名を本番の配備名と断定しない。トップレベルmainがなく環境内だけにmainがあるWorkerの実行単位生成は未対応。

関係は`declaration-dependency`、`code-reference`、canonicalな`calls/callback/handles/registers-event`、`http-request`、`message`、`data-operation`、`service-use`、`process-start`、`deployment-config`を保持する。

`aggregateArchitectureEdges`は**表示中の始点・終点、種類、confidence、環境**ごとにまとめる。元edgeのID、元の始点・終点、Evidenceをprovenanceとして保存し、self-loopも落とさない。A→BとB→Cがあっても、B内部の異なるメンバーをつなぐ実行経路を生成しない。ファイル・下位対象・元関係・Evidence・根拠箇所の件数は別の集合で数える。

## UIと状態

`architectureScopeGraph`はproject直下、または選んだ構成要素の直下を投影する。関係する範囲外の相手は同じcanonicalなArchitecture IDで文脈として表示し、「この範囲の外部」と示す。外部文脈を選んだだけでは移動しない。

- ノードのクリック・Enterは選択と詳細表示。`内部を開く`は子がある対象の階層移動。
- 構成上の親によるパンくず、親へ、プロジェクトへ、戻る・進むを共有のvisit stateで扱う。
- 検索は全構成の候補を1行で表示し、入力だけでは選択・配置を変更しない。候補から所属階層へ移動できる。
- 2Dは関係から段階を配置する構成図。種類による固定カラムではない。孤立した対象も残し、初期表示で全体をFitする。
- 3Dは同じ階層投影のArchitecture要素を点として配置する。全関数・全変数へ展開しない。2Dと3Dのカメラは独立し、明示的な対象へのジャンプを共有する。
- 入る関係は橙、出る関係は青。粒子3段階、囲い、自動省略、ラベル、hover/focusの所有権はC基盤を使用する。
- 自動省略ON/OFFは表示上の密度調整であり、実行単位や内部責務の意味集約を変えない。Architectureの未解決接続先を「定義先未特定の呼び出し集合」へ変換しない。
- Detailの全ファイル・下位対象数には補助コードも含み、その旨を表示する。関係数は現在のscope/env/filterの表示範囲と明記する。
- 環境切り替えでは選択を解除する。新しいproject storeでは従来どおりvisit・選択・カメラを初期化する。

幅の変更で図の表示領域が変わった場合はCと同様にカメラの中心を補正する。詳細を開いた際の画面幅差による平行移動は、選択への自動Fitではない。検証ではscaleとviewport中心に対する位置を比較する。

## 専門Viewとの対応

タブ6–9はcanonical member ID・owner・fileの明示的な所属範囲を渡す。対応対象がないボタンは無効化し、理由を示す。複数メンバーから恣意的に先頭の一件を選ばない。

タブ2–5は既存投影から、構成のファイル・Evidenceの完全パスに対応する候補を列挙する。候補を明示選択すると対象ID、必要な祖先展開、フォーカス要求を渡す。新しいプロジェクトでは古いフォーカス要求を使わない。

Dictionaryは既存Stackのstable IDを使う。package名が複数Stackに対応する場合は候補を示す。登録がないものはテキスト表示し、架空のURLを作らない。

## 変更範囲と検証

同じproject store内では解析結果を再利用し、project交換時は旧ジョブとTraceキャッシュを破棄する。Worker終了時はメッセージ・エラーハンドラーを外す。Cの3DではR3Fが最後のフレーム購読とRootStateを保持するため、フレームの参照セルをunmount時に空にし、Canvasの未使用pointer wrapperを置換、XRの通常disconnect後に転送先を解放する。OrbitControlsのDOM取り外し前の終了処理とは別の保持経路である。

A（タブ1–4）の全面更新は今回の対象外。B（5）とC（6–9）は既存の探索・表示契約を維持する。A/Bへ構成図の集約処理を持ち込まない。今回の実装・調査・テストは単独実行で、サブエージェントは使用していない。この作業条件を恒久的な並列作業禁止ルールにはしない。

`architecture.test.ts`にT01–T15と補足の正例・負例、`architectureActualSource.test.ts`にローカルの固定実入力、既存のPage/Flowテストに専門View移動と回帰を置く。実入力がない環境では実入力テストはskipとして報告する。

測定条件、実入力の照合、修正と再検証、A10-01–20の結果は[検証記録](architecture-map-review.md)を参照。
