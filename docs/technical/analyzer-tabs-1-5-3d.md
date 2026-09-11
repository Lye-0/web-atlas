# Analyzer タブ1〜5の2D／3D境界

2026-09-11。タブ1〜5は初回2Dで開き、同じ論理モデルを使う3D表示へ任意に切り替えられる。既存AのHTML/SVGとBの固定視点Module地図は維持する。

## Viewごとの意味

| View | 3Dの表現 | 元の意味・同一性 |
|---|---|---|
| Stack Map | Scopeの薄い立体境界と技術の点・隣接ラベル。Scopeの接続端点にも点を置き、まとまりを奥行きへ分ける | Project、Scope別Stack Usage、実在するcontains。架空のusesを追加しない |
| Workspace Flow | Project／config→pattern→packageの点をつなぐ主方向と枝の奥行き | 0一致・複数pattern一致・root packageのcontainsを保持 |
| Command Flow | executionRankをx、laneをy/zへ配置する点と隣接ラベル | entry、branch summary、operator・parallel metadata、循環・未解決の限界を保持 |
| Package Dependency | 内部package・Technology・外部packageをすべて点として配置 | 直接依存宣言。名前ベースの外部package同一性、versionRange、dependencyType、Evidenceを保持 |
| Module Dependency | 元FileをXYZへ詰める立体点群、Package／Directoryの包含境界 | 元のFile ID、親子Directory、import両端・Evidenceを保持。未選択時はimport線なし |

## データと配置

`src/analyzer/graph3D.ts` の `AnalyzerGraph3D` が共通rendererの契約。各pointは元の`AnalyzerViewNode`、各Regionは元の`AnalyzerSemanticRegion`、edgeは元の`AnalyzerViewEdge`を参照する。summaryは`presentation.role`で識別し、実体総数から除く。新しいFactやEvidenceは作らず、SemanticGraphへの変換・semantic Workerの起動も行わない。

`layoutAnalyzerGraph3D`はimmutableなView入力をWeakMapでキャッシュする。全File・依存対象の座標を先に確保し、検索・選択・手動表示・自動集約は後段の投影として処理する。点の位置を2Dへ書き戻さない。選択やOrbitControlsの更新で再packingしない。

File配置は再帰的なbox packing。子Directoryを先に組み立て、親直下Fileと一緒に親領域へ詰め、余白を含む親boxを確定する。分割軸上で兄弟boxは非重複になる。Packageから全子Directoryと直下Fileへたどれる。圧縮された単一子Directory chainは既存Regionを維持し、3Dの詳細欄から中間Directoryの元Fact ID・完全なパス・親ID・直下件数を確認できる。

Dependencyの入力から2D用のexternal summary／bundleを除き、折りたたまれている実体・宣言edgeも含める。表示上のgroup／集約線には元のmember ID／edge集合を保持する。複数利用元が同じ外部packageへ依存しても点を複製しない。Technologyを単一npm packageへ再定義しない。

## Session

| 状態 | 保存先・扱い |
|---|---|
| 検索・filter・Node／Region／edge選択・詳細開閉 | 既存View Sessionを共有 |
| Command entry／branch開閉 | 既存`entryScriptId`／`expandedPresentationIds`を共有 |
| 2Dカメラ | 既存`camera`を維持 |
| 2DのExternal／Directory開閉 | 既存`expandedPresentationIds`・`aggregation`を維持 |
| 表示mode | 加算した`graphMode`。未設定は2D |
| 3Dカメラ | `graph3DCamera`。schema=1、View、scanVersion・scannedAt・entryを含む入力キーを検証 |
| 3Dの明示的な開閉 | `graph3DAggregation.expandedGroupIds/collapsedGroupIds` |
| 自動省略・粒子・囲い | 既存Session全体の共通設定 |
| 自動owner・hover・ラベル・集約内訳 | renderer内の導出値／一時状態。Sessionへ永続化しない |

初回3Dは現在の範囲へFitし、以降は互換な3Dカメラを復元する。通常の選択はカメラを移動しない。検索結果・Focus・Fit・Reset・ズームは明示操作。Resetはカメラだけを変更する。CommandのFitは現在開いているbranch表示を含む範囲を使う。entry変更で無効な選択は既存復元規則で解除し、3Dでは理由を表示する。

