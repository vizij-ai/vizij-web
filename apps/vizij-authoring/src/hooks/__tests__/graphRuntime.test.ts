import { describe, expect, it, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import {
  buildFallbackGraphPath,
  stageGraphInputsFromState,
} from "../graphRuntime";
import type { GraphInputBindingEntry } from "../graphRuntime";

describe("buildFallbackGraphPath", () => {
  it("prepends the active face id and normalizes blank paths", () => {
    const input: StandardRigInput = {
      id: "jaw_open",
      path: "/standard/jaw/open",
      label: "Jaw Open",
      group: "/standard/jaw",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    };
    expect(buildFallbackGraphPath("face", input)).toBe(
      "rig/face/standard/jaw/open",
    );
    const rootInput: StandardRigInput = {
      id: "root",
      path: "/",
      label: "Root",
      group: "/",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    };
    expect(buildFallbackGraphPath("face", rootInput)).toBe(
      "rig/face/custom/input",
    );
  });
});

describe("stageGraphInputsFromState", () => {
  it("uses fallback bindings when direct bindings are missing", () => {
    const stageSpy = vi.fn();
    const fallback: GraphInputBindingEntry[] = [
      {
        graphPath: "rig/face/standard/mouth/x",
        inputId: "mouth_x",
        defaultValue: 0.25,
      },
    ];

    stageGraphInputsFromState({
      graphStatus: "ready",
      bindingsById: new Map(),
      fallbackBindings: fallback,
      inputValues: { mouth_x: 0.75 },
      standardInputsById: new Map(),
      stageRigInput: (path, payload) => stageSpy(path, payload.float),
      clearRigStaged: () => {},
    });

    expect(stageSpy).toHaveBeenCalledWith("rig/face/standard/mouth/x", 0.75);
  });

  it("falls back to the provided default value when no stored input exists", () => {
    const stageSpy = vi.fn();
    const fallback: GraphInputBindingEntry[] = [
      {
        graphPath: "rig/face/standard/eye/x",
        inputId: "eye_x",
        defaultValue: 0.6,
      },
    ];

    stageGraphInputsFromState({
      graphStatus: "ready",
      bindingsById: new Map(),
      fallbackBindings: fallback,
      inputValues: {},
      standardInputsById: new Map(),
      stageRigInput: (path, payload) => stageSpy(path, payload.float),
      clearRigStaged: vi.fn(),
    });

    expect(stageSpy).toHaveBeenCalledWith("rig/face/standard/eye/x", 0.6);
  });
});
