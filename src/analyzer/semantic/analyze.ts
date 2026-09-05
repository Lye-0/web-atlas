import { Parser, type Language, type Node } from 'web-tree-sitter';
import { semanticLanguage, responsibility } from './languages';
import type { SemanticAnalysis, SemanticConfidence, SemanticEdge, SemanticEvidence, SemanticField, SemanticInput, SemanticKind, SemanticNode, SemanticViewId } from './types';

const functionTypes = new Set(['function_declaration', 'function_definition', 'function_expression', 'arrow_function', 'method_definition', 'method_declaration', 'constructor_declaration', 'function_item', 'method', 'singleton_method', 'local_function_statement', 'lambda_expression', 'function_literal', 'function_signature']);
const modelTypes = new Set(['interface_declaration', 'type_alias_declaration', 'type_item', 'class_declaration', 'class_definition', 'class', 'struct_item', 'struct_specifier', 'type_spec', 'record_declaration', 'enum_declaration', 'enum_item', 'object_declaration', 'trait_item']);
const callTypes = new Set(['call_expression', 'invocation_expression', 'method_invocation', 'function_call_expression', 'member_call_expression', 'scoped_call_expression', 'call', 'object_creation_expression', 'new_expression', 'macro_invocation', 'selector']);
const assignmentTypes = new Set(['variable_declarator', 'assignment', 'assignment_expression', 'short_var_declaration', 'let_declaration', 'init_declarator', 'property_declaration']);
const ignoredCalls = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'sizeof', 'require', 'import', 'super']);
const identifierTypes = new Set(['identifier', 'simple_identifier', 'variable_name', 'field_identifier', 'shorthand_property_identifier', 'shorthand_property_identifier_pattern']);
const fieldTypes = new Set(['property_signature', 'public_field_definition', 'field_declaration', 'property_declaration', 'field_definition', 'property_element', 'assignment', 'class_parameter', 'declaration']);
const views = { call: ['function-call-flow', 'runtime-flow'] as SemanticViewId[], data: ['data-flow'] as SemanticViewId[], model: ['data-model'] as SemanticViewId[] };
const cleanName = (name: string) => name.replace(/^\$/, '').replace(/\s+/g, ' ').slice(0, 160);
const leaf = (name: string) => cleanName(name).replace(/<[^>]*>/g, '').split(/\?\.|\.|::|->/).at(-1) ?? name;
const field = (node: Node, ...names: string[]) => names.map(name => node.childForFieldName(name)).find(Boolean) ?? null;
function walk(node: Node, visit: (node: Node) => void) { const stack = [node]; while (stack.length) { const item = stack.pop()!; visit(item); for (let i = item.namedChildCount - 1; i >= 0; i--) { const child = item.namedChild(i); if (child) stack.push(child); } } }
function descendants(node: Node, types: ReadonlySet<string>): Node[] { const found: Node[] = []; walk(node, item => { if (types.has(item.type)) found.push(item); }); return found; }
function immediateCalls(node: Node): number[] {
  const found: number[] = []; const stack = [node];
  while (stack.length) { const item = stack.pop()!; if (functionTypes.has(item.type)) continue;
    if (callTypes.has(item.type) && (item.type !== 'selector' || item.namedChildren.some(child => child.type === 'argument_part'))) found.push(item.id);
    else stack.push(...item.namedChildren);
  }
  return found;
}
function declarationName(node: Node): string {
  const direct = field(node, 'name');
  if (direct) return cleanName(direct.text);
  const declarator = field(node, 'declarator');
  if (declarator) return declarationName(declarator) || declarator.namedChildren.find(child => /identifier/.test(child.type))?.text || '';
  if (['variable_declarator', 'pair', 'assignment', 'property_declaration'].includes(node.parent?.type ?? '')) {
    const parent = node.parent!;
    return cleanName(field(parent, 'name', 'key', 'left')?.text ?? parent.namedChildren[0]?.text ?? '');
  }
  return cleanName(node.namedChildren.find(child => /^(?:identifier|simple_identifier|type_identifier|property_identifier|name|constant)$/.test(child.type))?.text ?? '');
}
function evidence(path: string, node: Node, description: string): SemanticEvidence {
  return { path, start: node.startIndex, end: node.endIndex, line: node.startPosition.row + 1, endLine: node.endPosition.row + 1, description };
}
function literals(node: Node): string[] {
  const found: string[] = [];
  walk(node, item => { if (['string', 'string_literal', 'interpreted_string_literal', 'raw_string_literal', 'template_string', 'string_content', 'string_fragment'].includes(item.type)) {
    const text = item.text.replace(/^["'`]|["'`]$/g, ''); if (text && !found.includes(text)) found.push(text);
  } });
  return found;
}
function identifiers(node: Node): string[] {
  const names = new Set<string>(); const stack = [node];
  while (stack.length) {
    const item = stack.pop()!;
    if (functionTypes.has(item.type) || callTypes.has(item.type)) continue;
    if (identifierTypes.has(item.type) && !(item.parent?.type === 'pair' && field(item.parent, 'key')?.id === item.id)) names.add(cleanName(item.text));
    stack.push(...item.namedChildren);
  }
  return [...names].filter(value => /^[\w$]+$/.test(value));
}
function modelFields(node: Node, orm = false): SemanticField[] {
  const body = field(node, 'body', 'value', 'type') ?? node;
  const fields: SemanticField[] = [];
  const members = orm ? descendants(body, new Set(['pair'])).filter(item => item.parent?.id === body.id) : [...descendants(body, fieldTypes), ...(node.type === 'record_declaration' ? (field(node, 'parameters') ?? node.namedChildren.find(item => item.type === 'parameter_list'))?.namedChildren ?? [] : [])];
  for (const member of members) {
    let ancestor = member.parent; let nested = false;
    while (ancestor && ancestor.id !== body.id && ancestor.id !== node.id) { if (functionTypes.has(ancestor.type) || modelTypes.has(ancestor.type)) { nested = true; break; } ancestor = ancestor.parent; }
    if (nested) continue;
    const declarator = descendants(member, new Set(['variable_declarator', 'property_element', 'initialized_identifier']))[0];
    let nameNode = field(member, 'name', 'key', 'left') ?? (declarator ? field(declarator, 'name') ?? declarator.namedChildren.find(item => identifierTypes.has(item.type)) : undefined) ?? member.namedChildren.find(item => /identifier|variable_name/.test(item.type));
    if (nameNode?.type === 'pattern') nameNode = field(nameNode, 'bound_identifier') ?? nameNode;
    if (!nameNode) continue;
    const name = cleanName(nameNode.text.replace(/["']/g, ''));
    if (!/^[\w$]+$/.test(name) || fields.some(item => item.name === name)) continue;
    const typeNode = field(member, 'type', 'value', 'right') ?? field(declarator?.parent ?? member, 'type') ?? member.namedChildren.find(item => /type_annotation|user_type|type_identifier|predefined_type/.test(item.type));
    const type = (typeNode?.text ?? member.text.slice(nameNode.endIndex - member.startIndex)).replace(/^\s*[:=]\s*/, '').split('\n')[0]!.replace(/[,;]\s*$/, '').slice(0, 220);
    const text = member.text;
    fields.push({ name, type: type || 'unknown', optional: /\?|\.optional\(|\bOptional\b|\bnullable\b/.test(text),
      ...(/primaryKey\(|@id\b|PRIMARY KEY/i.test(text) ? { key: 'primary' as const } : {}),
      ...(/references\s*\(/.test(text) ? { key: 'foreign' as const, target: text.match(/references\s*\(\s*\(\)\s*=>\s*(\w+)/)?.[1] } : {}),
    });
  }
  return fields;
}

interface FunctionRecord { node: SemanticNode; start: number; end: number; parent?: string; parameters: string[]; parameterBindings?: string[][]; className?: string }
interface CallRecord { astId: number; node: SemanticNode; owner: string; callee: string; args: string[][]; argumentCalls: number[][]; callbacks: string[]; receiver: string[]; receiverCalls: number[]; result?: string; path: string; evidence: SemanticEvidence; target?: string; operation?: string; literalArgs: string[] }
interface AssignmentRecord { id: string; owner: string; path: string; name: string; inputs: string[]; calls: number[]; evidence: SemanticEvidence; scopeStart: number; scopeEnd: number; conditional: boolean; declaration: boolean }
interface ImportBinding { local: string; original: string; specifier: string }
interface RouteAnnotation { method: string; address: string; target?: FunctionRecord; className?: string; evidence: SemanticEvidence }

class SemanticBuilder {
  nodes = new Map<string, SemanticNode>(); edges = new Map<string, SemanticEdge>();
  generated = new Set<string>();
  node(kind: SemanticKind, label: string, path: string | undefined, at: number | string, ev: SemanticEvidence[], confidence: SemanticConfidence = 'source', attributes: SemanticNode['attributes'] = {}): SemanticNode {
    const id = `${kind}:${path ?? 'runtime'}:${at}:${cleanName(label)}`;
    const existing = this.nodes.get(id); if (existing) return existing;
    const node: SemanticNode = { id, kind, label: cleanName(label), path, line: ev[0]?.line, endLine: ev[0]?.endLine,
      language: path ? semanticLanguage(path) : undefined, group: path && this.generated.has(path) ? 'Generated definitions' : path ? responsibility(path, '') : 'Infrastructure', confidence, evidence: ev, attributes: { ...attributes, ...(path && this.generated.has(path) ? { generated: true } : {}) } };
    this.nodes.set(id, node); return node;
  }
  edge(source: string, target: string, kind: string, label: string, edgeViews: SemanticViewId[], ev: SemanticEvidence[], confidence: SemanticConfidence = 'source') {
    const id = `${kind}:${source}:${target}:${ev[0]?.start ?? ''}:${ev[0]?.end ?? ''}`;
    this.edges.set(id, { id, source, target, kind, label, views: edgeViews, confidence, evidence: ev });
  }
}

/** Real syntax trees are shared across all five projections; symbols never escape their source scope by name alone. */
export async function analyzeSemanticSources(input: SemanticInput, loadLanguage: (name: string) => Promise<Language>, progress?: (done: number, total: number) => void, createParser: (name: string) => Parser = () => new Parser()): Promise<SemanticAnalysis> {
  const started = performance.now();
  const builder = new SemanticBuilder();
  builder.generated = new Set(Object.entries(input.sources).filter(([path, source]) => /(?:^|\/)generated\//i.test(path) || /\b(?:auto.generated|generated by|code generated|do not edit)\b/i.test(source.slice(0, 600))).map(([path]) => path));
  const functions: FunctionRecord[] = []; const calls: CallRecord[] = []; const assignments: AssignmentRecord[] = [];
  const bindings = new Map<string, ImportBinding[]>();
  const coverage: SemanticAnalysis['coverage'] = []; const warnings: string[] = [];
  const resources = input.resources.map(resource => { const node = builder.node('resource', resource.label, resource.path, -1, resource.evidence ?? [], 'source', { resourceType: resource.type, binding: resource.binding ?? '', entryPath: resource.entryPath ?? '' }); node.group = resource.type === 'auth' ? 'Authentication' : resource.type === 'database' || resource.type === 'storage' ? 'Persistence' : 'Infrastructure'; return node; });
  const sources = Object.entries(input.sources).filter(([path]) => semanticLanguage(path));
  for (const [fileIndex, [path, originalSource]] of sources.entries()) {
    const language = semanticLanguage(path)!;
    if (['sql', 'prisma', 'graphql'].includes(language)) { parseSchemaFile(builder, path, originalSource, language); coverage.push({ path, language, status: 'parsed' }); progress?.(fileIndex + 1, sources.length); continue; }
    let parser: Parser | undefined;
    let tree: ReturnType<Parser['parse']> = null;
    try {
      const grammar = await loadLanguage(language);
      parser = createParser(language); parser.setLanguage(grammar);
      let source = originalSource;
      if (/\.(vue|svelte)$/.test(path)) {
        const characters: string[] = source.split('').map(char => char === '\n' || char === '\r' ? char : ' ');
        for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
          const offset = match.index! + match[0].indexOf('>') + 1;
          for (let i = 0; i < match[1]!.length; i++) characters[offset + i] = match[1]![i]!;
        }
        source = characters.join('');
      }
      tree = parser.parse(source);
      if (!tree) throw new Error('構文解析を完了できませんでした');
      const root = tree.rootNode;
      const errors = descendants(root, new Set(['ERROR'])).length;
      coverage.push({ path, language, status: errors || /\.(vue|svelte)$/.test(path) ? 'partial' : 'parsed',
        ...(errors ? { message: `${errors}箇所の構文エラー。解析可能な範囲を表示` } : /\.(vue|svelte)$/.test(path) ? { message: 'script内を解析。テンプレートは対象外' } : {}) });
      const initializer = builder.node('function', '<module>', path, 0, [], 'source', { initializer: true, exported: true });
      const localFunctions: FunctionRecord[] = [{ node: initializer, start: 0, end: source.length, parameters: [] }];
      walk(root, ast => {
        if (!functionTypes.has(ast.type) && !(language === 'ruby' && ['block', 'do_block'].includes(ast.type))) return;
        const name = declarationName(ast) || `callback L${ast.startPosition.row + 1}`;
        const paramsNode = field(ast, 'parameters', 'parameter') ?? field(field(ast, 'declarator') ?? ast, 'parameters') ?? ast.namedChildren.find(child => /^(?:function_value_parameters|formal_parameter_list|parameters)$/.test(child.type));
        const parameterNodes = (paramsNode ? identifierTypes.has(paramsNode.type) ? [paramsNode] : paramsNode.namedChildren : ast.namedChildren.filter(child => child.type === 'parameter')).filter(param => !/comment/.test(param.type));
        const parameterPatterns = parameterNodes.map(param => field(param, 'pattern', 'name', 'declarator') ?? param.namedChildren.find(child => identifierTypes.has(child.type)) ?? param);
        const parameters = parameterPatterns.map((pattern, index) => cleanName(pattern.text) || `argument ${index + 1}`);
        const parameterBindings = parameterPatterns.map(identifiers);
        let parent = ast.parent; let className: string | undefined;
        while (parent) { if (modelTypes.has(parent.type)) { className = declarationName(parent); break; } parent = parent.parent; }
        const ev = evidence(path, ast, `${name}の宣言`);
        const item = builder.node('function', className ? `${className}.${name}` : name, path, ast.startIndex, [ev], 'source', {
          name, className: className ?? '', parameters, exported: /export|public\b|pub\b/.test(ast.parent?.text.slice(0, 40) ?? ''),
          defaultExport: ast.parent?.type === 'export_statement' && /^export\s+default\b/.test(ast.parent.text),
          entry: /^(?:main|fetch|scheduled|queue|onRequest|doGet|doPost|GET|POST|PUT|DELETE|PATCH|activate|deactivate|applicationDidFinishLaunching)$/.test(name) || (/\.(tsx|jsx|vue|svelte)$/.test(path) && /^[A-Z]/.test(name)),
        });
        item.signature = ast.text.slice(0, ast.text.indexOf('{') >= 0 ? ast.text.indexOf('{') : ast.text.indexOf('\n') >= 0 ? ast.text.indexOf('\n') : 220).trim().slice(0, 220);
        item.endLine = ast.type === 'function_signature' && ast.nextNamedSibling?.type === 'function_body' ? ast.nextNamedSibling.endPosition.row + 1 : ast.endPosition.row + 1;
        localFunctions.push({ node: item, start: ast.startIndex, end: ast.type === 'function_signature' && ast.nextNamedSibling?.type === 'function_body' ? ast.nextNamedSibling.endIndex : ast.endIndex, parameters, parameterBindings, className });
        const routeFile = path.match(/(?:^|\/)(?:app|pages|routes)\/(.*?)(?:\/route|\/\+server|\/index)?\.[cm]?[jt]sx?$/);
        if (routeFile && (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name) || /(?:^|\/)pages\/api\//.test(path) && item.attributes.defaultExport)) {
          const endpoint = '/' + routeFile[1]!.replace(/\([^/]*\)\//g, '').replace(/\[\.\.\.(.*?)\]/g, '*').replace(/\[(.*?)\]/g, ':$1');
          const method = item.attributes.defaultExport ? 'ANY' : name;
          const entry = builder.node('entry', `${method} ${endpoint}`, path, ast.startIndex, [ev], 'inferred', { endpoint, method, framework: 'file routing' });
          builder.edge(entry.id, item.id, 'handles', 'file route', ['runtime-flow'], [ev], 'inferred');
        }
      });
      localFunctions.sort((a, b) => a.start - b.start || b.end - a.end);
      for (const fn of localFunctions) if (!fn.node.attributes.initializer) fn.parent = localFunctions.filter(parent => parent !== fn && parent.start <= fn.start && parent.end >= fn.end && (parent.start < fn.start || parent.end > fn.end || parent.node.attributes.initializer)).sort((a, b) => a.end - a.start - (b.end - b.start))[0]?.node.id;
      functions.push(...localFunctions);
      for (const fn of localFunctions.filter(fn => fn.node.attributes.entry)) {
        for (const runtime of resources.filter(node => node.attributes.entryPath === path)) builder.edge(runtime.id, fn.node.id, 'runtime-entry', 'entry point', ['runtime-flow'], [...runtime.evidence, ...fn.node.evidence]);
      }
      const ownerAt = (ast: Node) => localFunctions.filter(fn => fn.start <= ast.startIndex && fn.end >= ast.endIndex).sort((a, b) => a.end - a.start - (b.end - b.start) || Number(Boolean(a.node.attributes.initializer)) - Number(Boolean(b.node.attributes.initializer)))[0] ?? localFunctions[0]!;
      const assignmentScope = (ast: Node, owner: FunctionRecord) => {
        const declaration = !/^(?:assignment|assignment_expression)$/.test(ast.type) || language === 'python';
        const blockScoped = declaration && language !== 'python' && language !== 'ruby' && !(language.match(/^(?:javascript|typescript|tsx)$/) && ast.parent?.type === 'variable_declaration');
        let scopeStart = owner.start, scopeEnd = owner.end, conditional = false, scoped = false; let parent = ast.parent;
        while (parent && parent.startIndex >= owner.start && parent.id !== root.id) {
          if (/^(?:if_statement|if_expression|conditional_expression|switch_statement|switch_expression|match_expression|for_statement|for_in_statement|while_statement|do_statement|catch_clause|except_clause|case_clause)$/.test(parent.type)) conditional = true;
          if (blockScoped && !scoped && /^(?:block|statement_block|class_body|declaration_list)$/.test(parent.type)) { scopeStart = parent.startIndex; scopeEnd = parent.endIndex; scoped = true; }
          if (functionTypes.has(parent.type)) break;
          parent = parent.parent;
        }
        return { scopeStart, scopeEnd, conditional, declaration };
      };
      const localBindings: ImportBinding[] = [];
      const routeAnnotations: RouteAnnotation[] = [];
      const objectDeclarations = descendants(root, assignmentTypes).filter(ast => field(ast, 'value', 'right')?.type === 'object');
      const objectFields = (object: Node, seen = new Set<number>()): { fields: SemanticField[]; unresolved: string[] } => {
        if (seen.has(object.id)) return { fields: [], unresolved: ['循環したobject spread'] };
        const nextSeen = new Set([...seen, object.id]); const resolved = new Map<string, SemanticField>(); const unresolved: string[] = [];
        const direct = modelFields(object, true);
        for (const child of object.namedChildren) {
          if (child.type === 'spread_element') {
            const value = child.namedChildren[0];
            const declaration = value?.type === 'identifier' ? objectDeclarations.filter(item => field(item, 'name', 'left')?.text === value.text && item.startIndex < object.startIndex && (ownerAt(item).node.id === ownerAt(object).node.id || ownerAt(item).node.attributes.initializer)).at(-1) : undefined;
            const spread = value?.type === 'object' ? value : declaration ? field(declaration, 'value', 'right') : undefined;
            if (!spread) { unresolved.push(value?.text ?? child.text); continue; }
            const result = objectFields(spread, nextSeen); result.fields.forEach(field => resolved.set(field.name, field)); unresolved.push(...result.unresolved);
          } else if (child.type === 'pair') { const name = field(child, 'key')?.text.replace(/["']/g, ''); const item = direct.find(field => field.name === name); if (item) resolved.set(item.name, item); }
        }
        return { fields: [...resolved.values()], unresolved };
      };
      walk(root, ast => {
        if (['decorator', 'annotation', 'attribute'].includes(ast.type)) {
          const name = ast.text.match(/^@?(?:\w+\.)?(\w+)/)?.[1] ?? '';
          const methods: Record<string, string> = { get: 'GET', Get: 'GET', GetMapping: 'GET', HttpGet: 'GET', post: 'POST', Post: 'POST', PostMapping: 'POST', HttpPost: 'POST', put: 'PUT', Put: 'PUT', PutMapping: 'PUT', HttpPut: 'PUT', patch: 'PATCH', Patch: 'PATCH', PatchMapping: 'PATCH', HttpPatch: 'PATCH', delete: 'DELETE', Delete: 'DELETE', DeleteMapping: 'DELETE', HttpDelete: 'DELETE', route: 'ANY', Route: 'ANY', RequestMapping: 'ANY', Controller: 'ANY' };
          const method = methods[name];
          if (method) {
            let ancestor = ast.parent; let declaration: Node | null = null;
            if (ancestor?.type === 'class_body') { let sibling = ast.nextNamedSibling; while (sibling?.type === 'decorator') sibling = sibling.nextNamedSibling; if (sibling && functionTypes.has(sibling.type)) declaration = sibling; }
            while (ancestor && !declaration) {
              const decorated = ancestor.type === 'decorated_definition' ? field(ancestor, 'definition') : null;
              if (decorated && functionTypes.has(decorated.type)) { declaration = decorated; break; }
              if (functionTypes.has(ancestor.type) || modelTypes.has(ancestor.type)) { declaration = ancestor; break; }
              ancestor = ancestor.parent;
            }
            const target = declaration && functionTypes.has(declaration.type) ? localFunctions.find(fn => fn.start === declaration!.startIndex && !fn.node.attributes.initializer) : undefined;
            routeAnnotations.push({ method, address: literals(ast)[0] ?? '', target, className: declaration && modelTypes.has(declaration.type) ? declarationName(declaration) : undefined, evidence: evidence(path, ast, 'Route annotation') });
          }
        }
        if (ast.type === 'import_statement') {
          const specifier = field(ast, 'source')?.text.replace(/["']/g, '') ?? '';
          for (const item of descendants(ast, new Set(['import_specifier']))) {
            const name = field(item, 'name')?.text; if (name) localBindings.push({ local: field(item, 'alias')?.text ?? name, original: name, specifier });
          }
          const clause = ast.namedChildren.find(item => item.type === 'import_clause');
          const defaultName = clause?.namedChildren.find(item => item.type === 'identifier')?.text;
          if (defaultName) localBindings.push({ local: defaultName, original: 'default', specifier });
          const namespace = clause?.namedChildren.find(item => item.type === 'namespace_import');
          if (namespace) localBindings.push({ local: namespace.namedChildren.at(-1)?.text ?? '', original: '*', specifier });
        }
        if (ast.type === 'import_from_statement') {
          const specifier = field(ast, 'module_name')?.text ?? '';
          for (const item of ast.namedChildren.filter(child => ['aliased_import', 'dotted_name'].includes(child.type) && child.id !== field(ast, 'module_name')?.id)) {
            const original = field(item, 'name')?.text ?? item.text;
            localBindings.push({ local: field(item, 'alias')?.text ?? original, original, specifier });
          }
        }
        if (ast.type === 'import_spec' && language === 'go') {
          const specifier = field(ast, 'path')?.text.replace(/["`]/g, '') ?? '';
          localBindings.push({ local: field(ast, 'name')?.text ?? specifier.split('/').at(-1) ?? '', original: '*', specifier });
        }
        if (ast.type === 'use_declaration' && language === 'rust') {
          const argument = field(ast, 'argument');
          if (argument && /^[\w:]+$/.test(argument.text)) { const original = argument.text.split('::').at(-1)!; localBindings.push({ local: original, original, specifier: argument.text.split('::').slice(0, -1).join('::') }); }
        }
        if (modelTypes.has(ast.type)) {
          const name = declarationName(ast); if (!name) return;
          const item = builder.node('model', name, path, ast.startIndex, [evidence(path, ast, `${name}の構造定義`)], 'source', { modelKind: ast.type });
          if (/\b(?:BaseModel|models\.Model|ApplicationRecord|ActiveRecord|DbContext|Base|Model)\b/.test(ast.text.slice(0, (field(ast, 'body')?.startIndex ?? ast.endIndex) - ast.startIndex)) || /@Entity\b/.test(ast.text.slice(0, 100))) item.attributes.orm = true;
          item.fields = modelFields(ast); item.signature = ast.text.split('\n')[0]?.slice(0, 220);
          const types = descendants(ast, new Set(['type_identifier'])).map(node => node.text).filter(type => type !== name);
          item.attributes.typeReferences = [...new Set(types)];
          if (language === 'ruby') for (const association of descendants(ast, new Set(['call'])).filter(call => /^(?:belongs_to|has_one|has_many)\b/.test(call.text))) {
            const fieldName = association.text.match(/:([\w]+)/)?.[1]; if (fieldName) item.fields.push({ name: fieldName, type: association.text.split(/\s+/)[0]!, optional: /optional:\s*true/.test(association.text), target: fieldName.replace(/s$/, '').replace(/(^|_)(\w)/g, (_, _sep, char: string) => char.toUpperCase()) });
          }
        }
        if (assignmentTypes.has(ast.type)) {
          const left = field(ast, 'name', 'left', 'pattern', 'declarator'); const right = field(ast, 'value', 'right');
          if (left && right?.type === 'call_expression' && field(right, 'function')?.text === 'require') {
            const specifier = literals(right)[0] ?? '';
            if (left.type === 'object_pattern') for (const binding of left.namedChildren) {
              const original = field(binding, 'key')?.text ?? binding.text;
              localBindings.push({ local: field(binding, 'value')?.text ?? original, original, specifier });
            } else localBindings.push({ local: left.text, original: '*', specifier });
          }
          if (!left || !right || functionTypes.has(right.type) || right.type === 'class') return;
          const name = cleanName(left.text);
          const names = /^[\w$]+$/.test(name) ? [name] : /^(?:object_pattern|array_pattern|tuple_pattern|pattern_list|tuple|list|expression_list)$/.test(left.type) ? identifiers(left) : [];
          if (!names.length) return;
          const owner = ownerAt(ast); const ev = evidence(path, ast, `${name}への代入`);
          const scope = assignmentScope(ast, owner);
          for (const bindingName of names) {
            const data = builder.node('value', bindingName, path, ast.startIndex, [ev], 'source', { owner: owner.node.id, expression: right.text.slice(0, 240), conditional: scope.conditional, destructured: bindingName !== name });
            assignments.push({ id: data.id, owner: owner.node.id, path, name: bindingName, inputs: identifiers(right), calls: immediateCalls(right), evidence: ev, ...scope });
          }
          const tableCall = descendants(right, callTypes).find(item => /^(?:sqliteTable|pgTable|mysqlTable|sqliteView|pgView|defineTable|z\.object|zod\.object|Schema|mongoose\.Schema|mongoose\.model|sequelize\.define|Table)$/.test(field(item, 'function', 'constructor')?.text ?? ''));
          if (tableCall) {
            const object = descendants(tableCall, new Set(['object'])).at(0);
            const model = builder.node('model', name, path, ast.startIndex, [ev], 'source', { modelKind: /Table|View/.test(tableCall.text) ? 'table' : 'schema', storageName: literals(tableCall)[0] ?? name });
            const resolved = object ? objectFields(object) : { fields: [], unresolved: [] };
            model.fields = resolved.fields;
            if (resolved.unresolved.length) model.attributes.unresolvedSpreads = resolved.unresolved;
            model.attributes.orm = !/^z(?:od)?\./.test(field(tableCall, 'function')?.text ?? '');
            if (/mongoose\.model/.test(tableCall.text)) model.attributes.typeReferences = identifiers(field(tableCall, 'arguments') ?? tableCall);
          }
        }
        if (callTypes.has(ast.type)) {
          if (ast.type === 'selector' && !ast.namedChildren.some(child => child.type === 'argument_part')) return;
          const calleeNode = ast.type === 'selector' ? ast.previousNamedSibling : field(ast, 'function', 'name', 'method') ?? ast.namedChildren[0];
          if (!calleeNode) return;
          const receiver = field(ast, 'object');
          const callee = (receiver && receiver.id !== calleeNode.id ? `${receiver.text}.${calleeNode.text}` : calleeNode.text).slice(0, 240); if (ignoredCalls.has(callee)) return;
          const owner = ownerAt(ast); const ev = evidence(path, ast, `${callee}の呼び出し`);
          const argsNode = field(ast, 'arguments', 'argument_list') ?? descendants(ast, new Set(['arguments', 'value_arguments', 'argument_list']))[0];
          const argumentsList = argsNode?.namedChildren ?? [];
          const op = builder.node('operation', `${leaf(callee)}()`, path, `${ast.startIndex}-${ast.endIndex}`, [ev], 'source', { owner: owner.node.id, callee });
          const callbackIds = argumentsList.flatMap(argument => { const callback = localFunctions.find(fn => fn.start >= argument.startIndex && fn.end <= argument.endIndex && fn.parent === owner.node.id); return callback ? [callback.node.id] : []; });
          const record: CallRecord = { astId: ast.id, node: op, owner: owner.node.id, callee, args: argumentsList.map(identifiers), argumentCalls: argumentsList.map(immediateCalls), callbacks: callbackIds, receiver: identifiers(receiver ?? calleeNode), receiverCalls: immediateCalls(receiver ?? calleeNode), path, evidence: ev, literalArgs: argumentsList.flatMap(literals) };
          if (/^(?:JSON\.stringify|serialize|encode|marshal)$/.test(callee)) op.attributes.dataOperation = 'serialization';
          if (/^(?:JSON\.parse|deserialize|decode|unmarshal)$/.test(callee) || /\.(?:json|text|blob|arrayBuffer)$/.test(callee)) op.attributes.dataOperation = 'deserialization';
          if (/\b(?:validate|safeParse|parse)$/.test(callee)) op.attributes.dataOperation = 'validation';
          calls.push(record);
          const method = leaf(callee).toUpperCase();
          const route = /^(?:PATH|RE_PATH)$/.test(method) ? `/${record.literalArgs[0] ?? ''}` : record.literalArgs.find(value => value.startsWith('/'));
          let parent = ast.parent; let isAnnotation = false;
          while (parent && !functionTypes.has(parent.type)) { if (/decorator|annotation|attribute/.test(parent.type)) { isAnnotation = true; break; } parent = parent.parent; }
          if (/^(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|ALL|MAPGET|MAPPOST|MAPPUT|MAPDELETE|ROUTE|HANDLEFUNC|PATH|RE_PATH)$/.test(method) && route && !isAnnotation && !/database|\bdb\b|storage|bucket/i.test(callee)) {
            const httpMethod = method === 'ROUTE' ? argumentsList.at(-1)?.text.match(/\b(get|post|put|patch|delete)\s*\(/i)?.[1]?.toUpperCase() ?? 'ANY' : /^(?:ALL|HANDLEFUNC|PATH|RE_PATH)$/.test(method) ? 'ANY' : method.replace('MAP', '');
            const endpoint = builder.node('entry', `${httpMethod} ${route}`, path, ast.startIndex, [ev], 'source', { endpoint: route, method: httpMethod });
            const handler = localFunctions.find(fn => fn.start > ast.startIndex && fn.end <= ast.endIndex);
            if (handler) { builder.edge(endpoint.id, handler.node.id, 'handles', 'handler', ['runtime-flow'], [ev]); handler.node.attributes.entry = true; }
            else {
              const last = /^(?:PATH|RE_PATH)$/.test(method) ? argumentsList[1] : argumentsList.at(-1);
              if (last) {
                endpoint.attributes.handler = last.text.match(/\b(?:to|get|post|put|patch|delete)\(\s*(\w+)\s*\)/)?.[1] ?? last.text;
                const controller = last.text.match(/\b(\w+)::class\s*,\s*['"](\w+)['"]/);
                const rails = record.literalArgs.find(value => /^[\w/]+#\w+$/.test(value));
                if (controller) { endpoint.attributes.handlerClass = controller[1]!; endpoint.attributes.handler = controller[2]!; }
                if (rails) { endpoint.attributes.handlerClass = `${rails.split('#')[0]!.replace(/(^|_)(\w)/g, (_, _prefix, character: string) => character.toUpperCase())}Controller`; endpoint.attributes.handler = rails.split('#')[1]!; }
              }
            }
          }
          if (/^(?:addEventListener|registerCommand|onDidReceiveMessage|onMessage|onRequest|onCall|onSchedule|onDocumentCreated|subscribe)$/.test(leaf(callee))) {
            const event = record.literalArgs[0] ?? leaf(callee);
            const entry = builder.node('entry', `${leaf(callee)} · ${event}`, path, ast.startIndex, [ev], 'source', { event, registration: callee });
            const handler = localFunctions.find(fn => fn.start > ast.startIndex && fn.end <= ast.endIndex);
            if (handler) { builder.edge(entry.id, handler.node.id, 'handles', 'event handler', ['runtime-flow'], [ev]); handler.node.attributes.entry = true; }
            else { const candidate = argumentsList[leaf(callee) === 'onDidReceiveMessage' ? 0 : 1]; if (candidate) entry.attributes.handler = candidate.text; }
          }
          if (/(?:^|\.)(?:fetch|axios|request|requestJson|apiRequest|apiFetch|useQuery|useMutation)$/.test(callee) || /axios\.(?:get|post|put|delete|patch)$/.test(callee)) {
            const address = record.literalArgs.find(value => /^(?:https?:|\/)/.test(value)) ?? record.literalArgs[0];
            op.kind = 'request'; op.label = address ? address.slice(0, 140) : `${leaf(callee)} · URL未解決`;
            op.attributes.endpoint = address ?? ''; op.attributes.method = record.literalArgs.find(value => /^(GET|POST|PUT|PATCH|DELETE)$/.test(value)) ?? (callee.includes('axios.') ? leaf(callee).toUpperCase() : 'GET');
            if (!address || !/^(?:https?:|\/)/.test(address)) op.confidence = 'unresolved';
            else if (address.includes('${')) op.confidence = 'inferred';
            builder.edge(owner.node.id, op.id, 'requests', 'API request', ['runtime-flow'], [ev]); record.operation = 'request';
          }
          const database = /(?:database|\bdb|prisma|repository|query|drizzle|sql|\.prepare\()/i.test(callee);
          const storage = /(?:bucket|storage|\.kv\b|\.r2\b)/i.test(callee);
          const auth = /signIn|signOut|verifyIdToken|createUser|authenticate|getAuth/.test(callee);
          if ((database && /select|insert|update|delete|execute|query|prepare|find|create|save|drizzle/i.test(callee)) || storage || auth) {
            record.operation = auth ? 'auth' : storage ? 'storage' : 'database';
            op.attributes.operation = record.operation;
            builder.edge(owner.node.id, op.id, 'executes', record.operation, ['runtime-flow'], [ev]);
            const candidateResources = resources.filter(resource => resource.attributes.resourceType === record.operation || (record.operation === 'database' && /D1|SQL|Database/i.test(resource.label)));
            const binding = ast.text.match(/\benv\.([A-Z][A-Z0-9_]*)/)?.[1];
            const matched = binding ? candidateResources.filter(resource => resource.attributes.binding === binding) : candidateResources;
            if (matched.length === 1) {
              builder.edge(op.id, matched[0]!.id, 'uses-resource', record.operation, ['runtime-flow'], [ev], binding ? 'source' : 'inferred');
              const writes = /insert|update|delete|save|create|put|upload/i.test(callee);
              const reads = /select|find|get|download|read|\.all\b|\.first\b/i.test(callee);
              if (writes || reads) builder.edge(writes ? op.id : matched[0]!.id, writes ? matched[0]!.id : op.id, writes ? 'writes-resource' : 'reads-resource', writes ? '書き込み' : '読み取り', views.data, [ev], 'inferred');
            }
          }
          const ioBinding = localBindings.find(item => item.local === callee && /(?:child_process|fs(?:\/promises)?|subprocess|os\.exec)/.test(item.specifier));
          if (ioBinding || /^(?:fs\.|os\.exec|subprocess\.)/.test(callee) || /^(?:postMessage|sendMessage)$/.test(leaf(callee))) {
            record.operation = /spawn|exec|fork|run/.test(callee) ? 'process' : /Message/.test(callee) ? 'message' : 'filesystem';
            op.attributes.operation = record.operation; builder.edge(owner.node.id, op.id, 'executes', record.operation, ['runtime-flow'], [ev]);
          }
        }
        if (ast.type === 'jsx_attribute') {
          const name = ast.namedChildren[0]?.text ?? ''; if (!/^on[A-Z]/.test(name)) return;
          const ev = evidence(path, ast, `${name}イベントの登録`);
          const entry = builder.node('entry', `${name} · L${ev.line}`, path, ast.startIndex, [ev], 'source', { event: name });
          builder.edge(ownerAt(ast).node.id, entry.id, 'registers-event', name, ['runtime-flow'], [ev]);
          const handler = localFunctions.find(fn => fn.start >= ast.startIndex && fn.end <= ast.endIndex);
          if (handler) { builder.edge(entry.id, handler.node.id, 'handles', 'UI event', ['runtime-flow'], [ev]); handler.node.attributes.entry = true; }
          else entry.attributes.handler = ast.namedChildren.at(-1)?.text.replace(/^[{]|[}]$/g, '') ?? '';
        }
        if (/^(?:return_statement|return_expression)$/.test(ast.type) || /^(?:jump_expression|control_transfer_statement)$/.test(ast.type) && /^return\b/.test(ast.text)) {
          const owner = ownerAt(ast); const ev = evidence(path, ast, '戻り値');
          const value = builder.node('value', 'return', path, ast.startIndex, [ev], 'source', { owner: owner.node.id, returnValue: true });
          assignments.push({ id: value.id, owner: owner.node.id, path, name: 'return', inputs: identifiers(ast), calls: immediateCalls(ast), evidence: ev, ...assignmentScope(ast, owner) });
        }
        if (functionTypes.has(ast.type)) {
          const body = field(ast, 'body');
          const expression = body && !/block|statement|function_body/.test(body.type) ? body : language === 'rust' && body?.type === 'block' && body.lastNamedChild?.type !== 'return_expression' ? body.lastNamedChild : undefined;
          if (expression) {
            const owner = localFunctions.find(fn => fn.start === ast.startIndex && !fn.node.attributes.initializer);
            if (owner) { const ev = evidence(path, expression, '暗黙の戻り値'); const value = builder.node('value', 'return', path, expression.startIndex, [ev], 'source', { owner: owner.node.id, returnValue: true, implicit: true });
              assignments.push({ id: value.id, owner: owner.node.id, path, name: 'return', inputs: identifiers(expression), calls: immediateCalls(expression), evidence: ev, ...assignmentScope(expression, owner) }); }
          }
        }
        if (/^(?:string|string_literal|template_string)$/.test(ast.type) && /^['"`]\/api\//.test(ast.text) && /pathname|path\s*==|url\.path/.test(ast.parent?.text ?? '')) {
          const owner = ownerAt(ast); const address = ast.text.slice(1, -1);
          const entry = builder.node('entry', address, path, ast.startIndex, [evidence(path, ast, 'リクエストパスの条件')], 'source', { endpoint: address, method: 'ANY' });
          builder.edge(entry.id, owner.node.id, 'handles', 'path condition', ['runtime-flow'], entry.evidence, 'inferred'); owner.node.attributes.entry = true;
        }
        if (ast.type === 'regex' && /pathname\.match|path\.match/.test(ast.parent?.parent?.text ?? '')) {
          const address = ast.text.replace(/^\/\^?/, '').replace(/\$?\/[a-z]*$/, '').replaceAll('\\/', '/').replace(/\(\[\^\/\]\+\)/g, ':param');
          if (address.startsWith('/api/') && !/[()[\]{}]/.test(address)) {
            const owner = ownerAt(ast); const entry = builder.node('entry', address, path, ast.startIndex, [evidence(path, ast, 'リクエストパスのパターン')], 'inferred', { endpoint: address, method: 'ANY' });
            builder.edge(entry.id, owner.node.id, 'handles', 'path pattern', ['runtime-flow'], entry.evidence, 'inferred'); owner.node.attributes.entry = true;
          }
        }
      });
      bindings.set(path, localBindings);
      for (const annotation of routeAnnotations) {
        const target = annotation.target; if (!target) continue;
        const prefix = routeAnnotations.find(item => item.className && item.className === target.className);
        const address = `/${prefix?.address ?? ''}/${annotation.address}`.replace(/\/+/g, '/').replace('[controller]', target.className?.replace(/Controller$/, '') ?? '').replace(/\{([^}]+)\}/g, ':$1');
        const ev = annotation.evidence; const entry = builder.node('entry', `${annotation.method} ${address}`, path, ev.start, [ev, ...(prefix ? [prefix.evidence] : [])], 'source', { endpoint: address, method: annotation.method });
        builder.edge(entry.id, target.node.id, 'handles', 'handler', ['runtime-flow'], entry.evidence); target.node.attributes.entry = true;
      }
    } catch (error) {
      coverage.push({ path, language, status: 'skipped', message: error instanceof Error ? error.message : String(error) });
      warnings.push(`${path}: 構文解析を完了できませんでした`);
    } finally { tree?.delete(); parser?.delete(); }
    progress?.(fileIndex + 1, sources.length);
  }
  resolveRelationships(builder, input, functions, calls, assignments, bindings);
  const resultNodes = [...builder.nodes.values()];
  return { nodes: resultNodes, edges: [...builder.edges.values()], coverage, warnings,
    stats: { files: sources.length, functions: functions.filter(fn => !fn.node.attributes.initializer).length,
      models: resultNodes.filter(node => node.kind === 'model').length, unresolved: calls.filter(call => !call.target).length, elapsedMs: Math.round(performance.now() - started) } };
}

function resolveRelationships(builder: SemanticBuilder, input: SemanticInput, functions: FunctionRecord[], calls: CallRecord[], assignments: AssignmentRecord[], bindings: Map<string, ImportBinding[]>) {
  const byId = new Map(functions.map(fn => [fn.node.id, fn]));
  const byName = new Map<string, FunctionRecord[]>();
  for (const fn of functions) { const name = String(fn.node.attributes.name ?? ''); byName.set(name, [...(byName.get(name) ?? []), fn]); }
  const importedFiles = new Map<string, string[]>();
  for (const ref of input.imports) importedFiles.set(ref.from, [...(importedFiles.get(ref.from) ?? []), ref.to]);
  const sourcePaths = Object.keys(input.sources);
  const normalizePath = (value: string) => { const parts: string[] = []; for (const part of value.split('/')) { if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part); } return parts.join('/'); };
  const reachable = (path: string, specifier?: string) => {
    const paths = new Set<string>(); const queue = specifier ? input.imports.filter(item => item.from === path && item.specifier === specifier).map(item => item.to) : importedFiles.get(path) ?? [];
    if (!queue.length && specifier) {
      const language = semanticLanguage(path);
      const directory = path.split('/').slice(0, -1).join('/');
      let modulePath = specifier;
      if (language === 'python') {
        const relative = specifier.match(/^\.+/)?.[0].length ?? 0;
        modulePath = specifier.slice(relative).replaceAll('.', '/');
        if (relative) modulePath = normalizePath(`${directory}/${'../'.repeat(relative - 1)}${modulePath}`);
      } else if (language === 'rust') modulePath = specifier.replace(/^crate::/, 'src/').replace(/^self::/, `${directory}/`).replaceAll('::', '/');
      else if (specifier.startsWith('.')) modulePath = normalizePath(`${directory}/${specifier}`);
      for (const candidate of sourcePaths) {
        const stem = candidate.replace(/\.[^.]+$/, ''); const dir = candidate.split('/').slice(0, -1).join('/');
        if (stem === modulePath || stem.endsWith(`/${modulePath}`) || stem === `${modulePath}/__init__` || stem === `${modulePath}/mod` || language === 'go' && (modulePath.endsWith(`/${dir}`) || dir.endsWith(`/${modulePath.split('/').at(-1)}`))) paths.add(candidate);
      }
    }
    for (const item of queue) paths.add(item);
    // Follow only explicit re-exports; ordinary imports do not export their dependencies.
    for (let i = 0; i < queue.length; i++) for (const ref of input.imports.filter(ref => ref.from === queue[i])) {
      const code = input.sources[ref.from] ?? '';
      if (!code.split('\n').some(line => /^\s*export\b/.test(line) && line.includes(ref.specifier))) continue;
      if (!paths.has(ref.to)) { paths.add(ref.to); queue.push(ref.to); }
    }
    return paths;
  };
  const params = new Map<string, SemanticNode[]>();
  for (const fn of functions) params.set(fn.node.id, fn.parameters.map((name, index) => builder.node('value', name, fn.node.path, fn.start + index, fn.node.evidence, 'source', { owner: fn.node.id, parameter: true, parameterIndex: index, bindings: fn.parameterBindings?.[index] ?? [name] })));
  const assignmentIndex = new Map<string, AssignmentRecord[]>();
  for (const item of assignments) { const key = `${item.owner}:${item.name}`; const group = assignmentIndex.get(key) ?? []; group.push(item); assignmentIndex.set(key, group); }
  assignmentIndex.forEach(items => items.sort((a, b) => b.evidence.start - a.evidence.start));
  for (const assigned of assignments.filter(item => !item.declaration)) {
    const binding = assignmentIndex.get(`${assigned.owner}:${assigned.name}`)?.find(item => item.declaration && item.evidence.start < assigned.evidence.start && item.scopeStart <= assigned.evidence.start && item.scopeEnd >= assigned.evidence.start);
    if (binding) { assigned.scopeStart = binding.scopeStart; assigned.scopeEnd = binding.scopeEnd; }
  }
  const callIndex = new Map(calls.map(call => [`${call.path}:${call.astId}`, call]));
  const valuesFor = (owner: string, name: string, before: number): SemanticNode[] => {
    let scope: string | undefined = owner;
    const reaching: SemanticNode[] = [];
    while (scope) {
      const definitions = assignmentIndex.get(`${scope}:${name}`)?.filter(item => item.evidence.start <= before && item.scopeStart <= before && item.scopeEnd >= before) ?? [];
      for (const assigned of definitions) { reaching.push(builder.nodes.get(assigned.id)!); if (!assigned.conditional) return reaching; }
      const parameter = params.get(scope)?.find(item => item.label === name || Array.isArray(item.attributes.bindings) && item.attributes.bindings.includes(name)); if (parameter) return [...reaching, parameter];
      scope = byId.get(scope)?.parent;
    }
    return reaching;
  };
  for (const call of calls) {
    const owner = byId.get(call.owner)!; const name = leaf(call.callee);
    const memberCall = call.callee.includes('.') || call.callee.includes('::');
    const lexicalShadow = !memberCall && (byName.get(name) ?? []).some(fn => fn.node.path === call.path && fn.parent === owner.node.id);
    const binding = lexicalShadow ? undefined : bindings.get(call.path)?.find(item => item.local === call.callee || call.callee.startsWith(`${item.local}.`) || call.callee.startsWith(`${item.local}::`));
    let candidates = byName.get(binding && !memberCall && binding.original !== '*' && binding.original !== 'default' ? binding.original : name) ?? [];
    let confidence: SemanticConfidence = 'source';
    if (binding) {
      const paths = reachable(call.path, binding.specifier);
      if (binding.original === 'default' && !memberCall) candidates = functions.filter(fn => fn.node.attributes.defaultExport);
      if (!memberCall && !candidates.length) candidates = functions.filter(fn => fn.className === binding.original && /^(constructor|__init__|initialize)$/.test(String(fn.node.attributes.name)));
      if (memberCall && binding.original !== '*') candidates = candidates.filter(fn => fn.className === binding.original || binding.original === 'default');
      candidates = candidates.filter(fn => fn.node.path && paths.has(fn.node.path));
      if (memberCall) confidence = 'inferred';
      if (candidates.some(fn => !input.imports.some(ref => ref.from === call.path && ref.to === fn.node.path))) confidence = 'inferred';
    } else {
      const local = candidates.filter(fn => fn.node.path === call.path && (fn.parent === owner.node.id || fn.parent === owner.parent || fn.node.id === owner.node.id || fn.node.attributes.className && fn.className === owner.className));
      candidates = local.length ? local : candidates.filter(fn => fn.node.path === call.path && fn.parent === functions.find(item => item.node.path === call.path && item.node.attributes.initializer)?.node.id);
      if (call.callee.includes('.') && !/^(?:this|self)\./.test(call.callee)) confidence = 'inferred';
      if (!memberCall) candidates = candidates.filter(fn => !fn.className || fn.className === owner.className);
    }
    if (!call.callee.includes('.') && valuesFor(call.owner, call.callee, call.evidence.start).length) candidates = [];
    let target: SemanticNode;
    if (candidates.length === 1) { target = candidates[0]!.node; call.target = target.id; }
    else {
      target = builder.node('external', call.callee, call.path, 0, [call.evidence], 'unresolved', { candidates: candidates.map(fn => fn.node.id), reason: candidates.length ? '同名候補が複数あります' : '呼び出し先を静的に解決できません', callee: call.callee });
      confidence = 'unresolved';
    }
    builder.edge(call.owner, target.id, 'calls', call.callee, views.call, [call.evidence], confidence);
    if (/^(?:Promise|map|flatMap|forEach|filter|reduce|reduceRight|some|every|find|findIndex|sort|then|catch|finally|setTimeout|setInterval|setImmediate|queueMicrotask)$/.test(name)) for (const callback of call.callbacks) builder.edge(call.owner, callback, 'callback', `${name} callback`, views.call, [call.evidence], 'inferred');
    call.node.attributes.target = target.id;
    call.args.forEach((names, index) => names.flatMap(name => valuesFor(call.owner, name, call.evidence.start)).forEach(value => {
      builder.edge(value.id, call.node.id, 'argument', `argument ${index + 1}`, views.data, [call.evidence], value.attributes.conditional ? 'inferred' : 'source');
      const param = params.get(target.id)?.[index]; if (param) builder.edge(value.id, param.id, 'passes-to', `${value.label} → ${param.label}`, views.data, [call.evidence], value.attributes.conditional && confidence === 'source' ? 'inferred' : confidence);
    }));
    for (const name of call.receiver) for (const value of valuesFor(call.owner, name, call.evidence.start)) builder.edge(value.id, call.node.id, 'receiver', '変換の入力', views.data, [call.evidence]);
    for (const start of call.receiverCalls) { const nested = callIndex.get(`${call.path}:${start}`); if (nested && nested !== call) builder.edge(nested.node.id, call.node.id, 'receiver-result', '処理結果を引き継ぐ', views.data, [call.evidence]); }
    call.argumentCalls.forEach((starts, index) => starts.forEach(start => {
      const nested = callIndex.get(`${call.path}:${start}`); if (!nested || nested === call) return;
      builder.edge(nested.node.id, call.node.id, 'argument-result', `argument ${index + 1}`, views.data, [nested.evidence]);
      const param = params.get(target.id)?.[index]; if (param) builder.edge(nested.node.id, param.id, 'passes-result', `結果 → ${param.label}`, views.data, [call.evidence], confidence);
    }));
  }
  for (const assigned of assignments) {
    const relatedCalls = assigned.calls.flatMap(at => { const call = callIndex.get(`${assigned.path}:${at}`); return call ? [call] : []; });
    for (const name of assigned.inputs) for (const value of valuesFor(assigned.owner, name, assigned.evidence.start - 1)) if (value.id !== assigned.id) {
      builder.edge(value.id, assigned.id, 'transforms', '代入・変換', views.data, [assigned.evidence], value.attributes.conditional || assigned.conditional ? 'inferred' : 'source');
    }
    for (const call of relatedCalls) {
      builder.edge(call.node.id, assigned.id, 'produces', '結果', views.data, [assigned.evidence]);
      if (call.target) for (const returned of assignmentIndex.get(`${call.target}:return`) ?? []) builder.edge(returned.id, assigned.id, 'returns', '戻り値', views.data, [call.evidence]);
    }
  }
  const models = [...builder.nodes.values()].filter(node => node.kind === 'model');
  for (const model of models) {
    const refs = new Set([...(model.attributes.typeReferences as string[] ?? []), ...(model.fields ?? []).flatMap(item => item.target ? [item.target] : item.type.match(/[A-Z][A-Za-z0-9_]*/g) ?? [])]);
    for (const ref of refs) {
      const candidates = models.filter(item => item.id !== model.id && item.label === ref);
      const local = candidates.filter(item => item.path === model.path); const target = local.length === 1 ? local[0] : candidates.length === 1 ? candidates[0] : undefined;
      if (target) builder.edge(model.id, target.id, 'model-reference', '参照', views.model, model.evidence, target.path === model.path ? 'source' : 'inferred');
    }
  }
  for (const call of calls) if (call.operation === 'database') {
    const names = [...call.args.flat(), ...models.filter(model => new RegExp(`(?:^|\\.)${model.label}(?:\\.|::)`, 'i').test(call.callee)).map(model => model.label)];
    for (const model of models.filter(item => names.includes(item.label))) {
      const writes = /insert|update|delete|save|create/i.test(call.callee);
      builder.edge(writes ? call.node.id : model.id, writes ? model.id : call.node.id, writes ? 'writes' : 'reads', writes ? '書き込み' : '読み取り', ['data-flow', 'runtime-flow'], [call.evidence], 'inferred');
    }
  }
  for (const call of calls.filter(call => !call.operation)) {
    const ormModel = models.find(model => model.attributes.orm && new RegExp(`^${model.label}(?:\\.|::)`).test(call.callee));
    if (!ormModel || !/find|where|first|get|create|save|update|delete|all|count|select|insert|remove/i.test(call.callee)) continue;
    call.operation = 'database'; call.node.attributes.operation = 'database';
    builder.edge(call.owner, call.node.id, 'executes', 'ORM operation', ['runtime-flow'], [call.evidence], 'inferred');
    const writes = /create|save|update|delete|insert|remove/i.test(call.callee);
    builder.edge(writes ? call.node.id : ormModel.id, writes ? ormModel.id : call.node.id, writes ? 'writes' : 'reads', writes ? '書き込み' : '読み取り', ['data-flow', 'runtime-flow'], [call.evidence], 'inferred');
  }
  const endpoints = [...builder.nodes.values()].filter(node => node.kind === 'entry' && node.attributes.endpoint);
  for (const request of [...builder.nodes.values()].filter(node => node.kind === 'request')) {
    const normalizeRoute = (value: string) => value.replace(/^https?:\/\/[^/]+/, '').replace(/\$\{[^}]*\}/g, ':param').split('?')[0]!.replace(/:[\w]+/g, ':param').replace(/\/$/, '');
    const address = normalizeRoute(String(request.attributes.endpoint ?? ''));
    const matches = endpoints.filter(entry => normalizeRoute(String(entry.attributes.endpoint)) === address && (entry.attributes.method === request.attributes.method || entry.attributes.method === 'ANY'));
    if (matches.length === 1) builder.edge(request.id, matches[0]!.id, 'http', 'HTTP', ['runtime-flow', 'data-flow'], request.evidence, 'inferred');
  }
  for (const entry of [...builder.nodes.values()].filter(node => node.kind === 'entry' && node.attributes.handler)) {
    const handler = String(entry.attributes.handler);
    const binding = bindings.get(entry.path ?? '')?.find(item => item.local === handler || handler.startsWith(`${item.local}.`));
    const paths = binding ? reachable(entry.path!, binding.specifier) : undefined;
    const name = binding && binding.original !== '*' && !handler.includes('.') ? binding.original : leaf(handler);
    const candidates = functions.filter(fn => fn.node.attributes.name === name && (entry.attributes.handlerClass ? fn.className === entry.attributes.handlerClass : paths ? paths.has(fn.node.path!) : fn.node.path === entry.path));
    if (candidates.length === 1) { builder.edge(entry.id, candidates[0]!.node.id, 'handles', 'handler', ['runtime-flow'], entry.evidence, entry.attributes.handlerClass || binding ? 'inferred' : 'source'); candidates[0]!.node.attributes.entry = true; }
  }
}

function parseSchemaFile(builder: SemanticBuilder, path: string, source: string, language: string) {
  source = source.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\/\*[\s\S]*?\*\/|(?:--|\/\/|#)[^\r\n]*/g, token => /^(?:\/\*|--|\/\/|#)/.test(token) ? token.replace(/[^\r\n]/g, ' ') : token);
  const pattern = language === 'sql' ? /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`[]?([\w.]+)["`\]]?\s*\(([\s\S]*?)\)\s*;/gi : /\b(model|type|input|interface|enum)\s+(\w+)[^{]*\{([^}]*?)\}/g;
  for (const match of source.matchAll(pattern)) {
    const name = language === 'sql' ? match[1]! : match[2]!; const body = language === 'sql' ? match[2]! : match[3]!;
    const line = source.slice(0, match.index).split('\n').length;
    const ev = { path, start: match.index!, end: match.index! + Math.min(match[0].length, 160), line, endLine: line, description: `${name}のSchema定義` };
    const model = builder.node('model', name, path, match.index!, [ev], 'source', { modelKind: language });
    model.fields = body.split(language === 'sql' ? /,(?![^()]*\))/ : /\n/).flatMap(raw => {
      const item = raw.trim().match(/^["`]?([\w]+)["`]?\s*:?\s+([^\n]+)/);
      if (!item || /^(?:CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|@@)/i.test(item[1]!)) return [];
      const target = raw.match(/REFERENCES\s+["`]?([\w]+)/i)?.[1];
      return [{ name: item[1]!, type: item[2]!.trim(), optional: /\?|\bNULL\b/.test(raw) && !/NOT NULL/i.test(raw), ...(/PRIMARY KEY|@id\b/i.test(raw) ? { key: 'primary' as const } : {}), ...(target ? { target, key: 'foreign' as const } : {}) }];
    });
    if (language === 'graphql') model.fields = [...body.matchAll(/\b(\w+)\s*(?:\([^)]*\))?\s*:\s*([\w[\]!]+)/g)].map(field => ({ name: field[1]!, type: field[2]!, optional: !field[2]!.endsWith('!') }));
    if (language === 'sql') for (const foreign of body.matchAll(/FOREIGN\s+KEY\s*\(\s*["`]?([\w]+)["`]?\s*\)\s*REFERENCES\s+["`]?([\w]+)/gi)) {
      const member = model.fields.find(field => field.name.toLowerCase() === foreign[1]!.toLowerCase()); if (member) { member.key = 'foreign'; member.target = foreign[2]!; }
    }
  }
}
