# タブ10 簡易全体：Next.js・VS Code拡張の一般性検証

2026-09-19。開始HEAD 383aaf6、ブランチ「小規模修正３」、未コミット変更なし。Codex単独。比較用原本はChess 116ファイル、git-lines 1,899→1,900ファイル、vehicle-management 254ファイル。git-linesの増分は、今回読取対象に追加した.vscodeignore。標準の除外規則と秘密情報保護を使用し、入力コード・設定・scriptは実行せず、読み取り解析した。

## F1：Chessで欠けていた段階

package.jsonにはdev=next dev、build=next build、start=next startが存在する。Next.jsは16.2.9。next.config.tsはconstの空設定をdefault exportしている。使用中の原本に3コマンドがあり、共通Command Flowから取り出すarchitectureCommandsにも3断片が存在した。Architecture Mapの操作変換がNextを扱っておらず、操作0件だった。scopeや簡易要約で削除されたものではない。

共通CLI分類へNextを追加し、解決済みコマンドをArchitecture側で原本→開発配信操作→開発サーバー、原本→ビルド操作→.next→next start→読込構成へ対応させた。単純な成果物受け渡しは既存の要約規則で短縮されるが、選択した線の元の段階と内訳へ戻れる。元の1アプリをWeb/APIの別アプリには分けていない。

確認できたのは静的定義。生成済み・起動済み・公開済みを示さない。Next.jsのビルドモードは配備先環境とは別に保持し、Vercel等の公開先は追加していない。Firebase関連ファイルだけを理由とするCLI起動操作も追加していない。Chessのsecurity scriptはNode実行の定義として既存解析に残るが、その任意コードからFirebase起動手順を推測していない。

