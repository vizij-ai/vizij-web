# demo-orchestrator

> **Visualise Vizij orchestrator blackboard updates in real time.**  
> This demo wires two animations and two graphs into the orchestrator and displays merged writes, conflicts, and frame diagnostics.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Scenario Breakdown](#scenario-breakdown)
4. [UI Tour](#ui-tour)
5. [Development Scripts](#development-scripts)

---

## Overview

- Built with Vite + React on top of `@vizij/orchestrator-react`.
- Demonstrates how the orchestrator coordinates animation controllers and graph controllers against a shared blackboard.
- Useful for inspecting timing, merged writes, and conflict logs while the orchestrator runs under an RAF loop.

---

## Quick Start

```bash
pnpm install
pnpm --filter demo-orchestrator dev
```

Open the printed local URL and use the control bar to register controllers, start/stop stepping, and inspect merged writes.

---

## Scenario Breakdown

- **Ramp-up animation** – Writes a scalar ramp (`0 → 1`) to `demo/animations/ramp_up.value`.
- **Ramp-down animation** – Writes the inverse ramp (`1 → 0`) to `demo/animations/ramp_down.value`.
- **Multiply graph** – Subscribes to both animation outputs and publishes their product at `demo/graphs/product.value`.
- **Power graph** – Consumes the product, raises `10^product`, and writes the result to `demo/graphs/ten_power.value`.
- **Merged writes panel** – Shows the last few writes across controllers (with Value/Shape payloads).
- **Frame diagnostics** – Displays frame epoch, timings, and conflict logs.

---

## UI Tour

- **Ready / Register** – Wait for the provider to report ready, then press “Register controllers” to load the built-in animation and graph specs.
- **Play / Pause** – Toggles an internal RAF loop that calls `step(1/60)`. When paused you can step manually frame-by-frame.
- **Blackboard cards** – Highlight current values for animation and graph outputs, including raw `ValueJSON` payloads.
- **Merged writes** – Recent batches for copy/paste or debugging; includes shapes so you can inspect numeric layouts.

---

## Development Scripts

```bash
pnpm --filter demo-orchestrator dev       # start Vite dev server
pnpm --filter demo-orchestrator build     # production build + type check
pnpm --filter demo-orchestrator preview   # preview the production build
pnpm --filter demo-orchestrator typecheck # run tsc --noEmit
```

This demo is intentionally simple—use it as a sandbox for orchestrator workflows or to validate how custom controllers write to the blackboard. 🕹️
