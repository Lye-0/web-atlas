export const languageExtensions: Record<string, string> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  py: 'python', pyi: 'python', java: 'java', cs: 'c_sharp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', swift: 'swift', kt: 'kotlin', kts: 'kotlin', scala: 'scala', dart: 'dart',
  vue: 'vue', svelte: 'svelte', astro: 'astro', html: 'html', xaml: 'xaml', sql: 'sql', prisma: 'prisma', graphql: 'graphql', gql: 'graphql',
};
export function semanticLanguage(path: string): string | undefined { return languageExtensions[path.split('.').at(-1)?.toLowerCase() ?? '']; }
export const languageLabels: Record<string, string> = { typescript: 'TypeScript', tsx: 'TSX', jsx: 'JSX', vue: 'Vue', svelte: 'Svelte', astro: 'Astro', html: 'HTML', xaml: 'XAML', javascript: 'JavaScript', python: 'Python', java: 'Java', c_sharp: 'C#', go: 'Go', rust: 'Rust', ruby: 'Ruby', php: 'PHP', c: 'C', cpp: 'C++', swift: 'Swift', kotlin: 'Kotlin', scala: 'Scala', dart: 'Dart', sql: 'SQL', prisma: 'Prisma', graphql: 'GraphQL' };

/** Grammar implementation is independent of the public source/coverage language. */
export function grammarLanguage(language: string, source = ''): string {
  if (language === 'jsx') return 'tsx';
  if (['vue', 'svelte', 'astro', 'html'].includes(language)) return /<script\b[^>]*\blang=["'](?:js|javascript)["']/.test(source) ? 'javascript' : 'typescript';
  return language;
}

export function responsibility(path: string, source: string): string {
  if (/(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|\.)|\.(?:test|spec)\./i.test(path)) return 'Tests';
  if (/(?:^|\/)(?:auth|authentication|authorization)(?:\/|\.)/i.test(path) || /(?:verifyIdToken|signInWith|authenticate\()/.test(source)) return 'Authentication';
  if (/(?:^|\/)(?:schema|migrations|database|db|repositories|persistence)(?:\/|\.)|\.repository\./i.test(path)) return 'Persistence';
  if (/(?:^|\/)(?:models?|entities|types|dto)(?:\/|\.)/i.test(path)) return 'Data models';
  if (/(?:^|\/)(?:routes?|controllers?|api|handlers?|endpoints?)(?:\/|\.)/i.test(path)) return 'API';
  if (/\.(?:tsx|jsx|vue|svelte)$|\.component\./.test(path) || /(?:^|\/)(?:components|pages|views|screens)(?:\/|\.)/.test(path)) return 'UI';
  if (/(?:^|\/)(?:services?|domain|usecases?)(?:\/|\.)|\.service\./i.test(path)) return 'Domain services';
  if (/(?:^|\/)(?:config|infrastructure|infra|deploy)(?:\/|\.)/i.test(path)) return 'Infrastructure';
  return 'Shared logic';
}
