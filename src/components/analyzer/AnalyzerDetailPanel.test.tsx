import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AnalyzerDetailPanel } from './AnalyzerDetailPanel';
import type { AnalyzerFact, AnalyzerProjectStore, AnalyzerViewModel, AnalyzerViewNode, CommandFact, ProjectFact, TechnologyFact } from '../../analyzer';

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
});
