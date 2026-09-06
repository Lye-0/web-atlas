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

Local call resolution prioritizes the nearest lexical declaration, explicit `this`/`self` class context and import bindings. An unknown `obj.method()` receiver stays unresolved even when a local function has the same name. Languages with implicit instance calls may resolve the current class; JavaScript/TypeScript bare calls do not implicitly become `this` calls. Explicit re-exports can be traversed; ordinary imports do not re-export their dependencies. Parameter/local shadowing is preserved. Known callback-taking APIs support both inline and uniquely resolved named callbacks, with inferred `callback` edges rather than direct call edges. Passing a function to an unrecognized API does not establish callback execution.

Data values represent parameters, assignments and returns. Nested call results feed their parent operations, fluent receiver results connect to subsequent operations, and resolved calls connect arguments with parameters and returns with assigned results. Conditional assignments retain alternative preceding definitions with inferred confidence; block-local declarations do not escape their ranges. This is a conservative source-level data relation graph, not SSA, a taint proof, or a guarantee of runtime reachability. Database reads point from model/resource to operation; writes point toward persistence.

## View projections

| View | Main entities and relationships |
| --- | --- |
| Runtime Flow | Entry points, UI events, requests, operations and resources. Registration owner → event entry and entry → handler are distinct source relationships. Only unambiguous serial helper chains are compressed. Branch/merge boundaries on relevant runtime paths remain nodes, preserving all sides of convergence without enumerating every complete path. Compressed edges retain original relation IDs, kinds, confidence and evidence. Configured runtime entry files link runtimes with handlers. Unique HTTP route matches are inferred. |
| Function Call Flow | Function declarations and actual call sites, unresolved/external targets, and inferred callbacks for known callback-taking APIs. |
| Data Flow | Parameters, values, intermediate operations, arguments, return results, serialization/validation and persistence. |
| Data Model | Static model/schema definitions, fields and references, including detected primary/foreign keys. Execution logs do not create schemas. |
| Architecture Map | Responsibility groups, package/subsystem boundaries and aggregated relationships. Classification uses source paths and semantic relationships, with member IDs, file paths and evidence available in detail. It does not reuse Stack Map's technology catalog as its node set. |

## Execution data

The file input accepts JSON or JSON Lines, with a 20 MiB file and 20,000 record limit. Supported shapes include OTLP `resourceSpans` / `resourceLogs`, Jaeger traces with processes/references/logs, Chrome complete events and explicit begin/end scopes, and generic structured spans/logs. Unsupported Chrome phases and missing parent spans are reported. A structured log carrying a span ID remains a log.

Parent/child relationships use recorded IDs. Chrome begin/end scopes use their explicit per-process/thread nesting; complete events are not assigned parents merely because their timestamps overlap. Records without correlation remain separate. OTLP nanosecond and Jaeger/Chrome microsecond durations are converted to milliseconds.

Supplied start/end/event clocks are retained as strings, together with the input format, source filename and known clock unit/origin. OTLP nanosecond strings are never converted to `Number`; millisecond duration is a separate derived value. Jaeger start/log timestamps, Chrome `ts` and explicit end-event `endTs`, and generic supplied timestamp fields remain available in detail. Missing end times or correlations are not synthesized from duration or nearby events.

Source and execution layers can be displayed separately or together. A unique `code.file.path` / function / line correspondence links a span to the source; name-only matching is marked inferred. Sensitive attribute keys are masked. Observed Data Flow requires explicit `data.input.name` and/or `data.output.name` attributes; these create input → span → output relationships. Arbitrary log prose is not converted into data lineage.

## Exploration and rendering

`SemanticAnalyzerPage` routes Views 6–7 to `FlowAnalyzerPage`; Views 8–10 retain the earlier object-list/page renderer. Source analysis and imported execution data remain shared by store identity. Test code and generated definitions are hidden initially and can be included explicitly. Responsibility, kind, confidence, source/observed/combined layer and neighborhood depth/direction change the canonical target collection; query does not.

Views 5–7 share the project/view heading, search control and fixed-height `SearchResultStrip`. Search is literal, case-insensitive AND across whitespace-separated terms with trim and Windows/POSIX slash normalization. Search documents explicitly allow names, definition paths, ownership/group names and registered aliases; meaningful model fields remain supported. Internal IDs, arbitrary metadata, confidence flags and layout values are excluded. Ranking is exact name, name prefix, name substring, then path/group/field matches. Results expose match reasons and complete identifying paths in title/detail. The horizontal virtual row represents every match; its width and `aria-setsize` reflect the full result set. Card width is capped at 256px and shrinks to the measured row width minus two 4px focus gutters. Virtual stride, track width and focus reveal all use that same geometry. Home/End and arrow navigation can mount/focus any result, and focus scrolls only the strip. Resize keeps the focused candidate mounted and fully reveals it after the new track width commits. Scrolling retains a keyboard entry among visible results. Composition events cannot implicitly select a candidate.

Query produces result IDs and highlights while retaining the same graph object, node positions, camera and explicit selection. Choosing a result expands its presentation group and requests focus. Clearing query leaves selection and camera intact. Counts distinguish canonical projection size, filtered objects, display nodes (which may be groups), and direct search matches. A filter-hidden selection keeps its detail with an explanation and restore action; a selection absent from the current source/execution projection is invalidated. New project stores reset selection, execution data and cameras.

