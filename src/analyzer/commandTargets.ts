import { getStack } from '../data';
import { commandArgv, commandInvocation, type CommandFragment } from './commandParser';
import { commandPurpose, commandStackId } from './expandedCommands';
import { localPath } from './projectPaths';
import{commandProjectPath}from'./commandProject';
import{runtimeEntryArgument,workingDirectoryArgument}from'./runtimeArgv';
import type {
  AnalyzerProjectStore,
  AnalyzerRelationKind,
  PackageScriptFact,
  ResourceFact,
  RuntimeFact,
  TechnologyFact,
} from './types';

/**
 * Explicit CLI executable → Dictionary stack id. Keys are exact executable names
 * after wrapper unwrapping (`pnpm exec`, `npx`), not fuzzy command-string matches.
 */
export const COMMAND_EXECUTABLE_STACK_IDS: Readonly<Record<string, string>> = {
  vite: 'vite',
  vitest: 'vitest',
  tsc: 'typescript',
  'drizzle-kit': 'drizzle-orm',
};

const WRANGLER_RUNTIME_START_SUBCOMMANDS = new Set(['dev', 'deploy']);

export interface CommandTerminalTarget {
  factId: string;
  kind: AnalyzerRelationKind;
}

function technologyFactForStack(store: AnalyzerProjectStore, stackId: string): TechnologyFact | undefined {
  return store.facts.find((fact): fact is TechnologyFact => (
    fact.kind === 'technology'
    && (fact.dictionaryStackId === stackId || fact.id === `technology:${stackId}`)
  ));
}

function workersRuntimeInPackage(store: AnalyzerProjectStore, packageId: string): RuntimeFact | undefined {
  return store.facts.find((fact): fact is RuntimeFact => (
    fact.kind === 'runtime'
    && fact.runtimeType === 'cloudflare-workers'
    && fact.packageId === packageId
  )) ?? store.facts.find((fact): fact is RuntimeFact => fact.kind === 'runtime' && fact.runtimeType === 'cloudflare-workers');
}

function d1ResourceForCommand(
  store: AnalyzerProjectStore,
  packageId: string,
  positionalArgs: readonly string[],
): ResourceFact | undefined {
  const d1Resources = store.facts.filter((fact): fact is ResourceFact => (
    fact.kind === 'resource'
    && fact.dictionaryStackId === 'cloudflare-d1'
  ));
  const inPackage = d1Resources.filter((fact) => fact.packageId === packageId);
  const candidates = inPackage.length > 0 ? inPackage : d1Resources;
  const named = positionalArgs
    .slice(1)
    .map((value) => value.toLowerCase())
    .find((value) => candidates.some((fact) => (
      fact.binding?.toLowerCase() === value
      || (typeof fact.metadata.databaseName === 'string' && fact.metadata.databaseName.toLowerCase() === value)
    )));
  if (named) {
    return candidates.find((fact) => (
      fact.binding?.toLowerCase() === named
      || (typeof fact.metadata.databaseName === 'string' && fact.metadata.databaseName.toLowerCase() === named)
    ));
  }
  return candidates[0];
}

function wranglerTerminal(
  store: AnalyzerProjectStore,
  sourceScript: PackageScriptFact,
  subcommand: string | undefined,
  positionalArgs: readonly string[],
): CommandTerminalTarget | undefined {
  if (subcommand === 'd1') {
    const resource = d1ResourceForCommand(store, sourceScript.packageId, positionalArgs);
    return resource ? { factId: resource.id, kind: 'uses' } : undefined;
  }
  const runtime = workersRuntimeInPackage(store, sourceScript.packageId);
  if (!runtime) return undefined;
  if (subcommand && WRANGLER_RUNTIME_START_SUBCOMMANDS.has(subcommand)) {
    return { factId: runtime.id, kind: 'starts' };
  }
  if (subcommand === 'types') {
    return { factId: runtime.id, kind: 'uses' };
  }
  return undefined;
}

export function commandTerminalTarget(
  fragment: CommandFragment,
  store: AnalyzerProjectStore,
  sourceScript: PackageScriptFact,
): CommandTerminalTarget | undefined {
  const invocation = commandInvocation(fragment);
  if (!invocation) return undefined;

  if (invocation.executable === 'wrangler') {
    return wranglerTerminal(store, sourceScript, invocation.subcommand, invocation.positionalArgs);
  }

  if (invocation.executable === 'firebase') {
    const id=commandStackId(commandArgv(fragment));const target=id?technologyFactForStack(store,id):undefined;
    return target?{factId:target.id,kind:id==='firebase-emulator-suite'?'starts':'uses'}:undefined;
  }

  const stackId = COMMAND_EXECUTABLE_STACK_IDS[invocation.executable]??commandStackId(commandArgv(fragment));
  if (!stackId || !getStack(stackId)) return undefined;
  const technology = technologyFactForStack(store, stackId);
  if (!technology) return undefined;
  const kind: AnalyzerRelationKind = invocation.executable === 'tsc' || invocation.executable === 'drizzle-kit'
    ? 'uses'
    : 'starts';
  return { factId: technology.id, kind };
}

