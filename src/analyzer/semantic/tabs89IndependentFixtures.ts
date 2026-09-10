/** Reviewer-authored source expectations, fixed before inspecting Analyzer output. Never execute these strings. */
export const tabs89IndependentSources: Record<string, string> = {
  'flow.ts': `import { identity } from './library';
import type { A } from './models';
export function copies(input: number) {
  const a = input;
  const b = a;
  const c = a + 1;
  return b;
}
export function properties(input: { price: number }, out: { price: number }) {
  out.price = input.price;
  return out.price;
}
export function scopes(input: number) {
  const same = input;
  function nested(input: string) { const same = input; return same; }
  return same;
}
export function versions(condition: boolean) {
  let x = 1;
  const before = x;
  x = 2;
  const after = x;
  if (condition) x = 3;
  const maybe = x;
  return maybe;
}
export function calls(first: string, second: string) {
  const left = identity(first);
  const right = identity(second);
  return { left, right };
}
export function guard(selected: string | undefined) {
  if (!selected) return;
  return selected;
}
export function chain(items: string[]) { return items.slice(1).filter(Boolean).join(','); }
export function callback(cb: () => string, external: (cb: () => string) => void) { external(cb); }
export function dynamic(input: Record<string, unknown>, key: string, external: (x: unknown) => unknown) {
  const unknown = external(input[key]);
  return unknown;
}
export function linked(payload: A) { const id = payload.id; return id; }
export function notLinked(A: string) { return A; }
export function indexed(input: string[]) { const first = input[0]; const second = input[1]; return { first, second }; }
`,
  'library.ts': `export function identity(value: string) { return value; }
export function scopes(input: boolean) { const same = input; return same; }
`,
  'models.ts': `import type { Remote } from './peer';
export interface A { id: string; note?: string; value: string | null; readonly n: number; explicitUndefined: string | undefined }
export interface Nested { records: A[]; remote: Remote; child: { active: boolean } }
export type Choice = 'a' | 'b' | 'c';
export type Candidate = { kind: 'first'; first: string } | { kind: 'second'; second: number };
export interface Runner { run(): void }
export class Discovery { constructor(private readonly runner: Runner) {} public count = 0; protected reset(): void {} }
export interface Extended extends A { extra: boolean }
export type Alias = A;
export type Message = { type: 'detail'; detail: { oid: string; title?: string } } | { type: 'refresh'; version: number };
export type Detail = Extract<Message, { type: 'detail' }>['detail'];
export type Unknown = Missing;
export type Complex<T> = T extends string ? { text: T } : { other: T };
export interface Recursive { next?: Recursive }
export interface Same { local: string }
export interface UsesLocal { same: Same }
export type Homonym = { code: string };
export type NestedCandidate = { payload: A } | { payload: Remote };
`,
  'peer.ts': `export interface Remote { remoteId: number }
export interface Same { distant: boolean }
export interface UsesPeer { same: Same }
`,
  'validation.ts': `import { z } from 'zod';
export const Homonym = z.object({ code: z.string(), note: z.string().optional(), nullable: z.string().nullable(), count: z.number().min(0).default(1) });
export const Unused = z.object({ untouched: z.boolean() });
export function parseKnown(input: unknown) { return Homonym.parse(input); }
export type Validated = z.infer<typeof Homonym>;
`,
  'fake-validation.ts': `const z = { object(value: unknown) { return value; }, string() { return 'custom'; } };
export const Fake = z.object({ pretend: z.string() });
export const Homonym = { code: 'unrelated' };
`,
  'storage.ts': `import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
const timestamps = { createdAt: text('created_at').notNull().default('epoch') };
export const Parent = sqliteTable('parent', { tenant: text('tenant').notNull(), id: text('id').notNull(), ...timestamps }, table => [primaryKey({ columns: [table.tenant, table.id] })]);
export const Child = sqliteTable('child', { id: text('id').primaryKey(), parentId: text('parent_id').notNull().references(() => Parent.id, { onDelete: 'cascade' }), rank: integer('rank').default(1) }, table => [uniqueIndex('child_pair').on(table.id, table.parentId)]);
export const Soft = sqliteTable('soft', { id: text('id').primaryKey(), parentId: text('parent_id') });
export const SoftRelations = relations(Soft, ({ one }) => ({ parent: one(Parent, { fields: [Soft.parentId], references: [Parent.id] }) }));
export const Homonym = sqliteTable('Homonym', { code: text('code').notNull() });
`,
  'history.sql': `CREATE TABLE parent (tenant TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (tenant, id));
CREATE TABLE child (tenant TEXT NOT NULL, parent_id TEXT NOT NULL, rank INTEGER DEFAULT 1, FOREIGN KEY (tenant, parent_id) REFERENCES parent (tenant, id) ON DELETE CASCADE);
CREATE TABLE Homonym (code TEXT NOT NULL);
`,
  'legacy.prisma': `model LegacyParent {
  id String @id
  children LegacyChild[]
}
model LegacyChild {
  id String @id
  parentId String
  parent LegacyParent @relation(fields: [parentId], references: [id])
}
`,
  'legacy.graphql': `type LegacyUser { id: ID! name: String friends: [LegacyUser!]! }
`,
  'legacy-mongoose.ts': `import mongoose from 'mongoose';
export const PersonSchema = new mongoose.Schema({ name: { type: String, required: true }, age: Number });
export const Person = mongoose.model('Person', PersonSchema);
`,
  'legacy-sequelize.ts': `import { Sequelize, DataTypes } from 'sequelize';
const sequelize = new Sequelize('sqlite::memory:');
export const Account = sequelize.define('Account', { name: { type: DataTypes.STRING, allowNull: false }, age: DataTypes.INTEGER });
`,
};

