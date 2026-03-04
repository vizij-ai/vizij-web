import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const useRigControllerTs = readFileSync(
  path.resolve(process.cwd(), "src/hooks/useRigController.ts"),
  "utf8",
);

const runtimeInputRoutesTs = readFileSync(
  path.resolve(process.cwd(), "src/hooks/rigController/runtimeInputRoutes.ts"),
  "utf8",
);

const runtimeInputStagingTs = readFileSync(
  path.resolve(process.cwd(), "src/hooks/rigController/runtimeInputStaging.ts"),
  "utf8",
);

const rigGraphCompilerTs = readFileSync(
  path.resolve(process.cwd(), "src/hooks/rigController/rigGraphCompiler.ts"),
  "utf8",
);

const useRigGraphImportTs = readFileSync(
  path.resolve(process.cwd(), "src/hooks/useRigGraphImport.ts"),
  "utf8",
);

const useBundleSynchronizerTs = readFileSync(
  path.resolve(process.cwd(), "src/hooks/useBundleSynchronizer.ts"),
  "utf8",
);

const variablesPanelTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/panels/VariablesPanel.tsx"),
  "utf8",
);

describe("pose control input guard contracts", () => {
  it("keeps internal pose-control graph inputs out of runtime editable input routes", () => {
    expect(runtimeInputRoutesTs).toContain("isPoseControlInputPath(graphPath)");
  });

  it("hides internal pose-control managed inputs from the Inputs pane rows", () => {
    expect(variablesPanelTsx).toContain(
      ".filter((entry) => !isPoseControlInputPath(entry.input.path))",
    );
  });

  it("projects per-channel compose modes into rig graph compilation", () => {
    expect(rigGraphCompilerTs).toContain("buildPoseComposeModeByInputId");
    expect(rigGraphCompilerTs).toContain("inputComposeModesById");
  });

  it("keeps graph import rebuild aligned with export compose-mode projection", () => {
    expect(useRigControllerTs).toContain(
      "poseConfig: poseConfigSnapshot ?? null",
    );
    expect(useRigGraphImportTs).toContain("buildPoseComposeModeByInputId");
    expect(useRigGraphImportTs).toContain("inputComposeModesById");
    expect(useRigGraphImportTs).toContain("poseConfigHint");
    expect(useBundleSynchronizerTs).toContain("poseConfigHint");
  });

  it("keeps managed-input fallback routing so pose weights remain stageable", () => {
    expect(runtimeInputRoutesTs).toContain("managedStandardInputs.forEach");
    expect(runtimeInputRoutesTs).toContain(
      "buildFallbackGraphPath(faceId, input)",
    );
  });

  it("deduplicates runtime staging writes for unchanged graph-path values", () => {
    expect(runtimeInputStagingTs).toContain("stagedByGraphPath");
    expect(runtimeInputStagingTs).toContain("Object.is(staged, value)");
    expect(useRigControllerTs).toContain("stagedRuntimeInputValuesRef");
  });

  it("skips no-op direct input updates before staging", () => {
    expect(useRigControllerTs).toContain(
      "Object.is(inputValuesRef.current[resolvedInputId], value)",
    );
  });
});
