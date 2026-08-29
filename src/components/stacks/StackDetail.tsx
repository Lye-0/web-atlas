import { Link } from 'react-router-dom';
import { categoryById, stackById } from '../../data';
import type { StackEntry } from '../../types';
import { categoryPath, stackPath } from '../../utils/routes';

const relationIcon: Record<NonNullable<StackEntry['relationships']>[number]['kind'], string> = {
  'built-on': 'base',
  renders: 'renders',
  'runs-on': 'runs on',
  'integrates-with': 'connects',
  'stores-in': 'stores in',
  'served-by': 'served by',
  'related-to': 'related',
};

export function StackDetail({ stack }: { stack: StackEntry }) {
  const category = categoryById.get(stack.categoryId);
  const relatedStacks = (stack.relatedStackIds ?? [])
    .map((id) => stackById.get(id))
    .filter((candidate): candidate is StackEntry => Boolean(candidate));
  const relationships = (stack.relationships ?? [])
    .map((relationship) => ({ ...relationship, target: stackById.get(relationship.targetStackId) }))
    .filter((relationship): relationship is typeof relationship & { target: StackEntry } => Boolean(relationship.target));

  return (
    <article className="detail-layout" aria-labelledby="stack-title">
      <div className="detail-main">
        <div className="breadcrumb">
          <Link to="/dictionary/stacks">Stacks</Link>
          <span aria-hidden="true">/</span>
          <span>{stack.name}</span>
        </div>
        <header className="detail-header">
          <p className="eyebrow">STACK / {stack.id}</p>
          <h1 id="stack-title">{stack.name}</h1>
          <p className="detail-summary">{stack.summary}</p>
          <p className="detail-description">{stack.description}</p>
          <div className="stack-meta-row">
            <span className="status-pill">{stack.status}</span>
            {category && <Link className="category-chip" to={categoryPath(category.id)}>{category.name} <span aria-hidden="true">↗</span></Link>}
          </div>
        </header>

        <div className="detail-section-grid">
          <section className="detail-section detail-section-emphasis">
            <p className="section-kicker">RESPONSIBILITY</p>
            <h2>何を担当するか</h2>
            <ul className="clean-list">
              {stack.responsibilities.map((responsibility) => <li key={responsibility}>{responsibility}</li>)}
            </ul>
          </section>
          <section className="detail-section">
            <p className="section-kicker">USE CASES</p>
            <h2>使われる場面</h2>
            <ul className="clean-list">
              {stack.useCases.map((useCase) => <li key={useCase}>{useCase}</li>)}
            </ul>
          </section>
        </div>

        <section className="detail-section" aria-labelledby="features-title">
          <p className="section-kicker">FEATURES</p>
          <h2 id="features-title">主な特徴</h2>
          <div className="feature-list">
            {stack.features.map((feature) => <span className="feature-chip" key={feature}>{feature}</span>)}
          </div>
        </section>

        {relationships.length > 0 && (
          <section className="detail-section" aria-labelledby="relationships-title">
            <p className="section-kicker">RELATIONSHIPS</p>
            <h2 id="relationships-title">他の技術との関係</h2>
            <div className="relationship-list">
              {relationships.map((relationship) => (
                <div className="relationship-item" key={`${relationship.kind}-${relationship.targetStackId}`}>
                  <div className="relationship-line" aria-hidden="true"><span />↓</div>
                  <div>
                    <span className="relationship-kind">{relationIcon[relationship.kind]}</span>
                    <Link to={stackPath(relationship.target.id)} className="relationship-target">{relationship.target.name}</Link>
                    {relationship.explanation && <p>{relationship.explanation}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="detail-section" aria-labelledby="related-stacks-title">
          <div className="section-heading-row">
            <div>
              <p className="section-kicker">RELATED STACKS</p>
              <h2 id="related-stacks-title">よく一緒に使う技術</h2>
            </div>
            <span className="section-count">{relatedStacks.length}</span>
          </div>
          {relatedStacks.length > 0 ? (
            <div className="stack-link-grid">
              {relatedStacks.map((related) => (
                <Link className="stack-link-card" key={related.id} to={stackPath(related.id)}>
                  <span className="stack-link-dot" aria-hidden="true" />
                  <span>
                    <strong>{related.name}</strong>
                    <span>{related.summary}</span>
                  </span>
                  <span className="card-arrow" aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          ) : <p className="muted-copy">関連するStackはありません。</p>}
        </section>
      </div>

      <aside className="detail-aside" aria-label="Stack information">
        <div className="aside-card">
          <p className="section-kicker">IDENTIFIERS</p>
          <dl className="identifier-list">
            <div><dt>Stable ID</dt><dd><code>{stack.id}</code></dd></div>
            <div><dt>Category ID</dt><dd>{category ? <Link to={categoryPath(category.id)}><code>{category.id}</code></Link> : '—'}</dd></div>
            {stack.packageNames && stack.packageNames.length > 0 && <div><dt>Package</dt><dd>{stack.packageNames.map((name) => <code key={name}>{name}</code>)}</dd></div>}
          </dl>
        </div>
        {stack.officialUrl && (
          <div className="aside-card">
            <p className="section-kicker">OFFICIAL SOURCE</p>
            <a className="official-link" href={stack.officialUrl} target="_blank" rel="noreferrer">
              公式サイトを開く <span aria-hidden="true">↗</span>
            </a>
            <p className="url-copy">{new URL(stack.officialUrl).hostname}</p>
          </div>
        )}
        <div className="aside-card aside-tip">
          <span className="aside-tip-mark" aria-hidden="true">#</span>
          <p>Stable ID・package名・aliasは、将来のAnalyzerからDictionaryへ接続するための識別子です。</p>
        </div>
      </aside>
    </article>
  );
}
