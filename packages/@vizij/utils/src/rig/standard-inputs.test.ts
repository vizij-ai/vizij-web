import { describe, expect, it } from "vitest";
import {
  createStandardRigInput,
  normalizeStandardRigInputPath,
} from "./standard-inputs";

describe("normalizeStandardRigInputPath", () => {
  it("strips rig prefixes so stored paths stay relative", () => {
    expect(normalizeStandardRigInputPath("rig/robot/brow/pos")).toBe(
      "/brow/pos",
    );
  });

  it("removes repeated rig prefixes from doubly-qualified paths", () => {
    expect(
      normalizeStandardRigInputPath("/rig/robot/rig/robot/mouth/pos/x"),
    ).toBe("/mouth/pos/x");
  });
});

describe("createStandardRigInput", () => {
  it("normalizes absolute rig paths when creating inputs", () => {
    const input = createStandardRigInput({
      path: "rig/robot/eyes/blink",
      label: "Blink",
      group: "eyes",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    });
    expect(input.path).toBe("/eyes/blink");
  });
});
