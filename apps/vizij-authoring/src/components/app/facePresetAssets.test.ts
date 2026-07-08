import { describe, expect, it } from "vitest";
import {
  FACE_PRESET_GRID_OPTIONS,
  REFERENCE_FACE_PRESET_GRID_OPTIONS,
} from "./facePresetAssets";

describe("facePresetAssets", () => {
  it("surfaces Quori latest and Toasty current in the preset grid", () => {
    const quoriLatest = FACE_PRESET_GRID_OPTIONS.find(
      (preset) => preset.id === "quori:latest",
    );
    const toastyBasic = FACE_PRESET_GRID_OPTIONS.find(
      (preset) => preset.id === "toasty:basic",
    );

    expect(quoriLatest).toMatchObject({
      label: "Quori Latest",
      filename: "Quori_Current_Extended.glb",
      available: true,
      referenceCompatible: true,
    });
    expect(toastyBasic).toMatchObject({
      label: "Toasty Basic",
      filename: "Toasty_Current.glb",
      available: true,
      referenceCompatible: true,
    });
  });

  it("keeps legacy ids out of the preset collections", () => {
    expect(
      FACE_PRESET_GRID_OPTIONS.some((preset) => preset.id === "quori:legacy"),
    ).toBe(false);
    expect(
      REFERENCE_FACE_PRESET_GRID_OPTIONS.some(
        (preset) => preset.id === "quori:legacy",
      ),
    ).toBe(false);
    expect(
      FACE_PRESET_GRID_OPTIONS.some((preset) => preset.id === "toasty:legacy"),
    ).toBe(false);
    expect(
      REFERENCE_FACE_PRESET_GRID_OPTIONS.some(
        (preset) => preset.id === "toasty:legacy",
      ),
    ).toBe(false);
  });
});
