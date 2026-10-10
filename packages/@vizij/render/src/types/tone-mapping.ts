import type { ToneMapping } from "@vizij/runtime";

/**
 * A face's tone-mapping curve, as a bundle stores it and the view applies it
 * (`@vizij/runtime`'s `ToneMapping`):
 *
 * - `"none"` — no curve: colors as shaded, clipped at 1.0, as plain web
 *   rendering shows them. The default.
 * - `"agx"` — AgX, Blender 4.x's default view transform: over-1.0 emissive
 *   compressed into soft, slightly desaturated color, as faces authored in
 *   Blender expect.
 * - `"aces"` — ACES Filmic, a punchier cinematic curve.
 * - `"neutral"` — Khronos PBR Neutral, a mild curve that keeps hue and
 *   saturation while taming highlights.
 */
export type ToneMappingMode = ToneMapping;

/**
 * The set of supported tone-mapping modes, in display order. Useful for
 * building selection UIs.
 */
export const TONE_MAPPING_MODES: ToneMappingMode[] = [
  "none",
  "agx",
  "aces",
  "neutral",
];

/**
 * Human-readable labels for each tone-mapping mode.
 */
export const TONE_MAPPING_LABELS: Record<ToneMappingMode, string> = {
  none: "None (web match)",
  agx: "AgX (Blender)",
  aces: "ACES Filmic",
  neutral: "Neutral",
};

/** The tone-mapping mode of a face that specifies none. */
export const DEFAULT_TONE_MAPPING_MODE: ToneMappingMode = "none";

/**
 * Type guard: is `value` a valid {@link ToneMappingMode}?
 */
export function isToneMappingMode(value: unknown): value is ToneMappingMode {
  return (
    typeof value === "string" &&
    (TONE_MAPPING_MODES as string[]).includes(value)
  );
}

/**
 * Normalize an unknown/stored value into a valid {@link ToneMappingMode},
 * falling back to {@link DEFAULT_TONE_MAPPING_MODE}.
 */
export function normalizeToneMappingMode(value: unknown): ToneMappingMode {
  return isToneMappingMode(value) ? value : DEFAULT_TONE_MAPPING_MODE;
}
