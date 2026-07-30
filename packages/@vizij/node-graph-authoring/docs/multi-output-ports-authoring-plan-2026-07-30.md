# Multi-Output Ports in the Authoring Compiler

Last updated: 2026-07-30
Owner: Vizij Graph / Authoring
Status: draft design document (current-state + target-state)
Scope: `@vizij/node-graph-authoring`, `apps/demo-graph-studio`, `apps/vizij-authoring`
Companion doc: `subgraph-function-node-design-2026-07-30.md`

## 1) Goal

Let authored graphs read more than one output port from a node.

The graph substrate already evaluates every node as a many-in / many-out function. The authoring compiler in this package does not: it treats a node as a single value and always reads the implicit `out` port. This document specifies the change that closes that gap, entirely inside vizij-web.

Non-goal: letting users define new node types. That is the companion doc.

## 2) Verification Basis

Findings below were read from:

- `packages/@vizij/node-graph-authoring/src/**` at commit `693b039a` (this repo, authoritative).
- `apps/demo-graph-studio/src/**` at the same commit.
- `vizij-rs` core sources from a local checkout that is **behind** the published `@vizij/node-graph@0.7.0` this repo builds against (it lacks the `case` node that 0.7.0 metadata exposes). Rust line references are therefore indicative. Every core invariant this plan depends on is independently confirmed from the TypeScript side, which is pinned to 0.7.0 — see the cross-checks in section 3.2.

## 3) Current State

### 3.1 The core is already many-out

| Capability                         | Where                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Per-node map of named output ports | `GraphRuntime.outputs: HashMap<NodeId, HashMap<String, PortValue>>`       |
| Port-addressed edges               | `InputConnection { node_id, output_key }`, `output_key` defaults to `out` |
| Declared multi-output signatures   | `NodeSignature.outputs: Vec<PortSpec>` plus `variadic_outputs`            |
| Per-port shape enforcement         | `NodeSpec.output_shapes: HashMap<String, Shape>`                          |
| Nodes already using it             | `MultiSlider` (`x`/`y`/`z`), `Split` (variadic `part1..partN`)            |

Node evaluation is atomic: `eval_node` computes the whole port map in one call and inserts it once. `topo_order` is node-granular. For many-to-many that is the correct granularity — a node with five consumers reading three different ports is still evaluated exactly once.

### 3.2 Cross-checks from the TypeScript side (pinned to 0.7.0)

- `packages/@vizij/node-graph-authoring/src/ir/compiler.ts:89` already compiles `edge.from.portId` into `from.output` on the wire spec.
- `packages/@vizij/node-graph-authoring/src/ir/types.ts:12` — `IrPortRef` already carries an optional `portId`.
- `apps/demo-graph-studio/src/store/useEditorStore.ts:618` and `:952` already read and write `output_key` / `sourceHandle`, defaulting to `out`.
- `apps/demo-graph-studio/src/components/EditorCanvas.tsx:364` already renders one React Flow `Handle` per `schema.outputs` entry, including variadic groups.
- `@vizij/node-graph-react` already exports `useNodeOutput(nodeId, outputKey)` and `useNodeOutputs`.

So the wire format, the IR, the node-canvas editor, and the React read hooks are all port-aware today.

### 3.3 Where the single-output assumption actually lives

Three places, all in this package.

**(a) The expression compiler's currency is a node id, not a port ref.**

`materializeExpression` (`src/graphBuilder.ts:1245`) returns `string`, and so does every helper it calls: `getConstantNodeId` (`:671`), `getVectorConstantNodeId` (`:693`), `createBinaryOperationNode` (`:720`), `createVariadicOperationNode` (`:747`), `createNamedOperationNode` (`:773`), `ensureReservedVariableNode` (`:801`), `ensureGraphTimeNode` (`:817`), `emitScalarFunctionNode` (`:835`), `emitCaseFunctionNode` (`:982`).

Consequently all 28 `from: { nodeId }` edge emissions in `graphBuilder.ts` omit `portId`, and the compiler emits `out` everywhere by construction.

**(b) The function registry discards every port but the first.**

