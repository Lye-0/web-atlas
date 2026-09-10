import type { SemanticEvidence } from '../../analyzer/semantic/types';

export function architectureEvidencePaths(evidence: readonly SemanticEvidence[]) {
  const byName = new Map<string, Set<string>>();
  for (const item of evidence) { const name = item.path.replaceAll('\\', '/').split('/').at(-1) ?? ''; const paths = byName.get(name) ?? new Set(); paths.add(item.path); byName.set(name, paths); }
  const result = new Map<string, { filename: string; parent: string }>();
  for (const [filename, paths] of byName) {
    const parents = new Map([...paths].map(path => [path, path.replaceAll('\\', '/').split('/').slice(0, -1)]));
    const suffixes = new Map<string, number>();
    for (const parts of parents.values()) for (let depth = 1; depth <= parts.length; depth++) { const suffix = parts.slice(-depth).join('/'); suffixes.set(suffix, (suffixes.get(suffix) ?? 0) + 1); }
    for (const [path, parts] of parents) {
      let depth = Math.min(2, parts.length);
      while (depth < parts.length && (suffixes.get(parts.slice(-depth).join('/')) ?? 0) > 1) depth++;
      const selected = parts.slice(-depth), parent = selected.join('/');
      result.set(path, { filename: filename || 'ファイル名未記録', parent: !path ? '所属パス未記録' : !parts.length ? 'プロジェクト直下' : `${depth < parts.length ? '…/' : ''}${parent}` });
    }
  }
  return result;
}
