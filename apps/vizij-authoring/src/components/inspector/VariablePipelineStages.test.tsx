import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LegacyBindingMigrationAssessment } from "./pipelineStages";
import { VariablePipelineStages } from "./VariablePipelineStages";

type VariablePipelineStagesProps = React.ComponentProps<
  typeof VariablePipelineStages
>;

afterEach(() => {
  cleanup();
});

function createMigration(
  overrides: Partial<LegacyBindingMigrationAssessment>,
): LegacyBindingMigrationAssessment {
  return {
    kind: "none",
    expression: "",
    canonicalExpression: "",
    reason: null,
    ...overrides,
  };
}

function createBaseProps(): VariablePipelineStagesProps {
  return {
    parentExpression: "self + jawParent",
    compiledEquation:
      "effective = clamp(if(override.enabled, override.value, blend(parentContribution, directContribution)))",
    parents: [
      {
        id: "parent:jaw",
        label: "Jaw Parent",
        kind: "variable" as const,
        onInspect: vi.fn(),
        directControl: {
          value: 0.4,
          min: -1,
          max: 1,
          onValueChange: vi.fn(),
        },
        linkControl: {
          enabled: true,
          scale: 1,
          offset: 0,
          onEnabledChange: vi.fn(),
          onScaleChange: vi.fn(),
          onOffsetChange: vi.fn(),
        },
      },
    ],
    children: [
      {
        id: "child:mouth",
        label: "Mouth Child",
        kind: "variable" as const,
        onInspect: vi.fn(),
        onUnlink: vi.fn(),
        linkControl: {
          enabled: true,
          scale: 1,
          offset: 0,
          onEnabledChange: vi.fn(),
          onScaleChange: vi.fn(),
          onOffsetChange: vi.fn(),
        },
      },
    ],
    poses: [] as VariablePipelineStagesProps["poses"],
    diagnostics: {
      parentContribution: 0.4,
      poseContribution: null,
      directContribution: 0.2,
      blendedResult: 0.1,
      overrideSelectedResult: 0.1,
      effectiveResult: 0.1,
    },
    directInputEnabled: true,
    directInputPath: "rig/robot/controls/jawOpen",
    directValue: 0.2,
    directDefaultValue: 0,
    directMin: -1,
    directMax: 1,
    directControlDisabled: false,
    directControlReason: null,
    onDirectInputEnabledChange: vi.fn(),
    onDirectValueChange: vi.fn(),
    onDirectReset: vi.fn(),
    overrideEnabled: false,
    overrideValue: 0,
    overrideMin: -1,
    overrideMax: 1,
    onOverrideEnabledChange: vi.fn(),
    onOverrideValueChange: vi.fn(),
    clampEnabled: true,
    onClampEnabledChange: vi.fn(),
    migration: createMigration({ kind: "convertible" }),
    migrationSummary: {
      totalLegacy: 3,
      migrated: 1,
      convertible: 1,
      nonConvertible: 1,
    },
    onParentExpressionChange: vi.fn(),
    onCreateParentBinding: vi.fn(),
    onMigrateLegacyBinding: vi.fn(),
    onMigrateAllLegacyBindings: vi.fn(),
    onAddChild: vi.fn(),
  };
}