`src/expressionFunctions.ts:574`:

```ts
resultValueType: inferExpressionValueType(
  (signature.outputs as SignatureOutput[])?.[0]?.ty ?? null,
),
```

A `ScalarFunctionDefinition` has exactly one `resultValueType`. There is no representation for "this function has ports `position` and `rotation`."

**(c) The expression grammar has no way to name a port.**

`ControlExpressionNode` (`src/expression.ts:1`) is `Literal | VectorLiteral | Reference | Unary | Binary | Function`. `IDENT_PART` is `/[A-Za-z0-9_]/` — `.` is not an identifier character and there is no member-access production. `ExpressionVariableTable.resolveNodeId(name): string | null` (`src/expressionVariables.ts:51`) resolves a name to a node id with no port component.

Supporting facts: the per-expression type map `ExpressionBuildContext.nodeValueTypes` (`src/graphBuilder.ts:612`) is keyed by node id, so it cannot describe two ports of differing type on one node. And the binding model itself is one expression per `(animatable, component)` slot — vector animatables are reassembled by fanning N independent scalar subtrees into a `join` and then a single `output` sink (`src/graphBuilder.ts:2459-2501`).

### 3.4 Consequences today

1. `MultiSlider` is unusable from expressions; only its `x` port is reachable.
2. `Split`'s variadic outputs are unreachable from expressions.
3. Any future multi-result node (IK returning position and rotation, a solver returning value and error) is expressible in the core but not authorable.
4. Two bindings that need two results of the same computation each build their own copy of the subtree, because each binding slot compiles in its own `ExpressionBuildContext`. Constant dedup is per-context (`context.constants`), so there is no cross-slot common-subexpression elimination at all.

## 4) Target State

1. A node reference in an expression may name a port: `solver.position`.
2. A reference with no port resolves to the node's sole non-optional output, or errors with a listing of available ports if the node has more than one.
3. The compiler threads `{ nodeId, portId }` end to end, so `IrEdge.from.portId` is populated whenever the source is not the default port.
4. Nodes with multiple outputs are instantiated once per distinct call site, not once per consumed port.
5. Value-type checking is per port.
6. Specs that contain no port references compile byte-identically to today.

## 5) Design

### 5.1 Change the compiler's currency from `NodeId` to `PortRef`

The single highest-leverage change. Introduce an internal alias in `graphBuilder.ts`:

```ts
type PortRef = { nodeId: string; portId?: string };
```

`portId` stays optional and `undefined` means "default port", so the emitted IR — and therefore the compiled `GraphSpec` — is unchanged for every existing expression. `convertIrEdgeToGraphEdge` already passes `undefined` through as an absent `output`.

Mechanical steps:

1. Change the return type of the nine helpers in section 3.3(a) from `string` to `PortRef`. Node-creating helpers return `{ nodeId }`; only new port-selecting code returns a populated `portId`.
2. Change `materializeExpression`'s return type to `PortRef`.
3. Change the 28 `from: { nodeId: x }` sites to `from: x`.
4. Change `ExpressionBuildContext.nodeValueTypes` from `Map<string, ExpressionValueType>` to a map keyed by a `portKey(ref)` helper (`` `${nodeId}` `` when `portId` is undefined, `` `${nodeId}#${portId}` `` otherwise). Update `setNodeValueType`, `getNodeValueType`, `ensureOperandValueType` (`:617`, `:625`, `:645`) to take a `PortRef`.

This step is a pure refactor with no behavior change and should land as its own commit, verified by the existing IR parity fixtures (`src/__tests__/irParity.test.ts`) staying green **without regeneration**. That is the acceptance gate for step 1: if the frozen fixtures move, the refactor was not behavior-preserving.

### 5.2 Grammar: member access

Add one AST node to `ControlExpressionNode`:

```ts
| { type: "Member"; object: ControlExpressionNode; port: string }
```

Parsing: add a postfix loop in the primary-expression parser that consumes `.` followed by an identifier, binding tighter than any unary or binary operator. Grammar is `postfix := primary ("." IDENT)*`.

