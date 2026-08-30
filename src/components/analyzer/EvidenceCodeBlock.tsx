import type { AnalyzerEvidence, SourceRange } from '../../analyzer';

interface EvidenceCodeBlockProps {
  evidence: AnalyzerEvidence;
  source?: string;
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

export function EvidenceCodeBlock({ evidence, source }: EvidenceCodeBlockProps) {
  if (!source) return <p className="analyzer-empty-evidence">Source context is unavailable.</p>;
  const lines = source.split(/\r?\n/);
  const firstLine = Math.max(1, evidence.contextStartLine);
  const lastLine = Math.min(lines.length, evidence.contextEndLine);
  return (
    <div className="analyzer-evidence-block">
      <div className="analyzer-evidence-file">
        <code>{evidence.filePath}</code>
        <span>{evidence.description ?? evidence.detectorId}</span>
      </div>
      <pre aria-label={`Evidence in ${evidence.filePath}`}><code>
        {lines.slice(firstLine - 1, lastLine).map((line, index) => {
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
        })}
      </code></pre>
    </div>
  );
}

interface EvidencePreviewProps {
  evidenceIds: string[];
  evidence: AnalyzerEvidence[];
  sources: Record<string, string>;
}

export function EvidencePreview({ evidenceIds, evidence, sources }: EvidencePreviewProps) {
  const selectedEvidence = evidenceIds
    .map((id) => evidence.find((candidate) => candidate.id === id))
    .find((candidate): candidate is AnalyzerEvidence => Boolean(candidate));
  if (!selectedEvidence) return <p className="analyzer-empty-evidence">直接Evidenceはありません。</p>;
  return <EvidenceCodeBlock evidence={selectedEvidence} source={sources[selectedEvidence.filePath]} />;
}
