import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appTsx = readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
const assetLoaderTs = readFileSync(
  path.resolve(process.cwd(), "src/hooks/useVizijAssetLoader.ts"),
  "utf8",
);

describe("Import lifecycle migration contracts", () => {
  it("keeps legacy migration as the final runtime stabilization substep", () => {
    expect(assetLoaderTs).toContain('id: "runtime-stabilization"');
    expect(assetLoaderTs).toContain('id: "migrate-legacy-bindings"');
    expect(assetLoaderTs).toContain("Migrate legacy variable bindings");
  });

  it("automatically runs migrate-all once import runtime stabilizes", () => {
    expect(appTsx).toContain("handleMigrateAllLegacyBindings()");
    expect(appTsx).toContain('substepId: "migrate-legacy-bindings"');
    expect(appTsx).toContain("migrate-legacy-bindings-complete");
  });
});
