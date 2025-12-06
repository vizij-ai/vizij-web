# Agent Notes · tutorial-agent-face

## Purpose

Fullscreen Vizij face wired to a live Gemini agent. Mouse steers gaze, number keys trigger poses, and streamed visemes drive the mouth in real time.

## Runbook

- Dev server: `pnpm --filter tutorial-agent-face dev`
- Build/preview: `pnpm --filter tutorial-agent-face build` / `pnpm --filter tutorial-agent-face preview`
- Typecheck: `pnpm --filter tutorial-agent-face typecheck`
- Env: set `VITE_GEMINI_API_KEY` (Google AI Studio key) before running dev/build.

## Integration Tips

- Assets live under `public/assets/hugo_rigged.glb`; update `faceAssetUrl` in `src/FaceApp.tsx` if you change rigs.
- Runtime namespace is `tutorial-agent-face`; keep consistent so orchestrator inputs and gaze hooks stay aligned.
- Mouth animation uses viseme weights pushed via `setInput` to `rig/<face>/visemes/*`; adjust `visemeMapping.ts` if your rig uses different segment names.
- UI includes a "Mouth source" selector (text baseline, audio+text synth, or audio+text align); only one generator runs at a time. The align option runs a Viterbi aligner over Gemini audio features + phoneme probs, guided by the text timeline.
- Blend tuning: sliders for viseme blend window (ms) and viseme lead (ms, default +450). Positive lead makes the mouth move earlier relative to audio playback.
- Passive gaze/blink runs when the pointer is idle; mouse gaze takes over while moving.
- Emotion buttons (auto-detected from pose rig) pulse emotions via animateValue.
- Extend `usePoseHotkeys` if you add more poses—remember to update the hint overlay.
