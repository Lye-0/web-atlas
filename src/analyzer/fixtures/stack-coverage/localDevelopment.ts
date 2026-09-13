const definitions = [
  { stackId: 'wrangler', packageName: 'wrangler', command: 'npx wrangler dev', config: 'wrangler.jsonc', source: '{"name":"local-worker","main":"app.ts"}' },
  { stackId: 'vercel-cli', packageName: 'vercel', command: 'pnpm exec vercel dev', config: 'vercel.json', source: '{"version":2}' },
  { stackId: 'netlify-cli', packageName: 'netlify-cli', command: 'netlify dev', config: 'netlify.toml', source: '[build]\npublish="public"' },
  { stackId: 'firebase-cli', packageName: 'firebase-tools', command: 'firebase emulators:start', config: 'firebase.json', source: '{"emulators":{"auth":{"port":9099}}}' },
  { stackId: 'supabase-cli', packageName: 'supabase', command: 'npx supabase start', config: 'supabase/config.toml', source: 'project_id="local-fixture"\n[db]\nport=54322' },
];
export const localDevelopmentCoverageFixtures = definitions.map(item => ({ ...item, fixtureId: `coverage:${item.stackId}`, sources: {
  'package.json': JSON.stringify({ name: 'cli-fixture', scripts: { dev: item.command }, devDependencies: { [item.packageName]: '*' } }),
  [item.config]: item.source,
  'app.ts': 'export default { fetch() { return new Response("local"); } };',
} as Record<string, string> }));
