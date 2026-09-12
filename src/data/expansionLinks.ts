import type { StackEntry, StackRelationship } from '../types';

const additions: Record<string, string[]> = {
  csharp: ['java'], php: ['ruby'], 'aspnet-core': ['spring-framework', 'nestjs'], dotnet: ['jvm'], jvm: ['dotnet'],
  cargo: ['composer'], composer: ['cargo', 'nuget'], nuget: ['composer'], pytest: ['junit'], junit: ['pytest'],
  html: ['jsx', 'vue', 'svelte', 'angular'], css: ['bootstrap', 'vue', 'svelte'],
  javascript: ['jsx', 'vue', 'svelte', 'angular', 'bun', 'deno'], typescript: ['tsx', 'jsx', 'angular', 'nestjs', 'bun', 'deno'],
  nodejs: ['express', 'nestjs', 'fastify', 'bun', 'deno'], npm: ['yarn', 'jsdelivr', 'unpkg'], pnpm: ['yarn', 'jsdelivr', 'unpkg'],
  nextjs: ['nuxt', 'sveltekit', 'astro', 'clerk', 'auth0'], hono: ['express', 'fastify', 'nestjs'],
  react: ['jsx', 'tsx', 'vue', 'svelte', 'angular', 'redux-toolkit', 'mui', 'radix-ui'], 'react-dom': ['jsx', 'tsx'],
  tailwindcss: ['bootstrap'], 'shadcn-ui': ['radix-ui', 'mui'], zustand: ['redux-toolkit', 'pinia'], 'tanstack-query': ['swr'], zod: ['pydantic'],
  'drizzle-orm': ['sequelize', 'sqlalchemy', 'entity-framework-core', 'sql'], prisma: ['sequelize', 'sqlalchemy', 'entity-framework-core', 'sql'],
  postgresql: ['sql', 'sqlalchemy', 'sequelize', 'supabase'], mysql: ['sql', 'mariadb', 'sequelize'], sqlite: ['sql', 'sqlalchemy', 'entity-framework-core'],
  'cloudflare-d1': ['sql', 'cloudflare-kv'], mongodb: ['mongoose', 'cloud-firestore'], objectdb: ['java', 'jvm'], objectbox: ['kotlin', 'swift', 'dart'],
  'amazon-s3': ['amazon-cloudfront'], 'cloudflare-r2': ['cloudflare-cdn'], 'backblaze-b2': ['cloudflare-cdn'], 'google-cloud-storage': ['google-cloud-cdn', 'firebase'],
  'firebase-storage': ['firebase', 'cloud-firestore', 'firebase-emulator-suite'], 'firebase-authentication': ['firebase', 'firebase-emulator-suite', 'clerk', 'auth0'],
  'better-auth': ['clerk', 'auth0'], authjs: ['clerk', 'auth0'], vite: ['tsx', 'jsx', 'vue', 'svelte', 'astro', 'webpack', 'esbuild'],
  vitest: ['jest', 'firebase-emulator-suite'], 'playwright-test': ['cypress', 'firebase-emulator-suite'], git: ['gitlab'], github: ['gitlab', 'github-pages'],
  'github-actions': ['gitlab-ci', 'github-pages'], docker: ['docker-compose', 'kubernetes'], vercel: ['netlify', 'nuxt', 'astro', 'sveltekit'],
  'cloudflare-workers': ['cloudflare-kv', 'cloudflare-cdn', 'bun', 'deno'], 'cloudflare-pages': ['netlify', 'github-pages', 'firebase-hosting', 'cloudflare-cdn'],
};
const relations: Record<string, StackRelationship[]> = {
  csharp: [{ targetStackId: 'java', kind: 'related-to', label: '静的型付き言語と実行基盤の比較', explanation: 'C#は.NET、Javaは主にJVMの型とAPIを利用します。' }],
  php: [{ targetStackId: 'ruby', kind: 'related-to', label: 'Webで利用される動的言語の比較', explanation: 'PHPとRubyは構文や実行モデルが異なり、それぞれLaravelやRailsなどを利用できます。' }],
  'aspnet-core': [{ targetStackId: 'nestjs', kind: 'related-to', label: 'DIとcontrollerを持つAPI基盤の比較', explanation: 'ASP.NET Coreは.NET、NestJSはJavaScript runtime上のサーバー構成を担います。' }],
  dotnet: [{ targetStackId: 'jvm', kind: 'related-to', label: '実行基盤の比較', explanation: '.NETはruntime、標準library、SDKを含むplatformで、JVMはJava系bytecodeの仮想マシンを指します。' }],
  cargo: [{ targetStackId: 'composer', kind: 'related-to', label: '言語ごとの依存管理を比較', explanation: 'CargoはRust crateのbuildも統合し、ComposerはPHP依存とautoloadを管理します。' }],
  nuget: [{ targetStackId: 'composer', kind: 'related-to', label: '配布packageと参照方式を比較', explanation: 'NuGetは.NETのPackageReference、ComposerはPHPのrequireとautoloadを扱います。' }],
  pytest: [{ targetStackId: 'junit', kind: 'related-to', label: 'PythonとJVMのtest基盤を比較', explanation: 'pytestは関数とfixture、JUnitはJVMのannotationやtest engineを用います。' }],
  nuxt: [{ targetStackId: 'vue', kind: 'built-on', label: 'VueをUI基盤に利用' }],
  sveltekit: [{ targetStackId: 'svelte', kind: 'built-on', label: 'SvelteをUI基盤に利用' }],
  'spring-boot': [{ targetStackId: 'spring-framework', kind: 'built-on', label: 'Springの構成と起動を支援' }],
  express: [{ targetStackId: 'nodejs', kind: 'runs-on', label: 'Node.jsでHTTP処理を実行' }],
  java: [{ targetStackId: 'jvm', kind: 'runs-on', label: 'JVM向けバイトコードを実行' }],
  mongoose: [{ targetStackId: 'mongodb', kind: 'stores-in', label: 'MongoDBのdocumentを操作' }],
  'amazon-s3': [{ targetStackId: 'amazon-cloudfront', kind: 'served-by', label: 'CloudFrontのoriginとして接続可能', explanation: 'distributionにS3 originを明示した構成で利用します。' }],
  'cloudflare-r2': [{ targetStackId: 'cloudflare-cdn', kind: 'served-by', label: '公開配信設定でCDNと連携', explanation: 'R2を利用する全構成にCDNの採用を推定する関係ではありません。' }],
  'backblaze-b2': [{ targetStackId: 'cloudflare-cdn', kind: 'served-by', label: '公開B2 originをCloudflareへ接続可能', explanation: '公開bucketとCloudflareのproxyを組み合わせた配信構成で利用します。' }],
};

/** Related links support comparison in both directions; directed relations retain their own meaning. */
export function connectExpandedStacks(entries: StackEntry[]): StackEntry[] {
  const related = new Map(entries.map((stack) => [stack.id, new Set([...(stack.relatedStackIds ?? []), ...(additions[stack.id] ?? [])])]));
  for (const [id, ids] of related) for (const target of ids) related.get(target)?.add(id);
  return entries.map((stack) => ({ ...stack, relatedStackIds: [...(related.get(stack.id) ?? [])],
    relationships: [...(stack.relationships ?? []), ...(relations[stack.id] ?? [])] }));
}
