import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LegacyBindingMigrationAssessment } from "./pipelineStages";
import { VariablePipelineStages } from "./VariablePipelineStages";

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

function createBaseProps() {
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
      },
    ],
    children: [
      {
        id: "child:mouth",
        label: "Mouth Child",
        kind: "variable" as const,
        onInspect: vi.fn(),
        onUnlink: vi.fn(),
      },
    ],
    poses: [],
    diagnostics: {
      parentContribution: 0.4,
      poseContribution: null,
      directContribution: 0.2,
      blendedResult: 0.1,
      overrideSelectedResult: 0.1,
      effectiveResult: 0.1,
    },
    directInputEnabled: true,
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
    onMigrateLegacyBinding: vi.fn(),
    onEditParents: vi.fn(),
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

    const directStage = view.getByTestId("pipeline-stage-direct-input");
    fireEvent.click(within(directStage).getByRole("switch"));
    expect(props.onDirectInputEnabledChange).toHaveBeenCalled();
    expect(props.onDirectInputEnabledChange.mock.calls[0]?.[0]).toBe(false);

    const overrideStage = view.getByTestId("pipeline-stage-override");
    fireEvent.click(within(overrideStage).getByRole("switch"));
    expect(props.onOverrideEnabledChange).toHaveBeenCalled();
    expect(props.onOverrideEnabledChange.mock.calls[0]?.[0]).toBe(true);

    const clampStage = view.getByTestId("pipeline-stage-clamp");
    fireEvent.click(within(clampStage).getByRole("switch"));
    expect(props.onClampEnabledChange).toHaveBeenCalled();
    expect(props.onClampEnabledChange.mock.calls[0]?.[0]).toBe(false);
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
});
