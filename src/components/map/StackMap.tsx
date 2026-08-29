import { Link } from 'react-router-dom';
import { getCategory, getStack } from '../../data';
import type { MapNode } from '../../types';
import { categoryPath, stackPath } from '../../utils/routes';
import { stackMap } from '../../data';

interface MapNodeViewProps {
  node: MapNode;
  depth?: number;
}

function MapNodeView({ node, depth = 0 }: MapNodeViewProps) {
  if (node.kind === 'group') {
    return (
      <section className={`map-group map-group-depth-${depth}`} aria-labelledby={`map-group-${node.id}`}>
        <div className="map-group-heading">
          <span className="map-branch-mark" aria-hidden="true" />
          <div>
            <h3 id={`map-group-${node.id}`} className="map-group-title">
              {node.label}
            </h3>
            {node.description && <p className="map-group-description">{node.description}</p>}
          </div>
        </div>
        <div className="map-children">
          {node.children.map((child) => (
            <MapNodeView key={child.kind === 'category' ? child.categoryId : child.kind === 'stack' ? child.stackId : child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      </section>
    );
  }

  if (node.kind === 'category') {
    const category = getCategory(node.categoryId);
    if (!category) return null;
    const hasNestedCategories = node.children.some((child) => child.kind === 'category');
    return (
      <section className={`map-category${hasNestedCategories ? ' map-category-parent' : ''}`} aria-labelledby={`map-category-${category.id}`}>
        <Link to={categoryPath(category.id)} className="map-category-node" id={`map-category-${category.id}`}>
          <span className="map-node-type">Category</span>
          <span className="map-node-name">{category.name}</span>
          <span className="map-node-summary">{category.summary}</span>
        </Link>
        {node.children.length > 0 && (
          <div className="map-children map-category-children">
            {node.children.map((child) => (
              <MapNodeView key={child.kind === 'category' ? child.categoryId : child.kind === 'stack' ? child.stackId : child.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </section>
    );
  }

  const stack = getStack(node.stackId);
  if (!stack) return null;
  return (
    <Link to={stackPath(stack.id)} className="map-stack-node">
      <span className="stack-node-dot" aria-hidden="true" />
      <span className="map-node-name">{stack.name}</span>
      <span className="map-node-summary">{stack.summary}</span>
    </Link>
  );
}

export function StackMap() {
  return (
    <div className="stack-map" aria-label="Web開発周辺スタックの分類マップ">
      <div className="map-root-node">
        <span className="map-node-type">ROOT</span>
        <span className="map-root-title">Web開発周辺スタック</span>
        <span className="map-root-subtitle">分類から具体的な技術へ、役割の違いをたどる</span>
      </div>
      <div className="map-root-children">
        {(
          (stackMapRootChildren as MapNode[])
        ).map((node) => (
          <MapNodeView key={node.kind === 'category' ? node.categoryId : node.kind === 'stack' ? node.stackId : node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

// Kept as a small adapter so the visual root can stay separate from the map's data contract.
const stackMapRootChildren = stackMap.kind === 'group' ? stackMap.children : [];
