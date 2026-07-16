import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VariablePipelineStages } from "./VariablePipelineStages";

type VariablePipelineStagesProps = React.ComponentProps<
  typeof VariablePipelineStages
>;

afterEach(() => {
  cleanup();
});

function createBaseProps(): VariablePipelineStagesProps {
  return {
    parentExpression: "self + jawParent",
    compiledEquation:
      "effective = clamp(if(override.enabled, override.value, blend(parentContribution, directContribution)))",
    parents: [
      {
        id: "parent:jaw",
        label: "Jaw Parent",
        expressionVariable: "s1",
        kind: "variable" as const,
        onInspect: vi.fn(),
        onUnlink: vi.fn(),
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
    rotationDisplayPath: "rig/robot/controls/jawOpen",
    rotationDisplayMode: "degrees",
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
    onParentExpressionChange: vi.fn(),
    onAddParent: vi.fn(),
    onMigrateLegacyBinding: vi.fn(),
    onAddChild: vi.fn(),
  };
}

function openStage(
  view: ReturnType<typeof render>,
  testId: string,
  titlePattern: RegExp,
) {
  const stage = view.getByTestId(testId);
  const trigger = within(stage).getByRole("button", { name: titlePattern });
  if (trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(trigger);
  }
  return stage;
}

function hasNumericInputValue(
  container: HTMLElement,
  expected: number,
  tolerance = 1e-3,
): boolean {
  return Array.from(container.querySelectorAll("input")).some((element) => {
    const value = Number((element as HTMLInputElement).value);
    return Number.isFinite(value) && Math.abs(value - expected) <= tolerance;
  });
}

function getTextInputByValue(
  container: HTMLElement,
  expected: string,
): HTMLInputElement {
  const input = Array.from(container.querySelectorAll("input")).find(
    (element) =>
      (element as HTMLInputElement).type === "text" &&
      (element as HTMLInputElement).value === expected,
  );
  if (!input) {
    throw new Error(`No text input found with value ${expected}`);
  }
  return input as HTMLInputElement;
}

describe("VariablePipelineStages", () => {
  it("displays rotational direct-input values in degrees and converts edits back to radians", () => {
    const props = createBaseProps();
    props.directInputPath = "/propsrig/head/rotation/x";
    props.rotationDisplayPath = props.directInputPath;
    props.directValue = Math.PI / 2;
    props.directDefaultValue = Math.PI / 4;
    props.directMin = -Math.PI;
    props.directMax = Math.PI;
    props.onDirectValueChange = vi.fn();

    const view = render(<VariablePipelineStages {...props} />);
    const directStage = openStage(
      view,
      "pipeline-stage-direct-input",
      /direct input/i,
    );

    expect(hasNumericInputValue(directStage, 90)).toBe(true);
    expect(
      within(directStage).getByRole("button", { name: /reset \(45\.00\)/i }),
    ).toBeTruthy();

    fireEvent.change(getTextInputByValue(directStage, "90"), {
      target: { value: "180" },
    });

    expect(props.onDirectValueChange).toHaveBeenCalledWith(Math.PI);
  });

  it("keeps parents and children sections open by default", () => {
    const props = createBaseProps();
    const view = render(<VariablePipelineStages {...props} />);

    const parentsTrigger = within(
      view.getByTestId("pipeline-stage-parents"),
    ).getByRole("button", { name: /parents/i });
    expect(parentsTrigger.getAttribute("aria-expanded")).toBe("true");

    const childrenTrigger = within(
      view.getByTestId("pipeline-stage-children"),
    ).getByRole("button", { name: /children/i });
    expect(childrenTrigger.getAttribute("aria-expanded")).toBe("true");
  });

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
    const compiledStage = openStage(
      view,
      "pipeline-stage-compiled",
      /compiled pipeline/i,
    );
    expect(
      within(compiledStage).getByTestId("pipeline-compiled-equation")
        .textContent,
    ).toContain("effective =");
    expect(
      within(compiledStage).getByTestId("pipeline-compiled-source-parents")
        .textContent,
    ).toContain("0.400");
    expect(
      within(compiledStage).getByTestId("pipeline-compiled-source-direct")
        .textContent,
    ).toContain("0.200");
    expect(
      within(compiledStage).getByTestId("pipeline-compiled-effective")
        .textContent,
    ).toContain("0.100");
    expect(view.queryByTestId("pipeline-migration-summary")).toBeNull();
  });

  it("routes parent/child interactions and stage toggles", () => {
    const props = createBaseProps();
    const view = render(<VariablePipelineStages {...props} />);

    const parentStage = openStage(view, "pipeline-stage-parents", /parents/i);
    fireEvent.click(
      within(parentStage).getByRole("button", { name: /jaw parent/i }),
    );
    fireEvent.click(
      within(parentStage).getAllByRole("button", { name: "Delete" })[0]!,
    );
    expect(props.parents[0]?.onUnlink).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(parentStage).getByRole("button", { name: "Inspect" }),
    );
    expect(props.parents[0]?.onInspect).toHaveBeenCalledTimes(1);

    const childStage = openStage(view, "pipeline-stage-children", /children/i);
    fireEvent.click(
      within(childStage).getByRole("button", { name: /mouth child/i }),
    );
    fireEvent.click(
      within(childStage).getAllByRole("button", { name: "Delete" })[0]!,
    );
    expect(props.children[0]?.onUnlink).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(childStage).getByRole("button", { name: "Inspect" }),
    );
    expect(props.children[0]?.onInspect).toHaveBeenCalledTimes(1);

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
      within(parentStage).getByRole("button", { name: "Apply Formula" }),
    );
    expect(props.onParentExpressionChange).toHaveBeenCalledWith(
      "self - jawParent*2",
    );

    const childSwitches = within(childStage).getAllByRole("switch");
    fireEvent.click(childSwitches[0]!);
    expect(
      props.children[0]?.linkControl?.onEnabledChange,
    ).toHaveBeenCalledWith(false);

    const directStage = openStage(
      view,
      "pipeline-stage-direct-input",
      /direct input/i,
    );
    fireEvent.click(within(directStage).getByRole("switch"));
    expect(props.onDirectInputEnabledChange).toHaveBeenCalledWith(
      false,
      expect.anything(),
    );

    const overrideStage = openStage(
      view,
      "pipeline-stage-override",
      /override/i,
    );
    fireEvent.click(within(overrideStage).getByRole("switch"));
    expect(props.onOverrideEnabledChange).toHaveBeenCalledWith(
      true,
      expect.anything(),
    );

    const clampStage = openStage(view, "pipeline-stage-clamp", /clamp/i);
    fireEvent.click(within(clampStage).getByRole("switch"));
    expect(props.onClampEnabledChange).toHaveBeenCalledWith(
      false,
      expect.anything(),
    );
  });

  it("applies advanced parent formulas from collapsed editor", () => {
    const props = createBaseProps();
    const onParentFormulaChange = vi.fn();
    props.parents = [
      {
        ...props.parents[0]!,
        parentFormula: "s1 = parent * scale + offset",
        parentFormulaDefault: "s1 = parent * scale + offset",
        onParentFormulaChange,
      },
    ];
    const view = render(<VariablePipelineStages {...props} />);
    const parentStage = openStage(view, "pipeline-stage-parents", /parents/i);

    fireEvent.click(
      within(parentStage).getByRole("button", { name: /jaw parent/i }),
    );
    fireEvent.click(within(parentStage).getByText("Advanced Formula"));

    fireEvent.change(
      within(parentStage).getByTestId(
        "pipeline-parent-formula-editor-parent:jaw",
      ),
      {
        target: { value: "s1 = parent * scale + offset * 2" },
      },
    );
    fireEvent.click(within(parentStage).getByRole("button", { name: "Apply" }));
    expect(onParentFormulaChange).toHaveBeenCalledWith(
      "s1 = parent * scale + offset * 2",
    );
  });

  it("commits parent and child link scale/offset changes on blur", () => {
    const props = createBaseProps();
    const parentScaleChange = props.parents[0]?.linkControl?.onScaleChange;
    const parentOffsetChange = props.parents[0]?.linkControl?.onOffsetChange;
    const childScaleChange = props.children[0]?.linkControl?.onScaleChange;
    const childOffsetChange = props.children[0]?.linkControl?.onOffsetChange;

    const view = render(<VariablePipelineStages {...props} />);

    const parentStage = openStage(view, "pipeline-stage-parents", /parents/i);
    fireEvent.click(
      within(parentStage).getByRole("button", { name: /jaw parent/i }),
    );
    const parentFields = Array.from(
      parentStage.querySelectorAll(
        'input[aria-roledescription="Number field"]',
      ),
    ) as HTMLInputElement[];
    const parentScaleField = parentFields[0];
    const parentOffsetField = parentFields[1];
    expect(parentScaleField).toBeTruthy();
    expect(parentOffsetField).toBeTruthy();

    fireEvent.change(parentScaleField!, { target: { value: "1.5" } });
    expect(parentScaleChange).not.toHaveBeenCalled();
    fireEvent.blur(parentScaleField!);
    expect(parentScaleChange).toHaveBeenCalledWith(1.5);

    fireEvent.change(parentOffsetField!, { target: { value: "3.4" } });
    expect(parentOffsetChange).toHaveBeenCalledTimes(0);
    fireEvent.blur(parentOffsetField!);
    expect(parentOffsetChange).toHaveBeenCalledWith(3.4);

    const childStage = openStage(view, "pipeline-stage-children", /children/i);
    fireEvent.click(
      within(childStage).getByRole("button", { name: /mouth child/i }),
    );
    const childFields = Array.from(
      childStage.querySelectorAll('input[aria-roledescription="Number field"]'),
    ) as HTMLInputElement[];
    const childScaleField = childFields[0];
    const childOffsetField = childFields[1];
    expect(childScaleField).toBeTruthy();
    expect(childOffsetField).toBeTruthy();

    fireEvent.change(childScaleField!, { target: { value: "2.25" } });
    expect(childScaleChange).toHaveBeenCalledTimes(0);
    fireEvent.blur(childScaleField!);
    expect(childScaleChange).toHaveBeenCalledWith(2.25);

    fireEvent.change(childOffsetField!, { target: { value: "-3.5" } });
    expect(childOffsetChange).toHaveBeenCalledTimes(0);
    fireEvent.blur(childOffsetField!);
    expect(childOffsetChange).toHaveBeenCalledWith(-3.5);
  });

  it("runs migrate action when migrate button is provided", () => {
    const props = createBaseProps();
    const view = render(<VariablePipelineStages {...props} />);

    const parentStage = openStage(view, "pipeline-stage-parents", /parents/i);
    const migrateButton = within(parentStage).getByTestId(
      "pipeline-migrate-action",
    );
    fireEvent.click(migrateButton);
    expect(props.onMigrateLegacyBinding).toHaveBeenCalledTimes(1);
  });

  it("shows read-only legacy reason in parent expression editor", () => {
    const props = createBaseProps();
    props.parentExpressionReadOnly = true;
    props.parentExpressionReadOnlyReason = "Expression includes custom math.";
    props.onMigrateLegacyBinding = undefined;
    const view = render(<VariablePipelineStages {...props} />);
    const parentStage = openStage(view, "pipeline-stage-parents", /parents/i);

    expect(
      within(parentStage).getByText(
        /legacy read-only formula: expression includes custom math/i,
      ),
    ).toBeTruthy();
    expect(
      within(parentStage).queryByTestId("pipeline-migrate-action"),
    ).toBeNull();
  });

  it("shows parent variable mapping with expanded contribution math", () => {
    const props = createBaseProps();
    const view = render(<VariablePipelineStages {...props} />);
    const parentStage = openStage(view, "pipeline-stage-parents", /parents/i);

    const mapping = within(parentStage).getByTestId(
      "pipeline-parent-variable-mapping",
    );
    expect(within(mapping).getByText("Parent Variable Mapping")).toBeTruthy();
    expect(within(mapping).getByText("s1 = parent * 1 + 0")).toBeTruthy();
    expect(within(mapping).getByText("s1 = 0.4 * 1 + 0 = 0.4")).toBeTruthy();
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
    const parentStage = openStage(view, "pipeline-stage-parents", /parents/i);
    fireEvent.click(
      within(parentStage).getByRole("button", { name: /jaw parent/i }),
    );
    const poseStage = openStage(view, "pipeline-stage-poses", /expressions/i);
    fireEvent.click(within(poseStage).getByRole("button", { name: /smile/i }));
    openStage(view, "pipeline-stage-direct-input", /direct input/i);
    openStage(view, "pipeline-stage-override", /override/i);

    const sliders = view.getAllByRole("slider");
    expect(sliders.length).toBeGreaterThanOrEqual(4);
  });

  it("displays rotational driver values in degrees by default", () => {
    const props = createBaseProps();
    props.rotationDisplayPath = "/propsrig/head/rotation/x";
    props.directInputPath = "/propsrig/head/rotation/x";
    props.directValue = Math.PI / 2;
    props.directDefaultValue = Math.PI / 4;
    props.directMin = -Math.PI;
    props.directMax = Math.PI;
    props.overrideEnabled = true;
    props.overrideValue = Math.PI / 6;
    props.overrideMin = -Math.PI;
    props.overrideMax = Math.PI;

    const view = render(<VariablePipelineStages {...props} />);
    const directStage = openStage(
      view,
      "pipeline-stage-direct-input",
      /direct input/i,
    );
    const overrideStage = openStage(
      view,
      "pipeline-stage-override",
      /override/i,
    );

    expect(hasNumericInputValue(directStage, 90)).toBe(true);
    expect(within(directStage).getByText("Reset (45.00)")).toBeTruthy();
    expect(hasNumericInputValue(overrideStage, 30)).toBe(true);
  });

  it("shows disabled state labels for direct and override toggles when off", () => {
    const props = createBaseProps();
    props.directInputEnabled = false;
    props.overrideEnabled = false;
    const view = render(<VariablePipelineStages {...props} />);

    const directStage = openStage(
      view,
      "pipeline-stage-direct-input",
      /direct input/i,
    );
    expect(within(directStage).getByText("Disabled")).toBeTruthy();

    const overrideStage = openStage(
      view,
      "pipeline-stage-override",
      /override/i,
    );
    expect(within(overrideStage).getByText("Disabled")).toBeTruthy();
  });

  it("shows add parent action", () => {
    const props = createBaseProps();
    props.parents = [];
    const view = render(<VariablePipelineStages {...props} />);

    const parentStage = openStage(view, "pipeline-stage-parents", /parents/i);
    fireEvent.click(
      within(parentStage).getByRole("button", {
        name: "Add Parent Link",
      }),
    );
    expect(props.onAddParent).toHaveBeenCalledTimes(1);
  });

  it("shows staged parent contribution formula after migration", () => {
    const props = createBaseProps();
    props.parentExpressionTitle = "Parent Contribution Formula";
    props.parentExpression =
      'parentContribution = normalizedAdditive([(parent("Jaw Parent") * 1 + 0.2)], baseline=0.2)';
    props.onParentExpressionChange = undefined;
    const view = render(<VariablePipelineStages {...props} />);

    const parentStage = openStage(view, "pipeline-stage-parents", /parents/i);
    expect(
      within(parentStage).getByText("Parent Contribution Formula"),
    ).toBeTruthy();
    expect(within(parentStage).getByText(/normalizedAdditive/i)).toBeTruthy();
    expect(
      within(parentStage).queryByTestId("pipeline-parent-expression-editor"),
    ).toBeNull();
  });
});
