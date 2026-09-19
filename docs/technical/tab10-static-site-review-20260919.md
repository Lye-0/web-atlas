# タブ10：静的Webサイトと独自Node scriptの対応

着手：2026-09-19。最終確認：2026-09-20。

## 結果と原因

着手基準は `72377ce`、ブランチ `小規模修正３`、未コミット変更なし。HEAVY-PLAYの原本は指示書と一致し、package.json L4、HTMLのCSS参照L10/JS参照L118、配信script L5–9、生成script L5–17、READMEの公開先L7を照合した。今回の読取範囲に `.github/workflows`・公開scriptはなかった。外部の公開設定の有無・現在の稼働は判定しない。

HTML・JS・CSSは入力に存在した。Web系CLIを持たないpackageがcode-packageとなり、内部scriptのファイル操作が親の役割説明へ集約されていた。Command Flowには2つのNode呼出と実装パスが存在したが、Architectureの操作adapterが独自配信・生成に未対応だった。READMEはファイル発見段階で対象外だった。原因は入力消失や簡易モードの選択ではなく、入口の役割付け・操作変換・文書情報の不足だった。

共通の元モデルへ不足情報を追加した。簡易専用の固定図は作っていない。原本の同じIDを使い、11元ノード・937元関係から17元ノード・945元関係へ追加。元関係はEvidenceを含め全て一致する。簡易図は1表示要素・0表示線から、6表示要素・5表示線・2参照注記へ変わった。

## 認識規則と変更ファイル

- `staticSiteSources.ts`：既存HTMLパーサーで実文書と入力内のJS/CSS参照を確認する。テンプレート構文、テスト・fixture・docs・既知の出力ディレクトリを除外する。既存framework/manifestの所有を優先する。
- `architecture.ts`：未分類の原本だけにブラウザ役割を付与し、HTML入口・読込ファイル・位置のEvidenceを追加する。packageなしのHTML/JS/CSSにも対応する。モジュールを多数の独立アプリへ分割しない。
- `staticNodeScript.ts`：入力を実行せずTypeScript ASTとsymbolでNodeのimport・呼出を照合する。const、有限配列、限定した代入由来、import.meta.url、dirname/resolve、既定値と引数を読み取る。AST数100,000、値候補64、参照深さ24、依存追跡4,000等の上限を持つ。
- `architectureStaticSiteFlows.ts` / `architectureToolFlows.ts`：既存Command FlowのNode呼出とscriptパス/cwdを再利用する。既知adapterを先に適用し、未対応の独自操作を補う。単位・script・使用条件別のキャッシュは256文脈まで。選択やカメラ操作では再解析しない。
- `fileDiscovery.ts`：README.mdを読み取り対象へ追加する。文書URLの一般的なサービス化は行わない。
- `architectureSimple.ts`：新規の独自操作だけ、静的ファイル配信・独自ビルドという説明名を保つ。集合規則・配置アルゴリズムは変更していない。
- `ArchitectureStaticSiteInfo.tsx` / `ArchitectureSimpleDetail.tsx` / `ArchitectureDetail.tsx`：宣言された入力・出力・既定値、文書公開先を表示する。長い入力パスは内訳へ置く。READMEの記載位置を直接開く導線を用意する。

## 図と根拠

| 表示要素 | 根拠と意味 |
|---|---|
| heavy-play | HTML入口、JS/CSS参照に基づく静的Webサイト・ブラウザ実行。原本のIDを維持 |
| Node.js：静的ファイル配信 | start → scripts/serve.mjs。createServer、同一server.listen、要求パスに基づくファイル読取とres.endを照合 |
| ローカル閲覧用の構成 | 配信root `.`、設定上の既定 `127.0.0.1:5173`。HOST/PORTによる上書き値・稼働は未取得/未観測 |
| Node.js：独自ビルド | build:preview → scripts/build-preview.mjsの読取・変換・書込を照合 |
| 分離ファイル版の出力・更新 | snapshots.js / sounds.jsのデータ由来の生成、app.bundle.jsの結合、既存index.htmlの更新を内訳へ保持 |
| 単一HTMLプレビュー | HTML/CSS/JS由来の出力。既定 `../HEAVY-PLAY-preview.html`、argv[2]で変更可能。ルート外は宣言のみ保持 |

