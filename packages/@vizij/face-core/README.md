# @vizij/face-core

Headless, framework-agnostic Vizij face runtime controller — **L1** of the
package suite described in [`docs/redesign/`](../../../docs/redesign/README.md).

## Status: placeholder

This package currently exports nothing usable. It exists to reserve the
package name, join the fixed release line with `@vizij/runtime-react` and
`@vizij/render`, and hold the API-surface snapshot slot.

The `FaceRuntime` controller (load a Face Package → compose graphs → step the
arora device → read/write values at canonical paths → transport → subscribe)
is being extracted from `@vizij/runtime-react`'s `VizijRuntimeProvider` in
stages — see
[`docs/redesign/06-track-2-implementation.md`](../../../docs/redesign/06-track-2-implementation.md)
§3 for the extraction plan and the target API.

Until the extraction completes, consume the runtime through
`@vizij/runtime-react` (React) as today.
