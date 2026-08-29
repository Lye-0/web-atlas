import { Link } from 'react-router-dom';
import { dictionaryVisualGroups, getCategory, getStack, stackMap } from '../../data';
import type { MapNode } from '../../types';
import { categoryPath, stackPath } from '../../utils/routes';

const rootChildren = stackMap.kind === 'group' ? stackMap.children : [];

const getNodeKey = (node: MapNode) => {
  if (node.kind === 'group') return node.id;
  if (node.kind === 'category') return node.categoryId;
  return node.stackId;
};

const categoryNodeById = new Map<string, Extract<MapNode, { kind: 'category' }>>();

const collectCategoryNodes = (node: MapNode) => {
  if (node.kind === 'category') {
    categoryNodeById.set(node.categoryId, node);
  }
  if (node.kind === 'group' || node.kind === 'category') {
    node.children.forEach(collectCategoryNodes);
  }
};

rootChildren.forEach(collectCategoryNodes);

function MapNodeView({ node }: { node: MapNode }) {
  if (node.kind === 'group') {
    return (
      <li className="map-tree-group-node">
        <div className="map-subgroup-heading">
          <span className="map-group-marker" aria-hidden="true" />
          <span>{node.label}</span>
        </div>
        <ul className="map-tree-list map-tree-list-nested">
          {node.children.map((child) => <MapNodeView key={getNodeKey(child)} node={child} />)}
        </ul>
      </li>
    );
  }

  if (node.kind === 'category') {
    const category = getCategory(node.categoryId);
    if (!category) return null;

    return (
      <li className="map-tree-item map-tree-category-item">
        <Link
          to={categoryPath(category.id)}
          className="map-node map-category-node"
          title={category.summary}
        >
          <span className="map-node-marker" aria-hidden="true" />
          <span className="map-node-copy">
            <span className="map-node-name">{category.name}</span>
          </span>
        </Link>
        {node.children.length > 0 && (
          <ul className="map-tree-list map-tree-list-nested">
            {node.children.map((child) => <MapNodeView key={getNodeKey(child)} node={child} />)}
          </ul>
        )}
      </li>
    );
  }

  const stack = getStack(node.stackId);
  if (!stack) return null;

  return (
    <li className="map-tree-item map-tree-stack-item">
      <Link to={stackPath(stack.id)} className="map-node map-stack-node" title={stack.summary}>
        <span className="map-node-marker" aria-hidden="true" />
        <span className="map-node-copy">
          <span className="map-node-name">{stack.name}</span>
        </span>
      </Link>
    </li>
  );
}

export function StackMap() {
  return (
    <div className="stack-map" role="region" aria-label="Web開発技術の分類マップ">
      <div className="map-root-node">
        <strong>Web開発</strong>
        <span>分類から具体的な技術へ、関係をたどる</span>
      </div>

      <div className="map-visual-groups">
        {dictionaryVisualGroups.map((group) => {
          const nodes = group.rootCategoryIds
            .map((categoryId) => categoryNodeById.get(categoryId))
            .filter((node): node is Extract<MapNode, { kind: 'category' }> => Boolean(node));

          return (
            <section
              className={`map-visual-group map-visual-group-${group.id}`}
              key={group.id}
              aria-labelledby={`map-visual-group-${group.id}`}
            >
              <header className="map-visual-group-heading">
                <span className="map-group-marker" aria-hidden="true" />
                <div>
                  <h3 id={`map-visual-group-${group.id}`}>{group.label}</h3>
                  <p>{group.description}</p>
                </div>
              </header>
              <ul className="map-tree-list">
                {nodes.map((node) => <MapNodeView key={getNodeKey(node)} node={node} />)}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="map-legend" role="group" aria-label="マップの凡例">
        <span><span className="map-legend-marker map-legend-category" aria-hidden="true" />分類</span>
        <span><span className="map-legend-marker map-legend-stack" aria-hidden="true" />技術</span>
        <span className="map-legend-note">名称を選ぶと詳細を開きます。説明は各詳細ページで確認できます。</span>
      </div>
    </div>
  );
}