5本の常設線は、原本→配信、配信→閲覧構成、原本→生成、生成→分離ファイル群、生成→単一HTML。配信対象と原本の対応は既存の参照注記の仕組みで保持する。生成→配信の自動実行順や、プレビュー→GitHub Pagesの公開経路は追加しない。

出力の元パスと書込/読込箇所を保持する。同一index.htmlは既存入力の更新として説明し、架空のdistやコピーを追加しない。出力パスが未解決でも、他の確認できる生成経路と共に未解決の指定を残す。トップレベルで呼ばれない生成関数、任意条件下の書込、ログ/キャッシュの書込は生成先にしない。配信も未呼出関数・任意条件だけのサーバーを昇格せず、通常の直接実行ガードは認識する。

## 公開先と要求

DEPLOYMENT / 公開先 / デプロイ先節の、単独URLまたは限定した公開先リンクを文書情報として読む。説明文・docs/demo節・バッジ・コードフェンス・資格情報やquery付きURLを確定先にしない。READMEのGitHub Pages URLは親の詳細に「公開先としてREADMEに記載」と表示する。公開処理、配布対象、ブランチ、公開成功、稼働を意味しない。公開URLへアクセスしていない。

未特定HTTP要求7件は件数だけで推定せず、全て `tests/site.test.mjs` のfetch由来ID・使用元・Evidenceと照合した。ID・要求式・Evidenceを維持し、テスト由来の内訳に残した。HTTP判定器は変更していない。テストからimportしたhandlerを別の常設サーバーにしない。

## 修正前後の画面

画像は同じ1600×1100、同じ入力、プロジェクト直下・簡易全体・2D・Fitで撮影。実入力の全データと画像はローカルの非追跡キャッシュに置き、コミットしない。

- HEAVY-PLAY：[修正前](../../.cache/static-site/HEAVY-PLAY-before.png) / [修正後](../../.cache/static-site/HEAVY-PLAY-after.png)
- [配信操作の選択](../../.cache/static-site/HEAVY-PLAY-serve-selected.png) / [生成操作の内訳](../../.cache/static-site/HEAVY-PLAY-build-selected.png)
- [単一HTMLの出力指定](../../.cache/static-site/HEAVY-PLAY-preview-selected.png) / [文書公開先と根拠](../../.cache/static-site/HEAVY-PLAY-document-selected.png)
- [3D全景](../../.cache/static-site/HEAVY-PLAY-3d-full.png) / [3Dのポインター選択](../../.cache/static-site/HEAVY-PLAY-3d-selected.png)
- Chess：[前](../../.cache/static-site/Chess-before.png) / [後](../../.cache/static-site/Chess-after.png)
- git-lines：[前](../../.cache/static-site/git-lines-before.png) / [後](../../.cache/static-site/git-lines-after.png)
- vehicle-management：[前](../../.cache/static-site/vehicle-management-before.png) / [後](../../.cache/static-site/vehicle-management-after.png)
- [760pxの詳細欄](../../.cache/static-site/HEAVY-PLAY-narrow-selected.png)

## 既存3作品と操作

| 入力 | 元ノード | 元関係 | 簡易要素 | 表示線 | 注記 |
|---|---:|---:|---:|---:|---:|
| Chess | 51 | 2,320 | 16 | 19 | 4 |
| git-lines | 121 | 18,281 | 13 | 18 | 8 |
| vehicle-management | 379 | 14,592 | 39 | 59 | 14 |

3作品とも修正前後で上記件数だけでなく、全ノードの属性・役割・元ID、全関係/Evidence、簡易の要約・線、2D/3Dの配置座標が完全一致した。共通公開経路、共有コード・囲い、Firebaseの設定/接続側、拡張のビルド・配布経路に差分なし。

