---
id: rm-20260829-cloudflare-pnpm-build-scripts
topic: deployment
type: failure
status: active
maturity: candidate
created: 2026-08-29
last_verified: 2026-08-29
source_commit: "786ffc9"
related_files:
  - pnpm-workspace.yaml
  - package.json
  - pnpm-lock.yaml
  - docs/technical/deployment.md
  - README.md
tags:
  - cloudflare
  - workers-builds
  - pnpm
  - allow-builds
  - esbuild
  - workerd
supersedes: null
promoted_to: null
---

# Workers Buildsでのpnpm install script許可

## Conclusion

Workers Buildsが検出したpnpm `11.24.0`で`pnpm install --frozen-lockfile`を実行すると、
install scriptの許可が未設定なrepositoryでは`ERR_PNPM_IGNORED_BUILDS`で停止することがある。
このrepositoryではVite / Wranglerの実行に必要な`esbuild`と`workerd`だけを、ルートの
`pnpm-workspace.yaml`にあるpnpm 11形式の`allowBuilds`で`true`にする。他の依存のinstall
scriptは許可しない。

## Scope

Applicable:
- Cloudflare Workers Buildsがpnpm 11でこのVite + Wrangler repositoryをinstallする場合
- clean installでesbuild / workerdのpostinstallが必要な場合

Do not apply:
- pnpm 10以前の設定名`onlyBuiltDependencies`を追加すること
- 全依存を許可する`dangerouslyAllowAllBuilds`や無差別なinstall script許可
- `--ignore-scripts`でCloudflareのinstall失敗を隠すこと

## Evidence

- Workers Buildsのinstall logで`ERR_PNPM_IGNORED_BUILDS`と`esbuild@0.28.1`、
  `esbuild@0.28.2`、`workerd@1.20260826.1`が停止原因になった。
- `pnpm-workspace.yaml` の`allowBuilds: { esbuild: true, workerd: true }`
- `pnpm rebuild esbuild workerd` が3つのpostinstallを完了した。
- `pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、
  `pnpm exec wrangler deploy --dry-run` が成功した。

## Verification

1. Workers Buildsの次回install logで`ERR_PNPM_IGNORED_BUILDS`が発生しないことを確認する。
2. `pnpm install --frozen-lockfile`をpnpm 11で実行し、lockfileが変更されないことを確認する。
3. `pnpm build`と`pnpm exec wrangler deploy --dry-run`でVite / Wranglerの実行を確認する。
4. pnpm major versionを更新する場合は、そのversionのbuild script設定名と意味を再確認する。
