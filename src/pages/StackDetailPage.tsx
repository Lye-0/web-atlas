import { Link, useParams } from 'react-router-dom';
import { getStack } from '../data';
import { StackDetail } from '../components/stacks/StackDetail';
import { NotFoundPage } from './NotFoundPage';

export function StackDetailPage() {
  const { stackId } = useParams();
  const stack = stackId ? getStack(stackId) : undefined;
  if (!stack) return <NotFoundPage kind="stack" requestedId={stackId} />;

  return (
    <>
      <StackDetail stack={stack} />
      <div className="detail-back-link"><Link to="/dictionary/stacks">← Stacks一覧へ戻る</Link></div>
    </>
  );
}
