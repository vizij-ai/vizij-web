# Subgraph / Function Nodes: User-Definable Many-to-Many Blocks

Last updated: 2026-07-30
Owner: Vizij Graph / Authoring
Status: draft design document (current-state + target-state)
Scope: `vizij-rs/crates/node-graph/*` primarily; `@vizij/node-graph-authoring`, `@vizij/node-graph-react`, `apps/demo-graph-studio` secondarily
Companion doc: `multi-output-ports-authoring-plan-2026-07-30.md`

## 1) Goal

Let a graph author define a reusable block that takes several inputs and produces several named outputs, without adding a Rust variant for each one.

This is the feature people usually mean by "make the low-level building block many-to-many." The arity is not the blocker — the core is already many-in / many-out (see companion doc section 3.1). The blocker is that the vocabulary is closed.

## 2) Verification Basis

Same caveat as the companion doc: the `vizij-rs` checkout consulted is behind the published `@vizij/node-graph@0.7.0` that this repo builds against, so Rust line references are indicative. The structural facts this design turns on — closed `NodeType` enum, receiverless schema export, flat node-id addressing, node-keyed runtime state — are all visible in the wasm surface that 0.7.0 exposes and are cross-checked against the TypeScript shim in `packages/@vizij/node-graph-authoring/src/metadata-shim.d.ts`.

**This document specifies work that lands mostly in `vizij-rs`.** It lives here because the authoring compiler is the primary consumer and because the metadata contract it breaks is consumed from this package.

## 3) Current State: What Blocks It

### 3.1 The node vocabulary is a closed Rust enum

`NodeType` in `vizij-graph-core/src/types.rs` is a fixed enum with ~50 variants, matched exhaustively in `eval_node`. Adding a node means editing Rust, rebuilding wasm, and republishing `@vizij/node-graph`. There is no mechanism — none — for defining a node from TypeScript, from a spec file, or at runtime.

### 3.2 The schema registry is a receiverless global

```rust
#[wasm_bindgen]
pub fn get_node_schemas_json() -> String {
    let reg = vizij_graph_core::registry();
    ...
}
```

No graph handle, no instance. The TypeScript shim mirrors this: `getNodeRegistry()`, `requireNodeSignature(typeId)`, `listNodeTypeIds()` — all global lookups by type id. `expressionFunctions.ts` builds its entire function table from this at module scope.

Any design where node signatures depend on the loaded graph breaks this contract. That is the single largest ripple in this document, and it is worth stating up front rather than discovering during implementation.

### 3.3 Node identity is flat and global

- `set_param(node_id, key, json)` addresses nodes by bare id.
- `GraphRuntime.outputs: HashMap<NodeId, HashMap<String, PortValue>>` is a flat map.
- `GraphRuntime.node_states: HashMap<NodeId, NodeRuntimeState>` holds spring/damp/slew accumulators, keyed by node id and retained across evaluations via `node_states.retain(...)` in `evaluate_all`.

Two instances of the same reusable block therefore cannot share inner node ids without sharing — and corrupting — each other's transition state.

### 3.4 There is no grouping or macro concept anywhere

Confirmed by search across `vizij-rs/crates` and `vizij-web`: no subgraph, macro, group, or graph-reference node type exists in any form.

### 3.5 Two more facts that shape the design

`evaluate_all` looks up each node with `spec.nodes.iter().find(|n| n.id == id)` inside the topo loop — O(n²) in node count, every frame.

`eval_all` serializes **every** node's **every** port to JSON on **every** frame, and passes the whole payload across the wasm boundary. Node count is not free at either end.

Both matter because the leading implementation option multiplies node count.

## 4) Design

### 4.1 Spec surface: a function table

Extend `GraphSpec` with a named function table. This is the contract; the evaluator behind it is swappable.

```jsonc
{
  "functions": {
    "polar_to_cart": {
      "inputs": [
        { "id": "r", "ty": "Float" },
        { "id": "theta", "ty": "Float" },
      ],
      "outputs": [
        { "id": "x", "ty": "Float" },
        { "id": "y", "ty": "Float" },
      ],
      "body": {
        "nodes": [
          {
            "id": "cos",
            "type": "cos",
            "inputs": { "in": { "node_id": "$in.theta" } },
          },
          {
            "id": "x",
            "type": "multiply",
            "inputs": {
              "operand_1": { "node_id": "$in.r" },
              "operand_2": { "node_id": "cos" },
            },
          },
          // ...
        ],
        // `output` is optional and defaults to the inner node's default port.
        "returns": {
          "x": { "node_id": "x" },
          "y": { "node_id": "y", "output": "out" },
        },
      },
    },
  },
  "nodes": [
    {
      "id": "p1",
      "type": "call",
      "params": { "function": "polar_to_cart" },
      "inputs": {
        "r": { "node_id": "radius" },
        "theta": { "node_id": "angle" },
      },
    },
  ],
}
```

