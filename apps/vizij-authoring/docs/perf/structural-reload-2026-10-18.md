# Structural Edit Reload Time (2026-10-18)

A structural edit of the main face — one that changes its elements, hierarchy,
geometry, materials, animated features or animatables' types and ranges —
re-makes the face's GLB and reloads it; the previous scene draws until the
new one is ready. A value edit (a static feature's value, an animatable's
default) shows in place and does not reload. This records what a structural
edit costs on Quori.

## Scenario

`e2e/face-edits.workflow.pw.ts`, "a structural edit of Quori reloads it":
Quori Latest (`Quori_Current_Extended.glb`, 6.6 MB) loaded, its `Background`
element selected and deleted.

- **Total**: from the click to the face ready again — the slot's
  `data-vizij-ready` and the runtime status both back to ready.
- **Export**: the app's `vizij-authoring:main-face-export` performance
  measure — `buildSceneGraph` of the world and `exportScene` of it with the
  bundle.
- **Load**: the rest — `describe` and `loadVizij` of the bytes, and the face
  drawn with its device's pose.

## Machine context

- Apple M1, 8 cores; load average 15 to 30 during the runs (other suites and
  builds running on the host).
- Headless Chromium under Playwright, WebGL on SwiftShader (the suite's
  launch flags), production build (`vite build` + `vite preview`).

## Results

| Run    | Total (s) | Export (s) | Load (s) |
| ------ | --------: | ---------: | -------: |
| 1      |      11.1 |        2.6 |      8.5 |
| 2      |      14.2 |        2.7 |     11.5 |
| 3      |      12.5 |        2.6 |      9.8 |
| 4      |      15.9 |        4.2 |     11.7 |
| 5      |       9.0 |        2.0 |      7.0 |
| Median |      12.5 |        2.6 |      9.8 |

The load dominates. Under SwiftShader it includes the GPU work of the face's
first frames on the CPU, so a browser with a GPU loads faster; the export is
CPU work in either.

## Reproduce

```bash
pnpm --filter vizij-authoring exec playwright test \
  --config=playwright.config.ts --project=workflow \
  e2e/face-edits.workflow.pw.ts -g Quori --repeat-each=5 --workers=1
```

Each run prints `structural edit to ready: {"totalMs":…,"exportMs":…}` and
records it as the test's `structural-edit-load` annotation.
