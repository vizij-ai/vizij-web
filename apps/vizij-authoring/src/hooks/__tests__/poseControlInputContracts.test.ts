import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const useRigControllerTs = readFileSync(
  path.resolve(process.cwd(), "src/hooks/useRigController.ts"),
  "utf8",
);

const variablesPanelTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/panels/VariablesPanel.tsx"),
  "utf8",
);

describe("pose control input guard contracts", () => {
  it("keeps internal pose-control graph inputs out of runtime editable input routes", () => {
    expect(useRigControllerTs).toContain("isPoseControlInputPath(graphPath)");
    expect(useRigControllerTs).toContain(
      "should not become editable direct-input routes",
    );
  });

  it("hides internal pose-control managed inputs from the Inputs pane rows", () => {
    expect(variablesPanelTsx).toContain(
      ".filter((entry) => !isPoseControlInputPath(entry.input.path))",
    );
  });

  it("projects per-channel compose modes into rig graph compilation", () => {
    expect(useRigControllerTs).toContain("buildPoseComposeModeByInputId");
    expect(useRigControllerTs).toContain(
      "inputComposeModesById: poseComposeModesByInputId",
    );
  });

  it("keeps managed-input fallback routing so pose weights remain stageable", () => {
    expect(useRigControllerTs).toContain("managedStandardInputs.forEach");
    expect(useRigControllerTs).toContain(
      "buildFallbackGraphPath(faceId, input)",
    );
  });
});
