import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const inspectorContentTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/inspector/InspectorContent.tsx"),
  "utf8",
);

const inspectorPanelTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/inspector/InspectorPanel.tsx"),
  "utf8",
);

describe("B2.2 pose weight synchronization contracts", () => {
  it("routes pose inspector blend/apply controls through canonical pose-weight inputs", () => {
    expect(inspectorContentTsx).toContain("usePoseWeightPreview");
    expect(inspectorContentTsx).toContain("selectedPoseWeightInputId");
    expect(inspectorContentTsx).toContain(
      "handleInputValueChange(selectedPoseWeightInputId, clampedAmount)",
    );
    expect(inspectorContentTsx).toContain(
      "const activePoseWeight = usePoseWeightPreview",
    );
  });

  it("routes pose-group inspector controls through canonical pose-weight inputs", () => {
    expect(inspectorPanelTsx).toContain("parsePoseWeightInputSourceId");
    expect(inspectorPanelTsx).toContain("poseWeightInputIdByPoseId");
    expect(inspectorPanelTsx).toContain(
      "handleInputValueChange(poseWeightInputId, clamped)",
    );
    expect(inspectorPanelTsx).toContain(
      "applyStandardInputBatch(canonicalUpdates)",
    );
  });
});