The explicit filter-reset action replaces semantic options with their initial values, including clearing cross-View `members` context and disabling auxiliary/test/generated definitions. It does not merge a partial default into the previous filter object or write query, selection or camera state. A selected auxiliary object that becomes hidden retains its detail and the existing filter-hidden explanation.

Runtime model details retain fields, key/optional/type annotations and unresolved field spreads. Each selected object offers the other semantic Views as context links. `semanticNavigationContext` resolves a target through canonical ID, owner or explicit members; multiple owned values open the entire owner-scoped collection. An unrelated unique name is not enough to select a target, so unproven correspondence opens a definition-path search with no selected detail. Data Model navigation always uses the source layer; other targets inherit the current layer. Explicit context navigation frames the destination context and preserves its display-mode preference. Views 8–10 keep their existing return links, which can resolve the same canonical identity or owner when returning to Runtime/Function Call.

Views 6–7 use the Module Dependency detail proportions and disclosures. Relations are separated into outgoing, incoming and self, then grouped by canonical counterpart ID. Long counterpart and parallel-relation lists initially show six items and can be expanded completely. Each relation retains its own selection, kind, confidence and provenance. Node basic information, evidence, metadata and related Views start collapsed; model fields remain visible. Edge endpoints, relation information and evidence start open. Disclosures defer their content without removing any evidence ranges or cross-View destinations.

For Views 6–7, classification 2D uses SCC/dependency depth with stable source/group lanes. Large collections may collapse into presentation groups; singleton groups stay direct nodes and result selection expands the required group. The adapter preserves every canonical edge ID and evidence while mapping only displayed endpoints. The generic summary utility groups by direction, relation kind and confidence, retaining all members, original relations and unique evidence ranges. Parallel and self relations remain distinct. Curve spread is bounded for high multiplicity, and Fit includes the curves actually rendered. Full evidence ranges use their matching start/end lines; long excerpts can be expanded in the ordinary detail panel.

List 3D uses every filtered canonical node as a point in stable SCC depth planes. It does not require group selection, duplicate the 2D cards, or continuously run a force layout. Screen-facing labels prioritize selection, matches and near/important context with overlap rejection. Lines and particles focus on the selected canonical neighborhood. Both modes use the Module Dependency palette: outgoing blue `#82c6e2`, incoming amber `#dfb785`, internal `#afcbbd`, always relative to source/target rather than screen position. Static arrows and source → relation → target detail remain when particles are off. Normal/reduced/off control, reduced-motion defaults, page/viewport visibility, and disposal on mode change/unmount limit animation. Particles explain a relation direction; they are not proof of an observed execution order.

Both stages share Module Dependency's dark green background without a grid. In 2D, visible lines, arrows and particles are painted above node cards; transparent edge hit targets remain below cards so crossing lines do not intercept node selection. In 3D, label projection refreshes the camera world matrix before using it, since OrbitControls changes orientation before the WebGL renderer refreshes that matrix. Existing DOM labels receive CSS-pixel transforms in the same frame; React updates only label membership and content. Late-mounted labels use the latest position, and culled labels immediately leave display, pointer and keyboard interaction. Layer suspension ignores late frames and supports effect cleanup/remount.

`AnalyzerViewSession.flowCameras` stores an affine 2D camera and an orthographic 3D position/target/zoom separately per View. Initial 2D Fit waits for the measured viewport. Mode returns restore compatible saved cameras; resize preserves the current world center rather than triggering Fit. Legacy Orbit camera state is migrated only to 3D. Fit frames the current displayed targets/curves, selection focus is a separate command, and neither imposes a minimum scale that crops the content. 3D initialization failure or context loss returns to functional SVG 2D with semantic state intact. Escape on a normal focused 2D/3D canvas clears selection; the ancestor fullscreen handler handles the first Escape to leave fullscreen while retaining selection. The 3D canvas handler ignores composition/input events and is removed on disposal. Fullscreen preserves selection and restores page focus/scroll on exit.

Views 8–10 continue using `SemanticGraphCanvas` with its combined billboard-card texture mesh and batched edge geometry, searchable object list and 240-object rendering pages. Views 8–9 retain optional OrbitControls; Architecture stays in 2D. Cross-View actions use stable IDs or ownership and otherwise open a search. These existing pages are not converted to the new exploration surface by the Views 6–7 changes.

## Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build`. Real-WASM tests cover language declarations/calls, model fields, import aliases, nearest lexical/class resolution, unknown receiver counterexamples, named callbacks, registration ownership, nested/fluent calls, branch/merge preservation, full Schema ranges and routes. Projection/trace tests cover exact supplied clocks, recorded parent correlation, durations, explicit data lineage, View separation, complete summary provenance, cycle depth and evidence immutability. Search tests cover explicit fields/ranking/normalization and 10,000-result virtual navigation. Page tests cover query/camera independence, separate mode cameras, source/target evidence navigation, hidden selection, trace reset and retry.

To opt into read-only repository validation, set `WEB_ATLAS_VALIDATION_REPOS` to semicolon-separated absolute repository paths before running tests. The reader skips symlinks and excluded directories and does not run target code or write to those repositories. `WEB_ATLAS_VALIDATION_SNAPSHOT=1` additionally writes masked store/analysis snapshots only to this project's ignored `.cache/semantic-validation` directory for browser verification. These snapshots are temporary and are not shipped.

Browser verification must separately cover Worker/WASM loading, all five projections, detail navigation, 2D/3D interactions, fullscreen, responsive layout and the execution-data file chooser. Node parser tests alone do not establish browser compatibility.
