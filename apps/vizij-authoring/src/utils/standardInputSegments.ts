import { normalizeStandardRigInputPath } from "@vizij/utils";

const STANDARD_ROOT = "standard";

export function getStandardPathSegments(path: string): string[] | null {
  const normalizedPath = normalizeStandardRigInputPath(path);
  const withoutLeadingSlash = normalizedPath.startsWith("/")
    ? normalizedPath.slice(1)
    : normalizedPath;
  if (!withoutLeadingSlash) {
    return null;
  }

  const segments = withoutLeadingSlash.split("/").filter(Boolean);
  const standardIndex = segments.indexOf(STANDARD_ROOT);
  if (standardIndex < 0) {
    return null;
  }

  const afterStandard = segments.slice(standardIndex + 1);
  return afterStandard.length > 0 ? afterStandard : null;
}

export function deriveStandardNamespaceAndChannel(path: string): {
  namespace: string;
  channel: string;
} {
  const segments = getStandardPathSegments(path);
  if (!segments || segments.length === 0) {
    return { namespace: "", channel: "custom" };
  }

  if (segments.length >= 4) {
    return {
      namespace: segments[0] || "",
      channel: segments[1] || "custom",
    };
  }

  return {
    namespace: "",
    channel: segments[0] || "custom",
  };
}

export function formatStandardSegmentName(segment: string): string {
  return segment
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
