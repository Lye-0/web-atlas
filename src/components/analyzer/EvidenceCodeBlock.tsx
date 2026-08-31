import type { AnalyzerEvidence, SourceRange } from '../../analyzer';

interface EvidenceCodeBlockProps {
  evidence: AnalyzerEvidence;
  source?: string;
  compact?: boolean;
}

interface CodeSegment {
  text: string;
  highlighted: boolean;
}

function rangesForLine(evidence: AnalyzerEvidence, lineNumber: number, lineLength: number): Array<{ start: number; end: number }> {
  return evidence.highlightRanges
    .filter((range) => range.start.line <= lineNumber && range.end.line >= lineNumber)
    .map((range: SourceRange) => ({
      start: Math.max(0, range.start.line === lineNumber ? range.start.column - 1 : 0),
      end: Math.min(lineLength, range.end.line === lineNumber ? range.end.column - 1 : lineLength),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
}

function splitLine(line: string, ranges: Array<{ start: number; end: number }>): CodeSegment[] {
  if (ranges.length === 0) return [{ text: line || ' ', highlighted: false }];
  const segments: CodeSegment[] = [];
  let cursor = 0;
  ranges.forEach((range) => {
    const start = Math.max(cursor, range.start);
    if (start > cursor) segments.push({ text: line.slice(cursor, start), highlighted: false });
    const end = Math.max(start, range.end);
    if (end > start) segments.push({ text: line.slice(start, end), highlighted: true });
    cursor = Math.max(cursor, end);
  });
  if (cursor < line.length) segments.push({ text: line.slice(cursor), highlighted: false });
  return segments.length > 0 ? segments : [{ text: line || ' ', highlighted: false }];
}

function lineWindow(evidence: AnalyzerEvidence, lineCount: number, compact: boolean): { first: number; last: number } {
  let first = Math.max(1, Math.min(lineCount, evidence.contextStartLine));
  let last = Math.max(first, Math.min(lineCount, evidence.contextEndLine));
  if (!compact) return { first, last };

  const evidenceStart = evidence.highlightRanges[0]?.start.line ?? first;
  const evidenceEnd = evidence.highlightRanges.reduce((line, range) => Math.max(line, range.end.line), evidenceStart);
  first = Math.min(first, Math.max(1, evidenceStart - 1));
  last = Math.max(last, Math.min(lineCount, evidenceEnd + 1));
  if (last - first + 1 > 5) {
    first = Math.max(1, Math.min(evidenceStart, lineCount - 4));
    last = Math.min(lineCount, first + 4);
  }
  while (last - first + 1 < 3 && (first > 1 || last < lineCount)) {
    if (first > 1) first -= 1;
    else if (last < lineCount) last += 1;
  }
  return { first, last };
}

export function EvidenceCodeBlock({ evidence, source, compact = false }: EvidenceCodeBlockProps) {
  if (!source) return <p className="analyzer-empty-evidence">Source context is unavailable.</p>;
  const lines = source.split(/\r?\n/);
  const { first: firstLine, last: lastLine } = lineWindow(evidence, lines.length, compact);
  return (
    <div className={`analyzer-evidence-block${compact ? ' analyzer-evidence-block-compact' : ''}`}>
      <div className="analyzer-evidence-file">
        <code>{evidence.filePath}</code>
        <span>{evidence.description ?? evidence.detectorId}</span>
      </div>
      <pre aria-label={`Evidence in ${evidence.filePath}`}><code>{lines.slice(firstLine - 1, lastLine).map((line, index) => {
          const lineNumber = firstLine + index;
          const segments = splitLine(line, rangesForLine(evidence, lineNumber, line.length));
          return (
            <span className="analyzer-code-line" key={`${lineNumber}-${line}`}>
              <span className="analyzer-code-line-number">{String(lineNumber).padStart(3, ' ')}</span>
              <span className="analyzer-code-line-text">
                {segments.map((segment, segmentIndex) => segment.highlighted
                  ? <mark key={`${segmentIndex}-${segment.text}`}>{segment.text}</mark>
                  : <span key={`${segmentIndex}-${segment.text}`}>{segment.text}</span>)}
              </span>
              {'\n'}
            </span>
          );
        })}</code></pre>
    </div>
  );
}

interface EvidencePreviewProps {
  evidenceIds: string[];
  evidence: AnalyzerEvidence[];
  sources: Record<string, string>;
  compact?: boolean;
}

export function EvidencePreview({ evidenceIds, evidence, sources, compact = false }: EvidencePreviewProps) {
  const selectedEvidence = evidenceIds
    .map((id) => evidence.find((candidate) => candidate.id === id))
    .find((candidate): candidate is AnalyzerEvidence => Boolean(candidate));
  if (!selectedEvidence) return <p className="analyzer-empty-evidence">直接Evidenceはありません。</p>;
  return <EvidenceCodeBlock evidence={selectedEvidence} source={sources[selectedEvidence.filePath]} compact={compact} />;
}
