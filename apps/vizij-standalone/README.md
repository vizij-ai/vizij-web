# Vizij Standalone

The face page: one face on the Bevy view, run by its own Arora runtime, and a
voice agent talking through it. Everything the page needs is
[`@vizij/runtime`](https://github.com/vizij-ai/vizij-rs/tree/main/npm/@vizij/runtime)
— the view and the face's Arora in one wasm module — plus the agent's two
services. A Tauri shell (`src-tauri`) wraps the same page on the desktop
until the native [`vizij`](https://github.com/vizij-ai/vizij-rs/tree/main/crates/vizij)
binary ships installers.

## What it does

- Loads a face GLB — the page's `?glb=` URL, the shell's `--glb`, a file you
  open or drop, else the repository's
  `apps/vizij-authoring/public/assets/Quori_Current_Extended.glb` (Quori with
  its standard adaptation, so its expressions and lips follow the face
  standard) — and shows it: `mount`, `loadVizij`, `placeVizijIn`,
  `whenReady`, `run`.
- Speaks: a `say` run on the runtime (`runtime.invoke("say", { text })`,
  which resolves to the run's `RunHandle`), its audio played by the
  runtime's Web Audio player, its lips driven by the runtime's viseme
  players. `stop` halts the run (`runtime.halt(run.run)`); the audio cuts
  within 250 ms. The run has ended once its `status` key reads terminal.
- Listens and thinks: the microphone streamed to Deepgram (`src/agent/listen.ts`),
  each utterance answered by OpenAI (`src/agent/think.ts`) with the text to
  say and a ROS4HRI expression name, said with that expression. The user
  speaking over the face interrupts it (`src/agent/conversation.ts`).
- Expresses: the twelve ROS4HRI expression names, written to
  `standard/ros4hri/expression/name` (a `str`) with
  `standard/ros4hri/expression/arousal` at 1 (an `f32`) in one store change;
  the face's mapping shows the named expression at that arousal as its
  intensity, so a name alone, at the resting arousal of 0, shows nothing.
  Each write is of the type the key declares, as the device requires. The
  page writes no `rig/<faceId>/…` path.

Without a Deepgram key the microphone is off; without an OpenAI key the text
box says what you type. Keys come from the shell's flags (`--deepgram-key`,
`--openai-key`, `--api-url`, `--auto-mic`), the build's `VITE_DEEPGRAM_API_KEY`
/ `VITE_OPENAI_API_KEY` / `VITE_API_URL`, or the page's own settings panel
(kept in the browser).

## Run

```bash
pnpm --filter vizij-standalone run vite    # the page, http://localhost:1420
pnpm --filter vizij-standalone run dev     # the Tauri shell around it
pnpm --filter vizij-standalone run build   # a static build under dist/
pnpm --filter vizij-standalone run test    # the agent's units
```

The e2e suite (`e2e/tests/vizij-standalone-face.spec.ts`) boots the page,
waits for the face to be ready, and checks the canvas shows it and that an
expression changes it.

## Files

- [`src/App.tsx`](./src/App.tsx): the page.
- [`src/face.ts`](./src/face.ts): the face over `@vizij/runtime`.
- [`src/agent/`](./src/agent): the ear, the mind, the conversation, the keys.
- [`src/glb.ts`](./src/glb.ts): where the face comes from.
- [`src-tauri/`](./src-tauri): the desktop shell and its CLI flags.