export const tabs89IndependentImports = [
  { from: 'flow.ts', to: 'library.ts', specifier: './library' },
  { from: 'flow.ts', to: 'models.ts', specifier: './models' },
  { from: 'models.ts', to: 'peer.ts', specifier: './peer' },
];

export const tabs89IndependentExpected = {
  'DF-01': 'copies input -> a -> b; source direction, assignment occurrences retained',
  'DF-02': 'a -> a + 1 transform operation -> c; no direct plain assign a -> c',
  'DF-03': 'input.price property-read -> out.price property-write; input/out object identities distinct',
  'DF-04': 'three same declarations and their input parameters resolve independently across nested scope and file',
  'DF-05': 'x=1 -> before only; x=2 -> after; not x=2 -> before',
  'DF-06': 'maybe can originate x=2 or conditional x=3, with conditional uncertainty; neither observed',
  'DF-07': 'first -> call argument0 -> library identity.value in that context -> return -> left result',
  'DF-08': 'first/left and second/right contexts distinct; no path first -> right or second -> left',
  'DF-09': 'guard bare return no value, selected -> valued return only; return sites and exit distinguished',
  'DF-10': 'slice result -> filter receiver -> join receiver; callback Boolean not observed',
  'DF-11': 'cb is argument to external; no implied execution or returned cb value',
  'DF-12': 'input[key] dynamic boundary and unresolved external callee carry reasons; no invented target property',
  'DM-01': 'A has5 fields; note optional; value nullable; n readonly; explicitUndefined required and permits undefined',
  'DM-02': 'Nested.records A[] and remote Remote preserve expression+reference reason; child only inline active',
  'DM-03': 'Choice alternatives a,b,c exactly',
  'DM-04': 'Candidate alternatives preserve separate first/second shapes, no merged required fields',
  'DM-05': 'Discovery runner Runner private readonly; count public property; reset protected method',
  'DM-06': 'Extended extends A; Alias alias A; Remote import identity resolved in peer',
  'DM-07': 'Detail final oid/title optional OR explicitly unexpanded with expression/reference; never type field from filter',
  'DM-08': 'Unknown Missing unresolved; Complex generic conditional unexpanded or partial with reason, not genuine0 fields',
  'DM-09': 'Recursive.next self reference terminates with evidence',
  'DM-10': 'UsesLocal.same -> models.Same; UsesPeer.same -> peer.Same; no name-only cross reference',
  'DM-11': 'validation Homonym explicit properties/default/min constraints; parse usage separate; Unused not validated; fake z not Zod',
  'DM-12': 'SoftRelations is ORM relation only; Child.parentId is explicit FK; Soft.parentId not DB FK',
  'DM-13': 'Parent compound PK2; SQL child compound FK2 with onDelete; spread timestamps evidence preserved',
  'DM-14': 'Homonym code type,validation schema,ORM table,SQL table distinct IDs; no same-name correspondence',
  LINK: 'flow.linked payload A and id field have model link; notLinked parameter named A has no model link',
};
