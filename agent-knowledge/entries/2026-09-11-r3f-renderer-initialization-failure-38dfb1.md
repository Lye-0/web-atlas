---
id: rm-20260911-r3f-renderer-initialization-failure
topic: analyzer-rendering
type: failure
status: active
maturity: candidate
created: 2026-09-11
last_verified: 2026-09-11
source_commit: "502194f8d67b8101f8ab9c6f3051bcad5139a116"
related_files:
  - src/components/analyzer/recoverableWebGLRenderer.ts
  - src/components/analyzer/recoverableWebGLRenderer.test.ts
  - src/components/analyzer/AnalyzerGraph3DStage.tsx
  - src/components/analyzer/AnalyzerSpatialGraphStage.tsx
  - docs/technical/analyzer-tabs-1-5-3d.md
tags:
  - r3f
  - webgl
  - initialization
  - fallback
---

# R3Fのfallback mountをWebGL失敗判定に使わない

## Conclusion

R3F 9.7のCanvas fallbackはHTML canvasの子として通常時にもmountされる。fallback内のEffectで失敗を通知すると、正常な3Dまで2Dへ戻ってしまう。さらに、rendererを作る非同期configure taskは外側のReact境界だけでは初期化rejectを捕捉しない。実rendererの生成を扱うgl factoryで失敗を通知し、該当Canvasをunmountする必要がある。

gl生成前に止めたrootはSceneも未生成で、通常unmountの`dispose(scene)`が失敗するとroot登録が残る。失敗アダプターは空Sceneを用意して通常の削除を完了させる。この準備でstore通知すると未生成glに対するinvalidateが失敗するため、未完成rootだけを通知せず補正する。実ブラウザで6回の失敗後、それぞれ登録root数0・Canvas数0・未捕捉例外0を確認した。

## Scope

Applicable:
- Web AtlasのReact Three Fiber 9.7／Three.js renderer初期化。
- Bの2D地図と追加したタブ1〜5の3DにおけるWebGL利用不可と再試行。

Do not apply:
- グラフデータや表示集合が空であるケース。
- R3Fの将来版。configure taskとfallbackの実装を再確認する。
- すでに初期化されたCanvasの通常のcontext loss。これは別のイベント処理を持つ。

## Evidence

- `recoverableWebGLRenderer`とそのテスト：正常生成では通知せず、生成失敗を一度だけ通知し、未捕捉rejectを発生させない。
- `docs/technical/analyzer-tabs-1-5-3d.md`の「初期化失敗」。記載は上記source commitに対する実装時の変更で検証した。
- 実EdgeでgetContextをWebGLに限りnullへ差し替え、Moduleの説明・再試行・検索が残ることを確認。通常の3D起動も別に確認した。
- 失敗をfallbackのEffectから通知する方式では全5タブの正常3Dが直ちに退出した。実生成のfactoryへ変更すると正常起動と失敗復帰が両立した。

## Verification

1. 使用中のR3F CanvasImplでfallbackの位置とconfigure taskのcatch有無を確認する。
2. `pnpm exec vitest run src/components/analyzer/recoverableWebGLRenderer.test.ts`を実行する。
3. 実ブラウザで正常生成、WebGL無効、context loss、明示再試行を別々に試す。正常時にfallbackが通知していないことも確認する。
