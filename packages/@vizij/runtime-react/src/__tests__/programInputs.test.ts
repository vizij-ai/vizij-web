import { describe, expect, it } from "vitest";
import { deriveProgramInputSeedValues } from "../VizijRuntimeProvider";
import type { VizijProgramAsset } from "../types";

function makeProgram(path: string): VizijProgramAsset {
  return {
    id: "program",
    graph: {
      id: "program-graph",
      spec: {
        nodes: [
          {
            id: "input_host_value",
            type: "input",
            params: { path },
          },
        ],
        edges: [],
      },
    },
  };
}

describe("deriveProgramInputSeedValues", () => {
  it("seeds missing program inputs from authored rig defaults", () => {
    const inputPath =
      "rig/quori_latest/standard/vmotion/idle/eyes/jitter_amplitude";

    const writes = deriveProgramInputSeedValues({
      program: makeProgram(inputPath),
      namespace: "demo-player",
      inputConstraints: {
        [inputPath]: { defaultValue: 0.25 },
      },
      getPathSnapshot: () => undefined,
      stagedInputs: new Map(),
    });

    expect(writes).toEqual([{ path: inputPath, value: { float: 0.25 } }]);
  });

  it("resolves authored defaults stored as relative rig metadata paths", () => {
    const inputPath =
      "rig/quori_latest/standard/vmotion/idle/eyes/jitter_amplitude";

    const writes = deriveProgramInputSeedValues({
      program: makeProgram(inputPath),
      namespace: "demo-player",
      inputConstraints: {
        "/standard/vmotion/idle/eyes/jitter_amplitude": { defaultValue: 0.25 },
      },
      getPathSnapshot: () => undefined,
      stagedInputs: new Map(),
    });

    expect(writes).toEqual([{ path: inputPath, value: { float: 0.25 } }]);
  });

  it("does not seed inputs that are already staged for the namespace", () => {
    const inputPath =
      "rig/quori_latest/standard/vmotion/idle/eyes/jitter_amplitude";
    const stagedInputs = new Map([
      [
        "demo-player/rig/quori_latest/standard/vmotion/idle/eyes/jitter_amplitude",
        { value: { float: 0 } },
      ],
    ]);

    const writes = deriveProgramInputSeedValues({
      program: makeProgram(inputPath),
      namespace: "demo-player",
      inputConstraints: {
        [inputPath]: { defaultValue: 0.25 },
      },
      getPathSnapshot: () => undefined,
      stagedInputs,
    });

    expect(writes).toEqual([]);
  });

  it("does not seed inputs that already have a resolved runtime value", () => {
    const inputPath =
      "rig/quori_latest/standard/vmotion/idle/eyes/jitter_amplitude";

    const writes = deriveProgramInputSeedValues({
      program: makeProgram(inputPath),
      namespace: "demo-player",
      inputConstraints: {
        [inputPath]: { defaultValue: 0.25 },
      },
      getPathSnapshot: () => ({ float: 0.1 }),
      stagedInputs: new Map(),
    });

    expect(writes).toEqual([]);
  });
});