2D固有summaryから3Dへ移る場合、別の実体を代わりに選ばない。動的group内訳は主選択と独立しており、mode退出で閉じる。`replaceProject`は旧入力のView状態をリセットし、共通表示設定は既存規則どおり維持する。

## 描画・操作・資産の寿命

`AnalyzerGraph3DStage`はlazy importされ、2Dだけの利用では3D配置、OrbitControls、密度判定を開始しない。Three.jsのbatched points／wireと、点に隣接するHTMLラベルを使う。実体の関係線は元の点の3D座標へ接続する。Stack MapのScopeは`graph3DRegionAnchors`で境界の上・手前側に専用の接続点を置き、親子では左右を分ける。接続点は元Scope IDに対応し、技術の座標・解析対象数・関係IDを変えない。囲いOFFでも必要なScope名と選択可能な接続点を残す。端点をunprojectした後、既存Cと共通の`spatialRelationCurve`で49点の曲線を生成し、`SpatialRelationLines`と`SpatialFlowParticles`が同一経路を描く。SVGは透明な関係選択のhit領域とラベルの短い引き出し線に使用する。引き出し線は依存関係として数えない。

方向色は共通の`analyzerDirectionColors`を使用する。`graph3DSelectionContext`はNodeに加えScope／Region、Stack Usageの所属Scope、閉じたCommand branchの子を既存edgeの端点へ解決する。ModuleのRegion選択では内部importを除き、境界を跨ぐ関係を強調する。明示した関係も強調対象になる。

全rendererの操作欄は`AnalyzerGraphControls`と共通CSSを使用する。2D／3D、Fit、Reset、拡大縮小、選択へ移動、粒子、対応する囲い／自動省略、全画面、ヘルプの順を共有する。mode切替は全画面内にも置く。View固有の操作の有無は従来の能力に合わせる。

Commandの開始点は`CommandEntryControl`で通常表示・2D全画面・3D全画面の選択肢と変更処理を共有する。開始点stateは既存View Sessionのみ。全画面ではツールバー内のnative selectから直接選ぶ。開始ボタンと別の選択パネルを重ねず、名称と矢印の余白を確保して狭幅ではツールバーを折り返す。entry変更でコマンドを実行しない。

Package Dependencyの詳細は`dependencyDetailRelations`で元関係IDを維持した依存宣言と、summaryへの表示上の導線を分離する。相手数・宣言数・集合メンバー数は別々に示す。宣言のEvidenceは開いた時に描画する。2Dのsummary折りたたみと原宣言のsource／target／version指定は変更しない。

自動省略は既存`prepareAutoAggregation`／`projectAutoAggregation`、表示安定化、元関係の再投影、`AutoAggregationPanel`を再利用する。OFFでは密度計算を行わず、手動閉鎖とfilterを保持する。選択実体・関係両端・hoverを保護し、集約と個別表示が同じ対象を二重計上しない。Commandの閉じたbranchは元edgeをsummary ownerへ写し、原関係集合へ戻れる。

ラベルの静的情報・種類・同名識別は`prepareGraph3DLabels`がimmutable graph単位に準備し、投影候補と選定は`projectGraph3DLabels`が扱う。共通の`createSpatialLabelPlacer`でCと衝突回避・端点保護・前回位置の優先を共有し、`FlowLabelLayer`がフレーム中の位置更新とReactの文字情報を分離する。ラベルIDはnode／region／aggregateを区別し、元IDへの対応を保持する。

選択・ホバー／キーボードフォーカス・明示した関係端点を優先し、直接の相手と主要所属、近距離で読める名前を順に配置する。Stack MapはScope名、WorkspaceはProject・設定・パターンとpackage、Commandは開始点と現在の枝を重視する。Dependency／Moduleは所属・集合を残し、個別名は関係・近距離を中心にする。上限は表示面積とViewに応じた予算で、全タブ共通の固定120件ではない。幅は内容に応じて縮め、完全な名称はtooltipと既存の検索・詳細に保つ。検索一致は既に表示するラベルを強調し、全一致対象のラベルを強制表示しない。

