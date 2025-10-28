# vizij-authoring

The `vizij-authoring` app focuses on visualising Vizij assets without a rig or orchestrator. It provides a
minimal control panel to load `.glb` files, inspect their hierarchy, and export them back to
a GLB.

## Available interactions

- **Load** – Choose a local GLB file, paste a URL, or use the bundled Hugo sample.
- **Inspect** – Hover over any rendered element to see its metadata, animatable properties,
  and current values.
- **Export** – Download the currently loaded Vizij as `scene.glb`.
- **Author expressions** – Combine multiple control slots with `+`, `-`, `*`, `/`, and parentheses; the canvas reflects changes immediately and highlights invalid math.
- **Curate labels** – Rename features inline, reset to the original asset label with a click, and see overrides at-a-glance.
- **Refine slots** – Add additional slot inputs, rename their aliases, and manage per-slot remaps without leaving the feature inspector.

## Scripts

```bash
pnpm --filter vizij-authoring dev      # Start Vite in development mode
pnpm --filter vizij-authoring build    # Build the tool for production
pnpm --filter vizij-authoring preview  # Preview the production build
pnpm --filter vizij-authoring typecheck
```

The app expects Vizij-compatible GLB files (e.g. assets produced via the Vizij pipeline or the
sample included in `public/samples`).

## Deployment

### Firebase Hosting

1. Install the Firebase CLI (`pnpm exec firebase --version`) and authenticate once with `pnpm exec firebase login`.
2. Build the production bundle locally when you want to validate changes: `pnpm --filter vizij-authoring build`. The deploy command triggers the same build via a predeploy hook.
3. For a temporary preview URL run `pnpm --dir apps/vizij-authoring exec firebase hosting:channel:deploy staging --only hosting:vizij-authoring`.
4. Promote to production with `pnpm --dir apps/vizij-authoring exec firebase deploy --only hosting:vizij-authoring`.

The Firebase config files live beside this app (`firebase.json`, `.firebaserc`). They point Hosting at the `dist/` output, apply the COOP/COEP headers required for the WASM runtime, and rewrite all routes to `index.html` for SPA routing. The optional `apphosting.yaml` is unused unless we switch to Firebase App Hosting/Cloud Run in the future.
