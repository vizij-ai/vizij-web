const DEFAULT_FLOOR_DB = -60;
const DEFAULT_CEILING_DB = -15;
const EPSILON = 1e-8;

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function rmsToDb(rms: number) {
  return 20 * Math.log10(Math.max(rms, EPSILON));
}

/**
 * Convert an RMS amplitude into a normalized 0–1 "volume" estimate.
 * - Values below `floorDb` map to 0.
 * - Values at/above `ceilingDb` map to 1.
 * Defaults are tuned for typical TTS output (-60dB silence → -15dB loud).
 */
export function normalizeVolume(
  rms: number,
  {
    floorDb = DEFAULT_FLOOR_DB,
    ceilingDb = DEFAULT_CEILING_DB,
  }: { floorDb?: number; ceilingDb?: number } = {},
): number {
  const db = rmsToDb(rms);
  const span = Math.max(ceilingDb - floorDb, EPSILON);
  return clamp01((db - floorDb) / span);
}
