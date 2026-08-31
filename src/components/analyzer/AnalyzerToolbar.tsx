import { NavLink } from 'react-router-dom';
import { analyzerRoutes } from '../../utils/routes';
import { analyzerViewLabels, type AnalyzerViewCounts, type AnalyzerViewId, type PackageScriptFact } from '../../analyzer';

export type AnalyzerFilter = 'all' | 'application' | 'workspace-package' | 'workspace-config' | 'workspace-pattern' | 'package-script' | 'command' | 'technology' | 'runtime' | 'resource' | 'dotnet-project' | 'external-package';

interface AnalyzerToolbarProps {
  view: AnalyzerViewId;
  search: string;
  onSearchChange: (value: string) => void;
  filter: AnalyzerFilter;
  onFilterChange: (value: AnalyzerFilter) => void;
  externalExpanded: boolean;
  onToggleExternal: () => void;
  scripts: PackageScriptFact[];
  entryScriptId?: string;
  onEntryChange: (value: string) => void;
  counts: AnalyzerViewCounts;
}

const viewPaths: Record<AnalyzerViewId, string> = analyzerRoutes;

function filterOptions(view: AnalyzerViewId): Array<{ value: AnalyzerFilter; label: string }> {
  if (view === 'architecture') return [
    { value: 'all', label: 'すべてのNode' },
    { value: 'application', label: 'Applications' },
    { value: 'workspace-package', label: 'Packages' },
    { value: 'technology', label: 'Technologies' },
    { value: 'runtime', label: 'Runtime / Platform' },
    { value: 'resource', label: 'Resources' },
    { value: 'dotnet-project', label: '.NET Applications' },
  ];
  if (view === 'workspace') return [
    { value: 'all', label: 'すべてのNode' },
    { value: 'workspace-config', label: 'Config' },
    { value: 'workspace-pattern', label: 'Patterns' },
    { value: 'workspace-package', label: 'Packages' },
  ];
  if (view === 'command') return [
    { value: 'all', label: 'すべてのNode' },
    { value: 'package-script', label: 'Scripts' },
    { value: 'command', label: 'Commands / CLI' },
    { value: 'technology', label: 'Technology' },
    { value: 'runtime', label: 'Runtime / Platform' },
  ];
  return [
    { value: 'all', label: 'すべてのNode' },
    { value: 'workspace-package', label: 'Workspace Packages' },
    { value: 'technology', label: 'Recognized Technology' },
    { value: 'external-package', label: 'External Packages' },
  ];
}

export function AnalyzerToolbar({
  view,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  externalExpanded,
  onToggleExternal,
  scripts,
  entryScriptId,
  onEntryChange,
  counts,
}: AnalyzerToolbarProps) {
  const options = filterOptions(view);
  return (
    <div className="analyzer-toolbar">
      <nav className="analyzer-view-tabs" aria-label="Analyzer views">
        {(Object.keys(analyzerViewLabels) as AnalyzerViewId[]).map((viewId) => (
          <NavLink
            key={viewId}
            to={viewPaths[viewId]}
            className={({ isActive }) => `analyzer-view-tab${isActive ? ' is-active' : ''}`}
          >
            {analyzerViewLabels[viewId]}
          </NavLink>
        ))}
      </nav>

      <div className="analyzer-control-row">
        <label className="analyzer-search-control">
          <span>Search</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Node / package / path"
            aria-label="Analyzer Nodeを検索"
          />
        </label>
        <label className="analyzer-filter-control">
          <span>Filter</span>
          <select value={filter} onChange={(event) => onFilterChange(event.target.value as AnalyzerFilter)} aria-label="Analyzer Nodeを絞り込む">
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {view === 'command' && (
          <label className="analyzer-filter-control analyzer-entry-control">
            <span>Entry</span>
            <select value={entryScriptId ?? ''} onChange={(event) => onEntryChange(event.target.value)} aria-label="Command Flowのentry script">
              {scripts.length === 0 && <option value="">scriptなし</option>}
              {scripts.map((script) => <option key={script.id} value={script.id}>{script.packageName} · {script.scriptName}</option>)}
            </select>
          </label>
        )}
        {view === 'dependencies' && (
          <button type="button" className={`analyzer-quiet-button${externalExpanded ? ' is-active' : ''}`} onClick={onToggleExternal} aria-expanded={externalExpanded}>
            {externalExpanded ? 'Externalを折りたたむ' : 'Externalを展開'}
          </button>
        )}
        <span className="analyzer-node-count" aria-label={`${counts.visibleNodes} visible nodes, ${counts.totalNodes} total nodes`}>
          {counts.visibleNodes} visible · {counts.totalNodes} total
        </span>
      </div>
    </div>
  );
}
