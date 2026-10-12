# Agent Notes · tutorial-agent-face

## Purpose

Fullscreen Vizij face wired to a live Gemini agent. The face's program reacts to the conversation state the app writes; the agent's tools steer the gaze target and show expressions; the agent's audio drives the lips through `play_viseme`.

## Runbook

- Dev server: `pnpm --filter tutorial-agent-face dev`
- HTTPS LAN dev: `pnpm --filter tutorial-agent-face dev -- --host --https` or `pnpm --filter tutorial-agent-face dev:https`
- Build/preview: `pnpm --filter tutorial-agent-face build` / `pnpm --filter tutorial-agent-face preview`
- Typecheck, lint, tests: `pnpm --filter tutorial-agent-face typecheck`, `lint`, `test`
- e2e: `e2e/tests/tutorial-agent-face.spec.ts`, served on port 5206 (no Gemini key: the face and the debug controls).
- Env: set `VITE_GEMINI_API_KEY` (Google AI Studio key) before running dev/build.
- Recommended setup: create `apps/tutorial-agent-face/.env.local` with `VITE_GEMINI_API_KEY=...`, then run from repo root.
- Reader-facing setup instructions live in `README.md`.
- LAN microphone capture requires HTTPS or `localhost`; plain `http://<LAN-IP>` should be treated as a non-mic-capable setup.
- The HTTPS dev path generates a local self-signed certificate under `.vite/https/`.

## Integration Tips

- The app loads Quori from `apps/vizij-authoring/public/assets/Quori_Current_Extended.glb`; update `faceAssetUrl` in `src/FaceApp.tsx` if the canonical sample face moves.
- The face is driven only through its Arora API on `standard/vizij/*` keys and its `play_viseme` method. Its program writes the eye positions: steer the eyes through the gaze target (`useGazeTarget`), never through the eye positions.
- "Mouth source" selects the viseme timeline (text baseline, audio+text synth, audio+text align); the viseme lead slider shifts it against playback. The device's viseme players own the blend.
- The debug controls turn on mouse gaze, the expression hotkeys and the emotion buttons, and give the agent its `express_emotion` tool.