Design commitments:

- **One new `NodeType` variant: `Call`.** The enum stays closed; it gains exactly one variant, and that variant is the extension point. This is the whole trick.
- Inner references to `$in.<port>` bind to the call site's inputs. `returns` maps each declared output port to an inner **port ref** — `{ node_id, output? }`, where an absent `output` means the inner node's default port. This does **not** depend on the companion doc: `output_key` already exists in the wire format today, and without it a function wrapping a `split` could not expose `part2`, which is exactly the many-to-many case this feature is for.
- `functions` is a sibling of `nodes`, not nested inside a node, so a definition can be reused by many call sites and serialized once.
- Function definitions may reference other functions. Recursion is rejected at load (section 4.5).

### 4.2 Evaluation: inline at load, not nested at runtime

Two options were considered.

**Option A — inline expansion at load.** `load_graph` expands every `call` node into a copy of the function body with namespaced ids (`p1/cos`, `p1/x`), rewriting `$in.*` references to the call site's actual sources and rewriting each consumer of `p1` to the port ref that `returns` designates. Note that the rewrite target is a `(node_id, output_key)` **pair**, not a node: a consumer reading `{ node_id: "p1", output_key: "y" }` where `returns.y` is `{ node_id: "s", output: "part2" }` becomes `{ node_id: "p1/s", output_key: "part2" }`. Consumers that name no `output_key` resolve against the function's sole non-optional declared output, mirroring the defaulting rule in companion doc section 5.3. The runtime, `topo_order`, `eval_node`, and the wasm surface are untouched.

**Option B — nested runtime.** `Call` evaluates a child `GraphRuntime` recursively.

**Recommendation: Option A for v1.**

|                        | Option A (inline)                        | Option B (nested)                                        |
| ---------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Core evaluator changes | none                                     | recursive eval, child state ownership, error propagation |
| `topo_order` changes   | none                                     | must handle nesting                                      |
| Transition state       | works via id namespacing                 | needs per-instance child state trees                     |
| Debuggability          | inner nodes visible in `eval_all` output | inner nodes invisible without new API                    |
| Node count             | multiplied per instance                  | flat                                                     |
| Per-frame JSON payload | multiplied per instance                  | flat                                                     |
| Dynamic recursion      | impossible                               | possible                                                 |

Option A's costs are real and land exactly on the two hot spots in section 3.5: the O(n²) topo lookup and the per-frame full-outputs serialization. Both should be addressed as prerequisites, not deferred — fix the lookup with a `HashMap<NodeId, &NodeSpec>` index built once per `evaluate_all`, and add an opt-in filter to `eval_all` so tooling can request only the ports it renders. Those are worthwhile independent of this feature.

Option A's benefit is that it makes the feature almost entirely a _load-time_ concern in one function, which is a far smaller correctness surface than a recursive evaluator. Keep the spec surface in 4.1 identical either way so the evaluator can be swapped later without a format migration.

### 4.3 Instancing and stable identity

Namespaced ids must be **stable across recompiles**, because `node_states.retain` uses them to preserve spring/damp/slew accumulators. If ids churn, every transition node inside a function silently resets on every graph rebuild — a bug that will present as intermittent visual popping and will be miserable to trace back here.

Rule: inner id = `{callNodeId}/{innerNodeId}`. Call node ids are already stable in authored specs. Reject `/` in author-supplied node ids at load so the namespace is unambiguous.

`set_param` then addresses inner nodes as `p1/cos`. Whether per-instance param overrides are exposed in the UI is a separate product question; the addressing works either way.

### 4.4 Metadata: static registry to instance-level signatures

This is the ripple flagged in 3.2, and the part most likely to be underestimated.

`getNodeRegistry()` / `requireNodeSignature(typeId)` cannot describe a `call` node, because its ports depend on which function it targets in which graph.

Proposed contract change:

