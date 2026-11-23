import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Runtime } from "@vizij/runtime";
import type { InPlaceValues } from "../../scene/worldStructure";
import { useMainFaceValues, type MainFace } from "../useMainFaceBytes";

const { setValue } = vi.hoisted(() => ({ setValue: vi.fn() }));
vi.mock("@vizij/render", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vizij/render")>()),
  vizijHandle: () => Promise.resolve({ setValue }),
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

/** Lets the writes, which wait on the resolved App handle, land. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useMainFaceValues", () => {
  beforeEach(() => setValue.mockClear());
  afterEach(cleanup);

  it("sets each edited value on the face, and nothing the face shows already", async () => {
    const carried = values(1, 0);
    const view = render(
      <Harness
        runtime={first}
        face={{ bytes: BYTES, carried, values: carried }}
      />,
    );
    await settled();
    expect(setValue).not.toHaveBeenCalled();

    view.rerender(
      <Harness
        runtime={first}
        face={{ bytes: BYTES, carried, values: values(0.5, 0) }}
      />,
    );
    await settled();
    expect(setValue.mock.calls).toEqual([
      ["main", "plate", [0.5, 0, 0], "color"],
    ]);
  });

  it("sets on a newly loaded face the values edited since its bytes were made", async () => {
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
    await settled();
    setValue.mockClear();
    view.rerender(
      <Harness
        runtime={second}
        face={{ bytes: BYTES, carried: values(1, 2), values: values(0.5, 2) }}
      />,
    );
    await settled();
    expect(setValue.mock.calls).toEqual([
      ["main", "plate", [0.5, 0, 0], "color"],
    ]);
  });

  it("writes a translation as its three numbers", async () => {
    const carried = values(1, 0);
    const view = render(
      <Harness
        runtime={first}
        face={{ bytes: BYTES, carried, values: carried }}
      />,
    );
    view.rerender(
      <Harness
        runtime={first}
        face={{ bytes: BYTES, carried, values: values(1, 3) }}
      />,
    );
    await settled();
    expect(setValue.mock.calls).toEqual([
      ["main", "plate", [3, 0, 0], "translation"],
    ]);
  });

  it("sets nothing while no face runs", async () => {
    render(
      <Harness
        runtime={null}
        face={{ bytes: BYTES, carried: values(1, 0), values: values(0, 0) }}
      />,
    );
    await settled();
    expect(setValue).not.toHaveBeenCalled();
  });
});
