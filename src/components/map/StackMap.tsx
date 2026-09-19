import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { dictionaryVisualGroups, getCategory, getStack, stackMap } from '../../data';
import type { DictionaryVisualGroup } from '../../data/dictionaryGroups';
import type { MapNode, StackEntry } from '../../types';
import { categoryPath, stackPath } from '../../utils/routes';

const getNodeKey = (node: MapNode) => {
  if (node.kind === 'group') return node.id;
  if (node.kind === 'category') return node.categoryId;
  return node.stackId;
};

function collectCategoryNodes(node: MapNode, categoryNodeById: Map<string, Extract<MapNode, { kind: 'category' }>>) {
  if (node.kind === 'category') {
    categoryNodeById.set(node.categoryId, node);
  }
  if (node.kind === 'group' || node.kind === 'category') {
    node.children.forEach(child => collectCategoryNodes(child, categoryNodeById));
  }
}

const groupsBySide = (side: DictionaryVisualGroup['side']) => dictionaryVisualGroups
  .filter((group) => group.side === side)
  .sort((a, b) => a.order - b.order);

const groupsByOrder = [...dictionaryVisualGroups].sort((a, b) => a.order - b.order);

interface MapState { idPrefix: string; categoryNodes: Map<string, Extract<MapNode, {kind:'category'}>>; stackLookup: (id: string) => StackEntry | undefined }
function MapNodeView({ node, state }: { node: MapNode; state: MapState }) {
  if (node.kind === 'group') {
    return (
      <li className="map-tree-group-node">
        <div className="map-subgroup-heading">
          <span className="map-group-marker" aria-hidden="true" />
          <span>{node.label}</span>
        </div>
        <ul className="map-tree-list map-tree-list-nested">
          {node.children.map((child) => <MapNodeView key={getNodeKey(child)} node={child} state={state} />)}
        </ul>
      </li>
    );
  }

  if (node.kind === 'category') {
    const category = getCategory(node.categoryId);
    if (!category) return null;

    return (
      <li className="map-tree-item map-tree-category-item">
        <div className="map-category-heading">
          <Link
          to={categoryPath(category.id)}
          className="map-node map-category-node"
          title={category.summary}
          data-map-focus={`category:${category.id}`}
        >
          <span className="map-node-marker" aria-hidden="true" />
          <span className="map-node-copy">
            <span className="map-node-name">{category.name}</span>
          </span>
          </Link>
        </div>
        {node.children.length > 0 && (
          <ul className="map-tree-list map-tree-list-nested">
            {node.children.map((child) => <MapNodeView key={getNodeKey(child)} node={child} state={state} />)}
          </ul>
        )}
      </li>
    );
  }

  const stack = state.stackLookup(node.stackId);
  if (!stack) return null;

  return (
    <li className="map-tree-item map-tree-stack-item">
      <Link to={stackPath(stack.id)} className="map-node map-stack-node" title={stack.summary} data-map-focus={`stack:${stack.id}`}>
        <span className="map-node-marker" aria-hidden="true" />
        <span className="map-node-copy">
          <span className="map-node-name">{stack.name}</span>
        </span>
      </Link>
    </li>
  );
}

function MapVisualGroup({ group, state }: { group: DictionaryVisualGroup; state: MapState }) {
  const nodes = group.rootCategoryIds
    .map((categoryId) => state.categoryNodes.get(categoryId))
    .filter((node): node is Extract<MapNode, { kind: 'category' }> => Boolean(node));
  const headingId = `map-visual-group-${state.idPrefix}-${group.id}`;

  return (
    <section
      className={`map-visual-group map-visual-group-${group.id}`}
      style={{ order: group.order }}
      aria-labelledby={headingId}
    >
      <header className="map-visual-group-heading">
        <h3 id={headingId} tabIndex={-1} data-map-focus={`group:${group.id}`}>{group.label}</h3>
      </header>
      <ul className="map-tree-list">
        {nodes.map((node) => <MapNodeView key={getNodeKey(node)} node={node} state={state} />)}
      </ul>
    </section>
  );
}

