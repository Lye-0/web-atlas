export const localDevelopmentCliIds = ['wrangler', 'vercel-cli', 'netlify-cli', 'firebase-cli', 'supabase-cli'] as const;
const cliIds: Record<string, string> = { wrangler: 'wrangler', vercel: 'vercel-cli', netlify: 'netlify-cli', firebase: 'firebase-cli', supabase: 'supabase-cli' };
export function localDevelopmentCliId(argv: readonly string[]): string | undefined {
  return cliIds[argv[0]?.replace(/^\.\//, '').toLowerCase() ?? ''];
}
export function localDevelopmentSubcommand(argv: readonly string[]): string | undefined {
  const values = new Set(['--config', '-c', '--cwd', '--workdir', '--project', '-P', '--env', '-e', '--port', '--host', '--ip', '--only', '--scope', '--token']);
  const flags = new Set(['--local', '--remote', '--yes', '-y', '--non-interactive', '--debug']);
  for (let index = 1; index < argv.length; index++) {
    const value = argv[index]!;
    if (values.has(value)) { index++; continue; }
    if (flags.has(value) || value.startsWith('-') && value.includes('=') && (values.has(value.split('=')[0]!) || flags.has(value.split('=')[0]!))) continue;
    if (value.startsWith('-')) return undefined;
    return value;
  }
}
export function localDevelopmentOperation(argv: readonly string[]): 'local' | 'remote' | 'deploy' | 'tool' {
  if (argv.some(arg => ['--help', '-h', '--version', '-v'].includes(arg))) return 'tool';
  const executable = argv[0]?.replace(/^\.\//, ''), subcommand = localDevelopmentSubcommand(argv);
  if (subcommand === 'deploy' || executable === 'supabase' && argv[1] === 'functions' && argv[2] === 'deploy') return 'deploy';
  if (executable === 'wrangler' && subcommand === 'dev') return argv.includes('--remote') || argv.includes('--remote=true') ? 'remote' : 'local';
  if (['vercel', 'netlify'].includes(executable ?? '') && subcommand === 'dev'
    || executable === 'firebase' && ['emulators:start', 'emulators:exec'].includes(subcommand ?? '')
    || executable === 'supabase' && subcommand === 'start') return 'local';
  return 'tool';
}
