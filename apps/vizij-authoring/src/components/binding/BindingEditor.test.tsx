import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnimatableBinding } from "@vizij/node-graph-authoring";
import { SELF_BINDING_ID, type StandardRigInput } from "@vizij/utils";
import { BindingEditor } from "./BindingEditor";

const standardInputs: StandardRigInput[] = [
  {
    id: "rig_driver_smile",
    path: "/rig/driver/smile",
    label: "Smile Driver",
    group: "face",
    defaultValue: 0,
    range: { min: -1, max: 1 },
  },
];

const standardInputLookup = new Map(
  standardInputs.map((input) => [input.id, input]),
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function createCallbacks() {
  return {
    onBindingInputChange: vi.fn(),
    onAddBindingSlot: vi.fn(),
    onRemoveBindingSlot: vi.fn(),
    onBindingExpressionChange: vi.fn(),
    onBindingSlotAliasChange: vi.fn(),
    onBindingSlotValueTypeChange: vi.fn(),
    onNormalizeBindingSlot: vi.fn(),
    onResetBinding: vi.fn(),
    onInputValueChange: vi.fn(),
  };
}

function renderBindingEditor(
  binding: AnimatableBinding,
  issues?: string[],
  options?: { readOnly?: boolean },
) {
  const callbacks = createCallbacks();
  render(
    <BindingEditor
      binding={binding}
      targetId="rig_target_jaw"
      label="Jaw Open"
      standardInputs={standardInputs}
      standardInputLookup={standardInputLookup}
      issues={issues}
      onBindingInputChange={callbacks.onBindingInputChange}
      onAddBindingSlot={callbacks.onAddBindingSlot}
      onRemoveBindingSlot={callbacks.onRemoveBindingSlot}
      onBindingExpressionChange={callbacks.onBindingExpressionChange}
      onBindingSlotAliasChange={callbacks.onBindingSlotAliasChange}
      onBindingSlotValueTypeChange={callbacks.onBindingSlotValueTypeChange}
      onNormalizeBindingSlot={callbacks.onNormalizeBindingSlot}
      onResetBinding={callbacks.onResetBinding}
      featureFlags={{
        vectorAuthoringBeta: true,
        conditionalAuthoringBeta: true,
      }}
      currentValues={{ rig_driver_smile: 0.5 }}
      onInputValueChange={callbacks.onInputValueChange}
      expandable={false}
      defaultExpanded={true}
      readOnly={options?.readOnly}
    />,
  );
  return callbacks;
}

describe("BindingEditor", () => {
  it("renders slot/issue summaries and keeps key actions visible", () => {
    const callbacks = renderBindingEditor(
      {
        expression: "s1 + s2",
        slots: [
          {
            id: "s1",
            alias: "s1",
            inputId: "rig_driver_smile",
            valueType: "scalar",
          },
          {
            id: "s2",
            alias: "s2",
            inputId: SELF_BINDING_ID,
            valueType: "vector",
          },
          {
            id: "s3",
            alias: "s3",
            inputId: null,
            valueType: "scalar",
          },
        ],
      } as AnimatableBinding,
      ["Expression parsing failed."],
    );

    expect(screen.getByText(/3 controls/i)).toBeTruthy();
    expect(screen.getByText(/1 linked/i)).toBeTruthy();
    expect(screen.getByText(/1 local/i)).toBeTruthy();
    expect(screen.getByText(/1 unbound/i)).toBeTruthy();
    expect(screen.getByTestId("binding-editor-issue-summary")).toBeTruthy();
    expect(screen.getByText(/Expression parsing failed\./i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add control" }));
    expect(callbacks.onAddBindingSlot).toHaveBeenCalledWith("rig_target_jaw");

    fireEvent.click(screen.getByRole("button", { name: "Reset binding" }));
    expect(callbacks.onResetBinding).toHaveBeenCalledWith("rig_target_jaw");
  });

  it("supports expression apply + draft revert affordances", () => {
    const callbacks = renderBindingEditor({
      expression: "s1 + 1",
      slots: [{ id: "s1", alias: "s1", inputId: "rig_driver_smile" }],
    } as AnimatableBinding);

    const expressionField = screen.getByLabelText("Expression: Jaw Open =");
    fireEvent.change(expressionField, { target: { value: "s1 * 2" } });

    expect(screen.getByText("Draft changed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply expression" }));
    expect(callbacks.onBindingExpressionChange).toHaveBeenCalledWith(
      "rig_target_jaw",
      "s1 * 2",
    );

    fireEvent.change(expressionField, { target: { value: "s1 - 0.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Revert draft" }));
    expect((expressionField as HTMLTextAreaElement).value).toBe("s1 + 1");
  });

  it("keeps slot-level binding actions functional after layout overhaul", () => {
    const callbacks = renderBindingEditor({
      expression: "s1 + s2",
      slots: [
        { id: "s1", alias: "s1", inputId: "rig_driver_smile" },
        { id: "s2", alias: "s2", inputId: SELF_BINDING_ID },
      ],
    } as AnimatableBinding);

    const slotOne = screen.getByTestId("binding-slot-s1");
    fireEvent.click(within(slotOne).getByRole("button", { name: "Normalize" }));
    expect(callbacks.onNormalizeBindingSlot).toHaveBeenCalledWith(
      "rig_target_jaw",
      "s1",
    );

    const slotTwo = screen.getByTestId("binding-slot-s2");
    fireEvent.click(within(slotTwo).getByRole("button", { name: "Unbind" }));
    expect(callbacks.onBindingInputChange).toHaveBeenCalledWith(
      "rig_target_jaw",
      null,
      "s2",
    );

    const slotTwoNormalize = within(slotTwo).getByRole("button", {
      name: "Normalize",
    });
    expect(slotTwoNormalize.getAttribute("disabled")).not.toBeNull();
  });

  it("locks editing controls when rendered in read-only mode", () => {
    const callbacks = renderBindingEditor(
      {
        expression: "max(self, s2)",
        slots: [
          { id: "s1", alias: "self", inputId: SELF_BINDING_ID },
          { id: "s2", alias: "s2", inputId: "rig_driver_smile" },
        ],
      } as AnimatableBinding,
      undefined,
      { readOnly: true },
    );

    const addButton = screen.getByRole("button", { name: "Add control" });
    expect(addButton.getAttribute("disabled")).not.toBeNull();
    fireEvent.click(addButton);
    expect(callbacks.onAddBindingSlot).not.toHaveBeenCalled();

    const expressionField = screen.getByLabelText("Expression: Jaw Open =");
    expect((expressionField as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.change(expressionField, { target: { value: "s1 + s2" } });
    expect(callbacks.onBindingExpressionChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Legacy read-only/i)).toBeTruthy();
  });
});
