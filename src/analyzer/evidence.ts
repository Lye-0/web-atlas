import type { AnalyzerEvidence, AnalyzerEvidenceKind, SourcePosition } from './types';

export interface OffsetRange {
  start: number;
  end: number;
}

function clampOffset(offset: number, sourceLength: number): number {
  return Math.max(0, Math.min(offset, sourceLength));
}

export function lineStartOffsets(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

export function positionAt(source: string, offset: number, starts = lineStartOffsets(source)): SourcePosition {
  const safeOffset = clampOffset(offset, source.length);
  let low = 0;
  let high = starts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= safeOffset) low = middle + 1;
    else high = middle - 1;
  }

  const lineIndex = Math.max(0, high);
  return { line: lineIndex + 1, column: safeOffset - starts[lineIndex] + 1 };
}

export function offsetRangeForText(source: string, value: string, fromOffset = 0): OffsetRange | undefined {
  if (!value) return undefined;
  const start = source.indexOf(value, clampOffset(fromOffset, source.length));
  if (start < 0) return undefined;
  return { start, end: start + value.length };
}

export function makeEvidence(
  filePath: string,
  source: string,
  range: OffsetRange,
  kind: AnalyzerEvidenceKind,
  detectorId: string,
  description?: string,
  contextPadding = 2,
): AnalyzerEvidence {
  const starts = lineStartOffsets(source);
  const startOffset = clampOffset(range.start, source.length);
  const endOffset = clampOffset(Math.max(range.end, startOffset), source.length);
  const startPosition = positionAt(source, startOffset, starts);
  const endPosition = positionAt(source, endOffset, starts);
  const contextStartLine = Math.max(1, startPosition.line - contextPadding);
  const contextEndLine = Math.min(starts.length, Math.max(startPosition.line, endPosition.line) + contextPadding);

  return {
    id: `evidence:${detectorId}:${filePath}:${startOffset}:${endOffset}`,
    filePath,
    contextStartLine,
    contextEndLine,
    highlightRanges: [{ start: startPosition, end: endPosition }],
    kind,
    detectorId,
    ...(description ? { description } : {}),
  };
}

export function makeFileEvidence(
  filePath: string,
  source: string,
  kind: AnalyzerEvidenceKind,
  detectorId: string,
  description?: string,
): AnalyzerEvidence {
  const firstContentOffset = source.search(/\S/);
  const start = firstContentOffset < 0 ? 0 : firstContentOffset;
  return makeEvidence(filePath, source, { start, end: Math.min(source.length, start + 1) }, kind, detectorId, description);
}

function maskCharacters(value: string): string {
  return [...value].map((character) => (character === '\n' || character === '\r' ? character : '•')).join('');
}

function findQuotedEnd(source: string, start: number, quote: string): number {
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === quote) return index + 1;
  }
  return source.length;
}

/** Masks values for secret-like config keys without changing source offsets. */
export function maskSensitiveSource(source: string): string {
  const keyPattern = /(["']?)(B2_[A-Z0-9_]+|(?:API|AUTH|ACCESS|SECRET|PRIVATE|PASSWORD|TOKEN|CREDENTIAL)[A-Z0-9_]*)\1\s*[:=]\s*/gi;
  let masked = source;
  let match = keyPattern.exec(source);

  while (match) {
    const valueStart = match.index + match[0].length;
    if (valueStart >= source.length) break;

    let valueEnd = valueStart;
    if (source[valueStart] === '"' || source[valueStart] === "'") {
      valueEnd = findQuotedEnd(source, valueStart, source[valueStart]);
    } else {
      while (valueEnd < source.length && !',}\r\n'.includes(source[valueEnd])) valueEnd += 1;
      while (valueEnd > valueStart && /\s/.test(source[valueEnd - 1])) valueEnd -= 1;
    }

    if (valueEnd > valueStart) {
      masked = `${masked.slice(0, valueStart)}${maskCharacters(source.slice(valueStart, valueEnd))}${masked.slice(valueEnd)}`;
    }
    match = keyPattern.exec(source);
  }

  return masked;
}

export function sourceLines(source: string): string[] {
  return source.split(/\r?\n/);
}
