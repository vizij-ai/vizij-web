import { describe, expect, it } from "vitest";
import { stillFolding, type MorphTrianglesReport } from "@vizij/import";
import { NOTICEABLE, summarizeMorphTriangles } from "./importPasses";

type Part = MorphTrianglesReport["parts"][number];

function part(overrides: Partial<Part>): Part {
  return {
    mesh: 0,
    meshName: "mouth",
    primitive: 0,
    vertices: 65,
    outcome: "retriangulated",
    skipReason: null,
    folds: [],
    ...overrides,
  };
}

const summarize = (parts: Part[]) =>
  summarizeMorphTriangles({ parts }, stillFolding);

describe("summarizeMorphTriangles", () => {
  it("names a part fixed only when a shape visibly improved", () => {
    const fixed = part({
      folds: [{ shape: "smile_shape", before: 0.41, after: 0.12 }],
    });
    const marginal = part({
      meshName: "left_eyebrow",
      folds: [{ shape: "rest", before: NOTICEABLE / 2, after: 0 }],
    });
    const atThreshold = part({
      meshName: "left_pupil",
      folds: [{ shape: "rest", before: NOTICEABLE, after: 0 }],
    });
    expect(summarize([fixed, marginal, atThreshold]).improved).toEqual([
      "mouth",
      "left_pupil",
    ]);
  });

  it("lists each part once, however many pieces it was exported in", () => {
    const piece = (vertices: number, stillWrong: string) =>
      part({
        meshName: "left_eye_lid",
        vertices,
        folds: [
          { shape: "rest", before: 0.4, after: 0.0 },
          { shape: "wink_shape", before: 0.9, after: 0.0 },
        ].map((fold) =>
          fold.shape === stillWrong ? { ...fold, after: 0.3 } : fold,
        ),
      });
    const summary = summarize([piece(4, "rest"), piece(6, "wink_shape")]);
    expect(summary.improved).toEqual(["left_eye_lid"]);
    expect(summary.remaining).toEqual([
      { part: "left_eye_lid", shapes: ["neutral", "wink_shape"] },
    ]);
  });

  it("keeps shapes still drawn wrong above the threshold only", () => {
    const summary = summarize([
      part({
        outcome: "kept",
        folds: [
          { shape: "smile_shape", before: 0.12, after: 0.12 },
          { shape: "talking_shape", before: 0.012, after: 0.012 },
        ],
      }),
    ]);
    expect(summary).toEqual({
      changed: false,
      improved: [],
      remaining: [{ part: "mouth", shapes: ["smile_shape"] }],
      unchecked: [],
    });
  });

  it("records a rewrite too small to notice as a change", () => {
    const summary = summarize([
      part({ folds: [{ shape: "rest", before: 0.04, after: 0 }] }),
    ]);
    expect(summary.changed).toBe(true);
    expect(summary.improved).toEqual([]);
  });

  it("keeps two meshes that share a name apart", () => {
    const summary = summarize([
      part({
        mesh: 3,
        meshName: "Circle",
        outcome: "skipped",
        skipReason: "is not a single polygon",
      }),
      part({
        mesh: 4,
        meshName: "Circle",
        folds: [{ shape: "rest", before: 0.5, after: 0 }],
      }),
    ]);
    expect(summary.improved).toEqual(["Circle (mesh 4)"]);
    expect(summary.unchecked).toEqual([
      { part: "Circle (mesh 3)", reason: "is not a single polygon" },
    ]);
  });

  it("reports parts the cleanup could not check, with the reason", () => {
    const summary = summarize([
      part({
        meshName: null,
        mesh: 3,
        outcome: "skipped",
        skipReason: "is not a single polygon",
      }),
    ]);
    expect(summary.unchecked).toEqual([
      { part: "mesh 3", reason: "is not a single polygon" },
    ]);
  });
});
