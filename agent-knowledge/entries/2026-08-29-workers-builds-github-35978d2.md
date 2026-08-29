---
id: rm-20260829-workers-builds-github
topic: deployment
type: decision
status: active
maturity: candidate
created: 2026-08-29
last_verified: 2026-08-29
source_commit: "35978d2"
related_files:
  - package.json
  - pnpm-lock.yaml
  - wrangler.jsonc
  - mise.toml
  - README.md
  - docs/technical/deployment.md
tags:
  - cloudflare
  - workers-builds
  - github
  - preview
  - pnpm
  - deployment
supersedes: null
promoted_to: null
---

# Cloudflare Workers BuildsのGitHub連携契約

## Conclusion

Cloudflare Workers BuildsをGitHub repositoryの自動公開に使い、`main` をProduction branch、
それ以外のbranchとPull Requestをnon-production branchとして扱う。Workers BuildsのBuild
commandは `pnpm build`、ProductionのDeploy commandは `pnpm exec wrangler deploy`、Previewの
Non-production branch deploy commandは `pnpm exec wrangler versions upload`、Root directoryは
`/` とする。手動公開の `pnpm run deploy` は残すが、Workers BuildsのDeploy commandには指定しない。

## Scope

Applicable:
- Cloudflare DashboardのWorkers & Pages > Worker > Settings > Builds > Connect
- `web-atlas` Workerと同名のWrangler configを使うGitHub連携
- Production pushとPreview Versionのbranch運用

Do not apply:
- GitHub Actionsやrepository secretsを使う外部CI/CD
- Cloudflare Pages、custom domain、backend Worker、DB、Auth、APIの追加
- DictionaryのUI、データ、routingの変更

## Evidence

- `wrangler.jsonc` の `name: "web-atlas"` とStatic Assets設定
- `package.json` の `packageManager: "pnpm@11.24.0"` と既存deploy script
- `mise.toml` のNode.js `24.18.0` / pnpm `11.24.0` 固定
- `docs/technical/deployment.md` のWorkers Builds設定表、Dashboard手順、branchフロー
- `pnpm exec wrangler deploy --dry-run` 成功（distの4 assetを認識）
- `pnpm exec wrangler versions upload --dry-run` 成功（Preview upload経路を検証）
- `pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test` 成功

## Verification

1. Cloudflare DashboardでWorker名が `web-atlas` と一致することを確認する。
2. Builds設定でProduction branch `main`、Root `/`、Build / Deploy commandを再確認する。
3. `Builds for non-production branches` を有効にし、Preview commandが
   `pnpm exec wrangler versions upload` であることを確認する。
4. `main`へpushしてActive deployment、feature/fix branchまたはPull Requestへpushして
   Preview URLとGitHub check runを確認する。
