import { describe, expect, it } from "vitest";
import { deriveProgramResetValues } from "../index";
import type { VizijProgramAsset } from "../types";

function makeProgram(): VizijProgramAsset {
  return {
    id: "idle-eyes",
    graph: {
      id: "idle-eyes-graph",
      spec: {
        nodes: [
          {
            id: "blink",
            type: "output",
            params: { path: "rig/quori_latest/lids/blink" },
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