詳細欄のフォーカス連携はラベル専用で、線・粒子・点の自動省略へ流さない。対象が表示集合内なら、そのownerのラベルで集合内の対象であることを示す。自動省略OFFでも全ラベルを強制しない。モード・project交換時はlayerをsuspendし、observer・pointer listenerを解放する。

Moduleの囲いは`graph3DRegionEmphasis`で実際の`parentRegionId`をたどり、選択・ホバー・祖先・通常を区別する。圧縮chainの表示ownerと原親子関係を維持する。囲いOFFでは描かず、この強調を関係線や粒子の過密対策へ転用しない。

ホバー中のラベルは、点の投影座標と表示範囲が変わらない限り前の位置を保持する。ホバーで自分自身のhit領域を移すとenter／leaveが往復し、粒子materialの再生成が続くためである。カメラ・viewportが変わった場合は再投影する。

共通`SpatialParticleControl`、`useSpatialFlowMotion`、`useAnalyzerControlInset`、fullscreen、`useDisposableFrame`、`initializeSemanticCanvas`、`useCanvasDisposals`を再利用する。粒子は通常／控えめ／OFF、速度65・既存spacing／発光profileを維持。選択した前景の関係線はScope／Workspaceの`contains`も粒子の対象にする。背景の線と領域の囲いは静止させる。`frameloop="demand"`で、OFF・非表示・退出時に不要な更新を止める。geometry、material、particle texture、controls、listener、observer、frame参照を各rendererが解放する。

## 初期化失敗

R3F 9.7のCanvas `fallback`はHTML canvasの子として通常時もmountされるため、fallback内のEffectで利用不可と判定しない。また非同期`configure()`のrenderer生成失敗は、外側のReact ErrorBoundaryだけでは捕捉できない。

`recoverableWebGLRenderer`は実際のWebGLRenderer生成を試み、失敗をmicrotaskでUIへ通知する。生成できなかったconfigure taskには未解決の結果を返して未捕捉reject・二度目の生成を防ぐ。未完成rootには資産を持たない空Sceneを用意し、R3Fの通常unmountが`dispose(scene)`からroot登録の削除まで完了できるようにする。gl未生成時のstore通知はinvalidateがglを参照するため避ける。通知先はCanvasをunmountし、明示的な再試行を提示する。R3Fの`_roots`に依存する処理はこの失敗アダプター内に限定し、R3F更新時に再検証する。

3D固有の失敗・context lossは2Dへ戻し、検索・元選択を維持する。Bの2DもWebGLを必要とするため、WebGL全体が使えない場合は地図の説明・再試行と検索／詳細の導線を示す。非WebGL版のModule地図があるとは扱わない。lazy chunkの読み込み失敗はページ側の境界でも捕捉する。

## 検証

実施内容・画像・実測値は[初回実装検証レポート](analyzer-tabs-1-5-3d-review.md)と[描画・操作欄の修正検証](analyzer-3d-unification-review.md)を参照。独立fixtureは`graph3D.test.ts`、`graph3D.integration.test.ts`、方向色とScope選択は`graph3DSelection.test.ts`、失敗経路は`recoverableWebGLRenderer.test.ts`で確認する。実WebGL、狭幅、資産解放は別途実ブラウザで確認する。
`graph3DHoverEmphasis`は表示中かつ選択に関連するactiveな関係とホバー対象から、強調する関係IDと両端IDを返す。同じ集合をラベル・点・線・粒子に適用する。対象外ラベルのopacityは0.42、点の色強度は0.38、対象外線の強度は0.18で、対象外線の粒子は停止する。ホバー解除時は通常表示へ戻す。関係を持たない対象では全体を暗くせず、キーボードフォーカス中のラベルはopacityを1に保つ。
点とラベルのpointer hoverは同じ元IDで判定する。選択に関連するactiveな関係の端点であれば、点自体が未選択でも、その関係と両端を強調する。無関係な点・ラベル・線では強調しない。Canvas上のラベル周辺のhover corridorは関係強調に使わず、SVG線と点が重なる場合は13px以内の点を優先する。build:webview選択中はpnpm build:webviewの点／ラベルで強調し、pnpm build:extensionの点／ラベルでは強調しない。