describe("VariablePipelineStages", () => {
  it("renders stage-oriented sections and diagnostics", () => {
    const props = createBaseProps();
    const view = render(<VariablePipelineStages {...props} />);

    expect(view.getByTestId("pipeline-stage-parents")).toBeTruthy();
    expect(view.getByTestId("pipeline-stage-children")).toBeTruthy();
    expect(view.getByTestId("pipeline-stage-poses")).toBeTruthy();
    expect(view.getByTestId("pipeline-stage-direct-input")).toBeTruthy();
    expect(view.getByTestId("pipeline-stage-override")).toBeTruthy();
    expect(view.getByTestId("pipeline-stage-clamp")).toBeTruthy();
    expect(view.getByTestId("pipeline-stage-compiled")).toBeTruthy();
    expect(
      view.getByTestId("pipeline-compiled-equation").textContent,
    ).toContain("effective =");
    expect(view.getByText(/Parents 0.400/i)).toBeTruthy();
    expect(view.getByText(/Direct 0.200/i)).toBeTruthy();
    expect(view.getByTestId("pipeline-migration-summary")).toBeTruthy();
  });

  it("routes parent/child interactions and stage toggles", () => {
    const props = createBaseProps();
    const view = render(<VariablePipelineStages {...props} />);

    const parentStage = view.getByTestId("pipeline-stage-parents");
    fireEvent.click(within(parentStage).getByText("Jaw Parent"));
    expect(props.parents[0]?.onInspect).toHaveBeenCalledTimes(1);

    const childStage = view.getByTestId("pipeline-stage-children");
    fireEvent.click(within(childStage).getByText("Mouth Child"));
    expect(props.children[0]?.onInspect).toHaveBeenCalledTimes(1);
    fireEvent.click(within(childStage).getByRole("button", { name: "Unlink" }));
    expect(props.children[0]?.onUnlink).toHaveBeenCalledTimes(1);

    const parentSwitches = within(parentStage).getAllByRole("switch");
    fireEvent.click(parentSwitches[0]!);
    expect(props.parents[0]?.linkControl?.onEnabledChange).toHaveBeenCalledWith(
      false,
    );
    fireEvent.change(
      within(parentStage).getByTestId("pipeline-parent-expression-editor"),
      {
        target: { value: "self - jawParent*2" },
      },
    );
    fireEvent.click(
      within(parentStage).getByRole("button", { name: "Apply Expression" }),
    );
    expect(props.onParentExpressionChange).toHaveBeenCalledWith(
      "self - jawParent*2",
    );

    const childSwitches = within(childStage).getAllByRole("switch");
    fireEvent.click(childSwitches[0]!);
    expect(
      props.children[0]?.linkControl?.onEnabledChange,
    ).toHaveBeenCalledWith(false);

    const directStage = view.getByTestId("pipeline-stage-direct-input");
    fireEvent.click(within(directStage).getByRole("switch"));
    expect(props.onDirectInputEnabledChange).toHaveBeenCalledWith(
      false,
      expect.anything(),
    );

    const overrideStage = view.getByTestId("pipeline-stage-override");
    fireEvent.click(within(overrideStage).getByRole("switch"));
    expect(props.onOverrideEnabledChange).toHaveBeenCalledWith(
      true,
      expect.anything(),
    );

    const clampStage = view.getByTestId("pipeline-stage-clamp");
    fireEvent.click(within(clampStage).getByRole("switch"));
    expect(props.onClampEnabledChange).toHaveBeenCalledWith(
      false,
      expect.anything(),
    );

    fireEvent.click(view.getByTestId("pipeline-migrate-all-action"));
    expect(props.onMigrateAllLegacyBindings).toHaveBeenCalledTimes(1);
  });

  it("shows one-click migrate action for convertible legacy bindings", () => {
    const props = createBaseProps();
    const view = render(<VariablePipelineStages {...props} />);

    const migrateButton = view.getByTestId("pipeline-migrate-action");
    fireEvent.click(migrateButton);
    expect(props.onMigrateLegacyBinding).toHaveBeenCalledTimes(1);
  });

  it("shows read-only legacy flag when migration is non-convertible", () => {
    const props = createBaseProps();
    props.migration = createMigration({
      kind: "non-convertible",
      reason: "Expression includes custom math.",
    });
    const view = render(<VariablePipelineStages {...props} />);

    expect(view.getByTestId("pipeline-legacy-read-only-flag")).toBeTruthy();
    expect(view.queryByTestId("pipeline-migrate-action")).toBeNull();
    expect(view.getByText(/Expression includes custom math/i)).toBeTruthy();
  });

  it("renders slider controls for parent, direct, and override stages", () => {
    const props = createBaseProps();
    props.overrideEnabled = true;
    props.poses = [
      {
        id: "pose:smile",
        label: "Smile",
        targetValue: 0.5,
        weight: 0.25,
        onWeightChange: vi.fn(),
      },
    ];
    const view = render(<VariablePipelineStages {...props} />);

    const sliders = view.getAllByRole("slider");
    expect(sliders.length).toBeGreaterThanOrEqual(4);
  });

  it("shows disabled state labels for direct and override toggles when off", () => {
    const props = createBaseProps();
    props.directInputEnabled = false;
    props.overrideEnabled = false;
    const view = render(<VariablePipelineStages {...props} />);

    const directStage = view.getByTestId("pipeline-stage-direct-input");
    expect(within(directStage).getByText("Disabled")).toBeTruthy();

    const overrideStage = view.getByTestId("pipeline-stage-override");
    expect(within(overrideStage).getByText("Disabled")).toBeTruthy();
  });

  it("shows parent binding creation action when no parent links exist", () => {
    const props = createBaseProps();
    props.parents = [];
    const view = render(<VariablePipelineStages {...props} />);

    const parentStage = view.getByTestId("pipeline-stage-parents");
    fireEvent.click(
      within(parentStage).getByRole("button", {
        name: "Create Parent Binding",
      }),
    );
    expect(props.onCreateParentBinding).toHaveBeenCalledTimes(1);
  });

  it("shows staged parent contribution formula after migration", () => {
    const props = createBaseProps();
    props.migration = createMigration({ kind: "migrated" });
    props.parentExpressionTitle = "Parent Contribution Formula";
    props.parentExpression =
      'parentContribution = normalizedAdditive([(parent("Jaw Parent") * 1 + 0.2)], baseline=0.2)';
    props.onParentExpressionChange = undefined;
    const view = render(<VariablePipelineStages {...props} />);

    const parentStage = view.getByTestId("pipeline-stage-parents");
    expect(
      within(parentStage).getByText("Parent Contribution Formula"),
    ).toBeTruthy();
    expect(within(parentStage).getByText(/normalizedAdditive/i)).toBeTruthy();
    expect(
      within(parentStage).queryByTestId("pipeline-parent-expression-editor"),
    ).toBeNull();
  });
});
