# tutorial-fullscreen-face

`tutorial-fullscreen-face` is the smallest app that drives a Vizij face from
React end to end: one GLB, one `VizijRuntimeProvider`, one face on the page's
canvas, and the keyboard showing its expressions and visemes through the Vizij
face standard.

The walkthrough is [`tutorial.md`](./tutorial.md).

## Scripts

```bash
pnpm --filter fullscreen-face dev
pnpm --filter fullscreen-face build
pnpm --filter fullscreen-face preview
pnpm --filter fullscreen-face typecheck
pnpm --filter fullscreen-face lint
```

`?autoplay` runs the face's active program from load. The e2e spec is
`e2e/tests/fullscreen-face.spec.ts` (port 5204).

The face is Quori, loaded from
`apps/vizij-authoring/public/assets/Quori_Current_Extended.glb` by
`src/FaceApp.tsx`. The app drives it only through the face standard's keys
(`runtime.path("standard/vizij/…")`) and `play_viseme`, and writes no rig path.
The hotkeys come from the `vizij-face` profile, so an expression or viseme the
standard gains gets a key without a code change.

## Key Files

- [`src/FaceApp.tsx`](./src/FaceApp.tsx): the canvas, the provider and the
  face's slot.
- [`src/hooks/useFaceHotkeys.ts`](./src/hooks/useFaceHotkeys.ts): the face
  standard's expressions and visemes on the keyboard.
