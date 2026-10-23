# vizij-showcase

`vizij-showcase` is the main multi-surface demo in this repo. It shows several face experiences on one page, each section with a face of its own, all drawn on one canvas.

## Runtime Pattern

The page renders `@vizij/render`'s `<VizijCanvas>` once, fixed over the page with its pointer events off. Each section wraps its face in [`ShowcaseRuntime`](./src/components/ShowcaseRuntime.tsx), which:

- mounts a `VizijRuntimeProvider` (one Arora device per face) once the section has entered the viewport, under the id `showcase-<section>`;
- runs the face's device while the section is visible (`run={visible}`), so an offscreen face stops;
- passes the section's `loadVizij` options: no program by default, Quori's program where the section relies on it.

Every section's face is Quori, loaded from `apps/vizij-authoring/public/assets/Quori_Current_Extended.glb` through [`src/lib/faceAssets.ts`](./src/lib/faceAssets.ts).

[`RuntimeFaceFrame`](./src/components/RuntimeFaceFrame.tsx) places the face's slot (`VizijRuntimeFace`) in a card; the canvas draws the face over it, cropped at the canvas's edge as the page scrolls.

## What The App Demonstrates

| Section      | Program                                | What it drives                                                                                       |
| ------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Hero         | Quori's                                | expression weights and `play_viseme` in a passive routine, beside the program's idle gaze and blinks |
| Expressions  | none                                   | buttons and hotkeys over the face standard's expression weights                                      |
| Gaze Play    | Quori's                                | the face standard's gaze target from the pointer, a random expression on click                       |
| Voice        | none                                   | the device's `say`, which synthesises the line and moves the lips                                    |
| Rig Controls | none (rig, pose driver and poses only) | any rig input from `describe(glb).rigInputs`                                                         |

The gaze target (`standard/vizij/gaze/target/{x,y}` and its `weight`) is an input of Quori's program, so the Gaze Play section runs it.

## Environment

The Voice section's `say` calls the Vizij text-to-speech endpoint, the staging Cloud Function by default. Override only when needed:

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

The e2e spec is `e2e/tests/vizij-showcase.spec.ts` (port 5205).

## Key Files

- [`src/components/ShowcaseRuntime.tsx`](./src/components/ShowcaseRuntime.tsx): one section's face
- [`src/components/RuntimeFaceFrame.tsx`](./src/components/RuntimeFaceFrame.tsx): the face's card and slot
- [`src/hooks/useGazeTarget.ts`](./src/hooks/useGazeTarget.ts): the eyes through the face standard's gaze target
- [`src/hooks/useExpressions.ts`](./src/hooks/useExpressions.ts): the face standard's expression weights
- [`src/components/VoicePanel.tsx`](./src/components/VoicePanel.tsx): the device's `say`

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
