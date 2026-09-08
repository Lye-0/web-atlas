import type { ReactNode } from 'react';
import type { SemanticEvidence, SemanticField, SemanticNode, SemanticViewId } from '../../analyzer/semantic/types';
import './semantic-data-detail.css';

const kinds = { interface: 'インターフェース', object: 'オブジェクト型', class: 'クラス', 'literal-union': '文字列・リテラルの選択肢', union: '構造の選択肢', alias: '型の別名', derived: '派生型・型演算', schema: '検証スキーマ', table: 'テーブル定義', enum: '列挙型' };
const states = { expanded: '展開済み', partial: '部分展開', unexpanded: '未展開', failed: '解析失敗' };
const domains = { code: 'コード上の型', validation: '実行時検証の定義', storage: '保存用の定義' };
function qualities(field: SemanticField, domain: 'code' | 'validation' | 'storage') {
  return [domain === 'storage' ? undefined : field.optional ? '省略可' : '省略不可', field.nullable === undefined ? undefined : field.nullable ? 'null可' : 'null不可', field.allowsUndefined ? 'undefinedを含む' : undefined,
    field.default !== undefined ? '既定値あり' : undefined,
    field.array ? '配列' : undefined, field.readonly ? 'readonly（型の指定）' : undefined, field.access && field.access !== 'public' ? field.access : undefined, field.static ? 'static' : undefined, field.key === 'primary' ? '主キー' : field.key === 'foreign' ? '外部キー' : undefined].filter(Boolean).join(' · ');
}
export function SemanticModelStructure({ node, fieldId, onField, onSelect, onJump, evidence }: {
  node: SemanticNode; fieldId?: string; onField: (id?: string) => void; onSelect: (id: string) => void;
  onJump: (id: string, view: SemanticViewId, fieldId?: string) => void; evidence: (items: SemanticEvidence[]) => ReactNode;
}) {
  const model = node.model; if (!model) return null;
  const fields = node.fields ?? [], field = [...fields, ...(model.choices?.flatMap(choice => choice.fields ?? []) ?? [])].find(field => field.id === fieldId);
  const fieldTable = (members: SemanticField[]) => <div className="semantic-data-table-scroll"><table className="semantic-data-fields"><thead><tr><th scope="col">項目</th><th scope="col">型・定義</th><th scope="col">性質</th></tr></thead><tbody>{members.map((member, index) => <tr key={`${member.id ?? member.name}:${index}`} data-selected={member.id === fieldId || undefined}>
    <th scope="row"><button type="button" onClick={() => onField(member.id)} aria-pressed={member.id === fieldId}>{member.name}{member.optional && model.domain !== 'storage' ? '?' : ''}</button></th><td><code>{member.type}</code></td><td>{qualities(member, model.domain)}</td>
  </tr>)}</tbody></table></div>;
  return <section className="semantic-data-structure" aria-label="データ構造">
    <p className="semantic-data-kind"><strong>{model.kind === 'schema' && model.domain === 'storage' ? '保存用スキーマ' : kinds[model.kind]}</strong><span>{domains[model.domain]}</span><span data-expansion={model.expansion}>{states[model.expansion]}</span></p>
    {model.reasons.length > 0 && <ul className="semantic-data-reasons">{model.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
    {model.domain === 'storage' && <p>保存用の宣言にある型・null・既定値・制約を表示しています。INSERT時に必要な入力や、ライブDBへの適用状態は判定していません。</p>}
    {['derived', 'alias'].includes(model.kind) && <><h4>作り方・定義式</h4><pre className="semantic-data-expression">{model.definition}</pre></>}
    {model.choices && <><h4>{model.kind === 'literal-union' || model.kind === 'enum' ? '取り得る値' : '候補となる構造'}</h4><ol className="semantic-data-choices">{model.choices.map((choice, index) => <li key={index}><code>{choice.label}</code>{choice.fields?.length ? fieldTable(choice.fields) : null}<details><summary>候補の根拠</summary>{evidence(choice.evidence)}</details></li>)}</ol></>}
    {fields.length > 0 ? <><h4>{model.kind === 'class' ? 'プロパティ' : model.kind === 'table' ? 'カラム' : '項目'} <small>{fields.length}件</small></h4>{fieldTable(fields)}</>
      : !model.choices && model.expansion === 'expanded' && ['interface', 'object', 'class', 'schema', 'table'].includes(model.kind) ? <p>項目0件（この定義で対象とする明示的な項目）</p> : null}
    {field && <section className="semantic-data-field-detail" aria-label="選択した項目"><h4>{field.name}</h4><code>{field.type}</code><p>{qualities(field, model.domain)}</p>
      {field.origin && <p>由来: {field.origin}</p>}
      {field.default !== undefined && <p>既定値（{field.defaultSource === 'database' ? 'DB定義' : field.defaultSource === 'validation' ? '検証時の処理' : 'コード初期化'}）: <code>{field.default}</code></p>}
      {field.constraints?.length ? <ul>{field.constraints.map((item, index) => <li key={index}><code>{item}</code></li>)}</ul> : null}
      {field.referenceIds?.map(id => <button type="button" key={id} onClick={() => onSelect(id)}>この項目の参照先を見る ↗</button>)}
      {(node.links ?? []).filter(link => link.view === 'data-flow' && link.fieldId === field.id).map((link, index) => <button type="button" key={`${link.targetId}:${index}`} onClick={() => onJump(link.targetId, link.view)}>{link.reason} のデータフローを見る ↗</button>)}
      {evidence(field.evidence ?? [])}
    </section>}
    {model.methods?.length ? <details className="semantic-data-methods"><summary>メソッド {model.methods.length}件（公開・非公開を含む明示宣言）</summary><ul>{model.methods.map((method, index) => <li key={index}><code>{method.signature}</code><details><summary>{method.name} の根拠</summary>{evidence(method.evidence)}</details></li>)}</ul></details> : null}
    {model.constraints?.length ? <section><h4>制約・関係の宣言</h4><ul className="semantic-data-constraints">{model.constraints.map(item => <li key={item.id}><strong>{({ 'primary-key': '主キー', 'foreign-key': 'DB外部キー', unique: '一意制約・一意インデックス', index: 'インデックス', check: 'CHECK制約', 'orm-relation': 'ORMの関係宣言' })[item.kind]}</strong><p>{item.columns.join(', ')}{item.targetColumns?.length ? ` → ${item.targetColumns.join(', ')}` : ''}</p><code>{item.expression}</code><details><summary>制約の根拠</summary>{evidence(item.evidence)}</details></li>)}</ul></section> : null}
    <details><summary>完全な定義</summary><pre className="semantic-data-expression">{model.definition}</pre></details>
  </section>;
}
