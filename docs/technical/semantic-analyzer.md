# Analyzer View 6–10

## Data path

`scanProjectFiles` collects supported sources alongside the existing configuration and module facts. `AnalyzerProjectStore.semanticSources` contains a syntax-preserving mask of sensitive literal values; `sources` retains the existing masking contract for Views 1–5. File and line offsets are preserved. Neither source collection is persisted across browser reloads or uploaded.

Opening a semantic View starts `semantic/semantic.worker.ts` through `semantic/client.ts`. Analysis is cached by project-store identity, shared between the five Views, and reports file progress. The user can cancel or retry. Selecting or rescanning a project creates a new store and resets View state and imported execution data. Parser trees are deleted after each file, and the Worker terminates when analysis finishes. Parser runtimes and grammars are bundled as same-origin WASM assets; only grammars required by the selected sources are loaded.

`semantic/analyze.ts` produces a separate `SemanticAnalysis`, preserving the existing `AnalyzerFact` model and projectors. The new page calls `projectSemanticView`; sending a semantic View to the older synchronous `projectAnalyzerView` is an error rather than a fallback to an unrelated View.

## Language and framework coverage

The browser uses Tree-sitter grammars for TypeScript, TSX/JSX, JavaScript, Python, Java, C#, Go, Rust, Ruby, PHP, C, C++, Swift, Kotlin, Scala and Dart. Kotlin and Scala use an isolated legacy parser ABI; all other grammars use the current parser runtime. Vue and Svelte retain original offsets while parsing their script blocks; template analysis is reported as partial. SQL, Prisma and GraphQL use focused schema parsers, with comments excluded before extracting definitions.

Framework handling is syntax-based, not dependent on running or installing the target project:

| Surface | Recognized forms |
| --- | --- |
| UI and events | React JSX event attributes, DOM `addEventListener`, extension `registerCommand` / `onDidReceiveMessage`, named runtime callbacks and event registrations |
| JavaScript/TypeScript servers | Express/Hono-style HTTP method registrations, Next App Router and Pages API exports, SvelteKit server exports, Nest-style Controller and method decorators, Worker `fetch` / `scheduled` / `queue` |
| Python | FastAPI/Flask decorators, Django `path` / `re_path` and imported handlers |
| JVM / .NET | Spring mapping annotations, ASP.NET route attributes and minimal API method registrations; controller prefixes are composed with method paths |
| Go / Rust / Ruby / PHP | net/http and Gin-style registrations, route/get/to forms, Ruby route DSL and controller references, Laravel-style `Route` registrations |
| Data definitions | Interfaces, type aliases, classes, structs, records and fields; Zod objects, Drizzle tables/views, Mongoose schemas/models, Sequelize definitions, model inheritance, Prisma/SQL/GraphQL schemas |
| Operations | HTTP requests, recognizable database/storage/auth calls, native process/filesystem calls and message operations |

This is a cross-language structural analysis, not a complete compiler or framework runtime. Language grammar errors and unsupported template regions appear in per-file coverage. Framework factories, computed configuration, unrecognized route mounting, indirect dispatch, overloaded methods, reflection, macro expansion, complex import resolution and heap aliases can remain unresolved. Paths inferred from file routing, route patterns, service bindings or naming retain their confidence and evidence.

## Semantic contracts

Nodes identify functions, entries, requests, operations, values, models, resources, subsystems, external targets, spans and logs. IDs include source path, source range and symbol identity; they remain stable for an unchanged scan. Different calls in a fluent expression are identified by their complete AST ranges, including calls with the same start offset. Relationships retain source/target IDs and exact evidence ranges. Selection does not alter these relationships.

Confidence is explicit:

- `source`: a declaration or relation directly supported by source syntax.
- `inferred`: a possible correspondence, callback contract, branch-dependent value, or responsibility classification.
- `observed`: a record or explicit relationship in imported execution data.
- `unresolved`: a call target that cannot be uniquely resolved within available source and bindings.

Local call resolution uses lexical ownership, class context and import bindings; it does not choose an arbitrary function with the same name. Explicit re-exports can be traversed; ordinary imports do not re-export their dependencies. Parameter/local shadowing is preserved. Calls to external libraries and dynamic methods remain visible when their implementations cannot be resolved.

