# Data Flow / Data Model (Views 8–9)

## Purpose and common explorer

Data Flow follows a selected value through a source occurrence, property access, actual argument, operation, return and consumer. Data Model reads code types, validation definitions and persistence declarations as distinct domains. Their stable registry IDs remain `data-flow` and `data-model`.

Views 6–9 share `FlowAnalyzerPage`, `SearchResultStrip`, `useSemanticExplorerNavigation`, `SemanticFlowStage`, the existing 2D and 3D renderers, direction palette, particle preference, bounds preference and input-owned hover lifecycle. Architecture Map remains on the legacy page. No Dictionary, header/footer or Cloudflare redesign is involved.

The fixed-height single-row search searches explicit names, paths, ownership and fields. Typing only produces candidates/highlights; selecting a candidate performs a semantic jump. Clearing the query preserves selection and camera. Separate View sessions preserve queries and filters. The 2D explorer displays direct ownership children: project → directory → file → function/file-level processing → value/operation for View 8, and project → directory → file → model for View 9. Function scopes derive from recorded owner IDs, not graph reachability. Model fields remain in structural detail, rather than permanent individual points in the 3D overview.

Normal mode switches restore each mode's saved location/camera. Explicit cross-mode or cross-View jumps prioritize the supplied canonical ID. Browser history stores meaningful visits, not camera gestures. Model field selection is optional session/visit state. Definition and centre changes remain explicit actions; selecting a neighbour does not rebuild the centre. Model/data relationship colours remain source/target based, while the legend describes data origin/use or structural reference/derivation, respectively.

## Parsing and isolation

The existing Tree-sitter pass and multi-language framework resolver remain the source of Views 6–7. Data-specific TypeScript/JavaScript refinement runs after that pass through:

- `dataCompiler.ts`: a closed in-memory TypeScript compiler host, using the already installed TypeScript dependency. It parses supplied source and resolves supplied module facts or explicit relative files. It never reads the filesystem, imports project configuration, resolves external package contents, or executes target code.
- `dataModels.ts`: direct structural members, lexical/import-bound model references and bounded type expansion.
- `dataSchemas.ts`: import-grounded static validation/ORM factories and declaration-level constraints.
- `dataSchemaFiles.ts`: focused SQL/Prisma/GraphQL metadata, provenance and historical schema-file boundaries.
- `dataFlow.ts`: source occurrences, operation inputs, assignment versions and bounded call-context paths.

The compiler is bundled into the existing semantic Worker. Parser/Worker lifetime, cancellation and store-identity caching remain shared. New analysis runs on source replacement, not query, selection or bounds changes. TypeScript adds to Worker download/initialization cost; production Worker execution was separately smoke-tested in a browser, rather than inferred from Node tests. Runtime/Function Call existing node identity, attributes, Evidence and edges were independently compared on both reference inputs.

The input is the existing syntax-preserving sensitive-literal mask. Expressions and Evidence are local source-derived data. No source, evidence or trace is sent to an external service. Source and parsed semantic output are not browser-persisted across reloads. Review snapshots stay in ignored local cache.

## Additive contracts and conservation

`SemanticNode.model`, `.data` and `.links`, `SemanticField` additions, and `SemanticEdge.details` are optional. The existing required fields remain compatible. Corrected data/model relations change only the relevant View memberships. Existing shared Runtime and Function Call edge memberships, IDs, endpoints, labels and Evidence remain intact. The pre-existing model node identity and attributes/Evidence are preserved for those views; richer structural metadata is additive. `SemanticAnalysis.flowFieldsByNode` snapshots the pre-refinement model fields; only Views 6–7 project those fields into their accepted detail presentation. Views 8–9 and the canonical refined models retain corrected types, null/default/constraint metadata and field Evidence. The snapshot is a compatibility boundary, not a second Data Model interpretation.

Data Flow operations and values use source path, complete range and semantic role in their IDs. Repeated arguments also include their call and index. A bound call has its own contextual formal/return IDs. Original definition occurrences remain accessible. A display summary has its own ID and explicit source members/edge IDs, and does not replace or merge canonical source definitions by name.

Object/field accesses retain an object identity and a property path. Fields and constraints have stable IDs and source Evidence. An incorporated shared field carries both the original member definition and the concrete spread-use range. Inherited/aliased fields retain their original defining model. Cross-View links carry exact destination ID, optional field ID, reason and Evidence; reverse use candidates include line and column, so same-line uses can be distinguished before selecting them.

