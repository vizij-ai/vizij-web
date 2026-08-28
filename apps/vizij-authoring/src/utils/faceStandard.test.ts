import { describe, expect, it } from "vitest";
import {
  EXPRESSION_NAMES,
  VISEME_SHAPES,
  buildEmptyAdaptationSpec,
  expressionPath,
  visemePath,
} from "./faceStandard";

const PREFIX = "rig/quori_latest/";

describe("the face standard vocabulary", () => {
  // These counts are the standard's contract, not an implementation detail:
  // `vizij-bundle validate` reports coverage as a fraction of exactly these.
  it("carries the standard's 25 expressions and 15 visemes, each unique", () => {
    expect(EXPRESSION_NAMES).toHaveLength(25);
    expect(new Set(EXPRESSION_NAMES).size).toBe(25);
    expect(VISEME_SHAPES).toHaveLength(15);
    expect(new Set(VISEME_SHAPES).size).toBe(15);
    // `sil` is the rest shape the standard names explicitly.
    expect(VISEME_SHAPES).toContain("sil");
  });

  it("builds control paths under the standard's namespace", () => {
    expect(expressionPath("happy")).toBe("standard/vizij/expression/happy");
    expect(visemePath("aa")).toBe("standard/vizij/viseme/aa");
  });
});

describe("the empty adaptation", () => {
  it("declares every control as a rig-prefixed input and wires nothing", () => {
    const spec = buildEmptyAdaptationSpec(PREFIX);

    expect(spec.nodes).toHaveLength(40);
    expect(spec.edges).toStrictEqual([]);
    expect(spec.nodes.every((node) => node.type === "input")).toBe(true);

    const paths = spec.nodes.map((node) => node.params?.path);
    expect(paths).toContain(`${PREFIX}standard/vizij/expression/happy`);
    expect(paths).toContain(`${PREFIX}standard/vizij/viseme/aa`);
    // Node ids must be unique or the graph cannot round-trip through the editor.
    expect(new Set(spec.nodes.map((node) => node.id)).size).toBe(40);
  });

  it("rests every control at zero, so an unwired face holds its neutral", () => {
    const spec = buildEmptyAdaptationSpec(PREFIX);
    expect(spec.nodes.every((node) => node.params?.value === 0)).toBe(true);
  });

  it("omits the prefix for a face with no id, matching the runtime", () => {
    const spec = buildEmptyAdaptationSpec("");
    expect(spec.nodes[0]?.params?.path).toBe(
      "standard/vizij/expression/neutral",
    );
  });
});
