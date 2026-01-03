import { describe, expect, it } from "vitest";
import {
  createStandardRigInput,
  createStandardRigInputFromPath,
  type StandardRigInput,
} from "@vizij/utils";
import {
  normalizePersistedStandardInputs,
  resolvePersistedAutoKey,
} from "./legacyMigration";
import type { PersistedAutoStandardInput } from "./persistence";

describe("resolvePersistedAutoKey", () => {
  it("prefers a non-empty source id", () => {
    expect(
      resolvePersistedAutoKey("auto-mouth-pos-x", "/standard/mouth/pos/x"),
    ).toBe("auto-mouth-pos-x");
  });

  it("falls back to a normalized source path when id is missing", () => {
    expect(resolvePersistedAutoKey(null, " custom//Jaw_Open ")).toBe(
      "/custom/Jaw_Open",
    );
  });

  it("returns null when no key information is present", () => {
    expect(resolvePersistedAutoKey(undefined, undefined)).toBeNull();
    expect(resolvePersistedAutoKey("", "")).toBeNull();
  });
});

describe("normalizePersistedStandardInputs", () => {
  it("retains preset auto entries and preserves metadata", () => {
    const canonical = createStandardRigInputFromPath("/standard/mouth/pos/x");
    const descriptor: PersistedAutoStandardInput = {
      id: canonical.id,
      path: "standard/mouth/pos/x",
      sourceId: "auto-mouth-pos-x",
      sourcePath: "/standard/mouth/pos/x",
      group: "standard",
      label: "Mouth Pos X",
      defaultValue: canonical.defaultValue + 0.1,
      range: {
        min: canonical.range.min - 0.25,
        max: canonical.range.max + 0.5,
      },
    };

    const { autoEntries, legacyCustomInputs, idMismatches } =
      normalizePersistedStandardInputs([descriptor]);

    expect(autoEntries.size).toBe(1);
    const normalized = autoEntries.get("auto-mouth-pos-x");
    expect(normalized).toMatchObject({
      id: canonical.id,
      path: canonical.path,
      sourceId: descriptor.sourceId,
      sourcePath: canonical.path,
      group: "standard",
      label: descriptor.label,
      defaultValue: descriptor.defaultValue,
    });
    expect(normalized?.range).toEqual(descriptor.range);
    expect(legacyCustomInputs).toHaveLength(0);
    expect(idMismatches).toHaveLength(0);
  });

  it("normalizes custom auto entries and derives custom grouping", () => {
    const descriptor = {
      path: "custom/automation/lip_roll",
      sourcePath: " lip_roll ",
      group: "standard",
      label: "Lip Roll",
      defaultValue: 0.5,
      // Simulate legacy payload that omitted an id.
    } as PersistedAutoStandardInput;

    const { autoEntries, legacyCustomInputs, idMismatches } =
      normalizePersistedStandardInputs([descriptor]);

    expect(autoEntries.size).toBe(1);
    const normalized = autoEntries.get("/lip_roll");
    const canonical = createStandardRigInputFromPath(
      "/custom/automation/lip_roll",
    );
    expect(normalized).toMatchObject({
      id: canonical.id,
      path: canonical.path,
      sourceId: undefined,
      sourcePath: "/lip_roll",
      group: "custom",
      label: descriptor.label,
      defaultValue: descriptor.defaultValue,
    });
    expect(normalized?.range).toBeUndefined();
    expect(idMismatches).toHaveLength(0);
    expect(legacyCustomInputs).toHaveLength(0);
  });

  it("returns normalized legacy custom inputs", () => {
    const legacyDescriptor: StandardRigInput = {
      id: "legacy/custom_smile",
      path: " /custom/smile ",
      sourceId: "legacy-source",
      label: "  Smile  ",
      group: "custom",
      defaultValue: 3,
      range: { min: -1, max: 1 },
      parentBinding: null,
      derivedChildren: ["child_a"],
    };
    const expected = createStandardRigInput(legacyDescriptor);

    const { autoEntries, legacyCustomInputs, idMismatches } =
      normalizePersistedStandardInputs([legacyDescriptor]);

    expect(autoEntries.size).toBe(0);
    expect(legacyCustomInputs).toEqual([expected]);
    expect(idMismatches).toHaveLength(0);
  });

  it("falls back to the canonical path when the persisted key is missing", () => {
    const descriptor: PersistedAutoStandardInput = {
      id: "orphan",
      path: "/custom/unknown",
      label: "Unknown Input",
    };

    const { autoEntries, legacyCustomInputs, idMismatches } =
      normalizePersistedStandardInputs([descriptor]);

    expect(autoEntries.size).toBe(1);
    const normalized = autoEntries.get("/custom/unknown");
    expect(normalized).toMatchObject({
      id: descriptor.id,
      path: "/custom/unknown",
      sourceId: undefined,
      sourcePath: "/custom/unknown",
      label: descriptor.label,
    });
    expect(legacyCustomInputs).toHaveLength(0);
    expect(idMismatches).toHaveLength(0);
  });
});
