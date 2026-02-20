import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSampleAssetLoader } from "../useSampleAssetLoader";

describe("useSampleAssetLoader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads sample assets and clears prior loader errors", async () => {
    const clearLoaderError = vi.fn();
    const loadFromFile = vi.fn().mockResolvedValue(undefined);
    const blob = new Blob(["test"], { type: "model/gltf-binary" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => blob,
      }),
    );

    const { result } = renderHook(() =>
      useSampleAssetLoader({
        clearLoaderError,
        loadFromFile,
      }),
    );

    await act(async () => {
      await result.current.loadSampleAssetFromUrl(
        "/assets/test.glb",
        "test.glb",
      );
    });

    expect(clearLoaderError).toHaveBeenCalledTimes(1);
    expect(loadFromFile).toHaveBeenCalledTimes(1);
    const [fileArg] = loadFromFile.mock.calls[0] ?? [];
    expect(fileArg).toBeInstanceOf(File);
    expect(fileArg?.name).toBe("test.glb");
    expect(result.current.sampleLoadFailure).toBeNull();
  });

  it("stores a recoverable failure when sample fetch fails", async () => {
    const clearLoaderError = vi.fn();
    const loadFromFile = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    );

    const { result } = renderHook(() =>
      useSampleAssetLoader({
        clearLoaderError,
        loadFromFile,
      }),
    );

    await act(async () => {
      await result.current.loadSampleAssetFromUrl(
        "/assets/missing.glb",
        "missing.glb",
      );
    });

    expect(loadFromFile).not.toHaveBeenCalled();
    expect(result.current.sampleLoadFailure).toEqual(
      expect.objectContaining({
        url: "/assets/missing.glb",
        filename: "missing.glb",
      }),
    );
    expect(result.current.sampleLoadFailure?.message).toContain(
      "Failed to fetch sample",
    );
  });
});
