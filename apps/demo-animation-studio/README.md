# demo-animation-studio

> **Developer-facing playground for Vizij animation runtime workflows.**
> This app exercises `@vizij/animation-react` with a richer control surface for player/session management, preset editing, event logging, and output inspection.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [What It Demonstrates](#what-it-demonstrates)
4. [Key Files](#key-files)

---

## Overview

- Built with Vite + React.
- Uses `@vizij/animation-react` plus `@vizij/animation-wasm` directly for ABI/init visibility.
- Provides a denser animation-focused surface than the minimal demo apps.
- Useful for validating player controls, preset loading, editor flows, and event/output behavior while evolving the animation packages.

---

## Quick Start

```bash
pnpm install
pnpm --filter demo-animation-studio dev
```

Additional scripts:

```bash
pnpm --filter demo-animation-studio build
pnpm --filter demo-animation-studio preview
pnpm --filter demo-animation-studio typecheck
pnpm --filter demo-animation-studio test
```

---

## What It Demonstrates

- engine status and ABI visibility for the animation wasm runtime
- transport-style playback controls such as play, pause, stop, speed, loop mode, and seek
- preset loading and session-oriented animation workflows
- animation editing and configuration panels
- event logging and runtime output/history inspection

Compared with `minimal-demo-animation`, this app is the heavier debugging and workflow surface rather than the smallest-possible sample.

---

## Key Files

| File                 | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `src/App.tsx`        | App shell, runtime wiring, engine/transport bars, and studio panels. |
| `src/components/`    | Animation editor, config, session, player, and logging UI.           |
| `src/presets/`       | Bundled animation presets used by the app.                           |
| `src/styles/app.css` | App-specific styling for the studio layout.                          |

Use this app when you need broader animation workflow coverage than the minimal demos provide.