agent-browserスキルでWeb Atlasだけを起動。実入力を同じスキャナ・解析器で読み取って保存したモデルを、実際のAnalyzerPageへ渡す検証画面で操作した。入力側のサーバー・ビルド・テストは実行していない。

4入力で単クリックの選択、全体/簡易の往復、2D/3Dの往復、階層の内部移動と戻る、検索入力と解除、パン/ズーム・ホバー、詳細開閉を確認。配置・現在地・表示キー・保存カメラの維持を診断値で照合。HEAVY-PLAYでは実際の3D点をポインター選択し、使用条件のコピー→検索欄への貼付で文字列を照合し、全体の元対象とREADME根拠へ移動した。別入力への移動時に前のラベル・詳細を残さないことも確認した。

vehicle-managementのD1に接続する10本を選択し、development/productionと対象DBの内訳が2D/3Dで一致し、線の選択でカメラ・配置が動かないことを確認した。その他のタブは既存のRuntime/Command/Function/Data等のテストと共有詳細コンポーネント回帰で確認し、各タブを全て手動操作したという意味ではない。

760pxでは詳細欄の文字・パスが折り返される。選択時のカメラを保持するため、詳細欄でキャンバスが狭まると図の右側は表示領域外に残る。既存のFit/選択へ移動で確認する仕様を維持し、自動再配置で解消していない。

## 性能・テスト

同一機でのスキャン＋解析の一回比較（速度保証ではない）：HEAVY-PLAY 約26.9→25.9秒、Chess 5.7→5.5秒、git-lines 74.6→67.3秒、vehicle-management 53.3→53.2秒。追加READMEにより読込ファイル数は増える。簡易投影の初回はChess約53→36ms、git-lines約344→287ms、vehicle-management約254→204ms、同一scopeのキャッシュ100回取得は約0.5ms。測定ばらつきがあるため最適化効果とは断定しない。

27の専用fixtureで、packageなし、serveのみ/buildのみ、ファイルCLI、HTMLテンプレート/テスト、既定値/明示引数/未解決、複数出力/同一更新/範囲外、既知ツール併存、文書の正負例、改名、shadowing、未呼出/条件、循環と有限配列を検証。任意の入力コード評価は行わない。

最終チェックは typecheck / build / lint / git diff --check が成功。全体テストは1,496成功・29スキップ（明示実行用の実入力gate等を含む）、失敗なし。最後のNode.js辞書ID補正後も関連3ファイル62成功・1スキップを再確認した。既存失敗の持越しはない。

最終結果は `.cache/static-site/` の `test-final.log`、`typecheck-final.log`、`build-final.log`、`lint-final.log`、`comparison.log`、`edge-results.json` に記録する。実入力4件と比較gateは明示して別実行する。buildには従来のtree-sitterのbrowser externalization/eval、500kB超chunk警告がある。

## 未対応・未観測の範囲

- 独自scriptはES importで確認するNode HTTP/file APIの限定パターン。任意の別ファイル関数の呼出展開、CommonJS独自script、callback/stream方式、動的設定全般は網羅しない。
- 全出力が動的でWeb成果物との対応が一切確認できないscriptは、今回の独自ビルドとして確定しない。確認できる出力を伴う未解決先は保持する。
- package配下の別rootにあるHTML、インラインJSだけのサイト、frameworkの出力/templateは無条件に別サイトへ分類しない。未対応を独立アプリの不在と読み替えない。
- 公開手順・GitHub側の設定・現在の稼働・実際の生成成功は未確認/未観測。文書の公開先は実行経路へ昇格していない。
- ブラウザのファイル選択ダイアログからの全入力再選択は未実施。同じ読取・スキャン・解析結果を実際のUIに渡した検証であり、公開環境での動作検証ではない。
- 原本変更・入力側コマンドの実行・公開URLアクセス・外部送信・push・本番デプロイは行っていない。
