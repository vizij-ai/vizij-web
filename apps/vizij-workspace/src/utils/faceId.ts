import type { Group } from "@vizij/render";

/**
 * Produces an underscored slug that is stable for use in filenames.
 * Falls back to `vizij` so exports always have a descriptive prefix.
 */
export function faceSlug(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "vizij";
  }
  return trimmed.replace(/\s+/g, "_");
}

export function sanitizeFaceId(value: string): string {
  const normalised = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalised || "robot";
}

export function normaliseAssetLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return "";
  }
  const withoutParams = trimmed.split(/[?#]/, 1)[0];
  const withForwardSlashes = withoutParams.replace(/\\/g, "/");
  const segments = withForwardSlashes.split("/");
  const last = segments[segments.length - 1] ?? trimmed;
  const withoutExtension = last.replace(/\.[^.]+$/, "");
  return withoutExtension || last;
}

function stripVizijSuffix(value: string): string {
  const stripped = value.replace(/[_-]?vizij$/i, "");
  return stripped.length > 0 ? stripped : value;
}

export function deriveAutoFaceId(
  sourceName: string | null,
  rootRenderable: Group | undefined,
): string | null {
  if (sourceName) {
    const normalised = stripVizijSuffix(normaliseAssetLabel(sourceName));
    if (normalised) {
      return sanitizeFaceId(normalised);
    }
  }
  if (rootRenderable?.name) {
    return sanitizeFaceId(stripVizijSuffix(rootRenderable.name));
  }
  if (rootRenderable?.id) {
    return sanitizeFaceId(stripVizijSuffix(rootRenderable.id));
  }
  return null;
}
