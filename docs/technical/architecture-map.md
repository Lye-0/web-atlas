# Architecture Map

タブ10は、実行単位・共有コード・内部コンポーネント・外部の相手を読む構成図です。`FlowAnalyzerPage`とCの操作基盤を共有しますが、2Dは選択前から関係を表示する構成図です。タブ6–9のファイル一覧型の2Dエクスプローラーとは投影を分けます。

## モデルと境界

`analyzeSemanticSources`の最後に`buildArchitectureModel`を実行し、同じ`SemanticAnalysis`へ`architecture`を追加します。関数・値・モデルのcanonical node/edgeを改名・移動・削除しません。タブ6–9は従来の投影を使用します。設定やソースは静的に読み、対象プロジェクトを実行しません。

`ArchitectureEntity`は次を区別します。

- `application`: manifestや設定が示す実行単位。packageの存在だけでは生成しない。
- `code-package`: 存在を確認したコードパッケージ。用途・利用元・共有の役割は別に判定する。
- `shared-code`: 他の構成からのソース参照、またはライブラリの公開契約と利用宣言があるコード。利用元数だけでは判定しない。
- `component`: 上記の内部構成。パス規約・具体的な構文から役割を推定する。
- `resource`: 名前付きのDB・storageなどの設定対象。型やDBライブラリをリソースへ変換しない。
- `external-service` / `external-program`: 設定・使用コードで確認した外部の相手。稼働中であることは表さない。
- `unresolved`: 接続先・起動先を特定できない要求。判明している式とEvidenceを保持する。

IDはkindだけや表示名だけで作らず、宣言ファイル、親のID、設定環境などのnamespaceを含む。未特定のHTTP・プログラム要求は元の要求／呼び出し箇所のIDと式を保持し、同じ式でも接続先実体へ統合しない。子は一つの親を持つ。複数の役割を別の実体に複製せず、役割ごとのconfidence、reason、Evidenceを属性として持つ。

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

既存のimport関係とsemantic factを再利用し、実行入口・資源の設定・同一性は読み込まれた設定構造を静的に確認します。原本のinstall/build/import/require/evalは不要です。`.env`を構成解決のために読みません。

## 環境と関係

環境selectorは読み取ったWranglerのenv名がある場合だけ表示する。「論理構成・全設定」では全設定を見せ、具体的な環境では対応するresource/edgeを選ぶ。mainは上位から継承する。bindings/varsは環境ごとに再宣言する。assetsは環境の宣言を優先し、なければ上位設定を使う。

`identity`は実体の対応と設定の出現を分ける。D1のdatabase_id、KVのid、アカウントを明示したR2/service名、Firebase Authのproject IDなど、対応を判断できる識別情報が一致する場合は一つの対象へ複数設定を保持する。異なるIDやエミュレーターは分ける。名前だけ、または必要な設定範囲が不足する場合は同一性未確認として残す。環境別接続とconfigurationsのbinding・設定場所・根拠を保持し、稼働中の接続とは扱わない。

Firebaseのemulator宣言とCLI aliasは別の設定情報であり、Wrangler環境への対応を名前だけで作らない。環境を確定できない使用コードは残す。配置設定も静的な使用コードも、実際の通信・保存・稼働の観測ではない。タブ10ではTraceを混ぜない。

`configurationVariants`は環境別のname/mainと継承の有無、根拠を保持する。表示名を本番の配備名と断定しない。トップレベルmainがなく環境内だけにmainがあるWorkerの実行単位生成は未対応。

関係は`declaration-dependency`、`code-reference`、canonicalな`calls/callback/handles/registers-event`、`http-request`、`message`、`data-operation`、`service-use`、`process-start`、`deployment-config`を保持する。

`aggregateArchitectureEdges`は**表示中の始点・終点、種類、confidence、環境、内部／実際の自己関係**ごとにまとめる。下位の異なる対象や再帰を同じ表示ノードへ畳んだ関係は`internalRelations`へ保持し、輪として描かない。現在の粒度で根拠を持つ自己関係と、実体間の循環は保持する。元edgeのID、元の始点・終点、Evidenceはprovenanceへ保存する。3D密度集約の後も環境を混ぜず、新たに内部へ収まった線は描画から分離する。

A→BとB→Cがあっても、B内部の異なるメンバーをつなぐ実行経路を生成しない。ファイル・下位対象・元関係・Evidence・根拠箇所の件数は別の集合で数える。

## UIと状態

`prepareArchitectureScope`が条件ごとの所属・関係投影を保持し、`projectArchitectureScope`が選択・周辺表示を適用する。2Dは現在階層と直接の相手を表示する。3Dは同じモデルの現在階層を詳しく表示し、外側の主要構成を最上位の概要に畳んで残す。「表示範囲外」は別アプリも含み、プロジェクト外のサービスを意味しない。現在の親はパンくずと境界見出しにし、通常ノードへ二重計上しない。

