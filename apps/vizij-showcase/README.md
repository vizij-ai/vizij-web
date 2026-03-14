# vizij-showcase

`vizij-showcase` is the main multi-surface runtime demo in this repo. It renders several face experiences inside one app and uses `@vizij/runtime-react` in shared-orchestrator mode rather than the simpler isolated pattern used by the tutorials and `demo-vizij-player`.

## Runtime Pattern

The key runtime abstraction here is [`ShowcaseRuntime`](./src/components/ShowcaseRuntime.tsx).

Each section-level face:

- creates a bundle with `createShowcaseBundle()`
- gets a unique namespace like `vizij-showcase-<section>`
- mounts `VizijRuntimeProvider` with `orchestratorScope="shared"`
- decides whether it should actively drive the orchestrator or stay passive

This lets the showcase keep multiple runtime surfaces alive without every section running a full independent loop.

### Driver vs passive faces

Some faces are visible and interactive; others are decorative or hidden until scrolled into view.

`ShowcaseRuntime` therefore separates:

- `autostart`
- `driveOrchestrator`
- `visible`
- `hiddenStepHz`

Visible driver faces use the normal runtime loop. Hidden driver faces can fall back to low-frequency manual stepping through `step(..., { forceRuntime: true })`.

If you are trying to understand shared runtime-react orchestration, this app is the reference consumer in the repo.

## What The App Demonstrates

- shared runtime namespaces for multiple face surfaces
- pose hotkeys, idle gaze, and interactive gaze on top of runtime-react
- voice/viseme overlays tied to runtime bundles
- runtime status broadcasting for debug overlays

## Environment

Voice/viseme controls default to the staging Vizij API endpoint. Override only when needed:

```bash
cat > apps/vizij-showcase/.env.local <<'EOF'
VITE_API_URL=https://your-api-base.example.com
EOF
```

Restart Vite after changing the env file.

## Scripts

```bash
pnpm --filter vizij-showcase dev
pnpm --filter vizij-showcase build
pnpm --filter vizij-showcase preview
pnpm --filter vizij-showcase typecheck
pnpm --filter vizij-showcase lint
```

## Key Files

- [`src/components/ShowcaseRuntime.tsx`](./src/components/ShowcaseRuntime.tsx): shared runtime provider wrapper
- [`src/lib/faceAssets.ts`](./src/lib/faceAssets.ts): bundle template + namespace generation
- [`src/components/RuntimeFaceFrame.tsx`](./src/components/RuntimeFaceFrame.tsx): runtime face stage
- [`src/components/RuntimeDebugOverlay.tsx`](./src/components/RuntimeDebugOverlay.tsx): debug/status surface

## Build, Preview, And Deploy

1. Install deps from the repo root with `pnpm install`.
2. If you changed shared packages, rebuild them before checking the showcase.
3. Build with:

   ```bash
   pnpm --filter vizij-showcase build
   ```

4. Preview locally with:

   ```bash
   pnpm --filter vizij-showcase preview -- --host 127.0.0.1 --port 4173
   ```

Firebase hosting commands remain:

```bash
pnpm --dir apps/vizij-showcase exec firebase hosting:channel:deploy staging --only hosting:vizij-showcase
pnpm --dir apps/vizij-showcase exec firebase deploy --only hosting:vizij-showcase
```

The local Firebase config points Hosting at `dist/`, keeps the COOP/COEP headers needed for the wasm runtime, and rewrites routes to `index.html`.
