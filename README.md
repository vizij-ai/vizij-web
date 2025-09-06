# vizij/web — Web Monorepo (TS/React)

A monorepo for all TypeScript/React packages and web apps that power the Vizij “Web Based Framework for Rendered Robot Faces.”
It hosts the model, view (canvas renderer), React controller utilities, thin WASM wrappers, and showcase apps.

## Structure
```txt
packages/
  @vizij/model/            # TS types + JSON Schema validation + IO helpers
  @vizij/react-model/      # React hooks/context to read & write the model
  @vizij/view-canvas/      # Canvas/WebGL renderer that consumes the model
  @vizij/controller-bridge/# Typed bridge to controller WASM modules
  @vizij/*-wasm/           # Thin npm wrappers over Rust-built WASM artifacts
apps/
  website/                 # Main site showcasing faces and control methods
  demo-node-graph/         # Standalone demo for node graph controller
  demo-animation-player/   # Standalone demo for animation player
  playground/              # (optional) interactive sandbox
```

## Getting Started
- Requires Node LTS and pnpm.
```bash
corepack enable
pnpm i
pnpm -r build
pnpm -r test
pnpm -r dev   # run local dev servers where available
```

## Releasing
We use **Changesets** to version and publish only the packages that changed.
```bash
pnpm changeset            # choose bump types
pnpm changeset version    # update versions/changelogs
pnpm -r publish --access public
```

CI publishes with npm provenance via GitHub Actions. NPM token is stored as an org secret and only exposed to the release workflow.

## Contributing
- Open an issue first for major changes.
- Keep packages self-contained with clear READMEs.
- Tests: Vitest; Lint: ESLint/Prettier; Types: strict TS.

## License
Apache-2.0
