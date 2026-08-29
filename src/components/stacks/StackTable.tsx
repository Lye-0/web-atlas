import { Link } from 'react-router-dom';
import { categoryById, stacks } from '../../data';
import { categoryPath, stackPath } from '../../utils/routes';

export function StackTable() {
  return (
    <div className="table-shell">
      <table className="data-table stack-table">
        <caption className="sr-only">DictionaryのStack一覧</caption>
        <thead>
          <tr>
            <th scope="col">Stack</th>
            <th scope="col">Category</th>
            <th scope="col">Summary</th>
            <th scope="col" className="table-status-col">Status</th>
          </tr>
        </thead>
        <tbody>
          {stacks.map((stack) => {
            const category = categoryById.get(stack.categoryId);
            return (
              <tr key={stack.id}>
                <th scope="row">
                  <Link className="table-primary-link" to={stackPath(stack.id)}>
                    <span>{stack.name}</span>
                    <span className="table-id">{stack.id}</span>
                  </Link>
                </th>
                <td>{category ? <Link className="subtle-link" to={categoryPath(category.id)}>{category.name}</Link> : '—'}</td>
                <td>{stack.summary}</td>
                <td className="table-status-col"><span className="status-pill">{stack.status}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
