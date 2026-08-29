import { Link } from 'react-router-dom';

interface NotFoundPageProps {
  kind?: 'category' | 'stack';
  requestedId?: string;
}

export function NotFoundPage({ kind, requestedId }: NotFoundPageProps = {}) {
  const label = kind === 'category' ? '分類' : kind === 'stack' ? '技術' : 'ページ';
  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <p className="eyebrow">404 / NOT FOUND</p>
      <h1 id="not-found-title">見つからない{label}です</h1>
      <p>
        {requestedId ? <><code>{requestedId}</code> に一致する項目はありません。</> : '指定されたページは存在しません。'}
        {' '}IDを確認するか、Dictionaryの一覧から探してください。
      </p>
      <div className="not-found-actions">
        <Link className="primary-action" to="/dictionary/map">Mapへ</Link>
        <Link className="outlined-action" to="/dictionary/categories">分類一覧</Link>
        <Link className="outlined-action" to="/dictionary/stacks">技術一覧</Link>
      </div>
    </section>
  );
}
