# タブ10：クリック操作・基本範囲・配置の安定性

2026-09-13。添付F1〜F4に基づきCodex単独で調査・再現・実装・回帰・実ブラウザ再修正を実施。

## 基準と入力

- ブランチ: 小規模修正３、HEAD: 28bcfa195bd47323ab400111d1addfe232a3fbf3。開始時の作業ツリーはclean。既存実装を戻していない。
- Chess原本は読み取り専用。Web Atlasの除外対象に合わせた89ファイルをローカルの検証入力へ複製し、81ソースをsemantic解析。原本のscript実行・変更・外部送信はしていない。
- 正式representative自作17ファイルでも確認。git-lines /vehicle-management /web-atlasは既存固定入力の全体テストで回帰。
- 一時サーバーはloopback 5188。検証用state/カメラ/点座標は.cache/tab10-reviewのharness・Vite変換でDOMへ出した。製品コードに診断ログ・常時監視を残していない。

## 原因と修正

| 項目 | 確認した原因・再現 | 修正と結果 |
| --- | --- | --- |
| F1 | nativeの単クリックdetail=1だけで内部へ入る報告そのものは今回未再現。ただし、旧workspace captureは2回目の元対象IDを確認せず最初のIDへ転用していた。別ボタン・別対象を同位置で操作する反例が旧テストでも許容されていた | useArchitectureNodeGestureを対象側のnative detail=2＋同じ元ID＋同じcontext＋時間/距離確認に変更。captureは取り消しのみ。葉・表示集合は共通canOpenで除外。実クリックは即時選択、再単クリックでは移動しない |
| F2 | 旧projectArchitectureScopeのconnections/shownがselectedNode/selectedEdgeを起点に外側の全近傍を追加。Chess Suite内部で外側chessを選ぶと3表示対象→10、代表する元対象3→34、線2→9 | 基本範囲を現在地・filter・環境・周辺・明示展開だけで確定。通常選択は同じgraphを再利用。修正後は3対象・2線のまま。周辺OFFで表示外になった選択も詳細と明示移動は維持 |
| F3 | F2の変更で2Dの段階layoutが変わり、既存2ブロックの位置が変化。選択ごとにgraph identityも変わり3D静的入力を再生成。追加確認では、3Dラベルがパネル幅変更で左へ移動/拡大し、未選択dblclickの2回目が外れた | 基本投影と初期2D座標を条件単位で再利用。未特定要求の選択保護は既存配置を動かさず追加位置へ表示。既存viewportAnchor/カメラ保存を維持。3Dラベルはポインター操作中だけ同じDOM要素をmanual top layerに保ち、同じ矩形で2回目を受ける。別対象への操作を最初の対象にすり替えない |
| F4 | architectureScopeRole=directの補足と3D集合が「接続先」を内外分類として表示 | 「外側の接続相手」へ統一。入る/出る、要求先、HTTPの未特定接続先など実際の方向を示す表現は維持。片方向両種・双方向のテストでsource/target不変を検証 |

主変更: architectureProjection /flowPresentation /useArchitectureNodeGesture /SemanticFlow2D /SemanticFlow3D /semanticFlowLabels /ArchitectureNavigation /ArchitectureDetail /semanticFlowDisplay /FlowAnalyzerPage。解析adapter・分類・元モデル・2D線経路の設計は変更していない。

ラベルの一時保持は、pointer leave/cancel、別操作、wheel/scroll/key、window resize、visit変更、unmountで解除する。タイマー待ちで単クリックを遅らせない。top layerを使えないブラウザでは通常のラベル配置と明示ボタンを維持する。

## 実操作の確認

実ブラウザはWindows Edge。主なChess検証は約1421×976 CSS px、通常表示では縦スクロールも使用。自動クリックの事前スクロールによるpage座標変化はアプリの移動と混同せず、描画完了後・同じviewport/スクロール位置で比較した。

