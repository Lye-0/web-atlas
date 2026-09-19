# 表示内容プリセットの意味・範囲・操作の仕上げ

2026-09-17。着手ブランチ: 小規模修正３、HEAD: 7ce445bdff4dd15ec829574c8775c31cf01af798、未コミット変更なし。着手時の関連テスト23件成功。サブエージェントなし。原本の変更/実行/外部送信、push、デプロイなし。

## F1 論理定義

原因は環境見出し用のdefinition区分をそのまま起点に使い、code-definition等から入出力・通常通信へも範囲を伸ばしていたこと。全体分類が誤っていると判断した修正ではない。

論理単位（application/component/code-package/shared-code）を中心とし、直接のflow-definition/flow-servesで対応するexecution-configを残す。同じlogicalOwnerIdに基づくcode-definition→execution-configの実在するflow-configuresと、そのコードのflow-definitionを補助にする。元の向き・ID・Evidence・オブジェクトを保持。関係のないsource断片、操作、Migration、DB、認証、未特定要求へは広げない。両端が残ってもhttp-request等を戻さない。対応未解決の論理アプリも残す。

| 固定入力 | 正規モデル 対象/関係（不変） | 論理定義 修正前 | 修正後 |
| --- | ---: | ---: | ---: |
| vehicle-management（194ファイル） | 167 / 7504 | 143 / 336 | 36 / 9 |
| git-lines（1814ファイル） | 69 / 2438 | 33 / 10 | 25 / 2 |
| web-atlas（244ファイル） | 20 / 8549 | 17 / 13 | 11 / 7 |

値は投影前の対象/関係数。ブラウザvehicleは前回からの定義確認用2ファイルも含む196ファイル版で、169対象。こちらは145/336→38/9。APIのdevelopment/production/既定実行構成とWebの開発配信を確認。多数の正当な論理単位には件数上限を設けない。

## F2 未特定の意味

architectureEnvironmentContextは、正の環境名、共有宣言、論理種別、既定設定、設定出現箇所の場所だけのタグを判別する。名前だけのproductionやexecutionPlace='unconfirmed'を根拠に環境を決めていない。

vehicleのpackage.json:16/17/22のbuild:production/deploy:production/migrate:production開始scriptは、それ自体の環境名の記録がなくunknown。一方apps/api/package.json:7のwrangler deploy --env production操作は、environmentSource「コマンドの明示環境指定」、対象production、executionPlaceはunconfirmed。この区別は正常なので解析処理を変更していない。

名称を「対象環境未特定」にし、対象・所属の環境名と実行場所を区別する短い案内を追加。詳細の「表示内容への含まれ方」で中心/直接の相手・経路/定義・所属の補助を区別。script自身の未特定と呼出先の環境を説明する。既知環境の相手は自身の環境名のまま説明する。ブラウザでdeploy:productionの説明を確認。

## F3〜F5 選択と案内

- 「環境・設定から見る」「構成区分から見る」「経路から見る」に分離。既存候補IDを保持。
- 「全体 — 現在の構成図」→「全体」、「development の構成」→「development」、「共有…の構成」→「共有（…）」。「論理定義」も構成区分へ移動。
- 実環境と区分等が同名なら環境名を引用した識別表示を付ける。表示名の略号/連番置換なし。
- select幅を画面幅に合わせ、全文は直下に折り返し表示。長い日本語のstaging/release共有サンプルで1440/768/390pxの横幅内収まりと全文一致を確認。390px全画面でも操作可能。件数ヘルプはキーボードEnterで開閉。
- 通常表示は目的説明、「内容全体：N対象・M関係」、全体への導線。数え方は「範囲と件数について」へ移動。「現在の階層・条件」の投影件数と区別。
- 階層内に中心/相手がない場合と、フィルターで0件の場合の案内を分離。検索0候補は既存の検索欄で案内。数値は変更せず、カメラから独立。

## F6 状態復元

既存architectureContentStateを変更していない。以下を実ブラウザで確認した。

1. vehicle全体で検索vehicle、対象選択、ズーム、パン→DB内容でSQL選択、ズーム、パン→全体。全体の検索/選択/カメラ/座標が一致。DB再訪でDBのカメラ/選択/scopeが一致。
2. DBで2D→3D、90×50pxのドラッグで回転→2D→3D。2Dカメラ、3Dのposition/target/zoom/viewportAnchorが完全一致し、選択とscopeも保持。
3. 全体のAPI要求集合5件を明示展開（集合0+個別5）→DB→全体。5件の展開、集合選択、検索、カメラ復元。DBへ展開は混入しない。
4. web-atlas全体のdevelopmentフィルター→論理定義→全体。全体フィルター復元、論理側は独立。粒子OFF、3D分類囲いOFFも往復で維持。
5. git-lines/web-atlasの論理/未特定/3経路/全体の往復で全体の座標とカメラが一致。

入力交換、内部scopeの空表示、候補ID、フィルター/展開/カメラの分離は一般サンプル・既存ページテストでも確認。通常選択と明示移動の分離は既存テストで維持。任意の全組み合わせを実ブラウザで網羅したという意味ではない。

## 全体・性能・回帰

- 同じvehicle入力・1440×1000で着手HEADのsrcを別モジュールとして読み込み、現行と比較。全体の60表示ノード、関係ID、world座標、初期カメラが完全一致。
- 全3入力の論理定義以外の全候補について、修正前記録と対象ID/関係IDを比較して一致。4経路と正常な環境別表示を維持。すべての範囲生成後、正規モデルJSON不変・元オブジェクト参照同一を確認。
- 初期表示（読み込み/解析込み）単回は変更前15207ms、変更後13715ms。順番・キャッシュの影響を含むため改善の統計的断定はしない。
- 切替から2回requestAnimationFrameまで: git-lines 51〜87ms、web-atlas 84〜117ms。カメラ/選択で範囲を再生成しないWeakMapと既存配置キャッシュを維持。ページテストで切替による追加解析ジョブなし。
- 使用中の3DはCanvas1個、2Dは0個。Function Call Flowに表示内容selectの混入なし、3D表示を確認。共有の詳細部品・ナビゲーションはタブ10に限定した追加。
- build、lint、typecheck、git diff --check成功。全スイート1364成功/14skip、127ファイル成功。最後の同名表示調整後の関連17件も成功。opt-in実入力照合1テスト内の3プロジェクト成功。
- buildの大きいchunk警告は既存。検証用ページのfavicon404とmain.tsx編集時のcreateRoot HMR警告があった。再読み込み後のgit-lines/web-atlas操作にpageerrorなし。MCPの待ち時間エラーはアクセシブル名/詳細欄セレクターを直して再検証。別セッションとの干渉は確認されず、Edgeへの切替は不要だった。

## 未検証・制約

実入力は固定スナップショットの範囲。無制限の全ファイル走査、全scope×全候補×両モード、物理タッチ端末、スクリーンリーダー、長時間のheap/GPU資源測定は未実施。リークなしとは断定しない。未解決の実行構成の対応や実行/通信の観測は新たに補完しない。

画像/測定資料はローカル`.cache/preset-polish/`のbefore-logical.png、after-logical.png、unknown-script.png、long-name-narrow.png、git-lines-logical.png、web-atlas-logical.png、actual-before/after.jsonと各log（コミット対象外）。UI知見state-and-copyの「通常の判断材料と詳細を分ける」を適用した。今回の追加はプロジェクト固有のモデル意味であり、一般UIスキルの改訂は不要と判断した。
