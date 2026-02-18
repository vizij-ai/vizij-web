import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const inspectorContentTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/inspector/InspectorContent.tsx"),
  "utf8",
);

describe("B1.3 pose inspector value semantics contracts", () => {
  it("defines explicit legend labels for target, applied, and contribution", () => {
    expect(inspectorContentTsx).toContain("Target Value");
    expect(inspectorContentTsx).toContain("Current/Applied");
    expect(inspectorContentTsx).toContain("Contribution Strength");
  });

  it("uses runtime/autorig-authoritative path for applied values", () => {
    expect(inspectorContentTsx).toContain("resolvePoseAppliedValue");
    expect(inspectorContentTsx).toContain(
      "runtime/autorig-authoritative value currently applied",
    );
    expect(inspectorContentTsx).toContain("computePoseContributionSemantics");
  });

  it("removes ambiguous pose target labeling", () => {
    expect(inspectorContentTsx).toContain('defaultLabel="Target Value"');
    expect(inspectorContentTsx).not.toContain('defaultLabel="Pose Target"');
  });
});
