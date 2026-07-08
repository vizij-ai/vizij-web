import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReferenceFaceRuntime } from "./ReferenceFaceRuntime";

const capturedAssetBundles: unknown[] = [];
const mockUseVizijRuntime = vi.fn(() => ({
  ready: false,
  loading: false,
  setInput: vi.fn(),
  inputConstraints: null,
  faceId: "face",
  assetBundle: { rig: undefined, bundle: null },
  namespace: "refface",
}));

vi.mock("@vizij/runtime-react", () => ({
  VizijRuntimeProvider: ({
    assetBundle,
    children,
  }: {
    assetBundle: unknown;
    children: React.ReactNode;
  }) => {
    capturedAssetBundles.push(assetBundle);
    return <div data-testid="runtime-provider">{children}</div>;
  },
  useVizijRuntime: () => mockUseVizijRuntime(),
}));

vi.mock("./RuntimeFaceFrame", () => ({
  RuntimeFaceFrame: ({ overlay }: { overlay?: React.ReactNode }) => (
    <div data-testid="runtime-face-frame">{overlay}</div>
  ),
}));

vi.mock("./RuntimeFaceControlsOverlay", () => ({
  RuntimeFaceControlsOverlay: ({
    onResetInputs,
    resetButtonLabel,
  }: {
    onResetInputs?: () => void;
    resetButtonLabel?: string;
  }) => (
    <button
      type="button"
      data-testid="runtime-overlay-reset"
      onClick={onResetInputs}
    >
      {resetButtonLabel ?? "Reset Inputs"}
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

describe("ReferenceFaceRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAssetBundles.length = 0;
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:mock-url"),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
  });

  it("creates object URLs from effects and revokes superseded URLs", async () => {
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:face-a")
      .mockReturnValueOnce("blob:face-b");
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURL,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURL,
      configurable: true,
      writable: true,
    });

    try {
      const fileA = new File(["face-a"], "face-a.glb", {
        type: "model/gltf-binary",
      });
      const fileB = new File(["face-b"], "face-b.glb", {
        type: "model/gltf-binary",
      });

      const { rerender, unmount } = render(
        <ReferenceFaceRuntime file={fileA} active />,
      );

      await waitFor(() => {
        expect(capturedAssetBundles.length).toBeGreaterThan(0);
      });
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(
        (capturedAssetBundles.at(-1) as { glb?: { src?: string } }).glb?.src,
      ).toBe("blob:face-a");

      rerender(<ReferenceFaceRuntime file={fileA} active visible={false} />);
      expect(createObjectURL).toHaveBeenCalledTimes(1);

      rerender(<ReferenceFaceRuntime file={fileB} active />);
      await waitFor(() => {
        expect(
          (capturedAssetBundles.at(-1) as { glb?: { src?: string } }).glb?.src,
        ).toBe("blob:face-b");
      });
      expect(createObjectURL).toHaveBeenCalledTimes(2);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:face-a");

      unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:face-b");
      expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        value: originalCreateObjectURL,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        value: originalRevokeObjectURL,
        configurable: true,
        writable: true,
      });
    }
  });

  it("resets reference inputs by id and reports reset values through onStandardInputChange", async () => {
    const setInput = vi.fn();
    const onStandardInputChange = vi.fn();
    const onStandardInputsReady = vi.fn();
    const defaultMockRuntime = mockUseVizijRuntime();
    mockUseVizijRuntime.mockReturnValue({
      ...defaultMockRuntime,
      ready: true,
      loading: false,
      setInput,
      faceId: "face",
      namespace: "refface",
      inputConstraints: {
        "refface/standard/eyes/blink": {
          min: 0,
          max: 1,
          defaultValue: 0,
        },
        "refface/standard/eyes/squint": {
          min: 0,
          max: 1,
          defaultValue: 0.25,
        },
      },
    } as any);

    const file = new File(["ref"], "ref.glb", { type: "model/gltf-binary" });
    render(
      <ReferenceFaceRuntime
        file={file}
        active
        onStandardInputsReady={onStandardInputsReady}
        onStandardInputChange={onStandardInputChange}
      />,
    );

    let inputs: Array<{
      id: string;
      path: string;
      defaultValue: number;
    }> = [];
    await waitFor(() => {
      expect(onStandardInputsReady).toHaveBeenCalled();
      const lastCall = onStandardInputsReady.mock.calls.at(-1);
      inputs = (lastCall?.[0] as typeof inputs | undefined) ?? [];
      expect(inputs.length).toBe(2);
    });

    fireEvent.click(screen.getAllByTestId("runtime-overlay-reset").at(-1)!);

    await waitFor(() => {
      expect(onStandardInputChange).toHaveBeenCalledTimes(2);
    });
    inputs.forEach((input) => {
      expect(onStandardInputChange).toHaveBeenCalledWith(
        input.id,
        input.defaultValue,
      );
      expect(setInput).toHaveBeenCalledWith(input.path.replace(/^\/+/, ""), {
        float: input.defaultValue,
      });
    });
  });

  it("clears override enabled paths when resetting reference inputs", async () => {
    const setInput = vi.fn();
    const onStandardInputsReady = vi.fn();
    const defaultMockRuntime = mockUseVizijRuntime();
    mockUseVizijRuntime.mockReturnValue({
      ...defaultMockRuntime,
      ready: true,
      loading: false,
      setInput,
      faceId: "face",
      namespace: "refface",
      assetBundle: {
        rig: {
          spec: {
            nodes: [
              {
                type: "input",
                params: { path: "rig/face/override/blink/enabled" },
              },
              {
                type: "input",
                params: { path: "rig/face/override/blink/value" },
              },
            ],
          },
        },
        bundle: null,
      },
      inputConstraints: {
        "refface/blink": {
          min: 0,
          max: 1,
          defaultValue: 0,
        },
      },
    } as any);

    const file = new File(["ref"], "ref.glb", { type: "model/gltf-binary" });
    render(
      <ReferenceFaceRuntime
        file={file}
        active
        onStandardInputsReady={onStandardInputsReady}
      />,
    );

    await waitFor(() => {
      const lastCall = onStandardInputsReady.mock.calls.at(-1);
      const inputs = (lastCall?.[0] as Array<{ id: string }> | undefined) ?? [];
      expect(inputs.some((input) => input.id === "blink")).toBe(true);
    });

    fireEvent.click(screen.getAllByTestId("runtime-overlay-reset").at(-1)!);

    await waitFor(() => {
      expect(setInput).toHaveBeenCalledWith("rig/face/override/blink/value", {
        float: 0,
      });
      expect(setInput).toHaveBeenCalledWith("rig/face/override/blink/enabled", {
        float: 0,
      });
    });
  });

  it("stages pose-weight inputs directly and bypasses override routes", async () => {
    const setInput = vi.fn();
    const onAnimateValueReady = vi.fn();
    const defaultMockRuntime = mockUseVizijRuntime();
    mockUseVizijRuntime.mockReturnValue({
      ...defaultMockRuntime,
      ready: true,
      loading: false,
      setInput,
      faceId: "face",
      namespace: "refface",
      assetBundle: {
        rig: {
          spec: {
            nodes: [
              {
                type: "input",
                params: {
                  path: "rig/face/override/poses_pose_angry.weight/enabled",
                },
              },
              {
                type: "input",
                params: {
                  path: "rig/face/override/poses_pose_angry.weight/value",
                },
              },
            ],
          },
        },
        bundle: null,
      },
      inputConstraints: {
        "refface/poses/pose_angry.weight": {
          min: 0,
          max: 1,
          defaultValue: 0,
        },
      },
    } as any);

    const file = new File(["ref"], "ref.glb", { type: "model/gltf-binary" });
    render(
      <ReferenceFaceRuntime
        file={file}
        active
        onAnimateValueReady={onAnimateValueReady}
      />,
    );

    let animateValue: ((path: string, value: number) => void) | undefined;
    await waitFor(() => {
      const lastCall = onAnimateValueReady.mock.calls.at(-1);
      animateValue = lastCall?.[0] as typeof animateValue;
      expect(typeof animateValue).toBe("function");
    });

    animateValue?.("/poses/pose_angry.weight", 0);
    animateValue?.("/poses/pose_angry.weight", 1);

    await waitFor(() => {
      expect(setInput).toHaveBeenCalledWith("poses/pose_angry.weight", {
        float: 0,
      });
      expect(setInput).toHaveBeenCalledWith("poses/pose_angry.weight", {
        float: 1,
      });
    });
    expect(setInput).not.toHaveBeenCalledWith(
      "rig/face/override/poses_pose_angry.weight/enabled",
      expect.anything(),
    );
    expect(setInput).not.toHaveBeenCalledWith(
      "rig/face/override/poses_pose_angry.weight/value",
      expect.anything(),
    );
  });

  it("uses rig paths from runtime constraints when canonical path staging is requested", async () => {
    const setInput = vi.fn();
    const onAnimateValueReady = vi.fn();
    const defaultMockRuntime = mockUseVizijRuntime();
    mockUseVizijRuntime.mockReturnValue({
      ...defaultMockRuntime,
      ready: true,
      loading: false,
      setInput,
      faceId: "face",
      namespace: "refface",
      assetBundle: {
        rig: {
          spec: {
            nodes: [],
          },
        },
        bundle: null,
      },
      inputConstraints: {
        "refface/rig/quori_latest/poses/pose_angry.weight": {
          min: 0,
          max: 1,
          defaultValue: 0,
        },
        "refface/poses/pose_angry.weight": {
          min: 0,
          max: 1,
          defaultValue: 0,
        },
      },
    } as any);

    const file = new File(["ref"], "ref.glb", { type: "model/gltf-binary" });
    render(
      <ReferenceFaceRuntime
        file={file}
        active
        onAnimateValueReady={onAnimateValueReady}
      />,
    );

    let animateValue: ((path: string, value: number) => void) | undefined;
    await waitFor(() => {
      const lastCall = onAnimateValueReady.mock.calls.at(-1);
      animateValue = lastCall?.[0] as typeof animateValue;
      expect(typeof animateValue).toBe("function");
    });

    animateValue?.("/poses/pose_angry.weight", 1);

    await waitFor(() => {
      expect(setInput).toHaveBeenCalledWith(
        "rig/quori_latest/poses/pose_angry.weight",
        {
          float: 1,
        },
      );
    });
    expect(setInput).not.toHaveBeenCalledWith(
      "rig/face/poses/pose_angry.weight",
      expect.anything(),
    );
  });
});
