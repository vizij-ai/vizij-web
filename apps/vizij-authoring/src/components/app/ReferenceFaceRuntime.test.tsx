import React from "react";
import { render, waitFor } from "@testing-library/react";
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
  RuntimeFaceControlsOverlay: () => <div data-testid="runtime-overlay" />,
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
});
