export type ShellOperator = '&&' | '||' | ';';

export type CommandFragmentKind = 'pnpm-script' | 'pnpm-exec' | 'cli' | 'concurrently' | 'unknown';

export interface CommandFragment {
  text: string;
  start: number;
  end: number;
  operator?: ShellOperator;
  kind: CommandFragmentKind;
  packageSelector?: string;
  scriptName?: string;
  toolName?: string;
  children: CommandFragment[];
}

interface Token {
  value: string;
  start: number;
  end: number;
}

interface Segment {
  start: number;
  end: number;
  operator?: ShellOperator;
}

function trimRange(source: string, start: number, end: number): { start: number; end: number } {
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < trimmedEnd && /\s/.test(source[trimmedStart])) trimmedStart += 1;
  while (trimmedEnd > trimmedStart && /\s/.test(source[trimmedEnd - 1])) trimmedEnd -= 1;
  return { start: trimmedStart, end: trimmedEnd };
}

function splitShellOperators(command: string): Segment[] {
  const segments: Segment[] = [];
  let segmentStart = 0;
  let segmentOperator: ShellOperator | undefined;
  let quote: string | undefined;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    const twoCharacterOperator = command.slice(index, index + 2);
    const operator: ShellOperator | undefined = twoCharacterOperator === '&&' || twoCharacterOperator === '||'
      ? twoCharacterOperator
      : character === ';' ? ';' : undefined;
    if (!operator) continue;
    segments.push({ start: segmentStart, end: index, ...(segmentOperator ? { operator: segmentOperator } : {}) });
    const operatorLength = operator === ';' ? 1 : 2;
    segmentStart = index + operatorLength;
    segmentOperator = operator;
    index += operatorLength - 1;
  }
  segments.push({ start: segmentStart, end: command.length, ...(segmentOperator ? { operator: segmentOperator } : {}) });
  return segments;
}

function tokenize(source: string, start: number, end: number): Token[] {
  const tokens: Token[] = [];
  let tokenStart = -1;
  let value = '';
  let quote: string | undefined;
  let escaped = false;
  const pushToken = (tokenEnd: number) => {
    if (tokenStart >= 0 && value) tokens.push({ value, start: tokenStart, end: tokenEnd });
    tokenStart = -1;
    value = '';
  };

  for (let index = start; index < end; index += 1) {
    const character = source[index];
    if (escaped) {
      value += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      if (tokenStart < 0) tokenStart = index;
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else value += character;
      continue;
    }
    if (character === '"' || character === "'") {
      if (tokenStart < 0) tokenStart = index;
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      pushToken(index);
      continue;
    }
    if (tokenStart < 0) tokenStart = index;
    value += character;
  }
  pushToken(end);
  return tokens;
}

function extractQuotedFragments(source: string, start: number, end: number): CommandFragment[] {
  const fragments: CommandFragment[] = [];
  let quote: string | undefined;
  let contentStart = -1;
  let escaped = false;
  for (let index = start; index < end; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (!quote && (character === '"' || character === "'")) {
      quote = character;
      contentStart = index + 1;
    } else if (quote && character === quote) {
      if (contentStart >= 0 && contentStart < index) fragments.push(classifyRange(source, contentStart, index));
      quote = undefined;
      contentStart = -1;
    }
  }
  return fragments;
}

function classifyRange(source: string, start: number, end: number, operator?: ShellOperator): CommandFragment {
  const range = trimRange(source, start, end);
  const text = source.slice(range.start, range.end);
  const tokens = tokenize(source, range.start, range.end);
  const first = tokens[0]?.value.toLowerCase();
  const children: CommandFragment[] = [];
  if (!first) return { text, start: range.start, end: range.end, kind: 'unknown', children, ...(operator ? { operator } : {}) };

  if (first === 'concurrently') {
    children.push(...extractQuotedFragments(source, range.start, range.end));
    return { text, start: range.start, end: range.end, kind: 'concurrently', children, ...(operator ? { operator } : {}) };
  }

  if (first === 'pnpm') {
    const execIndex = tokens.findIndex((token) => token.value === 'exec');
    if (execIndex >= 0 && tokens[execIndex + 1]) {
      return {
        text,
        start: range.start,
        end: range.end,
        kind: 'pnpm-exec',
        toolName: tokens[execIndex + 1].value,
        children,
        ...(operator ? { operator } : {}),
      };
    }

    let packageSelector: string | undefined;
    let scriptIndex = 1;
    const filterIndex = tokens.findIndex((token) => token.value === '--filter' || token.value.startsWith('--filter='));
    if (filterIndex >= 0) {
      packageSelector = tokens[filterIndex].value.startsWith('--filter=')
        ? tokens[filterIndex].value.slice('--filter='.length)
        : tokens[filterIndex + 1]?.value;
      scriptIndex = filterIndex + (tokens[filterIndex].value.startsWith('--filter=') ? 1 : 2);
    }
    if (tokens[scriptIndex]?.value === 'run') scriptIndex += 1;
    const scriptName = tokens[scriptIndex]?.value;
    if (scriptName) {
      return {
        text,
        start: range.start,
        end: range.end,
        kind: 'pnpm-script',
        ...(packageSelector ? { packageSelector } : {}),
        scriptName,
        children,
        ...(operator ? { operator } : {}),
      };
    }
  }

  const knownCliNames = new Set([
    'vite',
    'vitest',
    'wrangler',
    'firebase',
    'node',
    'npm',
    'npx',
    'yarn',
    'tsc',
    'eslint',
    'prettier',
    'biome',
    'dotnet',
    'drizzle-kit',
  ]);
  if (first === 'npx') {
    const toolToken = tokens.find((token, index) => index > 0 && !token.value.startsWith('-'));
    if (toolToken) {
      return { text, start: range.start, end: range.end, kind: 'cli', toolName: toolToken.value, children, ...(operator ? { operator } : {}) };
    }
  }
  if (knownCliNames.has(first)) {
    return { text, start: range.start, end: range.end, kind: 'cli', toolName: tokens[0].value, children, ...(operator ? { operator } : {}) };
  }
  return { text, start: range.start, end: range.end, kind: 'unknown', children, ...(operator ? { operator } : {}) };
}

export function parseCommandExpression(command: string): CommandFragment[] {
  return splitShellOperators(command)
    .map((segment) => classifyRange(command, segment.start, segment.end, segment.operator))
    .filter((fragment) => fragment.text.length > 0);
}

function isFlagToken(value: string): boolean {
  return value.startsWith('-');
}

/** Resolves the CLI executable already classified on a fragment, plus the first non-flag subcommand. */
export function commandInvocation(fragment: CommandFragment): { executable: string; subcommand?: string; positionalArgs: string[] } | undefined {
  if (fragment.kind !== 'cli' && fragment.kind !== 'pnpm-exec') return undefined;
  const executable = fragment.toolName?.toLowerCase();
  if (!executable) return undefined;
  const tokens = tokenize(fragment.text, 0, fragment.text.length);
  const executableIndex = tokens.findIndex((token) => token.value.toLowerCase() === executable);
  const afterExecutable = (executableIndex >= 0 ? tokens.slice(executableIndex + 1) : tokens.slice(1))
    .map((token) => token.value)
    .filter((value) => !isFlagToken(value));
  const subcommand = afterExecutable[0]?.toLowerCase();
  return {
    executable,
    ...(subcommand ? { subcommand } : {}),
    positionalArgs: afterExecutable,
  };
}
