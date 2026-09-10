// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import type { SemanticInput } from './types';
import { maskSemanticSource } from './sourceMask';
import { projectSemanticView } from './project';
beforeAll(initializeTestParser);
const analyze = (sources: Record<string, string>, imports: SemanticInput['imports'] = [], resources: SemanticInput['resources'] = []) => analyzeSemanticSources({ sources, imports, resources }, testLanguage, undefined, testParser);

describe('semantic accuracy contracts', () => {
  it('keeps callback scopes, local shadowing and dynamic calls separate', async () => {
    const result = await analyze({ 'app.ts': `import { save } from './service'; function run(save: (x: string) => string, input: string) { const result = save(input); return result; } const factory = () => { const privateValue = 42; return privateValue; };`,'service.ts': 'export function save(value: string) { return value; }' }, [{ from: 'app.ts', to: 'service.ts', specifier: './service' }]);
    const run = result.nodes.find(node => node.kind === 'function' && node.label === 'run')!;
    expect(result.edges.filter(edge => edge.source === run.id && edge.kind === 'calls')).toEqual([expect.objectContaining({ confidence: 'unresolved' })]);
    const factory = result.nodes.find(node => node.kind === 'function' && node.label === 'factory')!;
    expect(result.nodes.find(node => node.label === 'privateValue' && node.kind === 'value')?.attributes.owner).toBe(factory.id);
  });
  it('tracks nested-call results and transformations without bypassing the callee', async () => {
    const result = await analyze({ 'app.ts': 'function clean(raw: string) { return raw.trim(); } function serialize(value: string) { return JSON.stringify(value); } function run(input: string) { const payload = serialize(clean(input)); return payload; }' });
    const cleanResult = result.nodes.find(node => node.data?.role === 'call-result' && node.data.expression === 'clean(input)' && !node.data.contextId)!;
    const serializeResult = result.nodes.find(node => node.data?.role === 'call-result' && node.data.expression === 'serialize(clean(input))' && !node.data.contextId)!;
    const actual = result.nodes.find(node => node.data?.role === 'argument' && node.data.expression === 'clean(input)' && !node.data.contextId)!;
    const payload = result.nodes.find(node => node.data?.role === 'declaration' && node.label === 'payload')!;
    expect(result.edges.some(edge => edge.source === cleanResult.id && edge.target === actual.id && edge.kind === 'argument')).toBe(true);
    expect(result.edges.some(edge => edge.source === cleanResult.id && edge.target === payload.id)).toBe(false);
    expect(result.edges.some(edge => edge.source === serializeResult.id && edge.target === payload.id && edge.kind === 'assign')).toBe(true);
    expect(result.edges.some(edge => edge.kind === 'receiver' && result.nodes.find(node => node.id === edge.source)?.label === 'raw')).toBe(true);
  });
  it('connects HTTP requests, handlers, runtime and persistence with evidence', async () => {
    const result = await analyze({
      'web.ts': `function save(input: string) { return fetch('/api/users', { method: 'POST', body: JSON.stringify(input) }); }`,
      'api.ts': `const users = sqliteTable('users', { id: text().primaryKey(), name: text() }); export async function fetch() {} app.post('/api/users', async (request) => { const row = await database.select().from(users); await database.insert(users); return row; });`,
    }, [], [{ id: 'db', label: 'D1', type: 'database', binding: 'DB', path: 'wrangler.jsonc' }, { id: 'runtime', label: 'Workers', type: 'runtime', path: 'wrangler.jsonc', entryPath: 'api.ts' }]);
    expect(result.edges.some(edge => edge.kind === 'http')).toBe(true);
    expect(result.edges.some(edge => edge.kind === 'runtime-entry')).toBe(true);
    const users = result.nodes.find(node => node.kind === 'model' && node.label === 'users')!;
    expect(result.edges.some(edge => edge.kind === 'reads' && edge.source === users.id)).toBe(true);
    expect(result.edges.some(edge => edge.kind === 'writes' && edge.target === users.id)).toBe(true);
    expect(result.edges.filter(edge => ['http', 'handles', 'reads', 'writes'].includes(edge.kind)).every(edge => edge.evidence.length > 0)).toBe(true);
  });
  it('detects Next routes, React events and extension commands', async () => {
    const result = await analyze({
      'app/api/users/[id]/route.ts': 'export function GET(request: Request) { return load(request); }',
      'src/Form.tsx': 'function submit() { save(); } export function Form() { return <button onClick={submit}>Save</button> }',
      'src/extension.ts': `export function activate() { vscode.commands.registerCommand('open', () => show()); } function show() { return 1; }`,
    });
    expect(result.nodes.some(node => node.kind === 'entry' && node.label === 'GET /api/users/:id')).toBe(true);
    expect(result.edges.filter(edge => edge.kind === 'handles')).toHaveLength(3);
    expect(projectSemanticView(result, 'runtime-flow').edges.length).toBeGreaterThanOrEqual(3);
  });
  it.each([
    ['python', 'app.py', `@app.get('/users')\ndef users():\n  return load()`, 'GET /users'],
    ['java', 'Api.java', `class Api { @GetMapping("/users") public User users() { return load(); } }`, 'GET /users'],
    ['c_sharp', 'Api.cs', `class Api { [HttpGet("/users")] public User Users() { return Load(); } }`, 'GET /users'],
    ['go', 'app.go', `package app\nfunc main() { http.HandleFunc("/users", users) }\nfunc users() { load() }`, 'ANY /users'],
    ['ruby', 'routes.rb', `get '/users', to: 'users#index'`, 'GET /users'],
    ['php', 'routes.php', `<?php Route::get('/users', [UserController::class, 'index']);`, 'GET /users'],
  ])('extracts %s route declarations', async (_language, path, source, label) => {
    const result = await analyze({ [path]: source });
    expect(result.nodes.some(node => node.kind === 'entry' && node.label === label)).toBe(true);
  });
  it('ignores commented routes and schemas and keeps method locals out of fields', async () => {
    const result = await analyze({ 'app.py': `# @app.get('/fake')\ndef good():\n  return 1`, 'app.ts': 'class User { id: string; method() { const local = 1; this.other = local; } }', 'schema.sql': '-- CREATE TABLE fake (id INT);\nCREATE TABLE organizations(id INT PRIMARY KEY);\nCREATE TABLE users(id INT PRIMARY KEY, org_id INT, FOREIGN KEY (org_id) REFERENCES organizations(id));' });
    expect(result.nodes.some(node => node.kind === 'entry')).toBe(false);
    expect(result.nodes.some(node => node.label === 'fake')).toBe(false);
    expect(result.nodes.find(node => node.kind === 'model' && node.label === 'User')?.fields?.map(field => field.name)).toEqual(['id']);
    expect(result.nodes.find(node => node.kind === 'model' && node.label === 'users')?.fields?.find(field => field.name === 'org_id')?.target).toBe('organizations');
  });
  it.each([
    ['python', 'py', 'class User(BaseModel):\n  id: int\n  name: str', ['id', 'name']],
    ['java', 'java', 'class User { int id; String name; }', ['id', 'name']],
    ['c_sharp', 'cs', 'class User { int id; public string Name { get;set; } }', ['id', 'Name']],
    ['go', 'go', 'package app\ntype User struct { ID int; Name string }', ['ID', 'Name']],
    ['rust', 'rs', 'struct User { id: i32, name: String }', ['id', 'name']],
    ['swift', 'swift', 'struct User { let id: Int; var name: String }', ['id', 'name']],
    ['kotlin', 'kt', 'data class User(val id: Int, val name: String)', ['id', 'name']],
    ['dart', 'dart', 'class User { int id; String name; }', ['id', 'name']],
    ['php', 'php', '<?php class User { public int $id; public string $name; }', ['id', 'name']],
  ])('extracts %s data fields', async (_language, ext, source, names) => {
    const result = await analyze({ [`model.${ext}`]: source });
    expect(result.nodes.find(node => node.kind === 'model' && node.label === 'User')?.fields?.map(field => field.name)).toEqual(names);
  });
  it('resolves Python, Rust and namespace Go imports conservatively', async () => {
    const examples: Record<string, string>[] = [
      { 'app/main.py': 'from .service import save as persist\ndef run(value):\n  return persist(value)', 'app/service.py': 'def save(value):\n  return value' },
      { 'src/main.rs': 'use crate::service::save; fn main() { save(1); }', 'src/service.rs': 'pub fn save(value: i32) -> i32 { value }' },
      { 'main.go': 'package app\nimport "app/service"\nfunc run(value string) string { return service.Save(value) }', 'service/save.go': 'package service\nfunc Save(value string) string { return value }' },
    ];
    for (const sources of examples) {
      const result = await analyze(sources);
      expect(result.edges.some(edge => edge.kind === 'calls' && edge.confidence !== 'unresolved')).toBe(true);
    }
  });
  it('preserves grammar and UTF-16 positions when masking sensitive literal values', async () => {
    const code = `const password = "🔒sensitive-value"; const token = createToken(); function auth(value: string) { return value; } console.log('AUTH_EMULATOR=true is required');`;
    const masked = maskSemanticSource(code);
    expect(masked.length).toBe(code.length); expect(masked).not.toContain('sensitive-value'); expect(masked).toContain('createToken()');
    const result = await analyze({ 'app.ts': masked }); expect(result.coverage[0]?.status).toBe('parsed'); expect(result.nodes.some(node => node.label === 'auth')).toBe(true);
  });
  it('keeps branch alternatives and prevents block-local variables from escaping', async () => {
    const result = await analyze({ 'app.ts': 'function run(flag: boolean) { let value = 1; if (flag) { value = 2; const privateValue = 3; } consume(value); consume(privateValue); }' });
    const use = result.nodes.find(node => node.data?.role === 'use' && node.label === 'value')!;
    expect(result.edges.filter(edge => edge.kind === 'origin' && edge.target === use.id)).toHaveLength(2);
    expect(result.edges.filter(edge => edge.kind === 'origin' && edge.target === use.id).every(edge => edge.confidence === 'inferred')).toBe(true);
    const unknown = result.nodes.find(node => node.data?.role === 'unknown' && node.label === 'privateValue')!;
    expect(unknown.data?.resolution).toBe('unresolved');
    expect(result.edges.filter(edge => edge.kind === 'origin' && edge.target === unknown.id)).toHaveLength(0);
  });
  it('links a fluent query result to the assigned data', async () => {
    const result = await analyze({ 'app.ts': "const users = sqliteTable('users', { id: text() }); function run() { const row = database.select().from(users).get(); return row; }" });
    const callResult = result.nodes.find(node => node.data?.role === 'call-result' && node.data.expression === 'database.select()')!;
    const row = result.nodes.find(node => node.data?.role === 'declaration' && node.label === 'row')!;
    const next = new Set([callResult.id]); let added = true;
    while (added) { added = false; for (const edge of result.edges.filter(edge => edge.views.includes('data-flow'))) if (next.has(edge.source) && !next.has(edge.target)) { next.add(edge.target); added = true; } }
    expect(next.has(row.id)).toBe(true);
    expect(result.edges.some(edge => edge.views.includes('data-flow') && /reads|writes/.test(edge.kind))).toBe(false);
  });
  it('composes controller prefixes and resolves imported Django handlers', async () => {
    const result = await analyze({ 'Users.ts': '@Controller("api/users") class Users { @Get(":id") getUser() { return load(); } }', 'urls.py': "from .views import users\nurlpatterns = [path('users/', users)]", 'views.py': 'def users(request):\n  return request' });
    expect(result.nodes.filter(node => node.kind === 'entry').map(node => node.label)).toContain('GET /api/users/:id');
    const endpoint = result.nodes.find(node => node.kind === 'entry' && node.label === 'ANY /users/')!;
    expect(result.edges.some(edge => edge.source === endpoint.id && edge.kind === 'handles')).toBe(true);
  });
  it('expands local ORM column spreads and positional record fields', async () => {
    const result = await analyze({ 'schema.ts': "import {sqliteTable,text} from 'drizzle-orm/sqlite-core'; const timestamps = { createdAt: text('created_at'), updatedAt: text('updated_at') }; const users = sqliteTable('users', { id: text('id').primaryKey(), ...timestamps });", 'User.cs': 'public record User(string Name, int Age);' });
    expect(result.nodes.find(node => node.kind === 'model' && node.label === 'users')?.fields?.map(field => field.name)).toEqual(['id', 'createdAt', 'updatedAt']);
    expect(result.nodes.find(node => node.kind === 'model' && node.label === 'User')?.fields?.map(field => field.name)).toEqual(['Name', 'Age']);
  });
  it('preserves argument positions and result bindings for destructuring', async () => {
    const result = await analyze({ 'app.ts': 'function save({id}: User, options: Options) { return options; } function run(user: User, config: Options) { const {payload} = decode(user); save(payload, config); return {payload}; }' });
    const payload = result.nodes.find(node => node.data?.role === 'declaration' && node.label === 'payload')!;
    const options = result.nodes.find(node => node.data?.role === 'parameter' && node.label === 'options' && node.data.contextId)!;
    const config = result.nodes.find(node => node.data?.role === 'parameter' && node.label === 'config' && !node.data.contextId)!;
    expect(payload.attributes.destructured).toBe(true);
    const reaches = (id: string) => { const found = new Set([id]); for (let index = 0, queue = [id]; index < queue.length; index++) for (const edge of result.edges.filter(edge => edge.views.includes('data-flow') && edge.source === queue[index])) if (!found.has(edge.target)) { found.add(edge.target); queue.push(edge.target); } return found; };
    expect(reaches(payload.id).has(options.id)).toBe(false);
    expect(reaches(config.id).has(options.id)).toBe(true);
    expect(result.edges.some(edge => edge.kind === 'passes-to' && edge.target === options.id && edge.details?.argumentIndex === 1)).toBe(true);
    expect(result.edges.some(edge => edge.kind === 'origin' && edge.source === payload.id)).toBe(true);
  });
});
