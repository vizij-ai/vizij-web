import type { Group } from "@vizij/render";

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

export function deriveAutoFaceId(
  sourceName: string | null,
  rootRenderable: Group | undefined,
): string | null {
  if (sourceName) {
    const normalised = normaliseAssetLabel(sourceName);
    if (normalised) {
      return sanitizeFaceId(normalised);
    }
  }
  if (rootRenderable?.name) {
    return sanitizeFaceId(rootRenderable.name);
  }
  if (rootRenderable?.id) {
    return sanitizeFaceId(rootRenderable.id);
  }
  return null;
}
