# minimal-demo-animation

> **Smallest practical Vizij animation demo for React.**
> This app exercises `@vizij/animation-react` with a compact UI for loading sample animations, editing JSON, staging the result, and watching a few tracked outputs update.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [What It Demonstrates](#what-it-demonstrates)
4. [Key Files](#key-files)

---

## Overview

- Built with Vite + React.
- Uses `@vizij/animation-react` with `@vizij/minimal-demo-ui` for the app chrome.
- Keeps dependencies and UI surface intentionally small so it remains the clearest animation “hello world” in the repo.
- Useful for sanity-checking animation provider changes without the heavier workflow UI from `demo-animation-studio`.

---

## Quick Start

```bash
pnpm install
pnpm --filter minimal-demo-animation dev
```

Additional scripts:

```bash
pnpm --filter minimal-demo-animation build
pnpm --filter minimal-demo-animation preview
pnpm --filter minimal-demo-animation typecheck
pnpm --filter minimal-demo-animation test
```

---

## What It Demonstrates

- loading bundled sample animations
- validating imported animation JSON before applying it
- tracking current player state and key runtime values
- exporting and reloading animation JSON during local experimentation

If you need the canonical minimal integration example for `@vizij/animation-react`, start here.

---

## Key Files

| File             | Purpose                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `src/App.tsx`    | Main sample selector, JSON editing, validation, and tracked output UI. |
| `src/main.tsx`   | App entrypoint and React bootstrapping.                                |
| `vite.config.ts` | Local Vite configuration for the demo.                                 |

This demo is intentionally small; keep new features focused on clarity and regression coverage rather than breadth.
