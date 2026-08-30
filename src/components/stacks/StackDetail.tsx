import { Link } from 'react-router-dom';
import { categoryById, stackById } from '../../data';
import type { RelationKind, StackEntry } from '../../types';
import { categoryPath, stackPath } from '../../utils/routes';
import { stackStatusLabels } from '../../utils/stackStatus';

const relationLabels: Record<RelationKind, string> = {
  'built-on': '基盤にする',
  renders: '描画する',
  'runs-on': '上で動作する',
  'integrates-with': '連携する',
  'stores-in': '保存する',
  'served-by': '配信される',
  'related-to': '関連する',
};

const pageSections = [
  { href: '#responsibilities', label: '何を担当するか' },
  { href: '#features', label: '主な特徴' },
  { href: '#use-cases', label: '使われる場面' },
  { href: '#relationships', label: '他の技術との関係' },
  { href: '#related-stacks', label: 'よく一緒に使う技術' },
  { href: '#official', label: '公式サイト' },
];

export function StackDetail({ stack }: { stack: StackEntry }) {
  const category = categoryById.get(stack.categoryId);
  const relatedStacks = (stack.relatedStackIds ?? [])
    .map((id) => stackById.get(id))
    .filter((candidate): candidate is StackEntry => Boolean(candidate));
  const relationships = (stack.relationships ?? [])
    .map((relationship) => ({ ...relationship, target: stackById.get(relationship.targetStackId) }))
    .filter((relationship): relationship is typeof relationship & { target: StackEntry } => Boolean(relationship.target));
  const officialHostname = stack.officialUrl ? new URL(stack.officialUrl).hostname : undefined;

  return (
    <article className="stack-detail detail-layout" aria-labelledby="stack-title">
      <div className="detail-main">
        <div className="breadcrumb">
          <Link to="/dictionary/stacks">Stacks</Link>
          <span aria-hidden="true">/</span>
          <span>{stack.name}</span>
        </div>

        <header className="detail-header" id="overview">
          <h1 id="stack-title">{stack.name}</h1>
          <p className="detail-summary">{stack.summary}</p>
          <p className="detail-description">{stack.description}</p>
          <div className="stack-meta-row">
            {category && <Link className="detail-category-link" to={categoryPath(category.id)}>{category.name} <span aria-hidden="true">→</span></Link>}
            {stack.status !== 'active' && <span className={`stack-status stack-status-${stack.status}`}>{stackStatusLabels[stack.status]}</span>}
          </div>
        </header>

        <section className="document-section" id="responsibilities" aria-labelledby="responsibilities-title">
          <p className="section-kicker">役割</p>
          <h2 id="responsibilities-title">何を担当するか</h2>
          <ul className="clean-list">
            {stack.responsibilities.map((responsibility) => <li key={responsibility}>{responsibility}</li>)}
          </ul>
        </section>

        <section className="document-section" id="features" aria-labelledby="features-title">
          <p className="section-kicker">特徴</p>
          <h2 id="features-title">主な特徴</h2>
          <ul className="feature-list">
            {stack.features.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>
        </section>

        <section className="document-section" id="use-cases" aria-labelledby="use-cases-title">
          <p className="section-kicker">利用場面</p>
          <h2 id="use-cases-title">使われる場面</h2>
          <ul className="clean-list">
            {stack.useCases.map((useCase) => <li key={useCase}>{useCase}</li>)}
          </ul>
        </section>

        {relationships.length > 0 && (
          <section className="document-section" id="relationships" aria-labelledby="relationships-title">
            <p className="section-kicker">関係</p>
            <h2 id="relationships-title">他の技術との関係</h2>
            <div className="relationship-list">
              {relationships.map((relationship) => {
                const relation = relationLabels[relationship.kind];
                return (
                  <div className="relationship-item" key={`${relationship.kind}-${relationship.targetStackId}`}>
                    <div className="relationship-row" aria-label={`${stack.name} ${relation} ${relationship.target.name}`}>
                      <span className="relationship-source">{stack.name}</span>
                      <span className="relationship-arrow" aria-hidden="true">→</span>
                      <span className="relationship-kind">{relation}</span>
                      <span className="relationship-arrow" aria-hidden="true">→</span>
                      <Link to={stackPath(relationship.target.id)} className="relationship-target">{relationship.target.name}</Link>
                    </div>
                    {relationship.label && relationship.label !== relation && <p className="relationship-context">{relationship.label}</p>}
                    {relationship.explanation && <p>{relationship.explanation}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="document-section" id="related-stacks" aria-labelledby="related-stacks-title">
          <p className="section-kicker">関連技術</p>
          <h2 id="related-stacks-title">よく一緒に使う技術</h2>
          {relatedStacks.length > 0 ? (
            <div className="document-link-list">
              {relatedStacks.map((related) => (
                <Link className="document-link-row" key={related.id} to={stackPath(related.id)}>
                  <span className="document-link-copy">
                    <strong>{related.name}</strong>
                    <span>{related.summary}</span>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          ) : <p className="muted-copy">関連する技術はありません。</p>}
        </section>

        {stack.officialUrl && (
          <section className="document-section" id="official" aria-labelledby="official-title">
            <p className="section-kicker">参照先</p>
            <h2 id="official-title">公式サイト</h2>
            <a className="official-link" href={stack.officialUrl} target="_blank" rel="noreferrer">
              公式サイトを開く <span aria-hidden="true">↗</span>
            </a>
            {officialHostname && <p className="url-copy">{officialHostname}</p>}
          </section>
        )}

        <details className="developer-metadata">
          <summary>開発者向けメタデータ</summary>
          <dl className="metadata-list">
            <div><dt>Stable ID</dt><dd><code>{stack.id}</code></dd></div>
            <div><dt>Category ID</dt><dd>{category ? <Link to={categoryPath(category.id)}><code>{category.id}</code></Link> : '—'}</dd></div>
            {stack.packageNames && stack.packageNames.length > 0 && (
              <div><dt>Package names</dt><dd>{stack.packageNames.map((name) => <code key={name}>{name}</code>)}</dd></div>
            )}
            {stack.aliases && stack.aliases.length > 0 && (
              <div><dt>Aliases</dt><dd>{stack.aliases.map((alias) => <span key={alias}>{alias}</span>)}</dd></div>
            )}
          </dl>
        </details>
      </div>

      <aside className="detail-aside" aria-label="このページの案内">
        <nav className="detail-toc" aria-label="ページ内目次">
          <p className="aside-heading">このページ</p>
          <a href="#overview">概要</a>
          {pageSections
            .filter((section) => section.href !== '#relationships' || relationships.length > 0)
            .filter((section) => section.href !== '#official' || Boolean(stack.officialUrl))
            .map((section) => <a href={section.href} key={section.href}>{section.label}</a>)}
        </nav>
      </aside>
    </article>
  );
}
