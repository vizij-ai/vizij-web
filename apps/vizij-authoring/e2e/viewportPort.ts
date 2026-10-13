import { readFileSync } from "node:fs";

type Manifest = {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function readManifest(relative: string): Manifest {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));
}

/** The major version a manifest requires of `@vizij/runtime`. */
function runtimeMajor(manifest: Manifest): number {
  const range =
    manifest.peerDependencies?.["@vizij/runtime"] ??
    manifest.dependencies?.["@vizij/runtime"];
  const match = /(\d+)/.exec(range ?? "");
  return match ? Number(match[1]) : Number.NaN;
}

/**
 * Whether the workspace's `@vizij/runtime-react` is the 1.0 line, over
 * `@vizij/runtime` 6, while this app still requires an earlier runtime: the
 * app has yet to move onto the 1.0 packages
 * ([VIZ-148](https://linear.app/semio-ai/issue/VIZ-148)).
 *
 * The app links the package by `workspace:*`, so against 1.0 it imports
 * names the package no longer exports and does not load: the viewport specs
 * are then expected to fail. The move onto 1.0 raises the app's
 * `@vizij/runtime` requirement to `^6.0.0`, which makes this false.
 */
export const VIEWPORT_PORT_PENDING =
  runtimeMajor(
    readManifest("../node_modules/@vizij/runtime-react/package.json"),
  ) >= 6 && runtimeMajor(readManifest("../package.json")) < 6;

export const VIEWPORT_PORT_PENDING_REASON =
  "vizij-authoring is not on @vizij/runtime-react 1.0 yet (VIZ-148): " +
  "the app does not load against the workspace's 1.0 packages";
