import { describe, expect, it } from "vitest";
import {
  deriveProgramInputSeedValues,
  deriveProgramResetValues,
} from "../index";
import type { VizijProgramAsset } from "../types";

function makeProgram(path = "rig/quori_latest/lids/blink"): VizijProgramAsset {
  return {
    id: "idle-eyes",
    graph: {
      id: "idle-eyes-graph",
      spec: {
        nodes: [
          {
            id: "blink",
            type: "output",
            params: { path },
          },
          {
            id: "smile",
            type: "output",
            params: { path: "rig/quori_latest/mouth/smile" },
          },
        ],
        edges: [],
      },
    },
  };
}

function makeInputProgram(path: string): VizijProgramAsset {
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
      program: makeInputProgram(inputPath),
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
      program: makeInputProgram(inputPath),
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
      program: makeInputProgram(inputPath),
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
      program: makeInputProgram(inputPath),
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

describe("deriveProgramResetValues", () => {
  it("uses explicit reset values when authored on the program", () => {
    expect(
      deriveProgramResetValues({
        program: {
          ...makeProgram(),
          resetValues: {
            "rig/quori_latest/lids/blink": 0,
            "rig/quori_latest/mouth/smile": 0.2,
            ignored: Number.NaN,
          },
        },
        inputConstraints: {},
      }),
    ).toEqual([
      { path: "rig/quori_latest/lids/blink", value: 0 },
      { path: "rig/quori_latest/mouth/smile", value: 0.2 },
    ]);
  });

  it("falls back to output defaults and zeroes for graph outputs", () => {
    expect(
      deriveProgramResetValues({
        program: makeProgram(),
        inputConstraints: {
          "rig/quori_latest/lids/blink": { defaultValue: 0.1 },
        },
      }),
    ).toEqual([
      { path: "rig/quori_latest/lids/blink", value: 0.1 },
      { path: "rig/quori_latest/mouth/smile", value: 0 },
    ]);
  });
});
