// The standalone demo apps covered by the smoke suite. Each runs on its own
// vite dev server (booted by playwright.config.ts) and is smoke-tested by
// tests/standalone-demos-smoke.spec.ts. Keep this list and the ports in sync —
// both the web servers and the specs are generated from it.
//
// These are the "run it on its own" demos that exercise the wasm + render stack
// end to end (orchestrator / animation / node-graph). Booting each and asserting
// it renders without page errors is the canary for that stack regressing.
export interface StandaloneDemo {
  /** pnpm workspace filter / package name. */
  filter: string;
  /** Dedicated dev-server port (must be unique across the list + authoring 5199). */
  port: number;
}

export const STANDALONE_DEMOS: StandaloneDemo[] = [
  { filter: "demo-vizij-player", port: 5200 },
  { filter: "demo-animation-studio", port: 5201 },
  { filter: "demo-graph-studio", port: 5202 },
];

/** The base URL a demo is served on. */
export function demoUrl(demo: StandaloneDemo): string {
  return `http://127.0.0.1:${demo.port}/`;
}
