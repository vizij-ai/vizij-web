# Vizij Node Graph Front-end Review (vizij-web)

## Overview

- `@vizij/node-graph-react` offers a React context/provider around the wasm graph runtime (`packages/@vizij/node-graph-react/src/index.tsx`). It normalizes specs, drives evaluation via RAF, and exposes selector hooks.
- `apps/demo-node-graph` is the primary consumer. It uses React Flow, Zustand state, and bespoke node components to visualize and edit graphs.

## Alignment with core schema

1. **Spec normalization**: The provider lowercases `node.type`, coerces `params.value`, and rewrites `output_shapes` (index.tsx:75-139). This mirrors wasm-side normalization but duplicates logic and only handles Value primitives and scalar shapes. Non-scalar params (e.g., `Record`, `Transform`) survive only if pre-tagged; no schema validation occurs.
2. **Shape support**: Equality helpers and value readers only recognize `{ float }`, `{ bool }`, `{ vec3 }`, and `{ vector }` (index.tsx:267-318, 583-628). Any transform, quaternion, record, enum, or array output is treated as “changed” every frame and cannot be rendered.
3. **Typed paths**: Neither the provider nor the demo exposes `params.path`. Inspector panels allow editing only numeric/bool params (InspectorPanel.tsx), and `setParam` delegates to wasm without a path branch. Graphs therefore cannot wire outputs to typed paths from the UI.
4. **Output shapes**: `nodesToSpec` always sets `output_shapes: {}` (graph.ts:101-107). No declared shapes are forwarded to the core, so the runtime must infer everything.
5. **Schema drift**: Local schema helpers are stale. `schema/graph.ts` enumerates legacy `vec3*` nodes (graph.ts:33-44) that no longer exist. `lib/node-types.ts` hardcodes port metadata (lines 1-210) but conflicts with runtime realities (e.g., `multislider` outputs `x/y/z`, not `o1/o2/o3`). The palette only categories statically defined types instead of reflecting the registry.
6. **Hook correctness**: `useNodeOutputs` omits `getNodeOutput` from the dependency array (index.tsx:569-575), so callers can capture stale closures when the context value changes.
7. **Debug logging**: `NodeGraphProvider` logs normalized specs on every load/reload (index.tsx:358-384, 429-454, 473-498), spamming consoles and leaking potentially large graphs in production builds.
8. **Testing**: The demo only has a trivial Vitest smoke test. There are no integration tests to guarantee graphs can be loaded, edited, or persisted.

## Documentation gaps

- `packages/@vizij/node-graph-react/README.md` still documents the animation provider, not the node graph package.
- The demo lacks written guidance on how the React wrapper is expected to behave relative to the Rust schema, and no documentation describes limitations (e.g., unhandled shape types).

## Recommendations

1. **Centralize schema**: Fetch `registry()` from wasm during initialization (the provider already imports `ShapeJSON`) and build port metadata dynamically. Replace hardcoded node registries and stale Zod enums with data from the runtime to ensure parity.
2. **Promote shared normalization utilities**: Move spec/value normalization into a shared helper (either re-exported from wasm or colocated) so React and Rust don’t diverge. Extend it to cover `sizes`, `path`, and composite Value variants.
3. **Expose typed paths**: Add UI affordances to edit `params.path` (e.g., in `InspectorPanel`) and update `setParam` to send the string to wasm until `TypedPath` structs are accepted. Validate against the forthcoming registry to prevent malformed paths.
4. **Handle full Value surface**: Extend display/equality helpers to support quaternions, transforms, records, enums, lists, and tuples. Use `ShapeJSON` to drive rendering so composites don’t silently fail.
5. **Respect declared shapes**: Allow nodes/components to declare `output_shapes` and pass them through `nodesToSpec`. Pair this with validation (once available in rust) to surface mismatches early.
6. **Cleanup provider implementation**: Remove console logging, add missing hook dependencies, and replace repeated `JSON.stringify` comparisons with structural diffing keyed by node ids when possible.
7. **Testing & docs**: Add integration tests that load the sample graph, modify parameters, persist/restore state, and assert wasm outputs. Update README files to describe the node graph provider, required wasm initialization, and demo limitations.
8. **Roadmap alignment**: In preparation for node clustering and reusable blocks, factor graph building (`nodesToSpec`) into composable primitives that can embed subgraphs, annotate group inputs/outputs, and round-trip through the wasm schema.