| 操作 | 2D | 3D |
| --- | --- | --- |
| 単クリック・十分に間を空けた同一対象の再クリック | Chess Suiteと外側chessで選択のみ、scope/履歴不変 | ChessのCanvas点と外側ラベルで選択のみ、scope/履歴不変 |
| 未選択からの実ダブルクリック | Chess外側chessのブロックから正規内部へ1visit | 独立sampleのSuiteラベル、apiのCanvas点から各1visit。追加発見したラベル移動も修正後に再確認 |
| 選択済み対象の実ダブルクリック | Suiteへ1visit | ChessのCanvas点から1visit |
| 明示ボタン・キーボード | 既存navigation/stateテストで共通open・履歴を確認 | Chessの「この構成を開く」をEnterで実行、1visit |
| 外側選択 | Suite内部2＋外側1、線2のまま | ONの周辺概要を維持。外側Firestoreを選んでも再帰展開しない。周辺/自動省略OFF/OFFでも3対象を維持 |
| 戻る・親へ | 外側chessから親へでproject。偽のSuite→chess親子にしない | 戻るでSuite、選択と保存cameraを復元 |
| ドラッグ・空白 | 実パンでcamera x+90/y+40、scope/履歴不変。空白で選択解除のみ | 実ドラッグで回転、scope/選択/履歴不変 |
| 詳細閉じ・通常/全画面 | 選択保持、画面中心/カメラ不変 | 選択保持。通常/全画面両方で確認、パネル縮小後も点とcameraを保持 |

異なる対象への高速クリック、pointer cancel、ドラッグ後の古いクリック、同時の二重open、葉・表示集合、古いラベルのblurによる新ラベルの保持解除は正式テストでも検証した。pointer cancelのOS実機発生と実機touchは未検証。実機touchの代替となる明示ボタンは維持。

## 安定性の測定

- Chess Suite内部の2D: 外側選択で基本ID集合・辺ID集合・3ブロックのtransform・カメラが一致。全画面で各ブロック中心の画面座標差0px。通常表示も同じ位置から実座標クリックし、描画完了後の中心座標一致。
- Chess 3D: 外側Firestore選択で全10描画点のworld座標差0、画面投影座標差0、position/quaternion/target/zoom一致。
- 通常3Dパネル表示でcanvas幅1368.91→994.91px。描画完了後の最大点位置差2.28e-13px（浮動小数点誤差）、camera値一致。明示Fitと回転・パンは有効。
- 2Dのrequest group保護では代表する元集合を保持し、選択を取り出しても既存座標不変。元modelのJSONは操作前後で一致。

同一Chess model、同一条件で100回交互選択し、投影→必要時2D layout→3D静的入力の取得を1warmup＋5回測定した中央値は、旧HEAD 76.38ms→修正後0.154ms。6回計600選択で静的入力の生成は600→1。これはNodeの投影/配置準備の比較であり、ブラウザのクリック応答やGPU FPSではない。単クリックに新しい待機時間は追加していない。

## テスト・回帰

最終結果は末尾の実行記録を参照。新規architectureStableScope.test.tsは範囲・2D座標・3D静的入力・要求保護・方向中立性を検証。architectureLabelPointer.test.tsは同じDOM矩形の保持と解除・未対応API fallbackを検証。旧テストの「外側選択なら全近傍を追加」「別要素の2回目を最初の対象へ転用」は今回の要件と衝突するため新契約へ更新した。

実ブラウザではrepresentative入力のタブ1〜9を表示しerrorなし。共通部品を使うタブ9は単クリックでapps階層へ入る従来動作と、3DのUserInput選択を確認。タブ6〜9のpointerup/通常選択・カメラ・履歴・集約は既存suiteで確認。全タブ×全ブラウザ×全操作の総当たりではない。

buildのtree-sitter externalization/eval/large chunk警告は既存依存由来で残る。実機touch、非Edgeブラウザ、OS由来pointer cancel、GPU FPS、全周辺/省略設定の組合せ総当たりは未検証。修正前動画の生イベントログが無いため、報告された「純粋な単クリックで内部移動」の発火原因は断定していない。

証拠は.cache/tab10-reviewのbefore-after.json、final-suite.json、読み取り専用入力と一時harness。原本変更・push・本番deploy・commitは行っていない。

## 最終実行記録

- 全Vitest: **1277成功 /0失敗 /8skip**。117 files成功/4skip、100.71秒。
- pnpm build: 型検査を含め成功、412 modules、Vite 17.74秒。
- pnpm lint、git diff --check: 成功。
- repository memory: クリック保持の既存記録を更新、基本範囲と選択の分離を新規candidateへ保存。validator警告0、INDEX生成成功。
- 3D追加最終ケース: 未選択apiのCanvas点を実doubleして正規scopeへ移動、履歴3→4。Suiteラベルの未選択doubleも1回移動し、遷移後popover残留0。
- 最後のラベル変更後にもタブ9 UserInputの3D選択、popover使用0、ブラウザerror0を確認。
- 専用サーバー停止・検証タブ閉鎖済み。診断用コードは.gitignore対象の.cache内に限定。
