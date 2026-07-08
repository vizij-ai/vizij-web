import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StandardInputCoveragePanel } from "./StandardInputCoveragePanel";

type MockBindingState = {
  managedStandardInputs: Array<{
    input: { id: string; label?: string };
    disabled?: boolean;
  }>;
  inputBindings: Record<
    string,
    {
      inputId?: string | null;
      slots?: Array<{ inputId?: string | null }>;
    }
  >;
  hiddenDriverIds: Set<string>;
  standardInputSchema: { id: string; version: string } | null;
};

const mockState: MockBindingState = {
  managedStandardInputs: [],
  inputBindings: {},
  hiddenDriverIds: new Set<string>(),
  standardInputSchema: null,
};

vi.mock("../../state/RigControllerProvider", () => ({
  useBindingAuthoring: (selector: (state: MockBindingState) => unknown) =>
    selector(mockState),
}));

describe("StandardInputCoveragePanel", () => {
  it("renders mapped/unmapped summary and missing list", () => {
    mockState.managedStandardInputs = [
      { input: { id: "a", label: "A" } },
      { input: { id: "b", label: "B" } },
      { input: { id: "c", label: "C" }, disabled: true },
    ];
    mockState.inputBindings = {
      a: { slots: [{ inputId: "parent/input" }] },
      b: { slots: [{ inputId: null }] },
    };
    mockState.hiddenDriverIds = new Set(["a"]);
    mockState.standardInputSchema = {
      id: "vizij-standard-face",
      version: "v1",
    };

    render(<StandardInputCoveragePanel />);

    expect(screen.getByText("Mapped 1")).toBeTruthy();
    expect(screen.getByText("Unmapped 2")).toBeTruthy();
    expect(screen.getByText("Disabled 1")).toBeTruthy();
    expect(screen.getByText("Hidden 1")).toBeTruthy();
    expect(screen.getByText(/Inputs needing mappings/)).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("b")).toBeTruthy();
    expect(screen.getByText(/vizij-standard-face · v1/)).toBeTruthy();
  });

  it("shows all-mapped helper text when there are no missing inputs", () => {
    mockState.managedStandardInputs = [
      { input: { id: "mapped", label: "Mapped" } },
    ];
    mockState.inputBindings = {
      mapped: { slots: [{ inputId: "some-parent" }] },
    };
    mockState.hiddenDriverIds = new Set();
    mockState.standardInputSchema = null;

    render(<StandardInputCoveragePanel />);

    expect(screen.getByText("All inputs are mapped or disabled.")).toBeTruthy();
  });
});
