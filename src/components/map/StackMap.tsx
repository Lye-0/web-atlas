import { Link } from 'react-router-dom';
import { getCategory, getStack, stackMap } from '../../data';
import type { MapNode } from '../../types';
import { presentText } from '../../utils/presentationText';
import { categoryPath, stackPath } from '../../utils/routes';

interface VisualMapGroup {
  id: string;
  label: string;
  description: string;
  nodeIds: string[];
}

const visualGroups: VisualMapGroup[] = [
  {
    id: 'language-runtime',
    label: '言語と実行基盤',
    description: 'コードを書く・動かす・依存を揃える',
    nodeIds: ['languages', 'runtime', 'package-manager'],
  },
  {
    id: 'application',
    label: 'UIとアプリケーション',
    description: '画面、アプリの構成、開発ツール',
    nodeIds: ['framework', 'library', 'ui-component-system', 'build-tool', 'auth-service'],
  },
  {
    id: 'data',
    label: 'データとストレージ',
    description: 'データを扱い、保存する仕組み',
    nodeIds: ['database', 'storage'],
  },
  {
    id: 'quality',
    label: '品質と検証',
    description: '動作を確かめ、コードを整える',
    nodeIds: ['testing', 'code-quality'],
  },
  {
    id: 'delivery',
    label: '開発と配信',
    description: '変更を共有し、実行環境へ届ける',
    nodeIds: ['version-control', 'development-platform', 'ci-cd', 'container', 'deployment-platform'],
  },
];

const rootChildren = stackMap.kind === 'group' ? stackMap.children : [];

const getNodeKey = (node: MapNode) => {
  if (node.kind === 'group') return node.id;
  if (node.kind === 'category') return node.categoryId;
  return node.stackId;
};

const nodeById = new Map(rootChildren.map((node) => [getNodeKey(node), node]));

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
          title={presentText(category.summary)}
        >
          <span className="map-node-marker" aria-hidden="true" />
          <span className="map-node-copy">
            <span className="map-node-type">分類</span>
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
      <Link to={stackPath(stack.id)} className="map-node map-stack-node" title={presentText(stack.summary)}>
        <span className="map-node-marker" aria-hidden="true" />
        <span className="map-node-copy">
          <span className="map-node-type">技術</span>
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
        <span className="map-node-type">全体</span>
        <strong>Web開発</strong>
        <span>分類から具体的な技術へ、関係をたどる</span>
      </div>

      <div className="map-visual-groups">
        {visualGroups.map((group) => {
          const nodes = group.nodeIds
            .map((nodeId) => nodeById.get(nodeId))
            .filter((node): node is MapNode => Boolean(node));

          return (
            <section className="map-visual-group" key={group.id} aria-labelledby={`map-visual-group-${group.id}`}>
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
