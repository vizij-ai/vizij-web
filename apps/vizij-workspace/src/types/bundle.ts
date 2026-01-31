import type { VizijBundleGraphEntry } from "@vizij/render";

/**
 * Vizij bundle graph entry with its optional IR payload included so downstream
 * consumers can preserve round-tripping when exporting bundles.
 */
export type BundleGraphWithIr = VizijBundleGraphEntry & {
  ir?: Record<string, unknown> | null;
};