Constraints worth fixing now rather than discovering later:

- The object of a `Member` must be a `Reference` or a `Function` call. `(a + b).x` is rejected at parse time with "Port access requires a control or function call." Allowing it on arbitrary expressions would imply structural field access on values, which is a different feature.
- Chained access (`a.b.c`) is rejected in v1. Ports are flat.
- `.` must not be consumed inside numeric literals. The literal scanner runs before the postfix loop, so `1.5` is unaffected, but add a regression test for `1.5.x` producing a clean parse error rather than a silent `1.5` followed by junk.

`collectExpressionReferences` (`src/expression.ts:597`) must descend into `Member.object` so reference collection and the "unknown control" diagnostics keep working. `mapExpression` (`:624`) needs a `Member` arm.

### 5.3 Variable and function resolution

`ExpressionVariableTable` gains a port-aware resolve alongside the existing one:

```ts
resolvePort(name: string, port?: string): { ref: PortRef; valueType } | null;
```

`resolveNodeId` stays for callers that only need the node. Slot variables always expose exactly one port, so `resolvePort(name, "anything")` on a slot variable is an error: "Control `expr` has no port `x`."

Port resolution rules when materializing `Member`:

1. Look up the source signature (registry signature for a function call, variable metadata for a reference).
2. If `port` names a declared `PortSpec` in `signature.outputs`, use it.
3. Else if `variadic_outputs` is declared and `port` matches its `{id}_{n}` pattern, accept it and record the required arity.
4. Else push the issue "Node type `split` has no output `foo`. Available: `part1`, `part2`." — listing the actual ports is the whole point; a bare "unknown port" is not actionable.

Bare references keep working via a defaulting rule: no `portId` means the sole non-optional output. If a signature declares more than one non-optional output and the expression does not name a port, emit "Node type `multislider` produces multiple outputs; name one (`x`, `y`, `z`)." This is the only place where previously-valid input can become an error — see section 6.

### 5.4 Function definitions carry all ports

Replace `ScalarFunctionDefinition.resultValueType: ExpressionValueType` with:

```ts
outputs: { id: string; valueType: ExpressionValueType; optional: boolean }[];
variadicOutputs?: { id: string; min: number; max: number | null; valueType: ExpressionValueType };
defaultOutput?: string;  // resolved sole non-optional output, when unambiguous
```

Keep `resultValueType` as a deprecated getter returning `outputs[defaultOutputIndex].valueType` so the `if`/`case` special-casing at `expressionFunctions.ts:578-598` does not have to change in the same commit.

Build these from the registry signature instead of truncating at `[0]`. `FUNCTION_OVERRIDES` gains an optional `replaceOutputs` for the same reason `replaceInputs` exists.

### 5.5 Call-site sharing

Once a call can produce several consumed ports, `solver(a, b).position + solver(a, b).rotation` must not instantiate the solver twice.

Add a memo to `ExpressionBuildContext` keyed by a structural hash of `(functionName, materialized argument PortRefs, literal params)`. On hit, reuse the existing node id and vary only `portId`. This is scoped, cheap, and sufficient for the in-expression case.

Cross-slot sharing (two different bindings calling the same solver) is explicitly **out of scope** here: each slot compiles in its own context, and unifying them means hoisting shared subtrees to graph scope with stable ids, which changes node identity across the whole spec and invalidates every IR fixture. Track it separately; it is a bigger change than this document.

### 5.6 UI

`apps/demo-graph-studio` needs no work for the canvas — `EditorCanvas.tsx:364` already renders per-output handles and `useEditorStore` already persists `sourceHandle`. Worth adding: label the handle with the port id when a node has more than one output, since today they are visually undifferentiated.

`apps/vizij-authoring` is the real UI work, because its authoring surface is the expression text field, not a node canvas:

1. Expression autocomplete must offer `.port` after a reference or call that has multiple outputs.
2. `src/utils/bindingExpressions.ts` and the inspector's pipeline-stage display need to render port-qualified references without mangling them.
3. Slot diagnostics (`src/components/binding/SlotDiagnosticsContext.tsx`) should surface the new "multiple outputs, name one" issue as a fixable hint rather than a generic parse error.

