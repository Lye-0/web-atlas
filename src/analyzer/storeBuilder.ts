import{maskSensitiveSource}from'./evidence';
import type{AnalyzerFact,AnalyzerRelation,AnalyzerEvidence,AnalyzerWarning,AnalyzerSourceFile,AnalyzerProjectStore}from'./types';
export const ANALYZER_MAX_CONFIG_SIZE = 1024 * 1024;

export class AnalyzerStoreBuilder {
  private readonly factMap = new Map<string, AnalyzerFact>();
  private readonly relationMap = new Map<string, AnalyzerRelation>();
  private readonly evidenceMap = new Map<string, AnalyzerEvidence>();
  private readonly sourceMap: Record<string, string> = {};
  private readonly warningMap = new Map<string, AnalyzerWarning>();

  addSource(filePath: string, source: string): void {
    this.sourceMap[filePath] = maskSensitiveSource(source);
  }

  addEvidence(evidence: AnalyzerEvidence): string {
    this.evidenceMap.set(evidence.id, evidence);
    return evidence.id;
  }

  addFact(fact: AnalyzerFact): string {
    const existing = this.factMap.get(fact.id);
    if (!existing) {
      this.factMap.set(fact.id, { ...fact, evidenceIds: [...new Set(fact.evidenceIds)] });
      return fact.id;
    }

    const mergedEvidenceIds = [...new Set([...existing.evidenceIds, ...fact.evidenceIds])];
    const mergedMetadata = { ...existing.metadata, ...fact.metadata };
    if (existing.kind === 'technology' && fact.kind === 'technology') {
      this.factMap.set(fact.id, {
        ...existing,
        ...fact,
        evidenceIds: mergedEvidenceIds,
        metadata: mergedMetadata,
        packageNames: [...new Set([...existing.packageNames, ...fact.packageNames])],
        explicit: existing.explicit || fact.explicit,
      });
    } else if (existing.kind === 'external-package' && fact.kind === 'external-package') {
      this.factMap.set(fact.id, {
        ...existing,
        ...fact,
        evidenceIds: mergedEvidenceIds,
        metadata: mergedMetadata,
        versionRanges: [...new Set([...existing.versionRanges, ...fact.versionRanges])],
        dependencyTypes: [...new Set([...existing.dependencyTypes, ...fact.dependencyTypes])],
      });
    } else if (existing.kind === 'workspace-package' && fact.kind === 'workspace-package') {
      this.factMap.set(fact.id, {
        ...existing,
        ...fact,
        evidenceIds: mergedEvidenceIds,
        metadata: mergedMetadata,
        scripts: { ...existing.scripts, ...fact.scripts },
        dependencies: [...existing.dependencies, ...fact.dependencies],
      });
    } else {
      this.factMap.set(fact.id, { ...existing, evidenceIds: mergedEvidenceIds, metadata: mergedMetadata });
    }
    return fact.id;
  }

  addRelation(relation: AnalyzerRelation): string {
    const existing = this.relationMap.get(relation.id);
    if (!existing) {
      this.relationMap.set(relation.id, { ...relation, evidenceIds: [...new Set(relation.evidenceIds)] });
      return relation.id;
    }
    this.relationMap.set(relation.id, {
      ...existing,
      evidenceIds: [...new Set([...existing.evidenceIds, ...relation.evidenceIds])],
      metadata: { ...existing.metadata, ...relation.metadata },
    });
    return relation.id;
  }

  addWarning(warning: AnalyzerWarning): string {
    this.warningMap.set(warning.id, warning);
    return warning.id;
  }

  getSource(filePath: string): string | undefined {
    return this.sourceMap[filePath];
  }

  getFact(id: string): AnalyzerFact | undefined {
    return this.factMap.get(id);
  }

  forEachFact(callback: (fact: AnalyzerFact) => void): void {
    this.factMap.forEach(callback);
  }

  build(files: AnalyzerSourceFile[]): AnalyzerProjectStore {
    return {
      files,
      facts: [...this.factMap.values()],
      relations: [...this.relationMap.values()],
      evidence: [...this.evidenceMap.values()],
      sources: { ...this.sourceMap },
      warnings: [...this.warningMap.values()],
      scannedAt: new Date().toISOString(),
    };
  }
}

