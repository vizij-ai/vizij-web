# @vizij/utils

## 0.2.0

### Minor Changes

- 1eaa5bf: Release seven months of accumulated `@vizij/utils` work — npm's `0.1.0` was cut
  on 2026-01-23 and every change since has been workspace-only, so anything
  installing `@vizij/utils` (directly, or transitively through `@vizij/render` /
  `@vizij/runtime-react` / `@vizij/node-graph-authoring`) has been running a stale
  copy of the rig helpers.

  Behavioural fixes now shipping:
  - `extractAnimatableComponents` decodes the arora engine `Value` record encoding
    (`{ f32: n }` scalars, `{ struct: { fields } }` vectors) for animatable base
    defaults. Unrecognised, every scale/opacity base fell back to `0`, so an
    imported raw rigged GLB drove every shape to scale 0 / opacity 0 and the face
    rendered blank.
  - The `cloneVector2`/`cloneVector3`/`cloneColor` fallback range now routes
    through `getVectorComponentValue`, so `computeScaleBounds` sees the true base
    instead of `0` and stops clamping a real base of ~25 back to the `[0, 2]`
    fallback — which had been shrinking mask/occluder shapes until masks stopped
    masking.

  API surface, relative to the published `0.1.0` (minor, not patch): 24 new
  exports, largely the rig-pipeline-v1 and propsrig helpers
  (`RIG_PIPELINE_V1_VERSION`, `buildRigPipelineV1*`, `resolveRigPipelineV1*`,
  `PROPSRIG_*` path prefixes, `isRigElementStandardInputPath*`,
  `migrateLegacyStandardRigInputLabel`, `createBrowserSafeId`). Four exports are
  gone with the `STANDARD_RIG_INPUTS` removal: `STANDARD_RIG_INPUTS`,
  `STANDARD_RIG_INPUTS_BY_ID`, `LEGACY_STANDARD_RIG_INPUT_IDS`, and
  `findStandardRigInput`.

  Internal `@vizij` dependencies in the publishable packages move from
  `workspace:*` to `workspace:^`, so a published manifest carries `^0.2.0` rather
  than an exact `0.2.0` pin and a later patch release of a shared package
  deduplicates into one installed copy instead of stranding consumers on the
  version their dependent was cut against.

## 0.1.0

### Minor Changes

- a53152b: React 19 support and dependency refresh
  - React 19 compatibility across Vizij React packages.
  - Update wasm wrapper dependencies to the latest published `@vizij/*-wasm` versions.
  - CI/release workflow updates (Node 24; npm publish via OIDC).

## 0.0.3

### Patch Changes

- ed31344: Updated to latest vizij-rs dependencies

## 0.0.2

### Patch Changes

- Update import and export process to save and consistently handle names

## 0.0.1

### Patch Changes

- Add changlog in preparation for publishing packages

This package tracks releases with [Changesets](../../.changeset/README.md). Use `pnpm changeset` to document new helpers or breaking API changes.