1. Keep the global registry for built-in types. Unchanged, no breakage.
2. Add `getGraphSignatures(spec)` returning per-node resolved signatures for a given spec, where `call` nodes resolve against `spec.functions`.
3. In `expressionFunctions.ts`, the module-scope `SCALAR_FUNCTIONS` table stays as the built-in vocabulary; graph-local functions become a second, spec-scoped lookup consulted after it. Do not merge them into one global table — that reintroduces the same coupling and makes the vocabulary depend on load order.
4. `apps/demo-graph-studio`'s `NodePalette` and `EditorCanvas` read port lists from the resolved signatures rather than `schema.outputs` directly. `EditorCanvas.tsx:148` (`outputs: schema.outputs ?? []`) is the seam.

### 4.5 Load-time validation

`load_graph` must reject, with actionable messages:

1. `call` referencing an unknown function name.
2. Recursive or mutually recursive function references (cycle-detect over the function reference graph before expansion — otherwise inlining does not terminate).
3. `$in.<port>` referencing an undeclared input port.
4. `returns` omitting a declared output port, naming an unknown inner node, or naming an `output` that the inner node's signature does not declare.
5. A `returns` port ref whose resolved inner port type contradicts the declared output `ty`.
6. Author-supplied node ids containing `/`.
7. Expansion exceeding a configured node-count ceiling — a nested function used ten times inside another used ten times is 100 instances, and the failure mode without a ceiling is a hang, not an error.

### 4.6 Authoring surface

Deliberately deferred. This document specifies the substrate. How a user _creates_ a function — select-nodes-and-collapse in demo-graph-studio, a named expression in vizij-authoring, or a file-level library — is a product decision that should be made after the substrate exists and can be prototyped against. Shipping the substrate with a JSON-only authoring path is a legitimate first milestone.

### 4.7 The port-level topology question

Node-granular scheduling means a node's ports all become available at once. So you cannot have output `A` of a call feed a chain that eventually feeds input `2` of that same call — it is a cycle at node granularity, even though it may be acyclic at port granularity.

This constrains genuine many-to-many solvers with partial feedback, which is a plausible motivation for wanting this feature in the first place.

**Decision for v1: keep node-granular scheduling and reject those graphs with a clear cycle error.** Port-level topology is a substantially larger change (edge-granular dependency graph, partial node evaluation, revised `eval_node` contract) and it should not ride along with this one. If a concrete use case demands it, it gets its own document.

Flag it early to users, because "why can't I wire this back in" is otherwise an opaque failure.

### 4.8 Integration with the multi-output ports plan

The end state both documents serve is one sentence: an author defines a many-in / many-out block and calls it from an expression, naming the port they want.

```text
polar_to_cart(radius, angle).x
```

The companion doc delivers the `.x`. This doc delivers the `polar_to_cart`. Four joins belong to neither document alone and are specified here because this is the dependent one.

**Join 1 — materializing a `call` from an expression.** `emitScalarFunctionNode` maps positional arguments to declared input ports in signature order. A `call` needs the same treatment against `spec.functions[name].inputs`. Two rules to fix now: arity mismatch is an error (user-defined functions have no optional-input concept in v1), and user-defined functions have **no params**, only inputs — so the literal-param machinery in `buildParamAssignments` must not be wired in speculatively. Adding params later is additive; unwinding a speculative implementation is not.

**Join 2 — two dedup layers, and they compose in one order only.** The companion doc memoizes call sites within an expression context (§5.5, TypeScript, compile time). This doc expands each surviving `call` inline (Rust, load time). A memoized `f(x).a + f(x).b` yields one `call` node, which yields one inlined body — correct, but only because the memo runs first. Do not add a second dedup pass at load. Two independent dedup mechanisms over the same identity are a source of id churn, and id churn is precisely what section 4.3 forbids.

**Join 3 — the default-port rule is implemented twice, in two languages.** Companion doc §5.3 resolves a bare reference to the sole non-optional output. Section 4.2 above applies the same rule when rewriting a consumer that names no `output_key`. If the two implementations disagree, a graph authored through expressions and the same graph authored as raw JSON diverge — silently, and only for nodes with multiple outputs. Write the rule once in prose, cite it from both call sites, and cover it with the authored-vs-inline parity test in section 7.

**Join 4 — diagnostics cross a boundary the author never sees.** A type error inside an inlined body reports against `p1/cos`, an id that appears in no document the author wrote. Load-time errors must render provenance: `function "polar_to_cart", node "cos" (called from "p1")`. This is the most likely place for the feature to feel bad in practice, and it is cheap if expansion carries provenance from the start. Retrofitting it means threading it back through every validation path in section 4.5.

