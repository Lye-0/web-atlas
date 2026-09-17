# タブ10：囲い内の環境・分類見出しへの限定復元

2026-09-17。単独対応。着手時 `小規模修正３` / `4163b7c`、作業ツリーはクリーン。

## 限定した変更

2Dを「薄い破線の囲いの内側左上に、背景のない控えめな名前を直接置く」表示へ変更した。今回のメッセージには写真ファイルが付いていなかったため、記載された見た目の条件を基準に実装・確認した。写真との厳密な余白・色の比較は未実施。

|ファイル|変更|
|---|---|
|src/analyzer/semantic/architectureHeadings.ts|画面座標で空きを探す配置を除去。world座標の左上を基本に、折り返し、局所的な横調整、上部余白を算出|
|src/components/analyzer/ArchitectureEnvironmentHeadings.tsx|ボタン・背景・全文パネル・引き出し線を除去。SVG text/tspanへ変更|
|src/components/analyzer/SemanticFlow2D.tsx|囲いと同じカメラ変換の内側で名前を描画。見出しのための上部余白だけ描画枠へ反映|
|src/components/analyzer/SemanticFlow3D.tsx|環境見出し専用の補助線と全文パネルだけ除去。点ラベルの補助線・優先順位・配置は維持|
|src/components/analyzer/architecture-context-polish.css|12px・通常ウェイト・控えめな文字色。3D環境名の背景/枠/影を透明/0/noneへ限定変更|
|src/components/analyzer/architectureContextPolish.test.tsx|外側配置の期待を囲い内の文字表示へ更新。SVG同一変換、装飾不在、長名・同名別ID・他領域ノードとの衝突を検証|

ノード本体、関係線、分類・定義元・相手要約の詳細欄、解析・HTTP判定・投影モデル・レイアウト・カメラ制御の変更はない。コミット全体のrevertや旧ファイルへの一括置換は行っていない。

## 実画面と再修正

Chrome / localhost。前回からの読み取り専用固定入力を使用：vehicle-management 196ファイル、git-lines 1,814、web-atlas 244。既存のブラウザ検証用スコープであり、今回の製品側にファイル除外は追加していない。

- vehicle-managementで環境未特定・論理定義・共有・development等が薄い囲いの内側に通常文字として出ることを確認。通常倍率約0.94で名前を読み取れた。
- production見出しと他環境ノードの接触を発見し、左上近くの上部余白で回避するよう再修正。遠い横位置へ移動させない。
- git-linesのdevelopment/環境未特定は同じ上端付近で横に分離。web-atlasでも任意の現在データから見出しを表示。
- 独立サンプルの長い共有名・日本語を390pxで2行表示。同名2件は別IDで保持。背景パネル・枠・引き出し線・連番なし。
- 2Dの選択で現在地・ノード座標・保存カメラが一致。1440/768/390pxへ変更しても見出しのworld座標が同一。ページ横はみ出しなし。
- 全画面、パン・ズーム、詳細欄の開閉、内部を開く→戻るを確認。戻った後のscopeとノード座標が一致。
- 3D環境見出しのcomputed styleは背景rgba(0,0,0,0)、border 0px、shadow none。囲いOFFで見出し0件、ONで3件に復元。通常の点ラベル・補助線は維持。
- Runtime Flow / Data Flow / Data Modelでは新しい見出し0件、Architecture Mapへ戻ると4件。プロジェクト切替で旧プロジェクトの名前は残らない。
- 詳細欄の短いpackage.json表示、対象自身の種類・定義元の構成の区別、相手要約の分離はコード差分なし。実ブラウザの詳細と既存回帰テストでも維持を確認。

代表画面（ローカルのみ、Git管理外）:

- [変更前：独立見出しパネル](../../.cache/inside-headings/before-vehicle.png)
- [変更後：通常倍率の囲い内見出し](../../.cache/inside-headings/after-vehicle-readable.png)
- [変更後：3Dの控えめな名前](../../.cache/inside-headings/vehicle-3d.png)
- [長い日本語・同名別ID](../../.cache/inside-headings/long.png)
- [git-lines全体Fit](../../.cache/inside-headings/git-lines-fit.png)
- [web-atlas](../../.cache/inside-headings/web-atlas.png)

変更前と通常倍率の代表画面は同じ固定入力だが、見出しの左上が読めるよう後者はパン位置・画面幅を調整している。厳密なピクセル差分ではない。別途、同じカメラ値での変更前後も確認した。画面外の囲いの左上にある名前は、そのまま画面外に出る。

## テスト

- 着手時の関連52件成功。
- 最終全回帰：125ファイル / **1,344テスト成功**、8ファイル / 13テストは既存条件付きskip。90.10秒。
- `pnpm build`（17.78秒）、`pnpm lint`、`pnpm typecheck`、`git diff --check`成功。
- 既存tree-sitterのブラウザ外部化/eval、bundleサイズ警告あり。実装途中のHMRでSVG部品を移動し終える前に一時的なHTMLタグ警告が出たが、最終再読込以後の確認では発生していない。favicon 404は検証用ページ由来。
- 元データは変更していない。3プロジェクトの既存固定入力テスト、元ID・Evidenceの保持、選択・階層移動の既存テストを維持した。

## 未確認・制約

- 添付写真そのものとの厳密な見た目の照合は未確認。今回は文章で指定された表示条件を確認した。
- 大きい図を全体Fitすると、囲いと同じ倍率で文字も縮む。git-lines全体Fitのような強い縮小では小さくなることを確認した。名前だけ画面座標へ固定する別方式は導入していない。
- 通常倍率で確認した入力では、見出しの重なりは再現しない。極端に多数の同一境界・長名が集中する全ケースは未検証。
- 無制限全ファイル入力、全OS/ブラウザ、支援技術の全組合せは未検証。今回、新しい性能ベンチマークは追加していない。
- UI Evolveのrepresentative-verificationを参照し、Fitと通常倍率を区別して確認した。今回の変更は指定された表現への限定復元であり、一般的な新しいUIルールの追加は不要と判断した。

実原本の変更・実行・外部送信、push、本番デプロイなし。
