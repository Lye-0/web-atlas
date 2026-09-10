---
id: rm-20260908-aggregation-fragmented-density
topic: analyzer-spatial
type: failure
status: superseded
maturity: candidate
created: 2026-09-08
last_verified: 2026-09-08
source_commit: "f97bafe59bb72d7af596504bbc0de319a84cb625"
related_files:
  - src/analyzer/autoAggregation.ts
  - src/analyzer/autoAggregation.test.ts
  - src/analyzer/semantic/flowAutoAggregation.ts
  - src/analyzer/moduleAutoAggregation.ts
  - docs/technical/semantic-analyzer.md
tags:
  - density
  - hierarchy
  - 3d
  - performance
  - projected-span
supersedes: null
promoted_to: null
---

# 細かな所属の密度だけでは、大規模な重なりを見逃す

2026-09-09: `rm-20260909-aggregation-wide-density`で置換。下記の「粗い候補にも投影spanの上限を持たせ、ズームで個別化を戻す」は、近接時に密集した数万点を戻すため現行の判断には使用しない。歴史的な計測証拠として保存する。

## Conclusion

Data Flowをscope・kind・role・confidenceの細かな所属に分け、各所属の最小件数と密度だけで集約すると、画面全体が密集していても小さな所属が多数残る。総対象数が多いことも、同じ役割の各所属が集約条件を満たすことも、画面の混雑を直接表さない。

全体の投影点近接密度と、意味を説明できる関数／file／directoryの階層候補を併用する。粗い候補にも投影spanの上限を持たせ、ズームで個別化を戻す。runtime文脈、モデルのcode/validation/storage、confidenceは分離し、役割を混ぜた候補は単一役割を名乗らず実メンバーの内訳を示す。明示展開した子範囲は自動の祖先にも再吸収させない。

## Scope

Applicable:

- 多数の小scopeが同じ画面へ投影される3Dの密度判断、所属階層、集約の粒度・解除条件。

Do not apply:

- 総件数だけによる強制集約や、OFFでの件数上限・対象削除。
- 解析の意味モデルやsource座標の再配置。
- CPU計算の短縮だけから、FPS・GPUメモリー・操作応答を保証すること。

## Evidence

- 独立ブラウザ確認の旧実装では35,303対象中25,749が個別に残り、81,118対象の密集fixtureでも自動0となった。細かな候補の多くが最小件数未満だった。
- `semanticAggregationInput`が階層候補を生成し、`projectAutoAggregation`が全体近接率、各候補の投影span、hysteresisを評価する。元座標と所属説明を維持する契約は`docs/technical/semantic-analyzer.md`にある。
- 修正後の固定入力・記録済みFitカメラを使った純粋投影では35,303対象が35代表へ集約され、zoom1/2/4で個別6,824/18,302/33,692へ戻った。81,118対象fixtureはONで240代表、OFFで全件個別。これらは特定カメラでのCPU投影結果であり、ブラウザ初期値やFPSではない。
- `autoAggregation.test.ts`は疎な配置、hysteresis、明示展開した子と重なる祖先、手動ownerとの非重複、実メンバー内訳を検証する。最終独立UXでも実投影・zoom・設定切替を再確認した。
- 記録時HEADに対する未コミット実装で確認。閾値や代表数を固定仕様として流用しない。

## Verification

1. 実入力で候補ごとの件数分布と全体の画面近接率を両方調べ、所属内の平均だけで混雑を判定していないか確認する。
2. `pnpm exec vitest run src/analyzer/autoAggregation.test.ts`を実行する。
3. 同じ入力・座標・カメラでON/OFF・遠近zoom・明示展開を比較し、集合の内訳と全件保全を確認する。性能は純粋投影、画面応答、GPU描画を区別して測る。
