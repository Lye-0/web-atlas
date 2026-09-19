# タブ10：表示集合の選択・個別要求の表示・種類の整理

検証日: 2026-09-13。開始HEAD: `f7fc32a5505a52b8916d3bc808302ebc4c7d0138`。
単独実装。原プロジェクトの変更・実行・外部送信、push、デプロイは行っていない。
開始時に存在した線端点の修正（spatialRelationPath / flowPolishGeometry / 既存docs差分）は保持した。

## 原因と修正

| 項目 | 原因 | 修正 |
| --- | --- | --- |
| F1 | 要求集合のクリックが通常の選択を迂回し、別のinspection stateだけを設定していた | 表示集合IDを共通の選択に記録し、上部選択情報、図の選択枠・関係強調、右側詳細へ接続。内訳の旧下部overlayは使用しない |
| F2 | 一時表示と明示展開の説明・戻す操作が不十分。残り1件が勝手に個別化され、明示展開では2D配置も再計算された | 現在の選択だけを一時保護。集合内1件も集合を維持。明示展開は元の予約座標を使用。元IDを個別表示と集合内に分割して件数を表示 |
| F3 | 個別要求が汎用名称で、3Dは表示用titleも使っていなかった | `HTTP要求：url` 等、記録式を短く表示。未特定の意味、要求元、ファイル・行・範囲、全文とEvidenceは詳細で確認。3Dラベルと読み上げにも反映 |
| F4 | 現在地の役割と要素種類が一続きで分かりにくかった | ラベルで「内部 · 種類：外部サービス」のように区別。詳細に現在地との関係・種類・環境を独立表示 |
| F5 | Suite宣言と接続API由来のサービス参照について、異なるIDの理由が目立たなかった | 型付きprovider/identity/configuration metadataを使った説明を追加。名称で分類・統合しない。ソースで確認した役割を一律「推定」と表示する点も修正 |

## 操作と保存条件

- 実構成：単クリックは選択、ダブルクリック／「内部を開く」は実階層への移動。
- 要求の表示集合：単クリックは共通右側詳細。ダブルクリックで内部移動しない。
- 「図で表示して選択」：元の要求IDをそのまま図へ取り出す。選択解除・別の選択で一時表示を戻す。詳細を閉じる操作では選択を残す。
- 「要求を個別に表示」：集合全体を明示展開。「まとめる」まで維持。個別要求から「元の集合の内訳を見る」で集合の詳細へ戻れる。
- 全件個別表示中は0件の集合ノードを作らず、集合の説明・件数・まとめる操作を右側に維持する。
- 件数はカメラやラベルの画面内外に依存しない。元要求ID = 集合内ID ∪ 個別表示ID、両者の重複なし。集合は実体数へ足さない。
- 通常の選択では現在地、訪問履歴、既存座標、カメラを更新しない。位置へのフォーカスは明示操作だけ。
- 一時表示と全件展開は同じ2D予約座標を使用。2Dの線経路や自動省略方式は再設計しない。

## Chessの根拠確認

ローカルの89ファイルの読み取り専用snapshotをWeb Atlas自身で解析。Chessのプログラムは実行していない。
HTTP未特定要求24件、起動要求2件、認証要求1件の計27件。件数はコードに固定しない。
`scripts/security/emulator-dynamic-verify.mjs:64` の要求式 `url` は元の要求ID
`architecture:["http-request-target","operation:scripts/security/emulator-dynamic-verify.mjs:2053-2114:fetch()"]`
のまま表示・選択できた。

Suite宣言:

- ID: `architecture:provider:firebase-emulator-suite|chess-64d14|local|suite:firebase.json`
- provider / identity.type: `firebase-emulator-suite`、kind: `external-service`、environment: `local`。
- project: `chess-64d14`、identifier: `suite:firebase.json`、identity.status: `confirmed`。
- Evidence: `firebase.json:8`、範囲163–172。個別Auth / Firestore Emulatorへのcontains関係を持つ。

接続API側のSuite参照:

