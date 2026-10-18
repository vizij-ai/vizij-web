# Structural Edit Reload Time (2026-10-18)

A structural edit of the main face re-makes the face's GLB and reloads it. A
structural edit is one that changes its elements, hierarchy, geometry,
materials, animated features, or animatables' types and ranges. The previous
scene draws until the new one is ready. A value edit (a static feature's value,
an animatable's default) shows in place and does not reload.

This page records what a structural edit costs on Quori, in the browser on the
GPU, and natively in instructions retired.

## Scenario

Quori Latest (`Quori_Current_Extended.glb`, 6.6 MB) is loaded, and its
`Background` element is selected and deleted. The scenario is
`e2e/face-edits.workflow.pw.ts`, "a structural edit of Quori reloads it".

## Browser, on the GPU

### Method

- **Browser:** headless Chromium under Playwright, launched with
  `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`. WebGL reports
  `ANGLE (Apple, ANGLE Metal Renderer: Apple M1)`. WebGPU is unavailable
  headless, so Bevy draws on WebGL2.
- **Build:** production (`vite build` + `vite preview`).
- **Machine:** Apple M1, 8 cores. The display was kept awake with
  `caffeinate -u` throughout.
- **Load:** the load average was 25 to 90 during the runs (other suites and
  builds on the host). Wall times are therefore upper bounds. The native
  instruction counts below do not depend on load.

### What each part measures

All times are measured from the click on Delete.

- **Edit to export:** the store edit, React's render, and the world split
  (`splitWorld`), until the export starts.
- **Export:** the app's `vizij-authoring:main-face-export` measure. It covers
  `buildSceneGraph` of the world, then `exportScene` of it with the bundle:
  JavaScript on the main thread.
- **Device load:** from the export's end to the
  `vizij-authoring:main-face-loaded` mark. The mark is recorded when the
  provider hands the page the new `Runtime`. This covers `describe` and
  `loadVizij`: the device is built from the bytes, then the view is sent the
  scene.
- **Loaded to next frame:** from the mark to the page's next animation frame.
  This covers the main-thread work between them: the workspace re-rendering on
  the new `Runtime`, and the device's first steps.
- **View frames:** the frames from then until the face is ready again (the
  slot's `data-vizij-ready` and the runtime status both back to ready), and
  the longest of them.

### Results

The table holds seven runs with the full breakdown; four earlier runs, timed at
load average 170 without it, gave totals of 3.5–5.3 s. Columns 2–7 are in
milliseconds.

| Run    | Total | Edit to export | Export | Device load | Loaded to next frame | View frames (count, longest) |
| ------ | ----: | -------------: | -----: | ----------: | -------------------: | ---------------------------: |
| 1      |  6133 |             55 |   2889 |        1501 |                 1297 |                       8, 131 |
| 2      |  5147 |             57 |   2620 |        1283 |                 1023 |                        6, 68 |
| 3      |  4621 |             48 |   2242 |        1162 |                 1024 |                        6, 50 |
| 4      |  5195 |             50 |   2761 |        1251 |                 1018 |                        7, 34 |
| 5      |  4284 |             48 |   2399 |         955 |                  761 |                        6, 49 |
| 6      |  3874 |             31 |   1845 |        1082 |                  779 |                        7, 50 |
| 7      |  5302 |             51 |   2639 |        1319 |                 1132 |                        6, 50 |
| Median |  5147 |             50 |   2620 |        1251 |                 1023 |                        6, 50 |

### Where the time goes

- **The export takes about half.** `buildSceneGraph` and `exportScene` are
  plain JavaScript on the main thread, so the page is unresponsive for their
  duration.
- **The device load is the wasm side of `loadVizij`.** Natively, building the
  device costs 6.9 G instructions (see below).
- **About a second passes between the new `Runtime` and the next frame.** This
  is main-thread work after `loadVizij` resolves, before the view draws
  anything.
- **The view's own part is small.** It takes six to eight frames of 16–50 ms,
  and no pipeline is compiled (see below).

## Native, in instructions retired

### Method

`load_cost` is a vizij-rs example kept outside the repository, built on
vizij-rs `18a01e4f` (the `@vizij/runtime` 7.0.0 release):

- It loads the face and draws it until it is ready.
- It then reloads it under the same id as `@vizij/runtime-react` does:
  `describe`, `loadVizij`'s device build with its defaults (graphs rig,
  pose-driver, pose and standard-adaptation, the active program, the
  animations), and `ViewEvent::LoadFace`.
- Last, it runs view frames until the reloaded face is ready.

The view runs as in the browser: one thread, no pipelined rendering,
synchronous pipeline compilation, drawing offscreen through wgpu on Metal.

Each count is taken two ways:

- **This thread's:** `thread_selfcounts`.
- **The whole process's:** `proc_pid_rusage`'s `ri_instructions`. This count
  includes the Metal driver's threads.

The build profile is `profiling` (release without fat LTO).

### Results

| Part                            | Thread instructions | Process instructions |
| ------------------------------- | ------------------: | -------------------: |
| `describe`                      |              0.40 G |               0.40 G |
| Device build                    |              6.88 G |               6.88 G |
| · `load_face` (composition)     |              1.70 G |                      |
| · stage and declare keys        |              2.91 G |                      |
| · builder (graph parse)         |              1.31 G |                      |
| · spawn program                 |              0.96 G |                      |
| · build, animations             |              0.01 G |                      |
| View, to ready (5 to 14 frames) |         0.16–0.27 G |          0.37–0.76 G |

Across three runs the counts agree to within 0.5 %, except the view's frame
count. That count depends on when the asset loader's tasks land.

On the view's side:

- The pipeline cache holds 42 pipelines before and after the reload. A
  structural reload of a face whose materials are already drawn compiles none.
- No single frame stands out: the first drawn frame is a frame like the others.

Within the device build, staging the neutral pose and declaring the store's
keys costs 2.9 G instructions, more than composing the face's graphs. It is the
largest single part of a reload's wasm work.

## Under SwiftShader (the CI suites' renderer)

The same scenario under the suites' launch flags (`--use-angle=swiftshader`)
renders the GPU's work on the CPU. Five runs at load average 15 to 30 gave:

- Totals: 11.1, 14.2, 12.5, 15.9 and 9.0 s (median 12.5 s).
- Export: 2.6, 2.7, 2.6, 4.2 and 2.0 s.

## Reproduce

The browser numbers come from the spec:

```bash
pnpm --filter vizij-authoring exec playwright test \
  --config=playwright.config.ts --project=workflow \
  e2e/face-edits.workflow.pw.ts -g Quori --repeat-each=5 --workers=1
```

Each run prints `structural edit to ready: {…}` with the parts above, and
records it as the test's `structural-edit-load` annotation. For the GPU, run it
under a config that spreads `playwright.config.ts` and sets
`use.launchOptions.args` to `["--use-angle=metal", "--enable-gpu",
"--ignore-gpu-blocklist"]`.
