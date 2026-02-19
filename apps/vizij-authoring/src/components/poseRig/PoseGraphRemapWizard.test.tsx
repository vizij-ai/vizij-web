import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import type { PoseImportResult } from "../../types/importOutcome";
import {
  PoseGraphRemapWizard,
  type PoseGraphRemapRow,
} from "./PoseGraphRemapWizard";

afterEach(() => {
  cleanup();
});

const standardInputs: StandardRigInput[] = [
  {
    id: "jaw_open",
    path: "/standard/face/jaw/open",
    label: "Jaw Open",
    group: "standard",
    defaultValue: 0,
    range: { min: -1, max: 1 },
  },
];

function createApplySpy() {
  return vi.fn(
    async (_rows: PoseGraphRemapRow[]): Promise<PoseImportResult> => ({
      status: "success",
    }),
  );
}

describe("PoseGraphRemapWizard", () => {
  it("requires row-level create-missing selection for unknown mapped inputs", () => {
    const onApply = createApplySpy();

    render(
      <PoseGraphRemapWizard
        autoRows={[]}
        rows={[
          {
            id: "row_unknown",
            nodeId: "out_smile",
            originalPath: "rig/old/smile",
            suggestedPath: "/standard/face/mouth/smile",
            status: "review",
          },
        ]}
        standardInputs={standardInputs}
        onApply={onApply}
        onCancel={() => undefined}
      />,
    );

    const applyButton = screen.getByRole("button", {
      name: /Apply mappings & finish/i,
    });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);

    const createMissingCheckbox = screen.getByLabelText(
      /Create missing standard input during apply/i,
    );
    fireEvent.click(createMissingCheckbox);

    expect((applyButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(applyButton);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        id: "row_unknown",
        suggestedPath: "/standard/face/mouth/smile",
        createMissingInput: true,
      }),
    ]);
  });

  it("applies known mappings without create-missing selection", () => {
    const onApply = createApplySpy();

    render(
      <PoseGraphRemapWizard
        autoRows={[]}
        rows={[
          {
            id: "row_known",
            nodeId: "out_jaw",
            originalPath: "rig/old/jaw",
            suggestedPath: "/standard/face/jaw/open",
            status: "review",
          },
        ]}
        standardInputs={standardInputs}
        onApply={onApply}
        onCancel={() => undefined}
      />,
    );

    expect(
      screen.queryByLabelText(/Create missing standard input during apply/i),
    ).toBeNull();

    const applyButton = screen.getByRole("button", {
      name: /Apply mappings & finish/i,
    });
    expect((applyButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(applyButton);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        id: "row_known",
        suggestedPath: "/standard/face/jaw/open",
        createMissingInput: false,
      }),
    ]);
  });
});
