# 簡易全体：主要構成と公開・配信先

2026-09-18。単独作業。開始HEAD `33a0cc6`、ブランチ`小規模修正３`、未コミット変更なし。原本は読取のみ、入力コマンド/任意設定を実行しない。外部送信・push・deployなし。[計画](../plans/2026-09-18-simple-deployment-structure.md)、[現在の設計](architecture-map.md#簡易全体)。

## F1〜F6の原因・判断・変更

| 項目 | 原因・判断 | 変更 |
|---|---|---|
| F1 公開先 | 正規flow-deploysとexecution-configは存在するが、logicalOwnerIdによる要約で入力アプリと到着先を同じ単位へ吸収していた。 | 公開対象の元実行構成を保護し、設定/論理所有者/実行場所に基づく公開先集合を図に残す。同環境の別対象や設定不足は個別。未知のホスティングは作らない。 |
| F2 構成 | 独立実行主体・共有ライブラリは元モデルの根拠が異なる。依存だけでは内部所有を証明しない。 | 明示親があり利用範囲も親に限られるライブラリだけ内部化できる。複数アプリ共有は保持。実行用途未確認のコードパッケージは既知補助と別集合。名前除外はしない。 |
| F3 環境別資源 | 同じ設定内bindingの役割に別環境の資源が対応していた。物理的同一性とは別。 | 設定path/binding/typeとEvidenceで集合化。同環境/実行場所に重複対象があればまとめない。元ID・環境・線を保持し、総当たりの接続を作らない。 |
| F4 相手 | 方向/環境/種類ごとの行をそのまま概要へ並べていた。 | 相手IDで一項目にし、内部で方向別の用途を示す。環境/確度は開閉へ。元関係検索とEvidenceは保持。 |
| F5 支援 | role=supportを一律に「道具」としていた。 | 「開発・公開・更新に関わるもの」に道具/成果物/定義等を分類。既出の支援だけ相手欄から省き、公開先の相手からWranglerを誤って消さない。 |
| F6 一時情報 | 選択したノードとは別の関係を一時的に読む動作と、選択中の関係の見出しが区別されていなかった。静止画だけで残留バグとは断定できない。 | 簡易側は選択IDを維持し、現在のhover/focusに一致するhintだけ一時表示。「一時確認中」と選択対象を併記し、解除後の古いhintを無視。全体/他タブの方式は変えない。 |

## 公開経路の照合

**vehicle-management**

- API側コード → Wrangler deploy → API既定設定、API側コード → deploy:production → production構成が正規モデルに存在。根拠はapps/api/package.json L6/L7とapps/api/wrangler.jsoncの操作設定Evidence。
- productionはWorkerの処理と静的アセットの配信設定を持つ。apps/web/distのproduction成果物 → deploy:productionの入力も存在し、Viteのbuild:productionから同じ成果物へ生成関係がある。簡易ではVite側の内訳に成果物を保持し、生成→入力の記録済み2段階を短縮してWranglerへつなぐ。APIコードとWeb成果物の入力は独立した元関係として保持。
- 同じapps/web/distでも環境未指定の成果物はbuildからの生成だけ。公開操作への入力を確認できず、そのカードへWranglerの線を追加しない。「この成果物を公開操作へ渡す関係は未確認」と説明する。
- 公開先集合の内訳は既定設定とproduction。既定設定を本番に読み替えない。ローカルdevelopment構成は従来どおり論理アプリ側の内訳に残し、起動と公開の元関係を分離する。

**web-atlas**

- Viteビルド → dist → Wrangler公開 → 既定設定の配信構成。package.json L11とwrangler.jsoncが公開の根拠。dist→Wrangler起動（L10）も別使用として維持する。
- 3要素から4要素に増えた理由は、以前アプリへ吸収していた実行・配信先を到着点として残したため。新しいAPI/DB/サービスは生成していない。

**git-lines**

- 保存入力のモデルには公開操作がない。拡張本体/Webviewとビルド成果物の確認できる段階まで表示し、Webホスティング形へ補完しない。7要素/12線を維持。

これらは設定上の対応であり、実際の公開成功・稼働・アカウント/URLの確認ではない。元モデル・HTTP判定・ツール検出は変更せず、簡易投影だけで対応を改善した。

## 要約の境界と3入力

vehicleのD1は同じwrangler.jsonc/binding=DB/type=D1に対応する既定/development/productionと、logicalResourceIdで対応するlocalを4対象の表示集合にした。元資源のidentityを集合全体へ流用しない。別binding/設定path/type、同じ環境に曖昧な複数対象があるケースは別に残す。

.NETのCompanion/LegacyHost/Import CLI等は元の実行宣言を持ち、Protocol/Import等の共有コードとは異なる。今回の実入力では依存だけでライブラリを私有化せず保持。明示親と利用範囲の正例/負例をfixtureで検証。xcode等も名称で除外しない。未確認code-package集合は実体統合や補助用途の認定ではない。

| 入力 | 前の要素/線 | 後の要素/線 | 元対象/元関係（保持） |
|---|---:|---:|---:|
| vehicle-management | 34 / 59 | 31 / 62 | 379 / 14,592 |
| git-lines | 7 / 12 | 7 / 12 | 80 / 18,231 |
| web-atlas | 3 / 7 | 4 / 9 | 20 / 8,549 |

要素数を目標にしない。線の増加は新たな架空接続ではなく、独立させた公開先への元関係が図へ出たもの。各元IDは一つの説明単位へ対応し、内部関係または表示線の根拠に全元関係を保持する。

| 入力 | 前2D | 後2D | 後3D |
|---|---|---|---|
| vehicle-management | [前](../../.cache/simple-deployment/vehicle-before.png) | [後](../../.cache/simple-deployment/vehicle-after.png) | [3D](../../.cache/simple-deployment/vehicle-3d.png) |
| git-lines | [前](../../.cache/simple-deployment/git-lines-before.png) | [後](../../.cache/simple-deployment/git-lines-after.png) | [3D](../../.cache/simple-deployment/git-lines-3d.png) |
| web-atlas | [前](../../.cache/simple-deployment/web-atlas-before.png) | [後](../../.cache/simple-deployment/web-atlas-after.png) | [3D](../../.cache/simple-deployment/web-atlas-3d.png) |

前画像は開始HEADと同じ前回完了画面。今回も同一保存入力で比較。ピクセル同一倍率の比較ではない。追加：[公開先詳細](../../.cache/simple-deployment/destination-detail.png)、[資源集合詳細](../../.cache/simple-deployment/resources-detail.png)、[一時確認](../../.cache/simple-deployment/temporary-relation.png)、[狭幅・明示Fit後](../../.cache/simple-deployment/narrow-fit.png)。キャッシュ画像/巨大な入力JSONはGitに含めない。

## 操作・状態・回帰

agent-browserスキル/Chromeの専用セッションで、保存モデルを返す検証workerと実際のページ/2D/3D/詳細/セッション処理を使用した。vehicle/gitの入力は前回の静的解析保存、webは前回OOMのため既存244ファイル保存モデル。このブラウザ確認を新しい全ソース解析の成功とはしない。通常の固定ソース回帰は3プロジェクトの現在のファイルを読取解析して成功。

- 公開線をキーボードで選択し、2元関係/2公開使用と元構成内訳を確認。
- 公開先集合のproductionを明示選択し、全体の正しいexecution-configへ移動。D1集合からproductionの元resource IDへも移動。
- 全体で選択したproductionを保存し、簡易で別対象/3D操作後に普通の全体復帰で選択・現在地・2Dカメラ一致。
- 簡易2D→3D→2D→3Dで選択・座標・モード別カメラ一致、Canvas1つ。
- Companion選択中に別の入力線をフォーカスすると「一時確認中の関係（ホバー／フォーカス） · 選択中：Companion」を表示。フォーカス解除で消え、選択/座標/カメラ不変。3D切替後も旧hintなし。静止画の現象は正常な一時確認として再現でき、継続残留の実証は得られていない。
- ポインターで対象線の中央を指定すると別pathに覆われるケースがあり、DOMの曲線位置を照合して操作。無関係な非アクティブ線で一時強調しない既存仕様を維持し、残留なし。線の回り込みは変更しない。
- gitの相手Git Linesが一項目になり、Webviewとの双方向用途をその中で確認。道具ViteとWeb成果物を分けて表示。
- project切替後に旧対象を残さず、webの公開先を3Dでも確認。390px全画面で横はみ出しなし。リサイズCLIのEOF応答はinnerWidth/画面で反映を確認。カメラ保持で一時的に図が画面外になるため、明示Fitも確認。
- 囲い/自動省略OFFをaria-pressed=falseで確認し、簡易4要素を維持。最終ブラウザpage errorsは0件。

空入力/該当なし/階層/検索/高速切替/他タブの組合せは既存UI回帰で確認。今回すべての組合せを実ブラウザで再実施したわけではない。詳細な全体/既存プリセットは、同一保存入力の旧実装投影と比較して対象・関係・配置・hashが一致。開始時保存のプリセットdigestも3入力で一致。

## 正確性・一般性・性能・テスト

fixtureはコード/成果物の合流、別公開先、同設定の任意環境、同環境の別対象、公開なし/対象未解決、同名成果物の別環境、専用/共有ライブラリ/独立CLI/未確認構成、binding資源の非同一、双方向相手、一時hint解除、分類別支援と公開操作の相手保持を検証。既存のソース位置/集計/HTTP判定も維持。

同じ保存入力と旧HEADの独立モジュールで簡易生成を比較した参考値：vehicle旧337ms→新254ms、git368→346ms、web160→166ms。100回のキャッシュ取得はいずれも0.04ms未満。これは静的な要約/配置の単発測定でありUI高速化率を断定しない。選択/カメラ操作で要約の再生成を行わず、根拠は開いたときに処理する。全体だけの利用では簡易生成を走らせない。長時間GPU/FPS/GCの定量評価は未実施。

| チェック | 結果 |
|---|---|
| 全回帰 `pnpm test` | 1,407成功、19 skip。136ファイル成功/11 skip、95.77秒 |
| 最後の公開先境界条件追加後 | 対象3ファイル：12成功/1 skip |
| 実入力ゲート `SIMPLE_DEPLOYMENT=1` | 3モデル保存・旧比較を含む8テスト成功 |
| 旧全体/プリセット比較 | `SIMPLE_POLISH=after` 成功、開始時digestとの直接照合も全入力一致 |
| lint / typecheck / build | 成功。buildは既存tree-sitter外部化通知・大chunk警告あり |
| git diff --check | 成功（改行変換通知のみ） |

途中のfixture不足（ExplorerLocation.depth）と、同じ道具に要約されるfixtureで外側短縮線を期待した誤りを修正。後者は別ビルド道具のケースとして入力を明示し、実装を期待値へ歪めていない。lintの不安定依存警告はtoolsのuseMemo化で解消。

## 残る範囲

- URL/アカウント/実際の公開・稼働は未観測。設定の到着先まで表示する。
- 環境未指定distの公開入力は未確認。未知ツールの公開経路解析は追加していない。
- web-atlasの新鮮な全ソース解析は未検証。前回の全入力OOMは今回解決対象外。
- 全景Fitで多い独立構成の文字が小さい点、個々の線の回り込みは維持。すべての解像度/操作/入力の組合せ、GPUメモリ回収、操作応答の包括的な定量比較は未検証。
- UI-evolveの既存の関係整理・代表確認を適用。今回の要約境界はプロジェクト固有の設計として記録し、汎用UIスキルへ普遍化しない。