Confidence and expansion are independent. A model definition may be source-confirmed while its structure is unexpanded. A field definition can be known while its named reference is unresolved. Explicit empty structures are distinguished from failed, partial and unexpanded definitions. Malformed definitions receive a failed expansion state; file coverage remains separately visible.

## Data Flow relation mapping

| Internal kind | Direction and meaning |
| --- | --- |
| `origin` | Reaching assignment/property write → a particular read occurrence; alternatives are inferred |
| `assign` | Evaluated input/result → declaration or reassignment; preserves occurrence |
| `property-read` | Object/collection value → explicit property/index read or destructuring access |
| `property-write` | Evaluated input → the selected object's property write |
| `property-access` | Object → computed-key access; key identity remains unresolved |
| `transform` | Operand → arithmetic/expression, array/object construction, or contextual processing summary |
| `argument` | Direct argument expression result → actual slot → receiving operation |
| `passes-to` | One call's actual slot → that call's contextual formal parameter |
| `parameter-default` | Default expression → formal, only when the argument is omitted in an expanded context |
| `receiver`, `receiver-result` | Receiver value/previous call result → next operation |
| `produces` | Operation expression → that call's result boundary; this is not a claim of identity with every input |
| `returns` | Return expression → return site → contextual call result |
| `validated-by` | Import/symbol-resolved validation method invocation → schema; declaration of a schema alone does not create this use |

A copy and arithmetic operation are different. Arrays and object literals are construction operations: an element passed inside an array is not presented as the direct actual argument. Fluent calls retain the previous call result or containing array as the next receiver. Bare `return;` is a termination operation and has no invented concrete return value. Condition reads are not return values.

Sequential variable assignments retain distinct versions. Conditional merges are possible paths, not observed branches. Explicit property writes followed by reads in the same analysed scope retain their write origin; objects with different binding identity do not connect just because their field spelling matches. Local lexical closures can retain captured source bindings; complex call-time heap aliasing, arbitrary mutation across function boundaries, reflection, computed keys and framework-wide propagation are not completely resolved.

Known local/imported functions map actual slots to formal parameters and return results per call site. Small return-relevant definition slices are instantiated separately for each call. Larger slices (over 12 nodes) and deeper nested contexts use one explicit contextual processing summary and return boundary. The summary retains original source member/edge IDs and every return-site Evidence, and marks possible input-to-return dependencies as inferred. This prevents unbounded body cloning and preserves a route to the complete definition paths. Recursion and deeper expansion have explicit limits/reasons. Contextual summaries are static possibilities, not exact dynamic executions.

Rest inputs retain argument indices and element membership; defaults and simple destructuring are represented. This is not complete element-level alias/heap analysis. An unresolved external callee ends at the recorded call/result boundary with a reason. Names such as `save`, `database` or `load` alone no longer create View 8 DB/HTTP destinations. Existing independent Runtime heuristics are not silently redefined by this correction.

## Model representation and expansion

| Kind | Detail and minimum scope |
| --- | --- |
| Interface / object type | Direct explicit properties, original type expression, optional/null/undefined/array/readonly flags and Evidence |
| Literal union / enum | Named/literal choices and candidate Evidence; no empty Fields table |
| Object union | Separate candidate structures, never one unconditional merged record |
| Class | Explicit properties including constructor parameter properties; access/static/readonly; method signatures and source |
| Alias | Source-bound aliases of simple objects/literals/references expand; inherited field provenance survives |
| Derived operator | Full expression, resolved source references and expansion state; unsupported operators are unexpanded with reasons |

Type operators such as `Extract<...>['detail']`, generic conditionals, mapped/intersection operators and arbitrary instantiated generics are not completely evaluated. Their intermediate predicate properties are never copied into the final field list. Simple aliases, references and literal choices are supported, rather than universally marked unexpanded. Expansion uses visited tracking and a depth limit of 16. Cycles retain references and explain unexpanded structures.

`field-type` points from the consuming model to the field's referenced model and includes the field ID/reason. `extends` and `implements` point toward the base/contract. `derived-from` retains the type/schema expression. `union-member` is only for a direct model alternative, not every reference nested inside a union candidate. Type/reference resolution is lexical/import-bound; there is no global unique-name fallback for TypeScript models.

## Validation, ORM and schema-file scope