[Next CLI公式仕様](https://nextjs.org/docs/app/api-reference/cli/next)、[distDir](https://nextjs.org/docs/app/api-reference/config/next-config-js/distDir)、[出力形式](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)と照合した。リテラルのdistDir、export/standalone、対応バージョン、空設定を扱う。動的export、書換えられる設定、見つからない入力rootでは確認できた操作までを残す。

## F2：操作なし・部分的な経路の配置

以前はサービスを一列へ置いた後の末尾位置から原本を配置していた。起動経路がない場合ほど、原本がサービス列の下端へ追いやられた。

準備経路なしの場合は、原本を左側へ置き、確認済みcontainsによるサービス群を複数列に置く。独立したコードパッケージも、実行主体へ分類変更せず起点として読める。関係の向き、循環、孤立対象を保持する。サービス群の高さを使って列の空きへ詰め、単なる全高の行や一列への積み上げを避ける。既存経路がある場合は、経路外の包含サービス群だけにこのコンパクトな配置を使う。

[操作なしfixture](../../.cache/generality/no-operations-after-full.png)。この入力のpackage.jsonには操作scriptがなく、解析モデルにもtool-operationは0件。原本とFirebaseの設定/使用、包含だけを描いている。[3D](../../.cache/generality/no-operations-after-3d.png)も同じ元対象・関係を使う。名前や要素数に合わせた固定図ではない。

vehicle-managementは全主経路・共有コード・囲いの配置を維持し、2Dと3Dの全座標が基準版と一致した。

## F3：git-lines本体・Webview・配布

原本に確認したもの：

- build:extensionがnode scripts/build-extension.mjsを実行する定義。
- build-extension.mjsはesbuildのbuildをimportし、src/extension.ts→dist/extension.jsを静的なオブジェクトで指定。
- build:webviewはVite、Webview出力はdist/webview。既存の開発配信/ビルド経路を維持。
- main=./dist/extension.js。engines.vscodeと併せてExtension Hostの読込設定を示す。
- .vscode/launch.jsonはextensionHost、extensionDevelopmentPath=${workspaceFolder}、preLaunchTaskを指定。
- packageはvsce package ... --out releases/。manifestのname/versionからこの指定のVSIX名へ対応できる。
- .vscodeignoreは除外後、dist/extension.jsとdist/webview/assetsのJS/CSS等を明示再包含している。

既存解析はesbuildの入力/出力宣言を既に検出していたが、Nodeコマンドからそのbuild呼出へ対応していなかった。buildAdaptersの型付きASTによるimport/require照合を再利用し、呼出ファイル、トップレベル性、入出力、cwdを検査して生成操作へ接続した。別scriptを呼ぶpackage managerの関係は共通Command Flowをそのまま利用する。

図では、拡張原本→esbuild→拡張成果物、Webview原本→Viteビルド→Web成果物の両方から、明示包含範囲を根拠にVSCEパッケージ化→VSIXへ進む。Viteの成果物受け渡しは既存規則で短縮されても元段階を保持する。通常のExtension Host読込設定と開発用Hostを区別し、成果物を読む設定として結ぶ。Webviewの開発配信先と、VS Code内で実行済みのWebviewを同一視していない。

主な定義で確認したのはパッケージ化まで。Marketplaceへの公開やVSIXのインストールを実行する定義は、主経路として確認できず追加していない。vscode:prepublishの名称やpublisherの存在だけでは公開としない。補助の記録・実験用コピーにある成果物/読込設定は、元の補助用途と所有IDに基づいて既存の内訳へ保持する。新しい情報を隠すために元IDを削除していない。

[esbuild公式API](https://esbuild.github.io/api/)、[VS Code manifest](https://code.visualstudio.com/api/references/extension-manifest)、[パッケージ化と公開](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)を参照した。パッケージ化・読込設定・明示publishは別の意味として扱う。

## F4：Firebaseの類似対象

Chessではfirebase.json/.firebaserc側にプロジェクトと各Emulator設定があり、src/lib/firebase.ts側のinitializeAppは環境変数からprojectIdを読む。接続APIには明示ホスト/ポートがあるが、そのコードが設定側と同一projectで動くことを静的には確定できない。秘匿ファイルの除外を解除して推測を補うこともしていない。

既存の同一性規則は変更せず、別対象を維持した。カードと詳細へ「設定で定義」「コード側の接続設定」、同一性を確定できない理由を追加した。Suiteの包含とアプリの利用を同じ関係にせず、localとdevelopment環境も分離する。

[区別の説明](../../.cache/generality/Chess-firebase-reason.png)。別fixtureでは同一projectとendpointが確認できる正例を検証し、1対象に両方の根拠が保持されることを確認。同じendpointでもprojectが静的に不明な負例は2対象のまま。見た目のための統合はしていない。

## 修正前後と主要経路の画面

1600×1100、同じ保存入力から得た新旧モデル、2D全画面でFit。撮影中の選択の有無は各ファイル名で区別。描画方式は実際のWeb Atlasのコンポーネントを使用し、ローカルの検証ハーネスが今回読み取り解析したモデルを供給する。

| 入力 | 修正前 | 修正後 | 選択・説明 |
|---|---|---|---|
| Chess | [全景](../../.cache/generality/Chess-before-full.png) | [全景](../../.cache/generality/Chess-after-full.png) | [ビルド](../../.cache/generality/Chess-route-selected.png) / [3D](../../.cache/generality/Chess-after-3d.png) |
| git-lines | [全景](../../.cache/generality/git-lines-before-full.png) | [全景](../../.cache/generality/git-lines-after-full.png) | [本体ビルド](../../.cache/generality/git-lines-route-selected.png) / [パッケージ化](../../.cache/generality/git-lines-package-selected.png) / [3D](../../.cache/generality/git-lines-after-3d.png) |
| vehicle-management | [全景](../../.cache/generality/vehicle-management-before-full.png) | [全景](../../.cache/generality/vehicle-management-after-full.png) | [原本選択](../../.cache/generality/vehicle-management-after-selected.png) / [D1の3D詳細](../../.cache/generality/d1-multiple-3d.png) |

## 元データ・他表示への影響

| 入力 | 正規対象 前→後 | 正規関係 前→後 | 簡易表示点 前→後 | 表示線 / 注記束（後） |
|---|---:|---:|---:|---:|
| Chess | 44→51 | 2,308→2,320 | 11→16 | 19 / 4 |
| git-lines | 80→121 | 18,231→18,281 | 9→13 | 18 / 8 |
| vehicle-management | 379→379 | 14,592→14,592 | 39→39 | 59 / 14 |

3入力で既存元IDが全て残り、既存関係はEvidenceを含めて一致する。簡易の全元対象・元関係の収容も検査した。git-linesの正規対象増分は主構成だけでなく、記録用コピーに実在する設定を含む。使用が確認できたesbuild出力の分類をresourceからartifactへ精密化したが、元IDと宣言の根拠は保持。

詳細な全体の投影方式は変更していない。共通解析で追加した操作・成果物・読込設定は全体にも現れる。既存のビルド・公開プリセットへpackage用途を含め、flow-loadsを入出力側の設定関係として扱う。架空の簡易専用データを作ってView間で事実を変えていない。元の本体/Webview間のコード参照・call・callback等をHTTPへ読み替えたり削除したりしていない。

## 操作・テスト・性能

- Chess/git-lines/操作なしfixtureで、通常選択、詳細、全体/簡易全体、2D/3D、パン・ズームを検証。Chess/git-linesでホバー、内部移動、戻るも実施。
- 選択・ホバーでは位置とカメラを変更しない。表示切替では各状態を復元する。Nextの検索・解除、完全コマンドのコピー→貼り付け一致、全体の元使用への移動も確認。
- vehicle-managementのD1個別線10本を実際に選択し、開発/local・本番・既定設定と複数対象の対応が2D/3Dで一致。
- [760pxのgit-lines詳細](../../.cache/generality/git-lines-narrow.png)。document幅は760pxで横のはみ出しなし。
- 全テスト1,469成功、27skip。今回の実入力再解析・比較・ブラウザfixture出力は環境変数付きの別ゲートで実行し成功。通常skipを実施済みと混同していない。
- lint、typecheck、build、git diff --check成功。tree-sitterのfs/path外部化と大きなchunk警告は既存。
- 初回チェックの旧テスト2件は、追加情報の根拠を確認して更新した。esbuildの生成物分類と、全体で増えるesbuild/Host読込の相手であり、単に件数制約を削除して通したものではない。検証用レポートの型注釈不足も修正した。
- 正負fixtureは直接CLI、別script/Nodeビルドファイル、require/別名import、依存のみ、出力方式、動的export、入力root未検出、cwd、条件下/未呼出build、別コマンド別成果物、複数成果物のVSIX包含、明示publishのみ、Firebase同一性、孤立/循環/独立原本を含む。
- 単発投影比較はChess 47.3→39.9ms、git-lines 454.2→345.2ms、vehicle 308.9→267.5ms。統計的な速度改善は主張しない。100回のキャッシュ再取得は各入力で約0.5～0.7ms、同一オブジェクトを再使用。モデルの関係を選択のたびに再解析しない。

## 未対応・未確認の境界

- 任意のNext設定関数、動的な設定合成・バージョン未確認の既定出力は確定しない。
- 任意のbuildファイル間の実行経路、未呼出関数、条件付き実行、可変/変更済みオブジェクト、動的/曖昧なcwdを一般的に実行解析する機能は追加していない。確認した初期宣言と、操作に対応する確定入出力を区別する。
- VSIXの完全なファイル一覧計算、全てのignore構文、任意task型やpreLaunchTaskの実行手順展開、browserだけを持つWeb拡張の実行先解決、カスタム公開ツールは未網羅。main/launchの設定・元根拠は保持する。
- 実際の起動・ビルド・インストール・公開・稼働は全て未観測。入力原本の変更・実行・外部送信、push、デプロイなし。
- 長時間FPS/メモリ、実タッチ端末、全カメラ角度、全操作組合せは未検証。確認したブラウザ操作で未解決の不具合はない。

UI知見は既存のrepresentative-verificationとaction-relationshipsを使用。新しい普遍的なUIルールは追加せず、元宣言と操作対応、経路なしの配置というプロジェクト固有の制約をrepository memoryへ保存した。