### 5.7 The sink is still 1:1

`Output` takes one `in` and writes one `TypedPath`. Reading two ports of a node into two animatables therefore still means two `output` nodes. That is correct and needs no change — but it is worth stating plainly, because "many-to-many" can be misheard as "one node writes several bindings," which this plan does not deliver and does not need to.

## 6) Compatibility

- Wire format: unchanged. `output_key` already defaults to `out`.
- Existing expressions: unchanged, with one exception. A bare reference to a node type that declares multiple non-optional outputs currently silently resolves to the first port; under section 5.3 it becomes an error. In practice the only reachable such type today is `multislider`, which the expression vocabulary does not expose as a callable function, so the expected real-world impact is zero. Confirm with a repo-wide fixture sweep before landing, and if any authored graph is affected, ship the defaulting rule as a warning for one release before promoting it to an error.
- IR fixtures: must not change in steps 1-2. They will change in step 3 only for expressions that use the new syntax.

## 7) Work Breakdown

| #   | Commit                                                 | Risk | Gate                                                   |
| --- | ------------------------------------------------------ | ---- | ------------------------------------------------------ |
| 1   | `PortRef` currency refactor in `graphBuilder.ts` (5.1) | low  | IR parity fixtures green **unregenerated**             |
| 2   | Multi-output `ScalarFunctionDefinition` (5.4)          | low  | Function registry snapshot unchanged for existing fns  |
| 3   | `Member` AST + parser + `collectExpressionReferences`  | med  | New parser tests incl. `1.5.x` and `(a+b).x` rejection |
| 4   | Port resolution + diagnostics (5.3)                    | med  | Issue-text tests; unknown-port lists available ports   |
| 5   | Call-site memoization (5.5)                            | med  | Double-port call emits one node, two edges             |
| 6   | demo-graph-studio handle labels (5.6)                  | low  | Visual check                                           |
| 7   | vizij-authoring autocomplete + diagnostics (5.6)       | med  | E2E: author `split(v).part2`, verify runtime write     |

Steps 1 and 2 are independent and can land in either order. 3-5 are sequential. 6 and 7 depend on 4.

## 8) Test Plan

- **Parser**: member access precedence against unary/binary; rejection cases; numeric-literal interaction.
- **Compiler**: `split(v).part2` emits `from.output === "part2"`; bare reference to single-output node still emits no `output` key; multi-output bare reference produces the expected issue string.
- **Parity**: existing `irParity.test.ts` fixtures unchanged through step 5 except where the fixture itself uses new syntax.
- **Sharing**: `f(x).a + f(x).b` emits exactly one `f` node.
- **Runtime**: extend `packages/@vizij/node-graph-react/src/__tests__/urdf-fk-ik.test.tsx`, which already exercises `output_key: "position"`, with an authored-expression counterpart so the authoring path is covered by the same contract the hand-written spec already proves.
- **E2E**: one authoring flow that binds two animatables to two ports of one node.

## 9) Risks

1. **Refactor blast radius.** Step 1 touches ~40 call sites in a 2858-line file. Mitigated by the unregenerated-fixture gate — it is a genuine behavioral no-op or it fails.
2. **Silent default-port drift.** If a node type gains a second output in a future core release, previously-valid bare references start erroring. That is the correct behavior but it is a cross-repo coupling: adding an output port to an existing node type becomes a breaking authoring change. Note it in the core's release checklist.
3. **Diagnostic quality.** Port errors surface in a text field with no canvas to point at. Budget real effort for the message text; a bad message here is worse than the missing feature.
4. **Registry staleness.** `expressionFunctions.ts` derives everything from `requireNodeSignature`, a static global. That is fine for this plan and is the exact assumption the companion doc breaks — sequence accordingly.

## 10) Out of Scope

- User-defined node types (companion doc).
- Cross-slot common-subexpression elimination.
- Multi-path sinks.
- Port-level topological scheduling (see companion doc section 4.7).
- Structural field access on values (`transform.translation` as a value operation rather than a port).
