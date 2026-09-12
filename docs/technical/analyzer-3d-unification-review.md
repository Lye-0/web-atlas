# 3Dの方向色・線・操作欄の修正検証

2026-09-11。初回の検証ではモデルや状態保持を中心に確認し、Scope／閉じたbranchの選択時の線色、既存Cとの描画部品・操作欄の差を見落としていた。ユーザーの指摘を受け、以下を修正した。

## 修正

- Scope／RegionやStack Usageの所属Scope、閉じたCommand branchの子を、実在する関係の端点へ解決する。Node IDだけを選択集合に入れていたため色が付かなかったケースを修正した。
- 色を共通の出方向`#82c6e2`・入方向`#dfb785`へ統一。明示した関係、Module Regionの境界関係も扱う。
- Cの曲線計算を`spatialRelationCurve`、GPU線と矢印を`SpatialRelationLines`へ抽出し、タブ1〜5と6以降の3D双方で使う。粒子も既存の`SpatialFlowParticles`へ同じ49点の経路を渡す。SVGの可視線・矢印を廃止し、透明hit領域のみ残す。
- 全rendererの操作欄を`AnalyzerGraphControls`へ置換。ボタンの順序、表示mode、粒子、全画面、ヘルプとCSSを共有する。旧CSSの重複を削除し、390pxで残っていた文字サイズ差も修正した。
- 共通凡例を表示し、凡例の実寸を測って内訳パネルとの重なりを避ける。

## 実ブラウザ確認

固定したgit-linesとvehicle-managementの解析入力を使い、ローカル検証用ビルドをEdgeの実WebGLで操作した。検証用に保持したrenderer／scene参照からGPU属性を読み取る。これらの参照は製品ビルドへ追加していない。

| 対象 | 確認結果 |
|---|---|
| 2入力×タブ1〜5 | 全10ケースでsource選択の出方向色・target選択の入方向色をGPUのcolor属性で確認 |
| Stack Usage | 両入力で所属Scopeの実在containsが入方向色になることを確認 |
| 閉じたCommand branch | vehicle-managementのsummary選択で入方向色を確認 |
| 関係を直接選択／粒子OFF | 全10ケースで強調色を確認。OFF後も線色を維持 |
| Cとの描画一致 | 矢印と粒子のvertex／fragment shader hashが全10ケースで一致。線opacity=.95、depthTest=false、経路49点、粒子spacing=50 |
| 操作欄1440px | 全10ケースでFitボタンのfont／height／padding／border／背景色がCと一致 |
| 390／768／1024px | タブ1〜5＋Function Call Flowの18ケースで横overflowなし、全ボタンが操作欄内。最終CSSで同じ幅のFit書式が一致 |
| 全画面／資産解放 | 上記6ビューで全画面内にmode操作あり。2D退出後の旧rendererのgeometry／texture／programが全て0 |
| 既存Cの5ビュー | 自動省略・囲い・Fit・Focus・orbit・2D往復を実行。選択とカメラ一致、2D時の旧3D canvasなし、pageerrorなし。Function Call Flowでcontext lossから2D復帰 |

集計は[GPUと方向色](../../reports/unified-3d-20260911/metrics.json)、[幅・全画面・解放](../../reports/unified-3d-20260911/responsive.json)、[Cの回帰](../../reports/unified-3d-20260911/c-regression.json)。画像は[Stack Map](../../reports/unified-3d-20260911/git-lines-architecture.png)、[Command](../../reports/unified-3d-20260911/vehicle-management-command.png)、[Module](../../reports/unified-3d-20260911/git-lines-module-dependency.png)、[比較用C](../../reports/unified-3d-20260911/reference-1440.png)、[390px](../../reports/unified-3d-20260911/narrow-architecture.png)。カメラとレイアウトの安定後に撮影して目視した。

## 検証範囲

全テスト713件成功・8件skip。lint、型検査を含む製品build成功。既存の大きなchunk警告は残る。Scopeとbranchの選択は独立fixtureのテストも追加した。

同じ描画部品を使うが、各Viewの意味に応じた配置・包含境界・パネル・点の違いはある。全入力や回転中の全フレームの同一性を保証する検証ではない。HTMLとGPUを組み合わせる表示では更新直後の撮影と安定後の撮影を区別した。元プロジェクトの実行・変更、push、デプロイはしていない。
