# vizij-showcase

Larger fullscreen Vizij face showcase that layers staging controls, pose hotkeys, gaze steering, and Polly-driven voice playback on top of the base runtime demo.

## Scripts

- `pnpm --filter vizij-showcase dev` – run the Vite dev server with hot reload.
- `pnpm --filter vizij-showcase build` – emit the production bundle to `apps/vizij-showcase/dist`.
- `pnpm --filter vizij-showcase preview` – serve the already-built production bundle with Vite’s preview server.
- `pnpm --filter vizij-showcase typecheck` – run TypeScript in `--noEmit` mode.
- `pnpm --filter vizij-showcase lint` – run ESLint across the project.

## Environment

Voice/viseme controls require the Vizij API endpoint. Create `apps/vizij-showcase/.env.local` (git-ignored) with:

```bash
VITE_API_URL="https://your-api-base.example.com"
```

Restart Vite whenever you change the env file.

## Production Build & Local Preview

1. From the repo root, make sure dependencies are installed (`pnpm install`) and packages are built if you changed any shared libraries (`pnpm run build:packages`).
2. Build the showcase bundle in production mode:

   ```bash
   pnpm --filter vizij-showcase build
   ```

   This writes the static assets to `apps/vizij-showcase/dist`.

3. Serve that production output locally using Vite preview (same compression + asset handling you get in production):

   ```bash
   pnpm --filter vizij-showcase preview -- --host 127.0.0.1 --port 4173
   ```

   The flag section after `--` goes straight to Vite, so adjust host/port as needed. Visit `http://127.0.0.1:4173` to confirm the production build.

4. If you prefer a different static file server, point it at `apps/vizij-showcase/dist` after the build step (for example, `python -m http.server 4173 --directory apps/vizij-showcase/dist`).

Because `vite preview` consumes the already-built files, rerun the build step whenever you change source and want those updates reflected in the production preview.

## Deployment

### Firebase Hosting

1. Install the Firebase CLI (`pnpm exec firebase --version`) and authenticate once with `pnpm exec firebase login`.
2. Build the production bundle locally when you want to validate changes: `pnpm --filter vizij-showcase build`. The deploy command triggers the same build via a predeploy hook.
3. For a temporary preview URL run `pnpm --dir apps/vizij-showcase exec firebase hosting:channel:deploy staging --only hosting:vizij-showcase`.
4. Promote to production with `pnpm --dir apps/vizij-showcase exec firebase deploy --only hosting:vizij-showcase`.

The Firebase config files live beside this app (`firebase.json`, `.firebaserc`). They point Hosting at the `dist/` output, apply the COOP/COEP headers required for the WASM runtime, and rewrite all routes to `index.html` for SPA routing. The optional `apphosting.yaml` is unused unless we switch to Firebase App Hosting/Cloud Run in the future.
