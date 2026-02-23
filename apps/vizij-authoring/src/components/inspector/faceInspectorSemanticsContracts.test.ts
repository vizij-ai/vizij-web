import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const transformSectionTsx = readFileSync(
  path.resolve(
    process.cwd(),
    "src/components/inspector/RiggingTransformSection.tsx",
  ),
  "utf8",
);
const morphSectionTsx = readFileSync(
  path.resolve(
    process.cwd(),
    "src/components/inspector/RiggingMorphTargetsSection.tsx",
  ),
  "utf8",
);
const materialSectionTsx = readFileSync(
  path.resolve(
    process.cwd(),
    "src/components/inspector/RiggingMaterialSection.tsx",
  ),
  "utf8",
);

describe("B1.4 face inspector truthfulness + lock contracts", () => {
  it("renders explicit current-value source labels", () => {
    expect(transformSectionTsx).toContain("Current Source:");
    expect(morphSectionTsx).toContain("Current Source:");
    expect(materialSectionTsx).toContain("Current Source:");
  });

  it("uses per-channel lock toggles instead of shared feature lock toggles", () => {
    expect(transformSectionTsx).toContain("toggleInspectorChannelLock");
    expect(morphSectionTsx).toContain("toggleInspectorChannelLock");
    expect(materialSectionTsx).toContain("toggleInspectorChannelLock");
    expect(transformSectionTsx).not.toContain("setFeatureAnimated(");
    expect(morphSectionTsx).not.toContain("setFeatureAnimated(");
    expect(materialSectionTsx).not.toContain("setFeatureAnimated(");
  });

  it("routes lock toggles through autorig input enable/disable mutations", () => {
    expect(transformSectionTsx).toContain("handleDisableStandardInput");
    expect(transformSectionTsx).toContain("handleEnableStandardInput");
    expect(morphSectionTsx).toContain("handleDisableStandardInput");
    expect(morphSectionTsx).toContain("handleEnableStandardInput");
    expect(materialSectionTsx).toContain("handleDisableStandardInput");
    expect(materialSectionTsx).toContain("handleEnableStandardInput");
  });
});
