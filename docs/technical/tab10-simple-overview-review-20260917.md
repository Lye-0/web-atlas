# 簡易全体の検証（2026-09-17）

## 基準と範囲

開始HEAD f950d20、ブランチ「小規模修正３」、作業ツリーは変更なし。単独実装。3入力は既存の読み取り専用browser.storeスナップショットを再解析し、現行全体・既存プリセットの対象・関係・座標を変更前に保存した。変更後に同じデータ構造と比較して一致。解析コードの変更なし。

実入力の原本は変更・実行・外部送信していない。主要なscript/configだけを読み取り照合した。スナップショット以降の原本全体の差分再収集はしていない。例えばvehicle-managementのAPIのmanifest名は原本でapi、スナップショットでvehicle-management-apiであり、検証画面は後者の記録を示す。

## 規則と元データ対応

- アプリ・共有コード・リソース・外部サービスは元IDで残す。名称だけで統合しない。
- 内部責務、logicalOwnerIdの一致するコードと実行構成を論理構成の内訳にする。実行主体を持つWebviewや別アプリは残す。
- 道具は所有・用途・環境・操作先・入出力の組み合わせで集約。SQL生成、DB適用、起動、公開を混ぜない。scriptは内訳へ格納し、分岐や条件の元関係も保持する。
- 未特定要求は要求元ごとの内訳・件数にする。要求元が対応できない集合も削除しない。
- 既存モデルの補助用途判定に従い、構成と道具を別の補助集合にする。推定の用途を確定扱いしない。元のアプリID・環境・定義に戻れる。
- 線は既存関係の端点を要約単位へ写したもの。新しい多段階経路を推論して追加しない。元の内部関係、直接関係、集約、provenanceの原関係・中間対象を区別する。全元対象・全元関係が内訳または表示線に1回対応することを検証した。

## 3入力の図

同条件（プロジェクトルート、追加フィルターなし、補助構成を含む、自動省略前）の表示単位数。実体数・実行回数ではない。

|入力|元モデルの対象／関係|詳細全体の表示要素／線|簡易全体の表示要素／線|
|---|---:|---:|---:|
|vehicle-management|167 / 7,504|60 / 100|38 / 68|
|git-lines|69 / 2,438|54 / 37|9 / 9|
|web-atlas|20 / 8,549|13 / 22|6 / 12|

通常の全体初期設定ではTestを除くためvehicle-managementは59要素/98線。簡易全体はTestも補助の内訳に残す。表は比較条件を揃えた数値。

- vehicle-management：Web/API、Companionと別.NETアプリ、共有コード、環境別DB、認証・保存先を分離。Vite、Wrangler、Firebase CLI、Drizzle Kitの用途が図に残る。別実体・未特定のサービスを無理に統合していないため38要素ある。全景Fitでは文字が小さく、読み込みには拡大が必要な箇所がある。
- git-lines：拡張本体とWebviewを区別。WebviewのVite開発・ビルドとWeb成果物、git起動先を保持。実験記録の構成と道具は推定の補助集合へまとめた。
- web-atlas：アプリ、Vite開発／ビルド、Wrangler起動／公開、distの6要素。架空のAPI・DBは追加していない。

ローカル画面記録：`.cache/simple-overview/vehicle-2d.png`、`vehicle-3d.png`、`git-lines-2d.png`、`git-lines-3d.png`、`web-atlas-2d.png`、`web-atlas-3d.png`、`narrow-fixed.png`、`narrow-detail-fixed.png`。

## 根拠の照合

- vehicle-management：apps/api/package.jsonのWrangler起動・公開・local/remote DB適用・Drizzle生成、apps/web/package.jsonのViteとproductionモード、ルートpackage.jsonのAuthエミュレーター起動。apps/api/drizzle.config.tsのschema/out、wrangler.jsoncのmain・assets・環境別DB binding・migrations_dirを読んだ。既存の接続とIDを再利用し、動的設定・通信の再判定はしていない。
- git-lines：package.jsonのbuild:webview/dev:webviewと、webview/vite.config.tsのroot=webview、outDir=../dist/webviewを照合。拡張本体をViteの配信対象へ誤統合していない。
- web-atlas：package.jsonのdev/build/preview:cloudflare/deployとwrangler.jsoncのassets.directory=./distを照合。Workerの動作や公開成功は観測していない。

## 操作・実ブラウザ

ブラウザ操作スキル（agent-browser、専用Chromeセッション）で確認。3入力の2D/3Dを開き、実ブラウザのエラーなし。1440×1000と390×900で確認。

- 2Dのツール選択と3DのDB適用選択で共通詳細欄を確認。内訳からVite元操作を指定し、全体へ移動した選択先が一致。
- 要約線はEnterでも選択でき、公開操作と実行構成の元対象・Evidence導線を確認。重なるSVG線は自動操作の中央クリックで拾えない場合があり、キーボードで補った。
- git-linesで実際に3Dドラッグ回転→2D→3Dを行い、保存カメラの完全一致を確認。全体へ戻した2Dカメラ、簡易へ再訪した3Dカメラも一致。scopeはprojectのまま。
- 自動省略OFFでもweb-atlasは6要素の簡易図を維持。囲いOFFで3D環境見出し0件。隠れたCanvasの同時稼働なし（表示中1枚）。
- 狭幅の詳細表示は図を潰さず縦スクロールで両方へ到達。通常の単クリックでは配置・内容・scopeを変更しない。
- UI回帰テストで内訳検索、選択時のカメラ／表示ID不変、2D/3D選択、全体復元、再訪の検索・選択、元対象への明示移動、実scope保持を確認。

## 性能

3入力のPreparedArchitectureScopeを用意した後の簡易投影初回：約72 / 33 / 130ms（vehicle / git-lines / web-atlas）。同じ入力のキャッシュ参照100回：約0.015 / 0.039 / 0.035ms。既存全体投影のキャッシュ参照100回：約0.327 / 0.069 / 0.102ms。単一マシンの参考計測であり、GUI全体のFPSや全端末の保証ではない。

選択や回転で要約・配置を再生成しないこと、基準全体・プリセットの投影一致を検証。元関係は有限リストで保持し、経路全列挙は行わない。大量の元関係/Evidenceを開閉前にDOMへ全描画しない。

## 検証と残る範囲

- 全回帰：1,378件成功、16件skip（131ファイル成功、10ファイルskip）。その後追加した元関係・中間ID・Evidence開示テスト1件も成功。
- build / lint / typecheck成功。buildは既存のchunkサイズ警告あり。最終差分の再確認結果は完了報告に記載。
- 同名別ID、別環境・用途・出力の道具、孤立アプリ、DBなし、循環、未特定所属、実scopeと外側相手、全ID/関係の保全を独立fixtureで検証。
- 全体・既存プリセットのデータ／配置比較は3スナップショットで実施。原本の最新全ファイルの再収集、全端末・全操作の総当たり、長時間メモリ計測、実通信・実デプロイは未実施。
- 2D線の回り込みと多数線の交差は既存方式を維持。今回の要約が既存解析で未特定の接続を補うことはない。
