# vizij-website

> **Marketing & documentation site for Vizij.**  
> Built with Vite + React to showcase components, demos, and integration guides across the Vizij platform.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Environment Variables](#environment-variables)
4. [Structure](#structure)
5. [Development Notes](#development-notes)

---

## Overview

- Uses the shared Vizij renderer packages to embed live demos.
- Documents API usage, rig configuration, and orchestration workflows.
- Integrates Cloud Functions for TTS demos via a configurable API base URL.
- Built on the Vite + React TypeScript template with ESLint configured for modern React.

---

## Quick Start

```bash
pnpm install
pnpm --filter vizij-website dev
```

Additional scripts:

```bash
pnpm --filter vizij-website build      # production build + type check
pnpm --filter vizij-website preview    # preview the production bundle
pnpm --filter vizij-website lint       # run ESLint
pnpm --filter vizij-website test       # (if/when tests are added)
```

---

## Environment Variables

Create an `.env.local` file in this app to provide the TTS API base URL:

```
VITE_API_URL=https://us-central1-semio-vizij.cloudfunctions.net/api
```

The value is required at runtime. If it is missing, the site surfaces a clear error message.

---

## Structure

| Path                      | Description                                               |
| ------------------------- | --------------------------------------------------------- |
| `src/`                    | React routes, components, and demo sections.              |
| `src/components/`         | Marketing sections, nav, hero, CTA.                       |
| `src/demos/`              | Embedded Vizij demos (renderer, graphs, orchestrator).    |
| `public/`                 | Static assets.                                            |
| `apps/website/functions/` | Cloud Functions used by the TTS demos (see README there). |

---

## Development Notes

- When linking local WASM/React packages, follow the guidance in the monorepo README to preserve symlinks (`preserveSymlinks: true`) and exclude linked wasm packages from Vite’s pre-bundling step.
- The template ships with SWC-based React fast-refresh (`@vitejs/plugin-react-swc`). Adjust ESLint rules to `recommendedTypeChecked` if you need type-aware linting (see the eslint config comments in this repo).
- The “animation player” section still expects a wasm bundle in `apps/website/animation-player/pkg`. Rebuild `vizij-animation-wasm` and copy/link the output if you modify the animation runtime.
