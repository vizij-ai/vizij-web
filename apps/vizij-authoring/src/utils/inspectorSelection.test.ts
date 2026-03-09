import { describe, expect, it } from "vitest";
import { shouldShowAssetInspector } from "./inspectorSelection";

describe("shouldShowAssetInspector", () => {
  it("shows asset inspectors when no competing selection is active", () => {
    expect(
      shouldShowAssetInspector({
        selectedSceneId: null,
        selectedRigId: null,
        selectedPoseId: null,
        selectedMaterialId: null,
        selectedMotionGraphNodeId: null,
      }),
    ).toBe(true);
  });

  it("hides asset inspectors while a scene object is selected", () => {
    expect(
      shouldShowAssetInspector({
        selectedSceneId: "mouth",
        selectedRigId: null,
        selectedPoseId: null,
        selectedMaterialId: null,
        selectedMotionGraphNodeId: null,
      }),
    ).toBe(false);
  });

  it("hides asset inspectors while another inspector target is selected", () => {
    expect(
      shouldShowAssetInspector({
        selectedSceneId: null,
        selectedRigId: "jaw.open",
        selectedPoseId: null,
        selectedMaterialId: null,
        selectedMotionGraphNodeId: null,
      }),
    ).toBe(false);
    expect(
      shouldShowAssetInspector({
        selectedSceneId: null,
        selectedRigId: null,
        selectedPoseId: "pose-id",
        selectedMaterialId: null,
        selectedMotionGraphNodeId: null,
      }),
    ).toBe(false);
    expect(
      shouldShowAssetInspector({
        selectedSceneId: null,
        selectedRigId: null,
        selectedPoseId: null,
        selectedMaterialId: "material-id",
        selectedMotionGraphNodeId: null,
      }),
    ).toBe(false);
    expect(
      shouldShowAssetInspector({
        selectedSceneId: null,
        selectedRigId: null,
        selectedPoseId: null,
        selectedMaterialId: null,
        selectedMotionGraphNodeId: "node-id",
      }),
    ).toBe(false);
  });
});
