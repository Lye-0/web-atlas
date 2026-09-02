import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AnalyzerDetailPanel } from './AnalyzerDetailPanel';
import type { AnalyzerEvidence, AnalyzerFact, AnalyzerProjectStore, AnalyzerSemanticRegion, AnalyzerViewModel, AnalyzerViewNode, CommandFact, ProjectFact, TechnologyFact } from '../../analyzer';

const storeBase: Omit<AnalyzerProjectStore, 'facts'> = {
  files: [],
  relations: [],
  evidence: [],
  sources: {},
  warnings: [],
  scannedAt: 'test',
};

function renderFactDetail(fact: AnalyzerFact, type: AnalyzerViewNode['type']): string {
  const node: AnalyzerViewNode = {
    id: fact.id,
    factId: fact.id,
    type,
    label: fact.label,
    evidenceIds: [],
    metadata: {},
  };
  const view: AnalyzerViewModel = {
    view: 'architecture',
    nodes: [node],
    edges: [],
    clusters: [],
    evidence: [],
    warnings: [],
  };
  return renderToStaticMarkup(
    <MemoryRouter>
      <AnalyzerDetailPanel
        store={{ ...storeBase, facts: [fact] }}
        view={view}
        selectedNodeId={node.id}
        expandedPresentationIds={new Set()}
        onSelectNode={() => undefined}
        onTogglePresentation={() => undefined}
        onClose={() => undefined}
      />
    </MemoryRouter>,
  );
}

function technologyFact(overrides: Partial<TechnologyFact> = {}): TechnologyFact {
  return {
    id: 'technology:test',
    kind: 'technology',
    label: 'Test technology',
    evidenceIds: [],
    metadata: {},
    packageNames: ['test-package'],
    explicit: false,
    ...overrides,
  };
}

function renderStackUsageDetail(): string {
  const fact = technologyFact({ id: 'technology:react', label: 'React', dictionaryStackId: 'react', packageNames: ['react'] });
  const evidence: AnalyzerEvidence = {
    id: 'evidence:web-react',
    filePath: 'apps/web/package.json',
    contextStartLine: 1,
    contextEndLine: 3,
    highlightRanges: [],
    kind: 'dependency',
    detectorId: 'package-dependency',
  };
  const node: AnalyzerViewNode = {
    id: 'stack-usage:package:apps/web:react',
    factId: fact.id,
    type: 'stack-usage',
    label: 'React',
    evidenceIds: [evidence.id],
    metadata: {
      displayRole: 'STACK',
      stackUsage: true,
      dictionaryStackId: 'react',
      categoryLabel: 'UIライブラリ',
      scopeLabel: 'WEB',
      scopePath: 'apps/web',
      roles: ['package dependency'],
    },
  };
  const view: AnalyzerViewModel = { view: 'architecture', nodes: [node], edges: [], clusters: [], evidence: [evidence], warnings: [] };
  return renderToStaticMarkup(
    <MemoryRouter>
      <AnalyzerDetailPanel
        store={{ ...storeBase, facts: [fact], evidence: [evidence], sources: { 'apps/web/package.json': '{"dependencies":{"react":"^19.0.0"}}' } }}
        view={view}
        selectedNodeId={node.id}
        expandedPresentationIds={new Set()}
        onSelectNode={() => undefined}
        onTogglePresentation={() => undefined}
        onClose={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe('Analyzer Dictionary title link', () => {
  it('links a recognized Stack through its stable dictionaryStackId', () => {
    const markup = renderFactDetail(technologyFact({ label: 'React', dictionaryStackId: 'react', packageNames: ['react'] }), 'technology');
    expect(markup).toContain('href="/dictionary/stacks/react"');
    expect(markup).toContain('>React</a>');
    expect(markup).not.toContain('Dictionaryで見る');
  });

  it('uses the stable ID instead of deriving a route from the displayed label', () => {
    const markup = renderFactDetail(technologyFact({ label: 'Vite.js', dictionaryStackId: 'vite', packageNames: ['vite'] }), 'technology');
    expect(markup).toContain('href="/dictionary/stacks/vite"');
    expect(markup).toContain('>Vite.js</a>');
  });

  it('keeps unmatched technology, Project, and Command titles as plain text', () => {
    const unmatched = renderFactDetail(technologyFact({ label: 'Firebase', packageNames: ['firebase'] }), 'technology');
    const labelOnly = renderFactDetail(technologyFact({ label: 'React', packageNames: [] }), 'technology');
    const project: ProjectFact = {
      id: 'project:root',
      kind: 'project',
      label: 'vehicle-management',
      relativePath: '.',
      evidenceIds: [],
      metadata: {},
    };
    const command: CommandFact = {
      id: 'command:dev',
      kind: 'command',
      label: 'pnpm dev',
      commandType: 'pnpm-script',
      command: 'pnpm dev',
      evidenceIds: [],
      metadata: {},
    };

    expect(unmatched).not.toContain('<a ');
    expect(labelOnly).not.toContain('<a ');
    expect(renderFactDetail(project, 'project')).not.toContain('<a ');
    expect(renderFactDetail(command, 'command')).not.toContain('<a ');
  });

  it('shows Stack Usage scope, category, and evidence file details', () => {
    const markup = renderStackUsageDetail();
    expect(markup).toContain('<h3>Stack Usage</h3>');
    expect(markup).toContain('Used in');
    expect(markup).toContain('WEB · apps/web');
    expect(markup).toContain('UIライブラリ');
    expect(markup).toContain('apps/web/package.json');
    expect(markup).toContain('href="/dictionary/stacks/react"');
  });

  it('shows and links the promoted parent Scope for a nested Region', () => {
    const parent: AnalyzerSemanticRegion = {
      id: 'region:scope:apps/api',
      entityKind: 'region',
      regionKind: 'scope',
      label: 'API',
      subtitle: 'apps/api',
      childIds: [],
      childRegionIds: ['region:scope:apps/api/test'],
      ports: [],
      selectable: true,
      evidenceIds: [],
      metadata: {},
    };
    const child: AnalyzerSemanticRegion = {
      id: 'region:scope:apps/api/test',
      entityKind: 'region',
      regionKind: 'scope',
      label: 'TEST',
      subtitle: 'apps/api/test',
      childIds: [],
      parentRegionId: parent.id,
      ports: [],
      selectable: true,
      evidenceIds: [],
      metadata: {},
    };
    const view: AnalyzerViewModel = { view: 'architecture', nodes: [], edges: [], clusters: [], regions: [parent, child], evidence: [], warnings: [] };
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <AnalyzerDetailPanel
          store={{ ...storeBase, facts: [] }}
          view={view}
          selectedRegionId={child.id}
          expandedPresentationIds={new Set()}
          onSelectNode={() => undefined}
          onSelectRegion={() => undefined}
          onTogglePresentation={() => undefined}
          onClose={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('Parent Scope');
    expect(markup).toContain('API · apps/api');
  });
});