Data values represent parameters, assignments and returns. Nested call results feed their parent operations, fluent receiver results connect to subsequent operations, and resolved calls connect arguments with parameters and returns with assigned results. Conditional assignments retain alternative preceding definitions with inferred confidence; block-local declarations do not escape their ranges. This is a conservative source-level data relation graph, not SSA, a taint proof, or a guarantee of runtime reachability. Database reads point from model/resource to operation; writes point toward persistence.

## View projections

| View | Main entities and relationships |
| --- | --- |
| Runtime Flow | Entry points, UI events, requests, operations and resources. Intermediate helper call chains are compressed while retaining the chain's evidence. Configured runtime entry files link runtimes with handlers. Unique HTTP route matches are inferred. |
| Function Call Flow | Function declarations and actual call sites, unresolved/external targets, and inferred callbacks for known callback-taking APIs. |
| Data Flow | Parameters, values, intermediate operations, arguments, return results, serialization/validation and persistence. |
| Data Model | Static model/schema definitions, fields and references, including detected primary/foreign keys. Execution logs do not create schemas. |
| Architecture Map | Responsibility groups, package/subsystem boundaries and aggregated relationships. Classification uses source paths and semantic relationships, with member IDs, file paths and evidence available in detail. It does not reuse Stack Map's technology catalog as its node set. |

## Execution data

The file input accepts JSON or JSON Lines, with a 20 MiB file and 20,000 record limit. Supported shapes include OTLP `resourceSpans` / `resourceLogs`, Jaeger traces with processes/references/logs, Chrome complete events and explicit begin/end scopes, and generic structured spans/logs. Unsupported Chrome phases and missing parent spans are reported. A structured log carrying a span ID remains a log.

Parent/child relationships use recorded IDs. Chrome begin/end scopes use their explicit per-process/thread nesting; complete events are not assigned parents merely because their timestamps overlap. Records without correlation remain separate. OTLP nanosecond and Jaeger/Chrome microsecond durations are converted to milliseconds.

Source and execution layers can be displayed separately or together. A unique `code.file.path` / function / line correspondence links a span to the source; name-only matching is marked inferred. Sensitive attribute keys are masked. Observed Data Flow requires explicit `data.input.name` and/or `data.output.name` attributes; these create input → span → output relationships. Arbitrary log prose is not converted into data lineage.

## Exploration and rendering

`SemanticAnalyzerPage` keeps search, responsibility/kind/confidence/layer filters, selection, neighborhood direction/depth, grouping and camera state per View. Test code and generated definitions are hidden initially and can be included explicitly. Counts distinguish matching objects from the full projection. Large graphs use summaries with every original member ID, then drill-down or searchable lists; rendering pages hold at most 240 objects and all pages remain reachable. Relationship details navigate to either endpoint and expose evidence. Cross-View actions use stable IDs, ownership or a unique name correspondence and otherwise open a search.

`SemanticGraphCanvas` uses a combined billboard-card texture mesh and batched edge geometry. Labels have a distance threshold, and arrows are positioned against camera-facing card bounds. Camera movement uses demand rendering, without rebuilding source graphs or per-frame React updates. GPU resources and controls are disposed on replacement/unmount. The accessible DOM object list and detail controls remain available if WebGL fails.

The default camera is 2D orthographic. Views 7–9 optionally enable OrbitControls; graph strongly connected components share a depth, and the condensed dependency graph determines successive depth planes. Cycles retain their relationships and self-calls have a visible loop. Runtime and Architecture stay in 2D. Fit, selection focus, zoom/pan, fullscreen and View-specific camera restoration operate on the current visible graph. Fullscreen preserves selection and restores page focus/scroll on exit.

## Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build`. Real-WASM tests cover language declarations/calls, model fields, import aliases, nested and fluent calls, scope/branch behavior, routes and schema references. Projection/trace tests cover parent correlation, durations, explicit data lineage, View separation, summary membership, cycle depth and evidence immutability. Page tests cover View state, source/target evidence navigation, trace reset and retry.

To opt into read-only repository validation, set `WEB_ATLAS_VALIDATION_REPOS` to semicolon-separated absolute repository paths before running tests. The reader skips symlinks and excluded directories and does not run target code or write to those repositories. `WEB_ATLAS_VALIDATION_SNAPSHOT=1` additionally writes masked store/analysis snapshots only to this project's ignored `.cache/semantic-validation` directory for browser verification. These snapshots are temporary and are not shipped.

Browser verification must separately cover Worker/WASM loading, all five projections, detail navigation, 2D/3D interactions, fullscreen, responsive layout and the execution-data file chooser. Node parser tests alone do not establish browser compatibility.
