import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Runtime } from "@vizij/runtime";
import type { InPlaceValues } from "../../scene/worldStructure";
import { useMainFaceValues, type MainFace } from "../useMainFaceBytes";

const { setStaticFeature } = vi.hoisted(() => ({ setStaticFeature: vi.fn() }));
vi.mock("@vizij/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vizij/runtime")>()),
  setStaticFeature,
}));

const BYTES = new Uint8Array();

function values(color: number, x: number): InPlaceValues {
  return new Map([
    [
      "plate",
      new Map<string, unknown>([
        ["color", { r: color, g: 0, b: 0 }],
        ["translation", { x, y: 0, z: 0 }],
      ]),
    ],
  ]);
}

function Harness({
  runtime,
  face,
}: {
  runtime: Runtime | null;
  face: MainFace | null;
}) {
  useMainFaceValues("main", runtime, face);
  return null;
}

const first = {} as Runtime;
const second = {} as Runtime;

describe("useMainFaceValues", () => {
  beforeEach(() => setStaticFeature.mockClear());
  afterEach(cleanup);

  it("sets each edited value on the face, and nothing the face shows already", () => {
    const carried = values(1, 0);
    const view = render(
      <Harness
        runtime={first}
        face={{ bytes: BYTES, carried, values: carried }}
      />,
    );
    expect(setStaticFeature).not.toHaveBeenCalled();

    view.rerender(
      <Harness
        runtime={first}
        face={{ bytes: BYTES, carried, values: values(0.5, 0) }}
      />,
    );
    expect(setStaticFeature.mock.calls).toEqual([
      ["main", "plate", "color", { r: 0.5, g: 0, b: 0 }],
    ]);
  });

  it("sets on a newly loaded face the values edited since its bytes were made", () => {
    const carried = values(1, 0);
    const view = render(
      <Harness
        runtime={first}
        face={{ bytes: BYTES, carried, values: carried }}
      />,
    );
    // Bytes made from the world before the colour edit; the face they load
    // shows the colour they carry.
    view.rerender(
      <Harness
        runtime={first}
        face={{ bytes: BYTES, carried: values(1, 2), values: values(0.5, 2) }}
      />,
    );
    setStaticFeature.mockClear();
    view.rerender(
      <Harness
        runtime={second}
        face={{ bytes: BYTES, carried: values(1, 2), values: values(0.5, 2) }}
      />,
    );
    expect(setStaticFeature.mock.calls).toEqual([
      ["main", "plate", "color", { r: 0.5, g: 0, b: 0 }],
    ]);
  });

  it("sets nothing while no face runs", () => {
    render(
      <Harness
        runtime={null}
        face={{ bytes: BYTES, carried: values(1, 0), values: values(0, 0) }}
      />,
    );
    expect(setStaticFeature).not.toHaveBeenCalled();
  });
});
