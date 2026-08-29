import { Link, useParams } from 'react-router-dom';
import { getCategory } from '../data';
import { CategoryDetail } from '../components/categories/CategoryDetail';
import { NotFoundPage } from './NotFoundPage';

export function CategoryDetailPage() {
  const { categoryId } = useParams();
  const category = categoryId ? getCategory(categoryId) : undefined;
  if (!category) return <NotFoundPage kind="category" requestedId={categoryId} />;

  return (
    <>
      <CategoryDetail category={category} />
      <div className="detail-back-link"><Link to="/dictionary/categories">← Categories一覧へ戻る</Link></div>
    </>
  );
}
