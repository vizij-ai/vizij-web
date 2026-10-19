# demo-animation-studio

A playground for the animation engine, `@vizij/animation`, through
`@vizij/animation-react`'s provider: load animation presets, create players and
instances, and watch their outputs, events and baked curves. It draws no face.

## Scripts

```bash
pnpm --filter demo-animation-studio dev
pnpm --filter demo-animation-studio build
pnpm --filter demo-animation-studio preview
pnpm --filter demo-animation-studio typecheck
pnpm --filter demo-animation-studio lint
pnpm --filter demo-animation-studio test
```

The workspace e2e suite boots it on port 5201
(`e2e/tests/standalone-demos-smoke.spec.ts`) and fails on any page error.

## Key Files

- [`src/App.tsx`](./src/App.tsx): the provider, the engine's initialisation and
  the panels.
- [`src/presets/`](./src/presets): the animation presets the app offers.
- [`src/components/`](./src/components): the animations, players, events and
  outputs panels.

## Maintaining

- The engine initialises in an effect (`init()` in `src/App.tsx`), never at a
  module's top level, so importing a module starts nothing.
- A change to `@vizij/animation-react` shows here after
  `pnpm --filter "@vizij/animation-react" build`.
- New sample data goes in `src/presets/`, with the UI change that uses it.
