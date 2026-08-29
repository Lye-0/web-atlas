# Web Atlas

Web開発の分類・技術・関係性をたどる、黒基調のTechnical Dictionaryです。

## 開発

```bash
pnpm install
pnpm dev
```

`pnpm dev` は Vite の開発サーバーを起動します。Cloudflare Workers Static Assets
としての配信確認は、build後に Wrangler を使う次のコマンドで行えます。

```bash
pnpm preview:cloudflare
```

Cloudflareへ公開するには、Cloudflareアカウントへ `pnpm wrangler login` でログインしたうえで実行します。

```bash
pnpm deploy
```

`wrangler.jsonc` は Vite の `dist` を静的assetとして登録し、SPAのクライアント側routeへ
`index.html`をfallbackさせます。backend Worker、DB、Auth、APIはこの公開設定には含めません。

品質確認:

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

## Phase 1

Dictionaryのみを対象とします。

- `/dictionary/map` — Stack Map
- `/dictionary/categories` — 分類の一覧と詳細
- `/dictionary/stacks` — 技術の一覧と詳細

データモデルと現在の設計は [`docs/technical/dictionary.md`](docs/technical/dictionary.md) を参照してください。Analyzer、backend、database、認証、3D表現は将来Phaseの対象であり、現在の実装には含めません。