Sequencing note: none of these require the companion doc to have landed first. They require the two to agree on join 3.

## 5) Alternatives Considered

**Expression-only macros in the authoring layer.** Textual substitution in `@vizij/node-graph-authoring`, no core change. Cheap, and genuinely worth considering if the only motivation is reuse. Rejected as the primary design: it cannot produce multiple outputs from one evaluation, it duplicates work per use site, and it is invisible to demo-graph-studio and to any non-vizij-web consumer of the core.

**A scripting node (WASM/Rhai/Lua body).** Maximum expressiveness, but it introduces a sandboxing and determinism problem, a second language surface to document and version, and a much harder story for the metadata registry. Not warranted by the current motivation.

**One Rust variant per new function.** The status quo. Fine for genuinely primitive operations; it is precisely what does not scale to user-defined blocks.

## 6) Work Breakdown

Roughly ordered; items 1-2 are prerequisites that stand on their own merit.

| #   | Change                                                     | Repo      | Risk |
| --- | ---------------------------------------------------------- | --------- | ---- |
| 1   | `HashMap` node index in `evaluate_all` (drop O(n²) lookup) | vizij-rs  | low  |
| 2   | Opt-in port filter for `eval_all`'s per-frame JSON payload | vizij-rs  | low  |
| 3   | `functions` table in `GraphSpec` + serde + normalization   | vizij-rs  | med  |
| 4   | `NodeType::Call` variant                                   | vizij-rs  | low  |
| 5   | Load-time inline expansion with id namespacing             | vizij-rs  | high |
| 6   | Load-time validation and cycle detection (4.5)             | vizij-rs  | med  |
| 7   | `getGraphSignatures(spec)` + wasm export                   | vizij-rs  | med  |
| 8   | Spec-scoped function lookup in `expressionFunctions.ts`    | vizij-web | med  |
| 9   | demo-graph-studio palette/canvas read resolved signatures  | vizij-web | med  |
| 10  | Authoring UX for defining a function                       | vizij-web | TBD  |

Items 1-2 can land immediately and independently. 10 is deliberately unspecified per 4.6.

## 7) Test Plan

- **Expansion**: a two-instance function produces disjoint namespaced ids and identical topology per instance.
- **State isolation**: two instances of a function containing a `spring` converge independently from different initial conditions.
- **State persistence**: recompiling an unchanged graph preserves spring state (guards the 4.3 stability rule — this is the regression that would otherwise ship silently).
- **Validation**: each of the seven rejections in 4.5 has a test asserting the message, not just the failure.
- **Cycle**: a feedback wiring that is port-acyclic but node-cyclic is rejected with the 4.7 error, not a hang or a wrong result.
- **Metadata**: `getGraphSignatures` resolves `call` ports; the global registry is unchanged for built-ins.
- **Parity**: a graph authored as a function and the same graph authored inline produce identical writes over 600 frames.

## 8) Risks and Open Questions

1. **Node-count blowup.** Nested reuse multiplies instances, and both the topo loop and the per-frame JSON payload scale with node count. Items 1-2 are prerequisites, not nice-to-haves. Enforce the ceiling from 4.5(7).
2. **Transition-state identity.** Highest-severity correctness risk. See 4.3 and its dedicated test.
3. **Metadata contract change.** Touches every consumer of `@vizij/node-graph/metadata`. Additive if `getGraphSignatures` is a new export and the global registry keeps working for built-ins — hold that line.
4. **Cross-repo sequencing.** Items 3-7 must ship in a published `@vizij/node-graph` before 8-9 can land. Coordinate with the release flow in `scripts/` and the `wasm:link` local-dev path.
5. **Open: are functions graph-local or a shared library?** This document assumes graph-local (`spec.functions`), which is self-contained and serializes cleanly. A cross-graph library needs a resolution and versioning story and should not be designed speculatively.
6. **Open: per-instance param overrides.** Addressing works (4.3); whether it is exposed, and how it serializes, is unresolved.

## 9) Relationship to the Companion Doc

The multi-output authoring plan is independent and strictly smaller. It can and should land first: it is confined to vizij-web, it delivers immediate value against existing multi-output node types, and it establishes the port-ref plumbing in the compiler that a `call` node's multiple outputs will need anyway.

This document depends on that plumbing existing. It does not depend on it landing first in wall-clock terms, but implementing this one first would mean building the same `PortRef` refactor under more pressure.
