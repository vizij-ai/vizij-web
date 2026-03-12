# tutorial-agent-face

`tutorial-agent-face` is the live Gemini + Vizij runtime demo. It loads a fullscreen face, connects to Gemini Live, and drives gaze, visemes, poses, and tool-triggered emotion changes through `@vizij/runtime-react`.

## Prerequisites

- Node.js 18 or newer
- `pnpm`
- A Google AI Studio Gemini API key

Get the key from Google AI Studio, then expose it to Vite as `VITE_GEMINI_API_KEY`.

## Run Locally

The recommended setup is a workspace-local env file in the app directory:

```bash
cat > apps/tutorial-agent-face/.env.local <<'EOF'
VITE_GEMINI_API_KEY=your_google_ai_studio_key
EOF

pnpm --filter tutorial-agent-face dev
```

Vite will load `.env.local` automatically for this app. Keep the `VITE_` prefix because browser-visible Vite env vars must use it.

### One-shot alternatives

Linux/macOS:

```bash
VITE_GEMINI_API_KEY=your_google_ai_studio_key \
  pnpm --filter tutorial-agent-face dev
```

Windows PowerShell:

```powershell
$env:VITE_GEMINI_API_KEY="your_google_ai_studio_key"
pnpm --filter tutorial-agent-face dev
```

## Build And Preview

```bash
pnpm --filter tutorial-agent-face build
pnpm --filter tutorial-agent-face preview
```

If you are not using `.env.local`, provide the key inline for both commands:

```bash
VITE_GEMINI_API_KEY=your_google_ai_studio_key \
  pnpm --filter tutorial-agent-face build

VITE_GEMINI_API_KEY=your_google_ai_studio_key \
  pnpm --filter tutorial-agent-face preview
```

## Other Useful Commands

```bash
pnpm --filter tutorial-agent-face typecheck
pnpm --filter tutorial-agent-face lint
```

## More Detail

- Runtime wiring and bundle setup walkthrough: [`tutorial.md`](./tutorial.md)
- Internal implementation notes for agents: [`AGENTS.md`](./AGENTS.md)
