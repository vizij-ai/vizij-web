# tutorial-agent-face

`tutorial-agent-face` is the live conversational runtime demo. It builds on the fullscreen runtime tutorial and adds Gemini Live, viseme playback, speech anticipation, idle gaze behavior, and function-call tools that steer the face through `@vizij/runtime-react`.

Use this app when you want the clearest example of a runtime-react face that is being actively driven by voice, gaze, emotion, and agent tools.

This README focuses on the app-specific delta. The shared runtime-react basics live in the fullscreen tutorial and the package README.

## Environment

The app requires a Google AI Studio Gemini key exposed as `VITE_GEMINI_API_KEY`.

Recommended setup:

```bash
cat > apps/tutorial-agent-face/.env.local <<'EOF'
VITE_GEMINI_API_KEY=your_google_ai_studio_key
EOF
```

Vite loads `.env.local` automatically for this app.

## Scripts

```bash
pnpm --filter tutorial-agent-face dev
pnpm --filter tutorial-agent-face dev:https
pnpm --filter tutorial-agent-face build
pnpm --filter tutorial-agent-face preview
pnpm --filter tutorial-agent-face typecheck
pnpm --filter tutorial-agent-face lint
```

If you are not using `.env.local`, pass the key inline when running the commands.

## Microphone Access On LAN

`getUserMedia` is only available on trustworthy origins. That means:

- `http://localhost:5173` works for local-only microphone testing.
- `http://<LAN-IP>:5173` is not a trustworthy origin, so the app will warn and keep Connect disabled.
- `https://<LAN-IP>:5173` is the supported LAN microphone path.

Use one of these commands from the repo root:

```bash
pnpm --filter tutorial-agent-face dev
pnpm --filter tutorial-agent-face dev -- --host --https
pnpm --filter tutorial-agent-face dev:https
```

The HTTPS dev flow generates a local self-signed certificate under `apps/tutorial-agent-face/.vite/https/`. Your browser may ask you to accept the certificate the first time you open the LAN URL.

Use `pnpm`, not `npm`, in this workspace. The monorepo uses `workspace:*` dependencies, so `npm install` is not supported here.

## Docs

- App walkthrough: [`tutorial.md`](./tutorial.md)
- Baseline runtime tutorial: [`apps/tutorial-fullscreen-face/tutorial.md`](../tutorial-fullscreen-face/tutorial.md)
- Runtime package reference: [`packages/@vizij/runtime-react/README.md`](../../packages/@vizij/runtime-react/README.md)

The walkthrough focuses on what this app adds on top of the baseline:

- Gemini Live session wiring
- tool-driven gaze and emotion control
- runtime-aware viseme, anticipation, and warmup behavior

## Key Files

- [`src/FaceApp.tsx`](./src/FaceApp.tsx): runtime bootstrap + live UI shell
- [`src/hooks/useGeminiLive.ts`](./src/hooks/useGeminiLive.ts): Gemini Live session
- [`src/hooks/useAgentFaceTools.ts`](./src/hooks/useAgentFaceTools.ts): tool-driven gaze/emotion runtime control
- [`src/hooks/useVisemeMouth.ts`](./src/hooks/useVisemeMouth.ts): speech-to-mouth behavior
