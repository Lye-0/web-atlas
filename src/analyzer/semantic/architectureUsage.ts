import type { SemanticEdge, SemanticEvidence, SemanticNode } from './types';
import type { ArchitectureTechnology } from './architectureMetadata';
import type { ArchitectureSyntax } from './architectureSyntax';
import { uniqueArchitectureEvidence } from './architectureEvidence';

interface Package { path: string; dir: string; config: Record<string, unknown>; node: SemanticNode }
const sectionNames = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;
const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const modulePackage = (name: string) => name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]!;
const supportPath = (path: string) => /(?:^|\/)(?:tests?|__tests__|scripts|build-tools)(?:\/)|\.(?:test|spec)\.|(?:^|\/)(?:vite|vitest|webpack|rollup|eslint|esbuild|drizzle)\.config\./.test(path);

export function populateArchitectureUsage(nodes: Map<string, SemanticNode>, edges: SemanticEdge[], packages: Package[], syntax: ReadonlyMap<string, ArchitectureSyntax>, evidence: (path: string, needle: string, reason: string) => SemanticEvidence[]) {
  const rootOf = (id: string) => {
    const visited = new Set<string>(); let node = nodes.get(id);
    while (node?.architecture?.parentId && !visited.has(node.id)) { visited.add(node.id); node = nodes.get(node.architecture.parentId); }
    return node;
  };
  // Record package existence, declared consumers and source consumers separately.
  for (const node of nodes.values()) if (node.architecture?.kind === 'code-package') {
    const declared: SemanticEvidence[] = [], source: SemanticEvidence[] = [], consumers = new Set<string>();
    for (const edge of edges) {
      if (rootOf(edge.target)?.id !== node.id || rootOf(edge.source)?.id === node.id) continue;
      if (edge.kind === 'declaration-dependency') declared.push(...edge.evidence);
      else if (edge.kind === 'code-reference') source.push(...edge.evidence);
      else continue;
      consumers.add(rootOf(edge.source)?.id ?? edge.source);
    }
    const pkg = packages.find(pkg => pkg.node.id === node.id);
    const libraryContract = Boolean(pkg?.config.exports || pkg?.config.types || pkg?.config.typings || node.evidence.some(e => /\.csproj$/i.test(e.path)));
    const shared = source.length > 0 || declared.length > 0 && libraryContract;
    const reason = source.length ? '別の構成要素から、このコードへのソース参照を確認'
      : declared.length && libraryContract ? 'ライブラリの公開契約と、別の構成要素からの依存宣言を確認'
        : declared.length ? '依存としての利用宣言あり。共有ライブラリの役割・実際の利用は未確認'
          : 'コードの存在を確認。用途・利用元は未確認';
    node.architecture.codeUsage = { status: source.length ? 'source' : declared.length ? 'declared' : 'unconfirmed', consumerIds: [...consumers], reason,
      declarationEvidence: uniqueArchitectureEvidence(declared), sourceEvidence: uniqueArchitectureEvidence(source) };
    if (shared) { node.architecture.kind = 'shared-code'; node.attributes.architectureKind = 'shared-code'; }
  }
  for (const node of nodes.values()) {
    const arch = node.architecture!;
    const pkg = packages.filter(pkg => arch.ownerPath === pkg.dir || arch.ownerPath?.startsWith(`${pkg.dir}/`) || pkg.dir === '').sort((a, b) => b.dir.length - a.dir.length)[0];
    const declared = new Map<string, ArchitectureTechnology['declarations']>();
    if (pkg) for (const section of sectionNames) for (const name of Object.keys(object(pkg.config[section]))) {
      const entries = declared.get(name) ?? []; entries.push({ section, path: pkg.path, evidence: evidence(pkg.path, JSON.stringify(name), `${section}の技術宣言。実行主体での使用を保証しない`) }); declared.set(name, entries);
    }
    const uses = new Map<string, { source: SemanticEvidence[]; support: SemanticEvidence[] }>();
    for (const path of arch.files) for (const ref of syntax.get(path)?.importReferences ?? []) {
      if (ref.name.startsWith('.') || ref.name.startsWith('/') || ref.name.startsWith('node:')) continue;
      const name = modulePackage(ref.name), usage = uses.get(name) ?? { source: [], support: [] };
      (ref.typeOnly || supportPath(path) || arch.auxiliary ? usage.support : usage.source).push(ref.evidence); uses.set(name, usage);
    }
    const names = new Set([...arch.technologyNames, ...uses.keys()]);
    arch.technologies = [...names].map(name => {
      const usage = uses.get(name), declarations = declared.get(name) ?? [];
      if (usage?.source.length) return { name, usage: 'source', reason: 'この構成要素のソースでモジュール参照を確認。実行状況は未観測', declarations, evidence: uniqueArchitectureEvidence([...usage.source, ...usage.support]) };
      if (usage?.support.length) return { name, usage: 'support', reason: '型参照、テストまたはビルド設定で参照を確認', declarations, evidence: uniqueArchitectureEvidence(usage.support) };
      if (declarations.length) return { name, usage: 'declared', reason: '所属パッケージに宣言あり。この実行主体での使用・用途は未確認', declarations, evidence: [] };
      return { name, usage: 'configuration', reason: '構成の宣言・設定から確認した技術', declarations: [], evidence: node.evidence.filter(item => /\.jsonc?$|\.toml$|\.csproj$/i.test(item.path)) };
    });
    arch.technologyNames = [...names];
  }
}
