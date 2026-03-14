# tutorial-fullscreen-face

`tutorial-fullscreen-face` is the smallest app in this repo that demonstrates the current `@vizij/runtime-react` workflow end to end: one bundled GLB, one runtime provider, one rendered face, plus a couple of runtime-aware interaction hooks.

It is the fastest place to inspect the baseline runtime stack before moving on to `tutorial-agent-face`, `demo-vizij-player`, or the larger shared-runtime surfaces.

This is the canonical minimal tutorial. The detailed bundle-first runtime narrative lives in [`tutorial.md`](./tutorial.md); the README is just the short entry point.

## Scripts

```bash
pnpm --filter fullscreen-face dev
pnpm --filter fullscreen-face build
pnpm --filter fullscreen-face preview
pnpm --filter fullscreen-face typecheck
pnpm --filter fullscreen-face lint
```

## Docs

- Runtime tutorial: [`tutorial.md`](./tutorial.md)
- Runtime package reference: [`packages/@vizij/runtime-react/README.md`](../../packages/@vizij/runtime-react/README.md)
- Next step: [`apps/tutorial-agent-face/tutorial.md`](../tutorial-agent-face/tutorial.md)

## Key Files

- [`src/FaceApp.tsx`](./src/FaceApp.tsx): provider + runtime stage
- [`src/hooks/useMouseGaze.ts`](./src/hooks/useMouseGaze.ts): gaze input staging
- [`src/hooks/usePoseHotkeys.ts`](./src/hooks/usePoseHotkeys.ts): semantic pose ordering + hotkey animation
