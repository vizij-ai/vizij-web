# tutorial-agent-face

`tutorial-agent-face` is the live conversational face. It builds on the fullscreen tutorial and adds Gemini Live as the agent and its voice, lips from the agent's audio through the device's `play_viseme`, the conversation state the face's program reacts to, and tools the agent calls to steer the gaze and show expressions — all through the Vizij face standard.

This README covers setup. The walkthrough is [`tutorial.md`](./tutorial.md).

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
pnpm --filter tutorial-agent-face test
```

The e2e spec is `e2e/tests/tutorial-agent-face.spec.ts` (port 5206). It needs no Gemini key: it checks the face and its debug controls.

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

## Key Files

- [`src/FaceApp.tsx`](./src/FaceApp.tsx): the canvas, the provider and the live UI shell
- [`src/hooks/useGeminiLive.ts`](./src/hooks/useGeminiLive.ts): the Gemini Live session
- [`src/hooks/useConversationState.ts`](./src/hooks/useConversationState.ts): the conversation state onto the face standard
- [`src/hooks/useGazeTarget.ts`](./src/hooks/useGazeTarget.ts): the eyes through the face standard's gaze target
- [`src/hooks/useAgentFaceTools.ts`](./src/hooks/useAgentFaceTools.ts): the agent's `set_gaze` and `express_emotion` tools
- [`src/hooks/useVisemeMouth.ts`](./src/hooks/useVisemeMouth.ts): the agent's audio onto `play_viseme`