export function commandTerminalTargets(fragment:CommandFragment,store:AnalyzerProjectStore,script:PackageScriptFact):CommandTerminalTarget[]{
  const argv=commandArgv(fragment);const stackId=commandStackId(argv);const targets:CommandTerminalTarget[]=[];
  for(const runtime of store.facts.filter(fact=>fact.kind==='runtime'&&fact.metadata.entryScriptId===script.id))targets.push({factId:runtime.id,kind:'starts'});
  const cwd=fragment.workingDirectory??workingDirectoryArgument(argv);const directory=cwd?localPath(script.packagePath,cwd):script.packagePath;const selected=commandProjectPath(argv,directory??script.packagePath);const selectedProject=selected.explicit?store.facts.find(fact=>fact.kind==='workspace-package'&&(fact.manifestPath===selected.path||fact.packagePath===selected.path))?.id:cwd&&directory?store.facts.filter(fact=>fact.kind==='workspace-package'&&(fact.packagePath===directory||directory.startsWith(fact.packagePath+'/'))).sort((a,b)=>(b.kind==='workspace-package'?b.packagePath.length:0)-(a.kind==='workspace-package'?a.packagePath.length:0))[0]?.id:script.packageId;
  if(stackId==='firebase-emulator-suite'){
    const onlyIndex=argv.indexOf('--only');const only=(onlyIndex>=0?argv[onlyIndex+1]:argv.find(value=>value.startsWith('--only='))?.slice(7))?.split(',');
    const local=store.facts.filter((fact):fact is ResourceFact=>fact.kind==='resource'&&fact.metadata.environment==='local'&&(!fact.packageId||fact.packageId===script.packageId));
    for(const fact of local)if(fact.dictionaryStackId==='firebase-emulator-suite'||only?.includes(String(fact.metadata.emulatorService??fact.metadata.service)))targets.push({factId:fact.id,kind:'starts'});
  }
  const entryArgument=runtimeEntryArgument(argv);const entryPath=entryArgument&&directory?localPath(directory,entryArgument):undefined;
  const runtime=store.facts.find(fact=>fact.kind==='runtime'&&fact.packageId===selectedProject&&fact.metadata.dictionaryStackId===stackId&&entryPath&&(fact.metadata.entryPath===entryPath||fact.metadata.invocationTargetPath===entryPath));
  if(runtime)targets.push({factId:runtime.id,kind:'starts'});
  const configIndex=argv.indexOf('--config');const configArgument=configIndex>=0?argv[configIndex+1]:argv.find(value=>value.startsWith('--config='))?.slice(9);const configPath=configArgument&&directory?localPath(directory,configArgument):undefined;
  const artifacts=store.facts.filter(fact=>fact.kind==='resource'&&fact.metadata.buildOutput&&fact.packageId===selectedProject&&(fact.metadata.buildInvocationScriptId===script.id||fact.dictionaryStackId==='webpack'&&stackId==='webpack'&&commandPurpose(argv)==='build'&&(configArgument?fact.filePath===configPath:directory&&fact.filePath?.startsWith(directory==='.'?'':directory+'/')&&fact.filePath?.slice(directory==='.'?0:directory.length+1).match(/^webpack\.config\.[cm]?[jt]s$/))||runtime?.metadata.entryPath===fact.filePath));for(const artifact of artifacts)targets.push({factId:artifact.id,kind:'uses'});
  if(!targets.length||artifacts.length&&!runtime){const terminal=commandTerminalTarget(fragment,store,script);if(terminal)targets.push(terminal);}
  if(['mvn','mvnw','gradle','gradlew','cargo','composer','dotnet','deno','bun','uv','webpack','esbuild','jest','pytest','cypress','netlify'].includes(argv[0]??'')&&['build','test','deploy','start','install'].includes(commandPurpose(argv))&&selectedProject&&store.facts.some(fact=>fact.id===selectedProject))targets.push({factId:selectedProject,kind:'uses'});
  return targets;
}
