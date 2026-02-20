import { describe, expect, it } from "vitest";
import {
  deriveStandardNamespaceAndChannel,
  formatStandardSegmentName,
  getStandardPathSegments,
} from "./standardInputSegments";

describe("standardInputSegments", () => {
  describe("getStandardPathSegments", () => {
    it("returns segments for standard paths", () => {
      expect(getStandardPathSegments("/standard/semio/left_eye/pos/x")).toEqual(
        ["semio", "left_eye", "pos", "x"],
      );
    });

    it("returns null for non-standard paths", () => {
      expect(getStandardPathSegments("/rig/robot/head/rotation/x")).toBeNull();
    });
  });

  describe("deriveStandardNamespaceAndChannel", () => {
    it("parses namespaced standard paths", () => {
      expect(
        deriveStandardNamespaceAndChannel("/standard/semio/left_eye/pos/x"),
      ).toEqual({
        namespace: "semio",
        channel: "left_eye",
      });
    });

    it("parses legacy paths without namespace", () => {
      expect(
        deriveStandardNamespaceAndChannel("/standard/left_eye/pos/x"),
      ).toEqual({
        namespace: "",
        channel: "left_eye",
      });
    });

    it("falls back when path is invalid", () => {
      expect(deriveStandardNamespaceAndChannel("/invalid/path")).toEqual({
        namespace: "",
        channel: "custom",
      });
    });
  });

  it("formats standard segment names for display", () => {
    expect(formatStandardSegmentName("left_eye")).toBe("Left Eye");
  });
});