- ID: `architecture:provider:resource:provider:["firebase-emulator-suite","src/lib/firebase.ts:1129:Firebase Local Emulator Suite · 接続設定","local","suite:."]`
- 同じprovider、kindは`external-service`、environmentは`local`。configurationOccurrenceを持つサービス参照。
- identifier: `suite:.`、projectIdentityなし、identity.status: `unconfirmed`。
- Evidence: `src/lib/firebase.ts:37`、範囲1129–1176。
- 元コードはdevelopmentかつ明示環境フラグの条件下で `connectFirestoreEmulator` と `connectAuthEmulator` を呼ぶ。
- `providerSourceAdapters.ts` はプロジェクトIDと所有範囲が対応する宣言を確認できるときだけ既存Suiteを再利用し、確認できなければ別resource occurrenceを作る。
- `stackArchitecture.ts` はこのresourceをサービス参照へ投影し、parentResourceIdから個別Emulatorの包含関係を構成する。設定オブジェクト自体への分類変更は不適切。
- このため両IDと既存関係を保持。設定の存在は起動・接続成功の観測ではない。

## 実ブラウザ確認

Edge、ローカル検証ページ、productionコンポーネントを使用。検証ページだけにカメラ・配置・sessionのread-only DOM診断を追加した。

| 確認 | 結果 |
| --- | --- |
| 2D 集合選択 | 共通右側詳細、上部の集合選択表示、図の選択枠を確認 |
| 2D 24→23＋1 | `HTTP要求：url` の元IDを選択。既存要素の座標変化0、カメラ同一、現在地project |
| 2D 詳細を閉じる | 選択と個別1件を維持 |
| 2D Escape | 一時表示を解除、元の集合24件へ戻る |
| 2D 全件展開／まとめる | 24件個別、集合ノードなし、集合詳細は維持。既存座標変化0、カメラ同一 |
| 3D 24→23＋1／元の集合へ | カメラposition/quaternion/zoom/target同一、共通要素のx/y/z変化0、現在地同一 |
| 3D 全件展開後のEscape | 選択だけ解除し24件の明示展開を保持。個別要求から内訳へ戻り「まとめる」も確認 |
| 3D 集合ダブルクリック | projectのまま。実体用の内部を開く操作なし |
| 3D Suite単クリック／ダブルクリック | 単クリックはprojectの詳細。ダブルクリックはSuite内部へ移動。Authは内部かつ外部サービス、Firestoreは内部かつリソースを維持 |
| 狭い画面 | 390px指定・実測CSS幅422px。横overflowなし、内訳20→24件の追加表示と個別要求の選択を確認。ボタン・長いパスの折り返しを目視確認 |
| 他タブ | Function Call Flowの読み込み確認。共有の選択、ラベル、カメラ、他タブの詳細は全体テストでも確認 |
| コンソール | 確認時errorなし |

ブラウザ操作中の最初のスクリーンショットで、3Dの旧名称と未装飾ボタンを発見し再修正した。

## 自動テストと制限

- 全体: 120ファイル成功、4ファイルskip。**1288テスト成功、8skip、失敗0**（85.97秒）。
- 新規: 0/1/2/24件、現在選択の入替・解除・再選択、元ID分割、全件展開と座標保全、複数owner/environment、式のマスク、metadataに基づくSuite説明。
- ページ統合: 共通詳細への選択、個別表示、詳細を閉じる、解除、展開維持、元集合への戻り、まとめる、scope/history保全。
- 最終の文言・選択読み上げ・hover context修正後、関連53テスト再実行成功。typecheck / lint / diff checkも再確認した。
- build / typecheck / lint / diff check成功。buildのtree-sitter eval・Node組込externalization・大きなchunk警告は既存依存によるもの。
- 実タッチ端末・Safari/Firefox・スクリーンリーダー実機は未検証。明示ボタン、キーボード、狭いEdgeで代替確認。
- すべての巨大プロジェクトでのGPU性能や長時間heapは未計測。今回新しい全件Evidence描画は追加せず、内訳の段階表示を維持した。
- 実際の接続成功、稼働状態、未特定URLの解決は確認対象外。未確認のSuite同一性は未確認として残す。
