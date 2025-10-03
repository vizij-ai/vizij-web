# Demo: Orchestrator Blackboard Explorer

This Vite + React demo drives the Vizij orchestrator with two scalar animations chained through two graphs. It is useful when you need to inspect how blackboard values flow between animations and graphs while the orchestrator loops automatically.

## What the demo does

- **Ramp-up animation** writes a normalised value from `0 → 1` to `demo/animations/ramp_up.value`.
- **Ramp-down animation** writes the inverse ramp (`1 → 0`) to `demo/animations/ramp_down.value`.
- **Multiply graph** subscribes to both animation outputs and publishes their product at `demo/graphs/product.value`.
- **Power graph** consumes the product, combines it with a constant ten, and raises `10^product`, writing the result to `demo/graphs/ten_power.value`.
- The UI surfaces every intermediate blackboard value, recent merged writes, and frame diagnostics so you can verify timing and data propagation.

## Running the demo locally

From the repository root:

```bash
pnpm install
pnpm --filter demo-orchestrator dev
```

Useful scripts:

- `pnpm --filter demo-orchestrator build` – Build the production bundle / run TypeScript checks.
- `pnpm --filter demo-orchestrator preview` – Preview the production build.
- `pnpm --filter demo-orchestrator typecheck` – Run `tsc --noEmit` directly.

## Notes

- Use the **Register controllers** button once the provider reports ready, then press **Play** to start the RAF-driven stepping loop.
- Blackboard cards in the UI display both the live scalar and the raw `WasmValue` payload for clarity. Use the merged writes panel to inspect recent changes or copy sample payloads when building new demos.
