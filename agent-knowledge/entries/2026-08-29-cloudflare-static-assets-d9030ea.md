---
id: rm-20260829-cloudflare-static-assets
topic: deployment
type: decision
status: active
maturity: candidate
created: 2026-08-29
last_verified: 2026-08-29
source_commit: "d9030ea"
related_files:
  - wrangler.jsonc
  - package.json
  - .gitignore
  - README.md
  - docs/technical/dictionary.md
tags:
  - cloudflare
  - workers
  - static-assets
  - spa
  - deployment
supersedes: null
promoted_to: null
---

# Cloudflare Workers Static Assetsの公開契約

## Conclusion

Phase 1 Dictionaryはbackend Workerを持たないVite SPAとして、`wrangler.jsonc` の
`assets.directory: "./dist"` と `not_found_handling: "single-page-application"` を使って
Cloudflare Workers Static Assetsへ公開する。`pnpm deploy` は毎回Vite buildを先に実行し、
`pnpm preview:cloudflare` は同じbuild成果物を `wrangler dev` で確認する。Cloudflareの
アカウント認証は `pnpm wrangler login` を経由し、secretやaccount IDはリポジトリへ保存しない。

## Scope

Applicable:
- `dist`をWorkers Static Assetsとして配信するPhase 1 SPAの手動公開
- BrowserRouterのdeep linkを`index.html`へfallbackする構成
- Wranglerのlocal stateと開発用secretのGit管理除外

Do not apply:
- backend Worker logic、API、DB、Auth、KV、R2、Pages、GitHub自動デプロイの追加
- Dictionaryの画面、データ構造、routing仕様を公開設定のために変更すること

## Evidence

- `wrangler.jsonc` のStatic Assets設定とSPA fallback
- `package.json` の `wrangler` devDependency、`deploy`、`preview:cloudflare` scripts
- `.gitignore` の `.wrangler/`、`.dev.vars*` 除外
- `pnpm exec wrangler deploy --dry-run` が `dist` の4ファイルを読み込み成功
- `wrangler dev --local` で `/` と `/dictionary/stacks/vite` が200を返すことを確認
- `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test` が成功

## Verification

1. Wranglerの現行config schemaで`assets.directory`とSPA fallbackのフィールド名を再確認する。
2. `pnpm build`後に`pnpm exec wrangler deploy --dry-run`を実行し、`dist/index.html`を含む成果物を確認する。
3. `pnpm preview:cloudflare`で `/dictionary/map`、Category / Stackのdeep linkを直接開き、200とSPA表示を確認する。
4. 本番公開時は`pnpm wrangler login`後に`pnpm run deploy`を実行し、出力された`workers.dev` URLを確認する。