元関係がa→B内部のbなら、概要Bへ投影し、bと元関係を詳細に保持する。A→Bしか分からない場合は境界接続の一覧へ置き、任意の子aから線を作らない。外側同士の線は通常は控え、選択した相手の関係を示す。

- ノードのクリック・Enterは選択と詳細表示。`内部を開く`は子がある対象の階層移動。
- 構成上の親によるパンくず、親へ、プロジェクトへ、戻る・進むを共有のvisit stateで扱う。
- 検索は全構成の候補を1行で表示し、入力だけでは選択・配置を変更しない。候補から所属階層へ移動できる。
- 2Dは関係から段階を配置する構成図。種類による固定カラムではない。孤立した対象も残し、初期表示で全体をFitする。
- 3Dの「周辺構成」はタブ10のセッション内で初期値表示。非表示でも直接の相手・選択した相手と関係は保持する。自動省略・囲い・粒子とは独立し、切り替えで座標やカメラを変更しない。
- 3Dの主要位置と内部の局所配置はモデル単位で用意する。内部へ入ると保存済み局所カメラ、または内部と近くの概要が見える初期表示を使う。明示Fitは表示対象全体を収める。全関数・全変数へ展開しない。
- 入る関係は橙、出る関係は青。粒子3段階、囲い、自動省略、ラベル、hover/focusの所有権はC基盤を使用する。
- 自動省略ON/OFFは表示上の密度調整であり、実行単位や内部責務の意味集約を変えない。Architectureの未解決接続先を「定義先未特定の呼び出し集合」へ変換しない。
- Detailの全ファイル・下位対象数には補助コードも含み、その旨を表示する。関係数は現在のscope/env/filterの表示範囲と明記する。
- 環境切り替えでは選択を解除する。新しいproject storeでは従来どおりvisit・選択・カメラを初期化する。

未特定要求は呼び出し元・種類・環境ごとの**表示集合**へ畳めるが、canonicalな個別要求を削除しない。内訳閲覧は主選択とは別状態。個別選択・式での検索・手動の個別表示へ到達でき、表示集合を実体数へ加算しない。

詳細は概要と主要操作を先に置き、内部・相手・技術・分類理由・設定・Evidence・内部メタデータを段階的に開く。技術は構成要素のソース参照、型／ビルド／テスト支援、構成設定、宣言のみを分け、依存区分から実行時利用を断定しない。閉じた根拠・専門View・大きいメタデータは遅延生成する。

幅の変更で図の表示領域が変わった場合はCと同様にカメラの中心を補正する。詳細を開いた際の画面幅差による平行移動は、選択への自動Fitではない。検証ではscaleとviewport中心に対する位置を比較する。

## 専門Viewとの対応

タブ6–9はcanonical member ID・owner・fileの明示的な所属範囲を渡す。対応対象がないボタンは無効化し、理由を示す。複数メンバーから恣意的に先頭の一件を選ばない。

タブ2–5は既存投影から、構成のファイル・Evidenceの完全パスに対応する候補を列挙する。候補を明示選択すると対象ID、必要な祖先展開、フォーカス要求を渡す。新しいプロジェクトでは古いフォーカス要求を使わない。

Dictionaryは既存Stackのstable IDを使う。package名が複数Stackに対応する場合は候補を示す。登録がないものはテキスト表示し、架空のURLを作らない。

## 変更範囲と検証

同じproject store内では解析結果を再利用し、project交換時は旧ジョブとTraceキャッシュを破棄する。Worker終了時はメッセージ・エラーハンドラーを外す。Cの3DではR3Fが最後のフレーム購読とRootStateを保持するため、フレームの参照セルをunmount時に空にし、Canvasの未使用pointer wrapperを置換、XRの通常disconnect後に転送先を解放する。OrbitControlsのDOM取り外し前の終了処理とは別の保持経路である。

タブ10の3D内の階層移動ではDOM Canvasを維持し、visitごとにSceneを切り替える。Canvasの遅いonCreatedが除去済みDOMへイベントを接続する競合を防ぎ、visitの世代に合わないラベル・投影・接続通知・カメラ更新を適用しない。他のCタブのCanvas寿命は変更しない。

A（タブ1–4）の全面更新は今回の対象外。B（5）とC（6–9）は既存の探索・表示契約を維持する。A/Bへ構成図の集約処理を持ち込まない。今回の実装・調査・テストは単独実行で、サブエージェントは使用していない。この作業条件を恒久的な並列作業禁止ルールにはしない。

`architecture.test.ts`にT01–T15と補足の正例・負例、`architectureActualSource.test.ts`にローカルの固定実入力、既存のPage/Flowテストに専門View移動と回帰を置く。実入力がない環境では実入力テストはskipとして報告する。

測定条件、実入力の照合、修正と再検証、A10-01–20の結果は[検証記録](architecture-map-review.md)を参照。

F1–F7の仕上げと内部詳細＋周辺概要の検証は[追加検証記録](architecture-focus-review.md)を参照。
