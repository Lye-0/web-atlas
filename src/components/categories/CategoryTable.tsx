import { Link } from 'react-router-dom';
import { categories, stacksForCategory } from '../../data';
import { categoryPath } from '../../utils/routes';

export function CategoryTable() {
  return (
    <div className="table-shell">
      <table className="data-table category-table">
        <caption className="sr-only">Dictionaryのカテゴリー一覧</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">概要</th>
            <th scope="col">主な役割</th>
            <th scope="col" className="table-count-col">Stacks</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id}>
              <th scope="row">
                <Link className="table-primary-link" to={categoryPath(category.id)}>
                  <span>{category.name}</span>
                  {category.parentCategoryId && <span className="table-parent">下位分類</span>}
                </Link>
              </th>
              <td>{category.summary}</td>
              <td>{category.role}</td>
              <td className="table-count-col">{stacksForCategory(category.id).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
