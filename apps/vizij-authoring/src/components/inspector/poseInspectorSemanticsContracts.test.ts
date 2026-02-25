import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const inspectorContentTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/inspector/InspectorContent.tsx"),
  "utf8",
);

describe("B1.3 pose inspector value semantics contracts", () => {
  it("defines explicit legend labels for target, direct, pose-driven, and contribution", () => {
    expect(inspectorContentTsx).toContain("Control Target");
    expect(inspectorContentTsx).toContain("Control Driver");
    expect(inspectorContentTsx).toContain("Current Pose");
    expect(inspectorContentTsx).toContain("Contribution Strength");
  });

  it("separates direct-input editing from pose-driven preview semantics", () => {
    expect(inspectorContentTsx).toContain("poseVariableBaseById");
    expect(inspectorContentTsx).toContain("poseVariableRenderGroups");
    expect(inspectorContentTsx).toContain(
      "const stagedValue = useBindingAuthoring(",
    );
    expect(inspectorContentTsx).toContain("state.inputValues[item.varId]");
    expect(inspectorContentTsx).toContain(
      "const poseDrivenVal = clampToRange(interpolated, base.min, base.max)",
    );
    expect(inspectorContentTsx).toContain(
      "canonical rig input value edited directly",
    );
    expect(inspectorContentTsx).toContain(
      "this pose's computed channel value at the current pose weight",
    );
  });

  it("removes ambiguous current/applied labeling", () => {
    expect(inspectorContentTsx).not.toContain("Current/Applied");
    expect(inspectorContentTsx).toContain("Control Target");
    expect(inspectorContentTsx).toContain("Control Driver");
    expect(inspectorContentTsx).toContain(
      "title={poseSemanticTooltips.target}",
    );
    expect(inspectorContentTsx).not.toContain("Target Value (100%)");
    expect(inspectorContentTsx).not.toContain("Direct Input");
    expect(inspectorContentTsx).not.toContain('defaultLabel="Pose Target"');
  });

  it("exposes per-channel direct+pose compose mode controls", () => {
    expect(inspectorContentTsx).toContain("Compose");
    expect(inspectorContentTsx).toContain('<option value="add">Add</option>');
    expect(inspectorContentTsx).toContain(
      '<option value="average">Average</option>',
    );
    expect(inspectorContentTsx).toContain("setPoseInputComposeMode");
  });

  it("defers heavy channel controls behind explicit expansion", () => {
    expect(inspectorContentTsx).toContain("togglePoseVariableExpansion");
    expect(inspectorContentTsx).toContain("isExpanded && (");
    expect(inspectorContentTsx).toContain("PoseVariableExpandedControls");
  });

  it("removes the per-channel contribution badge from pose rows", () => {
    expect(inspectorContentTsx).not.toContain("Contrib {contributionLabel}");
  });
});
