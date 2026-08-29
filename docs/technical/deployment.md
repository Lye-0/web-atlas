# Deployment 現行設計

## 対象と境界

Web Atlas Phase 1 は、Vite が生成する `dist` を Cloudflare Workers Static Assets として
公開する静的SPAである。Cloudflare Workers BuildsのGitHub連携を使い、`main` の変更は
Productionへ、それ以外のbranchとPull RequestはPreview Versionへ送る。

GitHub Actions、Cloudflare Pages、backend Worker、API、DB、Auth、Analyzerはこの構成に
含めない。Cloudflare DashboardでのGitHub接続が必要であり、repository側へAPI tokenや
account IDを保存しない。

## Repository側の現行設定

- `wrangler.jsonc` の `name` は `web-atlas`。Cloudflare DashboardのWorker名も同じにする。
- `wrangler.jsonc` は `assets.directory: "./dist"` と
  `not_found_handling: "single-page-application"` を定義する。
- `package.json` の `packageManager` は `pnpm@11.24.0`。
- `mise.toml` で Node.js `24.18.0` と pnpm `11.24.0` を既に固定しているため、今回のために
  version管理fileを追加しない。
- `package-lock.json` は生成しない。依存関係のlockfileは `pnpm-lock.yaml` のみを使う。
- `.github/workflows/` は追加しない。Workers BuildsがGitHubから直接buildとdeployを実行する。

手動公開用の `pnpm run deploy`（build + `wrangler deploy`）は残す。Workers Buildsでは
Build commandとDeploy commandが別々に実行されるため、Deploy commandへこのscriptを指定せず、
二重buildを避ける。

## Workers Buildsの設定値

Cloudflare Dashboardの `Workers & Pages → web-atlas → Settings → Builds → Connect` で
GitHub repositoryを接続し、次の値を設定する。

| 設定 | 値 |
| --- | --- |
| Git repository | `web-atlas` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `pnpm build` |
| Deploy command | `pnpm exec wrangler deploy` |
| Non-production branch deploy command | `pnpm exec wrangler versions upload` |
| Builds for non-production branches | 有効 |

Workers BuildsはProduction branchではBuild commandの後にDeploy commandを実行する。それ以外の
branchでは、Build commandの後にNon-production branch deploy commandを実行する。
`wrangler versions upload` はProductionへ昇格させずPreview Versionを作成するため、feature
branch、fix branch、Pull Requestの確認に使う。

## Branchごとの動作

```text
main push
  -> pnpm build
  -> pnpm exec wrangler deploy
  -> Production deployment

feature/*, fix/*, その他branch / Pull Request
  -> pnpm build
  -> pnpm exec wrangler versions upload
  -> Preview Version / preview URL
```

Preview URLとbuild statusはCloudflare Dashboardで確認でき、Pull RequestにはGitHub連携の
コメントやcheck runが表示される。Preview URLの扱いはCloudflareの現行仕様に従う。

## Cloudflare Dashboardでの接続手順

1. Cloudflare Dashboardで `Workers & Pages` を開き、Worker `web-atlas` を選択する。
2. `Settings → Builds → Connect` を開く。
3. GitHubを選択し、Cloudflare GitHub Appの認可を行う。
4. `web-atlas` repositoryとrepository root (`/`) を選ぶ。
5. Production branchを `main` にする。
6. Build command、Deploy command、Non-production branch deploy commandを上表の値にする。
7. `Builds for non-production branches` を有効にして保存する。
8. `main`へcommitをpushしてProduction buildを確認する。

Cloudflare側の認証やBuild tokenはDashboardのWorkers Buildsが管理する。secret、API token、
account IDをsource codeへ追加しない。

## 検証

repository側では次を実行する。

```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm exec wrangler deploy --dry-run
```

GitHub接続後は、変更をbranchへpushし、Cloudflare DashboardのBuild historyとGitHubのcheck
runを確認する。`main`のpushはActive deploymentへ反映され、non-production branch / Pull
RequestのpushはProductionを変更せずPreview URLを生成することを確認する。

## 公式資料

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
