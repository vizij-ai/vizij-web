import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeGlb } from "../../animationImport/__tests__/makeGlb";
import { ReferenceFaceRuntime } from "./ReferenceFaceRuntime";

/** What the provider was last rendered with. */
let providerProps: { glb: unknown; run: unknown } | null = null;

/** The reference face's device: its keys under `rig/face/`. */
function makeDevice(overrideKeys: string[] = []) {
  return {
    path: (relative: string) => `rig/face/${relative}`,
    setValue: vi.fn(),
    invoke: vi.fn().mockResolvedValue(undefined),
    listKeys: vi.fn(async (prefix: string) =>
      overrideKeys
        .filter((path) => path.startsWith(prefix))
        .map((path) => ({ path, __meta: {} })),
    ),
  };
}

let device = makeDevice();
let rigInputs: Array<{ path: string; defaultValue: number | null }> = [];

vi.mock("@vizij/runtime-react", () => ({
  VizijRuntimeProvider: ({
    children,
    ...props
  }: {
    glb: unknown;
    run: unknown;
    children: React.ReactNode;
  }) => {
    providerProps = props;
    return <div data-testid="runtime-provider">{children}</div>;
  },
  useVizijRuntime: () => ({
    status: "ready",
    runtime: device,
    description: {
      rigInputs: rigInputs.map((input) => ({
        id: null,
        label: null,
        group: null,
        min: 0,
        max: 1,
        ...input,
      })),
    },
  }),
}));

vi.mock("./RuntimeFaceFrame", () => ({
  RuntimeFaceFrame: ({ overlay }: { overlay?: React.ReactNode }) => (
    <div data-testid="runtime-face-frame">{overlay}</div>
  ),
}));

vi.mock("./RuntimeFaceControlsOverlay", () => ({
  RuntimeFaceControlsOverlay: ({
    onResetInputs,
  }: {
    onResetInputs?: () => void;
  }) => (
    <button
      type="button"
      data-testid="runtime-overlay-reset"
      onClick={onResetInputs}
    >
      Reset
    </button>
  ),
}));

vi.mock("../ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

/** A GLB file of `bytes`, readable as the browser reads one (jsdom's `File`
 * has no `arrayBuffer`). */
function glbFile(bytes: ArrayBuffer): File {
  const file = new File([bytes], "ref.glb", { type: "model/gltf-binary" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
  return file;
}

const FACE_FILE = glbFile(new TextEncoder().encode("ref").buffer);

/** Render the reference face; the latest function it hands out to write its
 * inputs, once it has listed its override keys. */
async function renderWithWriter() {
  const onAnimateValueReady = vi.fn();
  render(
    <ReferenceFaceRuntime
      file={FACE_FILE}
      onAnimateValueReady={onAnimateValueReady}
    />,
  );
  await waitFor(() => {
    expect(device.listKeys).toHaveBeenCalledWith("rig/face/override/");
  });
  await waitFor(() => {
    expect(typeof onAnimateValueReady.mock.calls.at(-1)?.[0]).toBe("function");
  });
  return (path: string, value: number) =>
    onAnimateValueReady.mock.calls.at(-1)?.[0](path, value);
}

describe("ReferenceFaceRuntime", () => {
  afterEach(cleanup);

  beforeEach(() => {
    providerProps = null;
    device = makeDevice();
    rigInputs = [];
  });

  it("loads the file as its own Vizij, running while visible", () => {
    const { rerender } = render(<ReferenceFaceRuntime file={FACE_FILE} />);
    expect(providerProps).toEqual({ glb: FACE_FILE, run: true });

    rerender(<ReferenceFaceRuntime file={FACE_FILE} visible={false} />);
    expect(providerProps?.run).toBe(false);
  });

  it("reports the bundle the file carries", async () => {
    const bundle = { version: 1, metadata: { faceId: "ref" } };
    const file = glbFile(
      makeGlb(
        {
          asset: { version: "2.0" },
          nodes: [{ name: "root", extensions: { VIZIJ_bundle: bundle } }],
        },
        new ArrayBuffer(0),
      ),
    );
    const onBundleReady = vi.fn();
    render(<ReferenceFaceRuntime file={file} onBundleReady={onBundleReady} />);

    await waitFor(() => {
      expect(onBundleReady).toHaveBeenCalledWith(bundle);
    });
  });

  it("returns its inputs to rest and reports their defaults", async () => {
    rigInputs = [
      { path: "standard/eyes/blink", defaultValue: 0 },
      { path: "standard/eyes/squint", defaultValue: 0.25 },
    ];
    const onStandardInputChange = vi.fn();
    const onStandardInputsReady = vi.fn();
    render(
      <ReferenceFaceRuntime
        file={FACE_FILE}
        onStandardInputsReady={onStandardInputsReady}
        onStandardInputChange={onStandardInputChange}
      />,
    );
    let inputs: Array<{ id: string; defaultValue: number }> = [];
    await waitFor(() => {
      inputs = onStandardInputsReady.mock.calls.at(-1)?.[0] ?? [];
      expect(inputs).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId("runtime-overlay-reset"));

    expect(device.invoke).toHaveBeenCalledWith("reset_keys", {
      keys: {
        strs: expect.arrayContaining([
          "rig/face/standard/eyes/blink",
          "rig/face/standard/eyes/squint",
        ]),
      },
    });
    inputs.forEach((input) => {
      expect(onStandardInputChange).toHaveBeenCalledWith(
        input.id,
        input.defaultValue,
      );
    });
  });

  it("writes and resets an input the rig reads through its override keys there", async () => {
    device = makeDevice([
      "rig/face/override/blink/enabled",
      "rig/face/override/blink/value",
    ]);
    rigInputs = [{ path: "blink", defaultValue: 0 }];
    const write = await renderWithWriter();

    await waitFor(() => {
      device.setValue.mockClear();
      write("/blink", 0.5);
      expect(device.setValue.mock.calls).toEqual([
        ["rig/face/override/blink/enabled", 1],
        ["rig/face/override/blink/value", 0.5],
      ]);
    });

    fireEvent.click(screen.getByTestId("runtime-overlay-reset"));
    expect(device.invoke).toHaveBeenCalledWith("reset_keys", {
      keys: {
        strs: [
          "rig/face/override/blink/value",
          "rig/face/override/blink/enabled",
        ],
      },
    });
  });

  it("writes a pose weight at its own key, whatever overrides the rig has", async () => {
    device = makeDevice([
      "rig/face/override/poses_pose_angry.weight/enabled",
      "rig/face/override/poses_pose_angry.weight/value",
    ]);
    rigInputs = [{ path: "poses/pose_angry.weight", defaultValue: 0 }];
    const write = await renderWithWriter();

    write("/poses/pose_angry.weight", 1);

    expect(device.setValue.mock.calls).toEqual([
      ["rig/face/poses/pose_angry.weight", 1],
    ]);
  });
});
