import type { VizijBundleExtension, VizijBundleMetadata } from "@vizij/render";

/**
 * The face's versions as the author edits them, each an empty string when the
 * face states none. They travel in the bundle's `metadata`, beside `faceId`
 * (see {@link VizijBundleMetadata}): `hardwareVersion` names the face itself —
 * its shapes, what can move in them and the layout giving them meaning —
 * and `softwareVersion` what it runs.
 */
export interface FaceVersions {
  hardwareVersion: string;
  softwareVersion: string;
}

export const NO_FACE_VERSIONS: FaceVersions = {
  hardwareVersion: "",
  softwareVersion: "",
};

function version(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The versions `bundle` states, trimmed; empty for one it does not state. */
export function readFaceVersions(
  bundle: Pick<VizijBundleExtension, "metadata"> | null | undefined,
): FaceVersions {
  return {
    hardwareVersion: version(bundle?.metadata?.hardwareVersion),
    softwareVersion: version(bundle?.metadata?.softwareVersion),
  };
}

/**
 * The metadata fields an export writes for `versions`: each one trimmed, and
 * left out when blank, so a face without a version states none and a device
 * showing it falls back as the bundle's readers do.
 */
export function faceVersionsMetadata(
  versions: FaceVersions | null | undefined,
): Pick<VizijBundleMetadata, "hardwareVersion" | "softwareVersion"> {
  const { hardwareVersion, softwareVersion } = readFaceVersions({
    metadata: { ...versions },
  });
  return {
    ...(hardwareVersion ? { hardwareVersion } : {}),
    ...(softwareVersion ? { softwareVersion } : {}),
  };
}
