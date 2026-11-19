import { describe, expect, it } from "vitest";
import {
  stillFolding,
  type MorphTrianglesReport,
  type ShapeFold,
  type ShapeKind,
} from "@vizij/import";
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

/** A fold; `change` is the pass's own judgement of the rewrite. */
function fold(
  shape: string,
  kind: ShapeKind,
  before: number | null,
  after: number | null,
  change: "better" | "worse" | "same" = "same",
): ShapeFold {
  return {
    shape,
    kind,
    before,
    after,
    visiblyBetter: change === "better",
    visiblyWorse: change === "worse",
  };
}

const summarize = (parts: Part[]) =>
  summarizeMorphTriangles({ parts }, stillFolding);

describe("summarizeMorphTriangles", () => {
  it("names a part improved by the pass's own visibly-better flag", () => {
    const summary = summarize([
      part({ folds: [fold("smile_shape", "target", 0.41, 0.12, "better")] }),
      part({
        meshName: "left_eyebrow",
        folds: [fold("rest", "rest", 0.3, 0.0, "same")],
      }),
    ]);
    expect(summary.improved).toEqual(["mouth"]);
    expect(summary.changed).toBe(true);
  });

  it("lists each part once, however many pieces it was exported in", () => {
    const piece = (vertices: number, stillWrong: string) =>
      part({
        meshName: "left_eye_lid",
        vertices,
        folds: [
          fold("rest", "rest", 0.4, stillWrong === "rest" ? 0.3 : 0, "better"),
          fold(
            "wink_shape",
            "target",
            0.9,
            stillWrong === "wink_shape" ? 0.3 : 0,
            "better",
          ),
        ],
      });
    const summary = summarize([piece(4, "rest"), piece(6, "wink_shape")]);
    expect(summary.improved).toEqual(["left_eye_lid"]);
    expect(summary.remaining).toEqual([
      { part: "left_eye_lid", shapes: ["neutral", "wink_shape"] },
    ]);
  });

  it("keeps poses still drawn wrong above the threshold only", () => {
    const summary = summarize([
      part({
        outcome: "kept",
        folds: [
          fold("smile_shape", "target", 0.12, 0.12),
          fold("talking_shape", "target", 0.012, 0.012),
        ],
      }),
    ]);
    expect(summary).toEqual({
      changed: false,
      improved: [],
      remaining: [{ part: "mouth", shapes: ["smile_shape"] }],
      worsened: [],
      declined: [],
      unchecked: [],
    });
  });

  it("lists whatever the pass flags as visibly worse, poses and blends alike", () => {
    const summary = summarize([
      part({
        folds: [
          fold("rest", "rest", 0.0, 0.3, "worse"),
          fold("smile_shape", "target", 0.9, 0.0, "better"),
          fold("idle_shape + sad_shape", "blend", 0.05, 0.19, "worse"),
          fold("o_shape + sad_shape", "blend", 0.0, 0.2, "same"),
        ],
      }),
    ]);
    expect(summary.worsened).toEqual([
      { part: "mouth", shapes: ["neutral", "idle_shape + sad_shape"] },
    ]);
    expect(summary.remaining).toEqual([]);
  });

  it("counts a blend made visibly better as the part improved", () => {
    const summary = summarize([
      part({ folds: [fold("a + b", "blend", 0.9, 0.1, "better")] }),
    ]);
    expect(summary.improved).toEqual(["mouth"]);
  });

  it("keeps a declined part's poses with the part, not with remodelling", () => {
    const summary = summarize([
      part({
        outcome: "declined",
        folds: [
          fold("rest", "rest", 0.46, 0.46),
          fold("a_shape", "target", 0.01, 0.01),
        ],
      }),
      part({
        mesh: 1,
        meshName: "left_eye_lid",
        outcome: "declined",
        folds: [fold("rest", "rest", 0, 0)],
      }),
    ]);
    expect(summary.declined).toEqual([
      { part: "mouth", shapes: ["neutral"] },
      { part: "left_eye_lid", shapes: [] },
    ]);
    expect(summary.remaining).toEqual([]);
  });

  it("records a rewrite too small to notice as a change", () => {
    const summary = summarize([
      part({ folds: [fold("rest", "rest", 0.04, 0)] }),
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
        folds: [fold("rest", "rest", 0.5, 0, "better")],
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

  it("lists a pose still wrong from the noticeable threshold on", () => {
    const summary = summarize([
      part({
        outcome: "kept",
        folds: [
          fold("a_shape", "target", NOTICEABLE * 1.01, NOTICEABLE * 1.01),
          fold("b_shape", "target", NOTICEABLE * 0.99, NOTICEABLE * 0.99),
        ],
      }),
    ]);
    expect(summary.remaining).toEqual([{ part: "mouth", shapes: ["a_shape"] }]);
  });
});
