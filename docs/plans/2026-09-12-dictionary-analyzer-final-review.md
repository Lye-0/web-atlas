# Dictionary / Analyzer 最終実装・確認結果

2026-09-12。ユーザーの再開・実装指示に従い、最後の修正と検証はサブエージェントを使わず実施した。**計画で採用した有限な静的形式の既知実装残件は解消済み。** 全API・動的構成の完全解析、下記の未測定項目まで完了したという意味ではない。

## 実装結果

- Dictionary: 新規94 Stack /9 Categoryを追加し、合計142 /52。旧48 ID・URL、関連分類・技術・比較を維持/拡充。TSX・JSX・Firebase Local Emulator Suiteを独立させ、CDN8製品を収録。
- Analyzer: manifest/lock/CLI/多言語/テンプレート/フレームワーク/データ/認証/配信設定の根拠と所属を追加。必要Viewへ同一のFact/IRから投影する。詳細は[94件台帳](2026-09-12-dictionary-analyzer-acceptance.md)。
- Map: コンテナ幅による2レーン/1レーン、Category単位の開閉・件数・グループ移動、resize時の開閉/focus保持。
- 残実装だったpytest fixture、Django/Rails query、Kubernetes Service/Ingress、NGINX upstream/location/proxy、Apache VirtualHost、Pages artifact、CDN cache/rule/behavior/domain/originを補完。設定接続はRuntimeとArchitectureへ元範囲付きで渡し、「構成と接続先」で詳細表示。

## 前回指摘の解消

| 指摘 | 修正と確認 |
| --- | --- |
| SOLO-01 Axum import alias | routingの正規symbolからHTTP methodを取得。GETの回帰成功 |
| SOLO-02 無関係なMapControllers | WebApplication builder→Buildしたapp→同じreceiverの登録を追跡。Fake receiver反例成功 |
| SOLO-03 Fastify引用schema | PropertyNameの引用を正規化し、body/responseを保持。200/400を表示名でも区別 |
| CI-RANGE-01 YAML script配列 | decoded→元sourceの境界対応を保持。配列/引用scalar両方でコマンド原文slice一致 |
| WPF/Boot/auth等の正式assertion不足 | completion.jsonとcompletion.test.tsへ永久保存、実entry/handler/結果を検証 |
| test/lint/diff不整合 | Moduleの現行表示期待、unused import、末尾空行を修正 |
| 最終画面での新関係名 | Architectureの転送先・配信元・selector等を具体的な日本語ラベルへ接続 |

## 自動検査

| 検査 | 最終結果 |
| --- | --- |
| 全Vitest | **1267成功 /0失敗 /8スキップ**。115 files成功 /4 skipped、80.01秒 |
| 最後の関係ラベル修正後 | completion /Architecture focus /labels /navigationの87 tests成功 |
| 型検査・本番build | pnpm build（tsc -bを含む）成功、411 modules、Vite段階14.98秒 |
| 全体lint | pnpm lint成功。一時review出力を除去後のプロジェクト全体 |
| 差分空白 | git diff --check成功 |
| Repository memory | validator成功（警告0）、INDEX再生成成功 |

既存の任意ローカルfixtureに依存する8skipは成功数に含めない。固定実sourceのgit-lines /vehicle-management /web-atlas 3例は全成功。tree-sitter依存のfs/path externalization、eval、大きなchunkのbuild警告は残るが、build失敗ではない。

## 実画面

最新sourceの専用ローカルサーバーで、正式自作fixtureをproductionのscan→worker→AnalyzerPageへ渡して確認した。

- 総合17ファイル入力で全10Viewへ移動して解析完了を確認。Runtime33対象/23関係、Function32/22、DataFlow115/110、DataModel4、Architecture12構成要素/13線などを表示。Moduleのroot階層は7 total /0 direct nodeであり、階層単位の表示と全体件数を区別する。
- NGINXのserver→location→proxy originを2D局所関係、詳細、辞書リンク、元位置で確認。3D・狭幅・全画面でも選択と設定詳細を保持。Architectureにも3本の具体的な設定関係名を表示。
- JSX単独入力はDataFlow41対象/39関係。nameの使用→value={name}→propsの局所3対象/2関係、元範囲223–227、所属App、完全式を確認。3D/全画面→通常表示後も選択を保持。TSXの同等経路は前回の単独確認でも実証済み。
- Dictionary Mapの52分類/142技術、全開閉、実幅約308/379/809/1089/1268/1908 CSS pxでdocument.scrollWidth=clientWidth。狭幅を画像でも確認。今回のviewport指定値はブラウザ倍率等で実寸と異なるため、上記はDOM実測値。前段P6の320〜1920/300件stress/境界幅検証とは別記録。
- 確認中のブラウザconsole errorは0。専用サーバー停止、検証タブを閉じviewport overrideを解除。一時review/review-distは.gitignore対象の.cacheへ退避し製品変更から除外。

全94製品×全View×全デバイスの総当たりUI検査は行っていない。意味解析は94件のfamily/専用/反例テスト、表示は共有rendererと代表入力で確認した。実機touch、実200%ズーム、精密browser worker heap、GPU FPS/3D frame heapの前後計測は未実施であり、これらを成功扱いしない。

## 同一入力の性能比較

| 指標 | 初期HEAD 34551af | 最終 |
| --- | --- | --- |
| 1200 module /1199 edge scan+projection+layout中央値 | 762.36ms | 784.16ms（約+2.9%） |
| 同1200 source semantic core中央値 | 67.94ms | 104.42ms（約+53.7%） |
| 初期entry JS | 644.34KB /gzip193.03KB | 464.59KB /gzip137.47KB |
| semantic worker本体 | 3867.46KB /gzip1109.25KB | 4417.87KB /gzip1269.16KB |

同じinstalled dependenciesと入力、Nodeで1warmup＋7回/5回。計測中はbuild/testを並走させていない。ホスト負荷差を含む比較で単一原因へ帰属しない。semantic coreの増加とworkerサイズ増加は拡張のコストとして残る。Node process memoryはbrowser worker heapではない。worker本体のサイズは遅延parser/WASMを含む総転送量ではない。entry/scan/SQL/GraphQL/3Dは必要時に読み込む。

## 記録

現行設計はtechnicalの[Dictionary](../technical/dictionary.md)、[Analyzer](../technical/analyzer.md)、[Semantic](../technical/semantic-analyzer.md)、[Architecture](../technical/architecture-map.md)へ反映した。Map memoryはcontainer幅契約へ更新、CI元範囲の再発防止は検証済みcandidate memoryへ保存した。

検証JSONは共通作業領域 C:/Users/kawau/.codex/visualizations/2026/09/12/01a0938c-6434-7cd0-b8a6-f929c46d6461 内のcompleted-final-suite.json、completed-semantic-performance.json、completed-spatial-performance.json、completed-bundle.json。以前のsolo-final-*は修正前の履歴であり現在の判定には使用しない。commit・push・deployは行っていない。