The actual vehicle-management reference uses `drizzle-orm ^0.45.2` / SQLite core. Its 21 table declarations include `text`, `integer`, `real`, `notNull`, defaults, shared timestamp spreads, column references/cascade, composite primary keys and multi-column unique indexes. These are explicit supported forms. Tables, their constraints and historical SQL migrations remain separate source definitions; the application does not claim that any declaration has been applied to a live DB.

| Format | Supported static scope / boundary |
| --- | --- |
| Drizzle tables/views | Import-grounded factories, direct/local-spread columns, basic column builders/modifiers/default expressions, FK targets/columns, compound PK/FK, unique/index declarations |
| Drizzle `relations` | Explicit source/target declarations represented as `orm-relation`, separately from DB foreign keys; no extra cardinality/cascade guarantee |
| Zod | Import-grounded `object`, basic type expressions, optional/nullable/nullish/default and basic constraint calls; resolved `.parse`/`.safeParse` family use is distinct from definition |
| Zod complex processing | `transform`, `preprocess`, `pipe`, refinements or unsupported shapes retain the expression and partial/unexpanded reason; input/output identity is not assumed |
| Mongoose | Import-grounded `Schema` and `model`, explicit object fields/type/required/default/basic constraints and explicit model→schema derivation; hooks/plugins/dynamic additions are outside static expansion |
| Sequelize | Import-grounded `define` on a known imported constructor instance, explicit fields/type/allowNull/defaultValue/primary/unique; no live DB or dynamic model discovery |
| SQL | Individual CREATE TABLE declarations, columns and explicit defaults/PK/FK/compound FK/unique/check, source ranges; targets resolve within the same declaration file |
| SQL ALTER | Explicit partial-coverage explanation; historical alterations are not merged into a supposed current DB schema |
| Prisma | Existing basic model fields and same-file references; explicit PK/unique and relation declarations; no live DB or relation-mode assumption |
| GraphQL | Existing direct type fields and basic enum choices; type modifiers remain source expressions |
| Other language grammars | Existing structural parser coverage remains; no claim of full type checking or framework evaluation |

No validation library was present in the two real-input dependency inventories. Zod, ORM relation-only, Mongoose, Sequelize, Prisma and GraphQL scope is therefore exercised with source-only fixtures. Their absence from actual inputs is separate from support capability. Same-name code types, validation schemas and storage definitions retain separate IDs and receive a link only with explicit correspondence.

## Imported execution data

The shared reader still accepts OTLP, Jaeger, Chrome Trace and legacy structured JSON/JSONL. View 8 uses the parent-owned `importDataExecutionTrace` validator and `adaptDataExecutionTrace` projection. An optional `version: 1` structured envelope is an explicit new contract; unsupported versions, malformed references and unsupported root relationship arrays are rejected. This is validation of supported forms, not a claim of exhaustive format compliance.

Raw imported traces remain in the shared cache so the existing Views 6–7 retain their accepted mapping. Only View 8's projection drops inherited source-confirmation Evidence and source mapping. A recorded `code.source.sha256` is provenance, not proof of a match: the present adapter does not compare it with a current source fingerprint, and displays that correspondence as unverified. Missing or stale fingerprints never turn into confirmed View 8 source identity.

Only recorded `data.input.name` / `data.output.name` creates observed input/output-name nodes attached to its own span. These are names, not actual variable/field values. The adapter does not retain actual values or invent inter-event causal links. Unknown parent spans are warned about; `FOLLOWS_FROM` is not promoted into data causality. Data Model has no functional observed-value/trace layer because the supported payloads do not supply meaningful model-comparison samples; it exposes the non-applicability explanation instead of a decorative importer.

File imports and rescans use request, store, View and folder ownership guards. A delayed result or error after a replacement, newer request or View change cannot replace the active source analysis, selection, trace or error state.

## Verification ownership

Implementation tests cover source refinement, explicit field/array paths, validation shadow counterexamples, expansion failure/cycles, same-line use labels, field-link round trips and stale asynchronous completion. The independently owned `tabs89IndependentAccuracy.test.ts`, `tabs89TraceAccuracy.test.ts`, and opt-in `tabs89ActualSourceReview.test.ts` preserve source-first expectations. Existing Runtime/Function Call projections are compared to the frozen baseline on the same read-only inputs by the parent harness. Browser review uses independently frozen source checkpoints; old checkpoint PASS is not treated as final PASS.

Run current `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and the existing local deployment dry-run where permitted. Actual input manifests, full acceptance statuses, timings, findings and rechecks are recorded in `.cache/tabs-8-9-refactor-20260908/`; this document describes the implementation contract and limits, not a substitute for those release gates.
