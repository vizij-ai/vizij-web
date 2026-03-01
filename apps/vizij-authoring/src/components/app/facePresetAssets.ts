export type FacePresetCharacterId = "quori" | "hugo" | "toasty";
export type FacePresetVariantId = "blender-export" | "basic" | "legacy";

interface FacePresetRow {
  id: FacePresetCharacterId;
  label: string;
}

interface FacePresetColumn {
  id: FacePresetVariantId;
  label: string;
  filenameSuffix: string;
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

const FACE_PRESET_ROWS: readonly FacePresetRow[] = [
  { id: "quori", label: "Quori" },
  { id: "hugo", label: "Hugo" },
  { id: "toasty", label: "Toasty" },
];

const FACE_PRESET_COLUMNS: readonly FacePresetColumn[] = [
  {
    id: "blender-export",
    label: "Blender Export",
    filenameSuffix: "Latest_Blender_Export",
  },
  { id: "basic", label: "Basic", filenameSuffix: "Current" },
  { id: "legacy", label: "Legacy", filenameSuffix: "Legacy" },
];

// Keep this list aligned with the preset files that currently exist.
const AVAILABLE_PRESET_FILENAMES = new Set<string>([
  "Quori_Latest_Blender_Export.glb",
  "Quori_Current.glb",
  "Quori_Legacy.glb",
  "Hugo_Latest_Blender_Export.glb",
  "Hugo_Current.glb",
  "Hugo_Legacy.glb",
  "Toasty_Latest_Blender_Export.glb",
]);

// Reference-face runtime requires embedded VIZIJ bundle metadata.
const REFERENCE_COMPATIBLE_PRESET_FILENAMES = new Set<string>([
  "Quori_Current.glb",
  "Quori_Legacy.glb",
  "Hugo_Current.glb",
  "Hugo_Legacy.glb",
]);

export const FACE_PRESET_GRID_OPTIONS: readonly FacePresetAssetOption[] =
  FACE_PRESET_ROWS.flatMap((row) =>
    FACE_PRESET_COLUMNS.map((column) => {
      const filename = `${row.label}_${column.filenameSuffix}.glb`;
      return {
        id: `${row.id}:${column.id}`,
        characterId: row.id,
        characterLabel: row.label,
        variantId: column.id,
        variantLabel: column.label,
        label: `${row.label} ${column.label}`,
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
