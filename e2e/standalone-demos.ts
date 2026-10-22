import { offsetPort } from "./ports";

// The standalone demo apps covered by the smoke suite. Each runs on its own
// vite dev server (booted by playwright.config.ts) and is smoke-tested by
// tests/standalone-demos-smoke.spec.ts. Keep this list and the ports in sync —
// both the web servers and the specs are generated from it.
//
// These are the "run it on its own" demos that exercise the wasm + render stack
// end to end (the runtime, the node graph). Booting each and asserting
// it renders without page errors is the canary for that stack regressing.
export interface StandaloneDemo {
  /** pnpm workspace filter / package name. */
  filter: string;
  /**
   * Dedicated dev-server port: a base port unique across the list and
   * authoring's 5199, shifted by the e2e port offset (see ports.ts).
   */
  port: number;
}

export const STANDALONE_DEMOS: StandaloneDemo[] = [
  { filter: "demo-vizij-player", port: offsetPort(5200) },
  { filter: "demo-graph-studio", port: offsetPort(5202) },
  // The face page on the Bevy view (its own spec checks the face shows).
  { filter: "vizij-standalone", port: offsetPort(5203) },
  // The minimal face page (its own spec checks an expression shows).
  { filter: "fullscreen-face", port: offsetPort(5204) },
  // The agent face (its own spec checks the face and its debug controls).
  { filter: "tutorial-agent-face", port: offsetPort(5206) },
  // The showcase: five faces on one canvas (its own spec checks each).
  { filter: "vizij-showcase", port: offsetPort(5205) },
];

/** The base URL a demo is served on. */
export function demoUrl(demo: StandaloneDemo): string {
  return `http://127.0.0.1:${demo.port}/`;
}
