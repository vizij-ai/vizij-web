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
  say and an expression name of the face standard, said with that expression. The user
  speaking over the face interrupts it (`src/agent/conversation.ts`).
- Expresses: twelve of the face standard's expression names, each a
  `set_expression` run on the runtime
  (`runtime.invoke("set_expression", { expression, valence, arousal })`,
  the arousal as the intensity). The run holds the expression until the next
  one takes the face over, crossfading from where the face is — the
  [skill](https://github.com/vizij-ai/vizij-rs/blob/main/docs/skills.md#the-expression-setters)
  a ROS 2 client commands on the native device; the face's standard
  adaptation maps its weights onto the face's own poses.

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

## The Tauri shell

The shell hands the page its face and the agent's flags, through the commands
`get_glb_source`, `read_glb_file` and `get_speech_keys`. Beside the page it
runs an Arora device of its own, on arora 13, which the page does not render.
The device runs the ROS4HRI profile graph (`standard/ros4hri/*` in,
`standard/vizij/*` out), the look_at skill and the `say` module, which plays
its audio from the shell through the TTS deployment `--api-url` names. A remote
may write the profile's inputs, `standard/ros4hri/*`, each of the type the
profile states but for the gaze point, and no other key; it may call the
device's methods (`look_at`, `say`, the interpreter module's). The device is
reachable over:

- the WebSocket bridge, `ws://127.0.0.1:9000` (`--port`), with its control
  panel on the same port unless `--no-web-control`;
- the ROS 2 bridge, with `--features ros2` (`ros2-zenoh` for the Zenoh
  backend): the ROS4HRI preset's face topics, the `/skill/look_at` and
  `/skill/say` actions, `/skill/set_expression` onto the expression keys, and
  each key published under `/vizij/keys/<path>` (`--ros2-namespace`,
  `--ros2-domain-id`);
- Semio Studio, with `--features studio-bridge`, the Android build's feature:
  `arora-studio-bridge-client` 10, whose keys a Studio reads from studio
  client 10 on. The device registers as `vizij-<random>`, owned by
  `DEVICE_OWNERS` or by the owners an earlier launch was given — an APK has
  neither, so it registers unowned — under one Studio identity across
  launches; `STUDIO_BRIDGE_ENDPOINT` names another bridge.

## Files

- [`src/App.tsx`](./src/App.tsx): the page.
- [`src/face.ts`](./src/face.ts): the face over `@vizij/runtime`.
- [`src/agent/`](./src/agent): the ear, the mind, the conversation, the keys.
- [`src/glb.ts`](./src/glb.ts): where the face comes from.
- [`src-tauri/`](./src-tauri): the shell, its CLI flags and its device;
  `src/skills.rs` holds the device's interpreter, `src/studio.rs` its Studio
  connection.
