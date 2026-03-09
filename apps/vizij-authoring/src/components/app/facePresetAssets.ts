export type FacePresetCharacterId = "quori" | "hugo" | "toasty";
export type FacePresetVariantId =
  | "blender-export"
  | "basic"
  | "latest"
  | "legacy";

interface FacePresetDefinition {
  variantId: FacePresetVariantId;
  variantLabel: string;
  filename: string;
}

export interface FacePresetAssetOption {
  id: string;
  characterId: FacePresetCharacterId;
  characterLabel: string;
  variantId: FacePresetVariantId;
  variantLabel: string;
  label: string;
  filename: string;
  url: string;
  available: boolean;
  referenceCompatible: boolean;
}

const FACE_PRESET_ROWS: readonly {
  id: FacePresetCharacterId;
  label: string;
  presets: readonly FacePresetDefinition[];
}[] = [
  {
    id: "quori",
    label: "Quori",
    presets: [
      {
        variantId: "blender-export",
        variantLabel: "Blender Export",
        filename: "Quori_Latest_Blender_Export.glb",
      },
      {
        variantId: "basic",
        variantLabel: "Basic",
        filename: "Quori_Current.glb",
      },
      {
        variantId: "latest",
        variantLabel: "Latest",
        filename: "Quori_Current_Extended.glb",
      },
    ],
  },
  {
    id: "hugo",
    label: "Hugo",
    presets: [
      {
        variantId: "blender-export",
        variantLabel: "Blender Export",
        filename: "Hugo_Latest_Blender_Export.glb",
      },
      {
        variantId: "basic",
        variantLabel: "Basic",
        filename: "Hugo_Current.glb",
      },
      {
        variantId: "legacy",
        variantLabel: "Legacy",
        filename: "Hugo_Legacy.glb",
      },
    ],
  },
  {
    id: "toasty",
    label: "Toasty",
    presets: [
      {
        variantId: "blender-export",
        variantLabel: "Blender Export",
        filename: "Toasty_Latest_Blender_Export.glb",
      },
      {
        variantId: "basic",
        variantLabel: "Basic",
        filename: "Toasty_Current.glb",
      },
    ],
  },
];

// Keep this list aligned with the preset files that currently exist.
const AVAILABLE_PRESET_FILENAMES = new Set<string>([
  "Quori_Latest_Blender_Export.glb",
  "Quori_Current.glb",
  "Quori_Current_Extended.glb",
  "Hugo_Latest_Blender_Export.glb",
  "Hugo_Current.glb",
  "Hugo_Legacy.glb",
  "Toasty_Latest_Blender_Export.glb",
  "Toasty_Current.glb",
]);

// Reference-face runtime requires embedded VIZIJ bundle metadata.
const REFERENCE_COMPATIBLE_PRESET_FILENAMES = new Set<string>([
  "Quori_Current.glb",
  "Quori_Current_Extended.glb",
  "Hugo_Current.glb",
  "Hugo_Legacy.glb",
  "Toasty_Current.glb",
]);

export const FACE_PRESET_GRID_OPTIONS: readonly FacePresetAssetOption[] =
  FACE_PRESET_ROWS.flatMap((row) =>
    row.presets.map((preset) => {
      const filename = preset.filename;
      return {
        id: `${row.id}:${preset.variantId}`,
        characterId: row.id,
        characterLabel: row.label,
        variantId: preset.variantId,
        variantLabel: preset.variantLabel,
        label: `${row.label} ${preset.variantLabel}`,
        filename,
        url: `/assets/${filename}`,
        available: AVAILABLE_PRESET_FILENAMES.has(filename),
        referenceCompatible:
          REFERENCE_COMPATIBLE_PRESET_FILENAMES.has(filename),
      };
    }),
  );

export const REFERENCE_FACE_PRESET_GRID_OPTIONS: readonly FacePresetAssetOption[] =
  FACE_PRESET_GRID_OPTIONS.filter(
    (preset) =>
      preset.referenceCompatible && preset.variantId !== "blender-export",
  );
