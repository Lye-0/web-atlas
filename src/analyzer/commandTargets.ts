import { getStack } from '../data';
import { commandInvocation, type CommandFragment } from './commandParser';
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
    const firebase = technologyFactForStack(store, 'firebase');
    return firebase ? { factId: firebase.id, kind: 'starts' } : undefined;
  }

  const stackId = COMMAND_EXECUTABLE_STACK_IDS[invocation.executable];
  if (!stackId || !getStack(stackId)) return undefined;
  const technology = technologyFactForStack(store, stackId);
  if (!technology) return undefined;
  const kind: AnalyzerRelationKind = invocation.executable === 'tsc' || invocation.executable === 'drizzle-kit'
    ? 'uses'
    : 'starts';
  return { factId: technology.id, kind };
}
