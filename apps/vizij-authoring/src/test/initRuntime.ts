import { readFileSync } from "node:fs";
import path from "node:path";
import { init } from "@vizij/runtime";

/**
 * Initializes `@vizij/runtime` from its wasm on disk, for a jsdom test whose
 * code reaches a device (animation sampling does): under jsdom the runtime
 * takes the browser's loader, which would fetch the module from a `file:`
 * URL. A Node-environment test needs none of this.
 */
export function initRuntimeFromDisk(): Promise<void> {
  return init(
    readFileSync(
      path.resolve(
        __dirname,
        "../../node_modules/@vizij/runtime/dist/pkg/vizij_bg.wasm",
      ),
    ),
  );
}
