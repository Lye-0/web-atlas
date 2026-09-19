import { commandArgv, type CommandFragment } from './commandParser';
import { localDevelopmentCliId, localDevelopmentOperation, localDevelopmentSubcommand } from './localDevelopmentCli';
import { localPath } from './projectPaths';
import { workingDirectoryArgument } from './runtimeArgv';
import type { AnalyzerProjectStore, PackageScriptFact } from './types';
import type { CommandTerminalTarget } from './commandTargets';

/** Resolve only recorded configuration targets; a CLI declaration is not a running service. */
export function localDevelopmentCliTargets(fragment: CommandFragment, store: AnalyzerProjectStore, script: PackageScriptFact): CommandTerminalTarget[] | undefined {
  const argv = commandArgv(fragment), cliId = localDevelopmentCliId(argv); if (!cliId) return undefined;
  const cli = store.facts.find(fact => fact.kind === 'technology' && fact.dictionaryStackId === cliId);
  const result: CommandTerminalTarget[] = cli ? [{ factId: cli.id, kind: 'uses' }] : [];
  const operation = localDevelopmentOperation(argv), subcommand = localDevelopmentSubcommand(argv);
  const resourceTool = cliId === 'wrangler' && ['d1', 'types'].includes(subcommand ?? '') && !argv.some(arg => ['--help', '-h', '--version', '-v'].includes(arg));
  if (operation === 'tool' && !resourceTool) return result;
  const option = (...keys: string[]) => { for (const key of keys) { const index = argv.indexOf(key); if (index >= 0) return argv[index + 1] ?? ''; const value = argv.find(arg => arg.startsWith(`${key}=`)); if (value) return value.slice(key.length + 1); } return undefined; };
  const cwd = fragment.workingDirectory ?? option('--cwd', '--workdir') ?? workingDirectoryArgument(argv);
  const directory = cwd === undefined ? script.packagePath : localPath(script.packagePath, cwd);
  const config = option('--config', '-c');
  if (!directory || [cwd, config].some(value => value !== undefined && (!value || /[$`]/.test(value)))) return result;
  const names = cliId === 'wrangler' ? ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml'] : cliId === 'firebase-cli' ? ['firebase.json']
    : cliId === 'netlify-cli' ? ['netlify.toml'] : cliId === 'vercel-cli' ? ['vercel.json'] : ['supabase/config.toml'];
  const candidates = config !== undefined ? [localPath(directory, config)] : names.map(name => localPath(directory, name));
  const paths = candidates.filter((path): path is string => Boolean(path && Object.hasOwn(store.sources, path)));
  if (paths.length !== 1) return result;
  const path = paths[0]!;
  const only = option('--only')?.split(',');
  for (const fact of store.facts) {
    if (fact.filePath !== path) continue;
    if (cliId === 'wrangler' && subcommand !== 'd1' && fact.kind === 'runtime' && fact.runtimeType === 'cloudflare-workers') result.push({ factId: fact.id, kind: operation === 'local' || operation === 'remote' ? 'starts' : 'uses' });
    if (cliId === 'wrangler' && subcommand === 'd1' && fact.kind === 'resource' && fact.dictionaryStackId === 'cloudflare-d1') {
      const index = argv.indexOf('d1'), name = argv[index + (argv[index + 1] === 'migrations' ? 3 : 2)];
      if (name && (fact.binding === name || fact.metadata.databaseName === name)) result.push({ factId: fact.id, kind: 'uses' });
    }
    if (cliId === 'firebase-cli' && operation === 'local' && fact.kind === 'resource' && fact.metadata.environment === 'local'
      && (fact.dictionaryStackId === 'firebase-emulator-suite' || !only || only.includes(String(fact.metadata.emulatorService ?? fact.metadata.service)))) result.push({ factId: fact.id, kind: 'starts' });
    if (cliId === 'netlify-cli' && fact.kind === 'resource' && fact.dictionaryStackId === 'netlify') result.push({ factId: fact.id, kind: 'uses' });
    if (cliId === 'firebase-cli' && operation === 'deploy' && fact.kind === 'resource' && fact.dictionaryStackId === 'firebase-hosting'
      && (!only || only.some(value => value === 'hosting' || value.startsWith('hosting:')))) result.push({ factId: fact.id, kind: 'uses' });
  }
  const owner = store.facts.filter((fact): fact is Extract<typeof fact, { kind: 'workspace-package' }> => fact.kind === 'workspace-package' && (fact.packagePath === '.' || path.startsWith(`${fact.packagePath}/`)))
    .sort((a, b) => b.packagePath.length - a.packagePath.length)[0];
  if (owner && result.length === (cli ? 1 : 0) && operation !== 'tool') result.push({ factId: owner.id, kind: 'uses' });
  return result.sort((a, b) => Number(a.factId === cli?.id) - Number(b.factId === cli?.id));
}
