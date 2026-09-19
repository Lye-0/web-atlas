# 簡易全体：支援の囲い・根拠表示・概要説明

2026-09-18。開始 `小規模修正３` / `2fcc8a9`、未コミット変更なし。単独実装。原本は読取のみ、入力側の実行・外部送信・push/deployなし。[計画](../plans/2026-09-18-simple-bounds-provenance.md)に基づく。

## 原因と対応

| 項目 | 確認した原因 | 変更・結果 |
|---|---|---|
| F1 囲い | 前回の投影がprimaryごと/共有支援ごとにregionを与え、領域生成が単独対象も囲っていた。 | アプリと、そのアプリだけを支える実操作がある場合へ限定。DB/サービス/共有コード/共有支援/単独対象は囲わない。他対象を内包する領域も描かない。元ID・対象・関係は維持。 |
| F2 根拠位置 | simpleMemberCaptionがnode.pathを優先しながら、別Evidenceのline/endLineを連結していた。 | 所属・設定・定義・入口を分離。代表的根拠は同じEvidenceのpath/line/endLineから生成。完全な根拠を内訳から直接展開・コピーできる。共通Evidence部品自体は変更不要だった。 |
| F3 主要/支援 | 共有コードを主経路の配置と同格に扱い、DB支援を個別に空き位置へ置いていた。 | 独立実行主体は残す。共有コードを近接する補助位置へ移動。重なるDB操作先を持つスキーマ/生成/SQL/適用を短い枝へ配置し、「DB構造変更」を表示。先行関係だけのアプリ起動を巻き込まない負例も追加。 |
| F4 方向 | 相手IDごとに関係ラベルだけを集めてsource/targetを捨てていた。 | 元の両端から入る/出るを表示し、種類・環境・確度を分ける。要求を設定より先に表示。内部関係は外側へ出さない。 |
| F5 件数 | 59,205は延べEvidence数ではなく、既にpath/start/endの異なる組だった。 | 数字を減らさず維持。正規化した物理範囲とEvidenceレコード数を分け、数え方を既存開閉欄に記載。根拠展開時だけ計算し、入力配列単位でキャッシュする。 |
| F6 要約線 | 見出しだけでコード入力等の意味が分かりにくく、端点の代表script属性が残っていた。 | 元種類/対象/用途による一文を追加。元操作IDを数え、開始scriptを二重に数えない。上部端点も「4使用（deployほか3使用）」へ修正。 |

## 3入力・画面

前回の同一解析スナップショットを使用。vehicle254ファイル、git-lines1,899ファイル、web-atlasは以前の244ファイルの保存入力。今回の全ファイル再スキャン結果とはしない。通常の固定ソース回帰テストは3入力の現行ファイルを静的解析して成功。

| 入力 | 要素/線（前後不変） | 2D囲い 前→後 | 3D囲い 後 | 判断 |
|---|---:|---:|---:|---|
| vehicle-management | 34 / 59 | 23→1 | 2 | API専用支援を2Dで囲む。Web側は他の対象まで包むため囲わず、Viteの近接と線を保持。 |
| git-lines | 7 / 12 | 3→0 | 1 | 2Dは大きいカード余白に別対象が入るため囲いを省略。Webview/道具/拡張主体の区別は維持。 |
| web-atlas | 3 / 7 | 1→1 | 1 | アプリとVite/Wranglerの専用支援という有効なまとまりを維持。 |

3Dは点の領域余白が小さいため、2Dで抑制したWeb/Webviewの支援領域を残せる。点ラベル/優先順位/操作は作り直していない。どちらも新しい論理所属ではない。

| 入力 | 前 | 後2D | 後3D |
|---|---|---|---|
| vehicle-management | [前](../../.cache/simple-bounds/vehicle-before.png) | [後](../../.cache/simple-bounds/vehicle-after.png) | [3D](../../.cache/simple-bounds/vehicle-3d-after.png) |
| git-lines | [前](../../.cache/simple-bounds/git-lines-before.png) | [後](../../.cache/simple-bounds/git-lines-after.png) | [3D](../../.cache/simple-bounds/git-lines-3d-after.png) |
| web-atlas | [前](../../.cache/simple-bounds/web-atlas-before.png) | [後](../../.cache/simple-bounds/web-atlas-after.png) | [3D](../../.cache/simple-bounds/web-atlas-3d-after.png) |

vehicleの前は着手時の実画面。git/webの前は前回完了版（今回開始HEADと同じ表示）の保存画像。カメラを固定した画素比較ではない。追加：[API詳細](../../.cache/simple-bounds/api-detail-after.png)、[4使用の入力線](../../.cache/simple-bounds/input-relation-after.png)、[390px幅](../../.cache/simple-bounds/narrow-after.png)。検証キャッシュはローカルに保存しGitへ巨大な入力や画像を追加しない。

## 元ソース・集計の照合

