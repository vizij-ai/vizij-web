import { describe, expect, it } from "vitest";
import type { RawValue } from "@vizij/utils";
import type { RuntimeOutputWrite } from "@vizij/runtime-react";
import {
  applyLockedRuntimeOutputWrite,
  buildLockedRuntimeOutputIndex,
} from "./runtimeOutputLocks";

function makeWrite(
  id: string,
  value: RawValue,
  namespace = "vizij",
  currentValue?: RawValue,
): RuntimeOutputWrite {
  return { id, namespace, value, currentValue };
}

describe("buildLockedRuntimeOutputIndex", () => {
  it("separates scalar target ids from vector component target ids", () => {
    const index = buildLockedRuntimeOutputIndex(
      new Set(["jaw_open", "mouth_translation:y", "mouth_translation:x"]),
    );

    expect(index.lockedScalarTargetIds.has("jaw_open")).toBe(true);
    expect(
      index.lockedComponentsByAnimatableId.get("mouth_translation"),
    ).toEqual(new Set(["x", "y"]));
  });

  it("normalizes rgb component locks to canonical vector axes", () => {
    const index = buildLockedRuntimeOutputIndex(
      new Set(["eye_color:r", "eye_color:g", "eye_color:b"]),
    );

    expect(index.lockedComponentsByAnimatableId.get("eye_color")).toEqual(
      new Set(["x", "y", "z"]),
    );
  });
});

describe("applyLockedRuntimeOutputWrite", () => {
  it("drops writes for fully locked scalar targets", () => {
    const index = buildLockedRuntimeOutputIndex(new Set(["jaw_open"]));

    const result = applyLockedRuntimeOutputWrite(
      makeWrite("jaw_open", 0.6),
      index,
    );

    expect(result).toBeNull();
  });

  it("preserves locked components while allowing unlocked components to update", () => {
    const index = buildLockedRuntimeOutputIndex(
      new Set(["mouth_translation:y"]),
    );

    const result = applyLockedRuntimeOutputWrite(
      makeWrite("mouth_translation", { x: 10, y: 20, z: 30 }, "vizij", {
        x: 1,
        y: 2,
        z: 3,
      }),
      index,
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe("mouth_translation");
    expect(result?.value).toEqual({
      x: 10,
      y: 2,
      z: 30,
      g: 2,
    });
  });

  it("drops vector writes when every present component is locked", () => {
    const index = buildLockedRuntimeOutputIndex(
      new Set([
        "mouth_translation:x",
        "mouth_translation:y",
        "mouth_translation:z",
      ]),
    );

    const result = applyLockedRuntimeOutputWrite(
      makeWrite("mouth_translation", { x: 10, y: 20, z: 30 }, "vizij", {
        x: 1,
        y: 2,
        z: 3,
      }),
      index,
    );

    expect(result).toBeNull();
  });

  it("drops scalar component writes when that component is locked", () => {
    const index = buildLockedRuntimeOutputIndex(
      new Set(["mouth_translation:y"]),
    );

    const result = applyLockedRuntimeOutputWrite(
      makeWrite("mouth_translation:y", 0.25),
      index,
    );

    expect(result).toBeNull();
  });

  it("applies alias-safe locking for rgb/x yz-style output payloads", () => {
    const index = buildLockedRuntimeOutputIndex(new Set(["eye_color:r"]));
    const result = applyLockedRuntimeOutputWrite(
      makeWrite(
        "eye_color",
        { x: 0.9, y: 0.8, z: 0.7, r: 0.9, g: 0.8, b: 0.7 },
        "vizij",
        { x: 0.2, y: 0.3, z: 0.4, r: 0.2, g: 0.3, b: 0.4 },
      ),
      index,
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe("eye_color");
    expect(result?.value).toEqual({
      x: 0.2,
      y: 0.8,
      z: 0.7,
      r: 0.2,
      g: 0.8,
      b: 0.7,
    });
  });

  it("passes writes through when no lock targets match", () => {
    const index = buildLockedRuntimeOutputIndex(new Set(["other_target"]));
    const write = makeWrite("mouth_translation", { x: 10, y: 20, z: 30 });

    const result = applyLockedRuntimeOutputWrite(write, index);

    expect(result).toEqual(write);
  });
});
