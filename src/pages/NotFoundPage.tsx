import { Link } from 'react-router-dom';

interface NotFoundPageProps {
  kind?: 'category' | 'stack';
  requestedId?: string;
}

export function NotFoundPage({ kind, requestedId }: NotFoundPageProps = {}) {
  const label = kind === 'category' ? 'Category' : kind === 'stack' ? 'Stack' : 'ページ';
  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <p className="eyebrow">404 / NOT FOUND</p>
      <h1 id="not-found-title">見つからない{label}です</h1>
      <p>
        {requestedId ? <><code>{requestedId}</code> に一致する項目はありません。</> : '指定されたページは存在しません。'}
        {' '}IDを確認するか、Dictionaryの一覧から探してください。
      </p>
      <div className="not-found-actions">
        <Link className="primary-action" to="/dictionary/map">Stack Mapへ</Link>
        <Link className="outlined-action" to="/dictionary/categories">Categories</Link>
        <Link className="outlined-action" to="/dictionary/stacks">Stacks</Link>
      </div>
    </section>
  );
}
