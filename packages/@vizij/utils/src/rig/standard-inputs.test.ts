import { describe, expect, it } from "vitest";
import {
  createStandardRigInput,
  normalizeStandardRigInputPath,
  resolveStandardRigInputId,
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

describe("resolveStandardRigInputId", () => {
  it("resolves pose-control paths keyed by canonical input id", () => {
    const input = createStandardRigInput({
      id: "jaw_open",
      path: "/propsrig/jaw/open",
      label: "Jaw Open",
      group: "jaw",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    });
    const map = new Map([[input.id, input]]);

    expect(resolveStandardRigInputId("/pose/control/jaw_open", map)).toBe(
      "jaw_open",
    );
    expect(
      resolveStandardRigInputId("rig/face/pose/control/jaw_open", map),
    ).toBe("jaw_open");
  });

  it("keeps legacy pose-control path alias resolution", () => {
    const input = createStandardRigInput({
      id: "propsrig_source_openness",
      path: "/propsrig/source/openness",
      label: "Source Openness",
      group: "source",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    });
    const map = new Map([[input.id, input]]);

    expect(
      resolveStandardRigInputId("/pose/control/source/openness", map),
    ).toBe("propsrig_source_openness");
  });
});
