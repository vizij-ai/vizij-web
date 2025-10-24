import {
  DEFAULT_APP_STATE,
  type AppState,
  type GlbAsset,
  type GraphAsset,
} from "./types";

const STORAGE_VERSION = "v2";
const STORAGE_PREFIX = `demo-animating-faces/${STORAGE_VERSION}`;
const STORAGE_LAST_KEY = `${STORAGE_PREFIX}/last-key`;

function makeBundleStorageKey(bundleKey: string): string {
  return `${STORAGE_PREFIX}/bundle/${bundleKey}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stableStringify(value: unknown): string {
  if (!isObject(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

function hashString(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hash =
    ((h2 >>> 0).toString(16).padStart(8, "0") as string) +
    ((h1 >>> 0).toString(16).padStart(8, "0") as string);

  return `bundle-${hash}`;
}

function sanitiseFileName(label: string): string {
  const base = label.replace(/\s+/g, "_").toLowerCase() || "animation";
  return base.endsWith(".json") ? base : `${base}.json`;
}

function normaliseTracks(tracks: unknown): Array<{
  channel: string;
  keyframes: Array<{ time: number; value: number }>;
}> {
  if (!Array.isArray(tracks)) {
    return [];
  }
  return tracks
    .map((track) => {
      if (!track || typeof track !== "object") {
        return null;
      }
      const channel =
        typeof (track as any).channel === "string"
          ? ((track as any).channel as string)
          : "";
      const keyframesRaw = Array.isArray((track as any).keyframes)
        ? ((track as any).keyframes as unknown[])
        : [];
      const keyframes = keyframesRaw
        .map((frame) => {
          if (!frame || typeof frame !== "object") {
            return null;
          }
          const time = Number((frame as any).time);
          const value = Number((frame as any).value);
          if (!Number.isFinite(time) || !Number.isFinite(value)) {
            return null;
          }
          return { time, value };
        })
        .filter((frame): frame is { time: number; value: number } =>
          Boolean(frame),
        )
        .sort((a, b) => a.time - b.time);
      return { channel, keyframes };
    })
    .filter(
      (
        track,
      ): track is {
        channel: string;
        keyframes: Array<{ time: number; value: number }>;
      } => Boolean(track && track.channel),
    );
}

export function computeBundleKey(
  glb: GlbAsset | null,
  lowLevel: GraphAsset | null,
): string {
  if (!glb && !lowLevel) {
    return "bundle-default";
  }
  const parts = [
    glb?.label ?? "",
    glb?.fileName ?? "",
    glb?.updatedAt ?? "",
    String(glb?.size ?? 0),
    lowLevel?.label ?? "",
    lowLevel?.fileName ?? "",
    lowLevel?.updatedAt ?? "",
    stableStringify(lowLevel?.spec ?? {}),
  ];
  return hashString(parts.join("|"));
}

export function loadPersistedState(): {
  state: AppState;
  bundleKey: string | null;
} {
  if (typeof window === "undefined") {
    return { state: DEFAULT_APP_STATE, bundleKey: null };
  }
  try {
    const lastKey = window.localStorage.getItem(STORAGE_LAST_KEY);
    if (!lastKey) {
      return { state: DEFAULT_APP_STATE, bundleKey: null };
    }
    const payload = window.localStorage.getItem(makeBundleStorageKey(lastKey));
    if (!payload) {
      return { state: DEFAULT_APP_STATE, bundleKey: null };
    }
    const parsed = JSON.parse(payload) as Partial<AppState>;
    const state: AppState = {
      ...DEFAULT_APP_STATE,
      ...parsed,
      glb: parsed.glb ?? null,
      lowLevel: parsed.lowLevel ?? null,
      highLevel: Array.isArray(parsed.highLevel) ? parsed.highLevel : [],
      animations: Array.isArray(parsed.animations)
        ? parsed.animations.map((raw) => {
            const label =
              typeof (raw as any)?.label === "string"
                ? ((raw as any).label as string)
                : typeof (raw as any)?.name === "string"
                  ? ((raw as any).name as string)
                  : "Animation";
            const clipRaw = (raw as any)?.clip ?? null;
            const clipId =
              clipRaw && typeof clipRaw.id === "string"
                ? (clipRaw.id as string)
                : (((raw as any)?.id as string | undefined) ?? label);
            const assetId =
              typeof (raw as any)?.id === "string"
                ? ((raw as any).id as string)
                : clipId;
            return {
              id: assetId,
              label,
              fileName:
                typeof (raw as any)?.fileName === "string"
                  ? ((raw as any).fileName as string)
                  : sanitiseFileName(label),
              weight:
                typeof (raw as any)?.weight === "number"
                  ? Number((raw as any).weight)
                  : 1,
              clip:
                clipRaw && typeof clipRaw === "object"
                  ? {
                      id: clipId,
                      name:
                        typeof clipRaw.name === "string"
                          ? (clipRaw.name as string)
                          : label,
                      duration:
                        Number((clipRaw as any).duration) > 0
                          ? Number((clipRaw as any).duration)
                          : 1,
                      tracks: normaliseTracks((clipRaw as any).tracks),
                    }
                  : {
                      id: clipId,
                      name: label,
                      duration: 1,
                      tracks: [],
                    },
              updatedAt:
                typeof (raw as any)?.updatedAt === "string"
                  ? ((raw as any).updatedAt as string)
                  : new Date().toISOString(),
            };
          })
        : [],
      selectedRigIds: Array.isArray(parsed.selectedRigIds)
        ? parsed.selectedRigIds
        : [],
      sliderValues:
        typeof parsed.sliderValues === "object" && parsed.sliderValues
          ? parsed.sliderValues
          : {},
      rigPresets:
        typeof parsed.rigPresets === "object" && parsed.rigPresets
          ? parsed.rigPresets
          : {},
      selectedAnimationId:
        parsed.selectedAnimationId !== undefined
          ? parsed.selectedAnimationId
          : null,
    };
    return { state, bundleKey: lastKey };
  } catch (err) {
    console.warn("demo-animating-faces: failed to load persisted state", err);
    return { state: DEFAULT_APP_STATE, bundleKey: null };
  }
}

export function persistState(state: AppState): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const bundleKey = computeBundleKey(state.glb, state.lowLevel);
    const payload = JSON.stringify(state);
    window.localStorage.setItem(makeBundleStorageKey(bundleKey), payload);
    window.localStorage.setItem(STORAGE_LAST_KEY, bundleKey);
    return bundleKey;
  } catch (err) {
    console.warn("demo-animating-faces: failed to persist state", err);
    return null;
  }
}

export function clearPersistedState(bundleKey?: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const key = bundleKey ?? window.localStorage.getItem(STORAGE_LAST_KEY);
    if (key) {
      window.localStorage.removeItem(makeBundleStorageKey(key));
    }
    window.localStorage.removeItem(STORAGE_LAST_KEY);
  } catch (err) {
    console.warn("demo-animating-faces: failed to clear persisted state", err);
  }
}