- API: 誤表示 `apps/api:3–9` → 所属 `apps/api` / 代表的根拠 `apps/api/drizzle.config.ts L3–9`。プレビューは同ファイルのdefineConfig、オフセット61–212。
- Persistence: 所属apps/apiと `apps/api/migrations/0000_initial.sql L1–8` を分離。
- Authentication: 所属apps/apiと `apps/api/src/auth/firebase.ts L14–17` を分離。
- API環境別構成: `node.path=apps/api/src/index.ts`、`entryDeclaration=src/index.ts`、設定はwrangler.jsonc、先頭Evidenceはpackage.json L6/L7/L8だった。旧`src/index.ts:6/7/8`は別ファイル同士の結合であり誤表示。今回、設定上の入口と代表Evidenceを別項目にする。
- CompanionはcsprojのWinExe/WPF、LegacyHostとAbacusImport.CliはExe、LocalProtocolとAbacusImportは共有コードとして元モデルに存在。名前/.NETだけで統合しない。用途未判定とテストの既存区分も維持。
- APIのpackage.json/wrangler.jsonc/drizzle.config.ts、Companion/LocalProtocolのcsprojは現在の原本と保存ソースが完全一致することを読取比較した。
- 59,205はAPI要約の異なるpath/start/end。Evidenceは100,315レコード。全レコードに保存ソースが存在し、範囲終端はそのソース長内。不明範囲0。同じ範囲の異なる説明を削ってはいない。入れ子の範囲も異なる範囲として数えるため、「別の行の数」や「関係数」とは一致しない。
- 循環・複数経路を再帰走査して集計せず、当該入力の根拠配列を一度走査。別入力の配列とは合算しない。同じ行の別範囲、別ファイルの同じ行、区切り文字/相対表記、意味の異なる同一範囲をfixtureで確認。

## 操作と意味

API概要で `web → この構成 / HTTPリクエストを送る記述 / production` と `この構成 → DB / リソースへの操作を要求 / 推定` を分離。設定関係は別の行。向きを見た目に合わせて反転しない。

入力線は「vehicle-management-api側のコードを、Wranglerの起動・公開操作で入力として使う関係をまとめています。」、4元関係・4使用（deployほか3使用）。web-atlasのVite入力は2元関係・2使用（devほか1使用）。1/4/20使用のfixtureでも総数/残数を照合。複数独立使用を順番のある実行とは表現しない。

agent-browser/Chromeの専用セッションで本物のページ/操作/描画に保存モデルを注入。解析の再実行時間はこのブラウザ確認に含めない。

- APIの通常選択、内部を開く→戻るで現在地/ノード座標/カメラ一致。
- 2D→3D→2D→3Dで選択関係とカメラ一致、Canvas1つ。全体→簡易再訪でも選択/現在地/カメラを復元。
- 内訳の根拠を展開し、完全パス・範囲・プレビュー一致。パスコピーは実ボタンで成功状態を確認。自動化evalからの合成clickとclipboard.readTextはブラウザ権限で拒否されたため、実clickへ切替。clipboard読戻しは未許可だが、単体テストでwriteText引数も検証。
- 390px全画面で横はみ出しなし。リサイズCLIにEOF応答が出たが、innerWidth=390と画像で実際の変更を確認。図の保存カメラを強制移動しない。
- web-atlasの入力線→元関係グループ→package.json L9の入力コード→「全体でこの関係を詳しく見る」を実操作し、全体の正規selectedEdgeIdと入力関係詳細を確認。最後のブラウザpage errorsは0件。
- 検証中のVite HMRでハーネスが再読込され初期全体へ戻る場面があった。再読込後に簡易を選び直して撮影し、状態復元はファイル更新のない状態で比較した。本番の切替動作と混同しない。

## 回帰・性能・テスト

旧2fcc8a9のソースをローカルへarchiveして独立した比較画面を用意。同一保存入力のAPI選択から2回のrequestAnimationFrameまでの参考値は旧151ms、新75ms。単発測定であり高速化率の保証やFPS評価にはしない。パン/回転時は要約生成と根拠集計の入力が変わらず、キャッシュを再利用する。

簡易投影coldはvehicle209ms/git301ms/web135ms。全簡易ノードの根拠集計を初めて行う合計は161/362/180ms。100回の要約と全ノード集計キャッシュ取得は0.28/0.08/0.03ms。UIは開いた根拠だけ集計し、通常選択で全件集計しない。メモリ回収/長時間GPU/FPSは未計測。

元全体/プリセット投影は同一凍結モデルと旧実装で比較し、元モデルhash/ID/関係/配置の一致を再確認。元対象・線は今回の簡易でも前後一致。共有変更はsimpleOverview分岐と限定的領域条件で、他タブの領域・根拠表示は変更しない。HTTP判定は既存回帰のみ。

| 項目 | 結果 |
|---|---|
| 全テスト | 1,397成功・18 skip、134ファイル成功・11 skip、116.17秒 |
| 実スナップショット+一般fixture | SIMPLE_BOUNDSの10テスト成功、3入力の囲い/元ID/集計を確認 |
| 全体/既存プリセット旧比較 | SIMPLE_POLISH=afterの独立比較成功 |
| typecheck / lint / build | 成功。buildは既存tree-sitterのfs/path外部化通知と大chunk警告あり |
| diff --check | 成功（改行変換通知のみ） |

途中で旧囲い名を期待する既存テストを、新しい「単独は囲わない」契約へ更新。web-atlasの有効な1囲いまで減少を要求した初期検証条件も誤りだったため、元対象を保持し必要な囲いだけ残る検証へ修正。これらは最終失敗として残っていない。

## 限界

大きい全景Fitの文字は小さく、初期倍率とパンで読む仕様を維持。線の回り込み/粒子量は変更していない。原本の起動/公開/DB操作は未観測。web-atlas全ソース再解析は前回OOMのため保存入力で補い、今回の新鮮な全ソース解析成功とはしない。全操作×全入力×全解像度の網羅、パン/回転の定量的な修正前後比較、実GPUメモリ解放は未検証。

UI-evolveの既存の「操作と関係」「代表性のある確認」を適用。今回の一般原則は既存知見で説明できるため、汎用Skillの新規ルールは追加しない。