function MapVerticalTree({ groups, state }: { groups: DictionaryVisualGroup[]; state: MapState }) {
  return (
    <div className="map-mobile-groups">
      <ul className="map-mobile-group-list">
        {groups.map((group) => (
          <li className="map-mobile-group-item" key={group.id}>
            <MapVisualGroup group={group} state={state} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StackMap({ map = stackMap, stackLookup = getStack }: { map?: MapNode; stackLookup?: (id: string) => StackEntry | undefined } = {}) {
  const categoryNodeById = useMemo(() => { const nodes = new Map<string, Extract<MapNode, {kind:'category'}>>(); collectCategoryNodes(map, nodes); return nodes; }, [map]);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<string | undefined>(undefined);
  const desktop: MapState = { idPrefix: 'desktop', categoryNodes: categoryNodeById, stackLookup };
  const mobile: MapState = { idPrefix: 'mobile', categoryNodes: categoryNodeById, stackLookup };
  useEffect(() => {
    const root = rootRef.current; if (!root || typeof ResizeObserver === 'undefined') return;
    let previousWidth = root.getBoundingClientRect().width;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? previousWidth;
      const switched = (previousWidth > 1100) !== (width > 1100); previousWidth = width;
      if (!switched || !lastFocus.current) return;
      const active = document.activeElement;
      if (active === document.body || active instanceof HTMLElement && root.contains(active) && active.getClientRects().length === 0) {
        const target = [...root.querySelectorAll<HTMLElement>('[data-map-focus]')].find(element => element.dataset.mapFocus === lastFocus.current && element.getClientRects().length > 0);
        target?.focus({ preventScroll: true });
        if (target) { const rect = target.getBoundingClientRect(); if (rect.top < 110 || rect.bottom > window.innerHeight) target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); }
      }
    });
    const clearOutsideFocus = (event: Event) => { if (event.target instanceof Node && !root.contains(event.target) && event.target !== document.body) lastFocus.current = undefined; };
    const clearOutsidePointer = (event: Event) => { if (event.target instanceof Node && !root.contains(event.target)) lastFocus.current = undefined; };
    document.addEventListener('focusin', clearOutsideFocus);
    document.addEventListener('pointerdown', clearOutsidePointer);
    observer.observe(root); return () => { observer.disconnect(); document.removeEventListener('focusin', clearOutsideFocus); document.removeEventListener('pointerdown', clearOutsidePointer); };
  }, []);
  const leftGroups = groupsBySide('left');
  const rightGroups = groupsBySide('right');

  return (
    <div className="map-container">
    <div ref={rootRef} className="stack-map" role="region" aria-label="Web開発技術の分類マップ"
      onFocusCapture={event => { lastFocus.current = (event.target as HTMLElement).dataset.mapFocus; }}>
      <div className="map-root-node">
        <strong>Web開発</strong>
      </div>

      <div className="map-visual-groups">
        <div className="map-visual-lane map-visual-lane-left">
          {leftGroups.map((group) => <MapVisualGroup key={group.id} group={group} state={desktop} />)}
        </div>
        <div className="map-central-trunk" aria-hidden="true" />
        <div className="map-visual-lane map-visual-lane-right">
          {rightGroups.map((group) => <MapVisualGroup key={group.id} group={group} state={desktop} />)}
        </div>
      </div>

      <MapVerticalTree groups={groupsByOrder} state={mobile} />

      <div className="map-legend" role="group" aria-label="マップの凡例">
        <span><span className="map-legend-marker map-legend-category" aria-hidden="true" />分類</span>
        <span><span className="map-legend-marker map-legend-stack" aria-hidden="true" />技術</span>
        <span className="map-legend-note">名称を選ぶと詳細を開きます。説明は各詳細ページで確認できます。</span>
      </div>
    </div>
    </div>
  );
}
