import { describe, expect, it } from "vitest";
import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import {
  buildFallbackGraphPath,
  buildRuntimeInputRouteSnapshot,
  createEmptyRuntimeInputRouteSnapshot,
} from "../index";

function createInput(
  id: string,
  path: string,
  defaultValue: number,
): StandardRigInput {
  return {
    id,
    path,
    label: id,
    group: "/group",
    defaultValue,
    range: { min: 0, max: 1 },
  };
}

describe("buildRuntimeInputRouteSnapshot", () => {
  it("maps canonical routes, filters pose-control inputs, and backfills managed fallbacks", () => {
    const jawAlias = createInput("jaw_alias", "/propsrig/jaw/open", 0.6);
    const brow = createInput("brow_up", "/standard/brow/up", 0.2);
    const byPath = new Map<string, StandardRigInput>([
      [normalizeStandardRigInputPath(jawAlias.path), jawAlias],
      [normalizeStandardRigInputPath(brow.path), brow],
    ]);
    const byId = new Map<string, StandardRigInput>([
      [jawAlias.id, jawAlias],
      [brow.id, brow],
    ]);
    const snapshot = buildRuntimeInputRouteSnapshot({
      faceId: "face",
      graphSummary: {
        inputs: ["pose/control/internal", "rig/face/propsrig/jaw/open"],
      },
      rigOutputLookup: new Map(),
      standardInputsByPath: byPath,
      standardInputsById: byId,
      managedStandardInputs: [{ input: jawAlias }, { input: brow }],
      resolveRuntimeInputId: (inputId) =>
        inputId === "jaw_alias" ? "jaw_open" : inputId,
    });

    expect(snapshot.routesByCanonicalId.size).toBe(2);
    expect(snapshot.routesByCanonicalId.get("jaw_open")).toEqual({
      graphPath: "rig/face/propsrig/jaw/open",
      defaultValue: 0.6,
    });
    expect(snapshot.routesByCanonicalId.get("brow_up")).toEqual({
      graphPath: "rig/face/standard/brow/up",
      defaultValue: 0.2,
    });
    expect(snapshot.graphPathLookupByInputId.get("jaw_open")).toBe(
      "rig/face/propsrig/jaw/open",
    );
    expect(snapshot.graphPathLookupByInputId.get("jaw_alias")).toBe(
      "rig/face/propsrig/jaw/open",
    );
    expect(snapshot.defaults).toEqual({
      jaw_open: 0.6,
      brow_up: 0.2,
    });
  });

  it("returns an empty snapshot when no graph summary is available", () => {
    const snapshot = buildRuntimeInputRouteSnapshot({
      faceId: "face",
      graphSummary: null,
      rigOutputLookup: new Map(),
      standardInputsByPath: new Map(),
      standardInputsById: new Map(),
      managedStandardInputs: [],
      resolveRuntimeInputId: (inputId) => inputId,
    });
    expect(snapshot).toEqual(createEmptyRuntimeInputRouteSnapshot());
  });

  it("resolves legacy rig aliases to propsrig inputs", () => {
    const jaw = createInput("jaw_open", "/propsrig/jaw/open", 0.4);
    const brow = createInput("brow_up", "/propsrig/brow/up", 0.3);
    const byPath = new Map<string, StandardRigInput>([
      [normalizeStandardRigInputPath(jaw.path), jaw],
      [normalizeStandardRigInputPath(brow.path), brow],
    ]);

    const snapshot = buildRuntimeInputRouteSnapshot({
      faceId: "face",
      graphSummary: {
        inputs: [
          "rig/face/rig/element/jaw/open",
          "rig/face/rig/control/brow/up",
        ],
      },
      rigOutputLookup: new Map(),
      standardInputsByPath: byPath,
      standardInputsById: new Map([
        [jaw.id, jaw],
        [brow.id, brow],
      ]),
      managedStandardInputs: [],
      resolveRuntimeInputId: (inputId) => inputId,
    });

    expect(snapshot.routesByCanonicalId.get("jaw_open")).toEqual({
      graphPath: "rig/face/rig/element/jaw/open",
      defaultValue: 0.4,
    });
    expect(snapshot.routesByCanonicalId.get("brow_up")).toEqual({
      graphPath: "rig/face/rig/control/brow/up",
      defaultValue: 0.3,
    });
  });

  it("registers override runtime paths as directly stageable routes", () => {
    const jaw = createInput("jaw_open", "/propsrig/jaw/open", 0.4);
    const byPath = new Map<string, StandardRigInput>([
      [normalizeStandardRigInputPath(jaw.path), jaw],
    ]);
    const byId = new Map<string, StandardRigInput>([[jaw.id, jaw]]);

    const snapshot = buildRuntimeInputRouteSnapshot({
      faceId: "face",
      graphSummary: {
        inputs: [
          "rig/face/override/jaw_open/enabled",
          "rig/face/override/jaw_open/value",
        ],
      },
      rigOutputLookup: new Map(),
      standardInputsByPath: byPath,
      standardInputsById: byId,
      managedStandardInputs: [],
      resolveRuntimeInputId: (inputId) => inputId,
    });

    expect(
      snapshot.routesByCanonicalId.get("rig/face/override/jaw_open/enabled"),
    ).toEqual({
      graphPath: "rig/face/override/jaw_open/enabled",
      defaultValue: 0,
    });
    expect(
      snapshot.routesByCanonicalId.get("rig/face/override/jaw_open/value"),
    ).toEqual({
      graphPath: "rig/face/override/jaw_open/value",
      defaultValue: 0.4,
    });
    expect(
      snapshot.graphPathLookupByInputId.get("rig/face/override/jaw_open/value"),
    ).toBe("rig/face/override/jaw_open/value");
  });

  it("builds fallback graph paths from normalized standard input paths", () => {
    expect(
      buildFallbackGraphPath(
        "face",
        createInput("jaw_open", "/standard/jaw/open", 0),
      ),
    ).toBe("rig/face/standard/jaw/open");
    expect(buildFallbackGraphPath("face", createInput("root", "/", 0))).toBe(
      "rig/face/custom/input",
    );
  });
});
