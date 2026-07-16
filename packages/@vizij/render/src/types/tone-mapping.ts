import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  NoToneMapping,
} from "three";
import type { ToneMapping } from "three";

/**
 * Vizij-level tone-mapping selection.
 *
 * This is a stable, serializable string enum rather than a raw three.js
 * constant so it can be persisted in the `VIZIJ_bundle` extension and round-trip
 * through import/export without leaking three's numeric enum values into stored
 * data.
 *
 * - `"none"` — no tone mapping. Values are written to the framebuffer as-is and
 *   clip at 1.0. This matches plain web/canvas rendering and is the historical
 *   vizij default (chosen so studio colors match the canvas).
 * - `"agx"` — AgX, Blender 4.x's default view transform. Compresses
 *   over-1.0 emissive into soft, slightly-desaturated color; matches faces
 *   authored/exported from Blender.
 * - `"aces"` — ACES Filmic, a punchier cinematic curve.
 * - `"neutral"` — Khronos PBR Neutral, a mild curve that preserves hue/saturation
 *   while taming highlights.
 */
export type ToneMappingMode = "none" | "agx" | "aces" | "neutral";

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

/**
 * The default tone-mapping mode used when a face/scene has not specified one.
 * `"none"` preserves the historical web-matching behavior.
 */
export const DEFAULT_TONE_MAPPING_MODE: ToneMappingMode = "none";

const TONE_MAPPING_CONSTANTS: Record<ToneMappingMode, ToneMapping> = {
  none: NoToneMapping,
  agx: AgXToneMapping,
  aces: ACESFilmicToneMapping,
  neutral: NeutralToneMapping,
};

/**
 * Type guard: is `value` a valid {@link ToneMappingMode}?
 */
export function isToneMappingMode(value: unknown): value is ToneMappingMode {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TONE_MAPPING_CONSTANTS, value)
  );
}

/**
 * Resolve a {@link ToneMappingMode} (or an unknown/undefined stored value) to
 * the corresponding three.js tone-mapping constant. Falls back to
 * {@link DEFAULT_TONE_MAPPING_MODE} for missing/invalid input.
 */
export function resolveToneMapping(mode: unknown): ToneMapping {
  if (isToneMappingMode(mode)) {
    return TONE_MAPPING_CONSTANTS[mode];
  }
  return TONE_MAPPING_CONSTANTS[DEFAULT_TONE_MAPPING_MODE];
}

/**
 * Normalize an unknown/stored value into a valid {@link ToneMappingMode},
 * falling back to {@link DEFAULT_TONE_MAPPING_MODE}.
 */
export function normalizeToneMappingMode(value: unknown): ToneMappingMode {
  return isToneMappingMode(value) ? value : DEFAULT_TONE_MAPPING_MODE;
}
