import { describe, expect, it } from "vitest";
import {
  faceVersionsMetadata,
  NO_FACE_VERSIONS,
  readFaceVersions,
} from "../faceVersions";

describe("face versions", () => {
  it("reads the versions a bundle states, trimmed", () => {
    expect(
      readFaceVersions({
        metadata: {
          faceId: "quori",
          hardwareVersion: " quori-1.3 ",
          softwareVersion: "2.0-ros4hri",
        },
      }),
    ).toEqual({ hardwareVersion: "quori-1.3", softwareVersion: "2.0-ros4hri" });
  });

  it("reads none from a bundle without them, or with one that is no string", () => {
    expect(readFaceVersions(null)).toEqual(NO_FACE_VERSIONS);
    expect(readFaceVersions({ metadata: { faceId: "quori" } })).toEqual(
      NO_FACE_VERSIONS,
    );
    expect(
      readFaceVersions({ metadata: { hardwareVersion: 3 } as never }),
    ).toEqual(NO_FACE_VERSIONS);
  });

  it("exports each version trimmed, and leaves a blank one out", () => {
    expect(
      faceVersionsMetadata({
        hardwareVersion: " emy-2026-10-13 ",
        softwareVersion: "1.2",
      }),
    ).toEqual({ hardwareVersion: "emy-2026-10-13", softwareVersion: "1.2" });
    expect(
      faceVersionsMetadata({ hardwareVersion: "  ", softwareVersion: "1.2" }),
    ).toEqual({ softwareVersion: "1.2" });
    expect(faceVersionsMetadata(NO_FACE_VERSIONS)).toEqual({});
    expect(faceVersionsMetadata(undefined)).toEqual({});
  });
});
