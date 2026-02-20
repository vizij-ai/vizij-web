import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useImportFileHandlers } from "../useImportFileHandlers";

function createChangeEvent(file: File | null) {
  return {
    target: {
      files: file ? [file] : [],
      value: "selected",
    },
  } as unknown as ChangeEvent<HTMLInputElement>;
}

describe("useImportFileHandlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads selected files and applies standard import discrepancy mode", async () => {
    const clearLoaderError = vi.fn();
    const clearSampleLoadFailure = vi.fn();
    const resetBundleSyncState = vi.fn();
    const loadFromFile = vi.fn(async () => undefined);
    const setSkipDiscrepancyCheck = vi.fn();
    const setReferenceFaceFile = vi.fn();
    const file = new File(["binary"], "robot.glb", {
      type: "model/gltf-binary",
    });

    const { result } = renderHook(() =>
      useImportFileHandlers({
        clearLoaderError,
        clearSampleLoadFailure,
        resetBundleSyncState,
        loadFromFile,
        setSkipDiscrepancyCheck,
        setReferenceFaceFile,
      }),
    );

    const event = createChangeEvent(file);
    await act(async () => {
      await result.current.handleFileChange(event);
    });

    expect(clearLoaderError).toHaveBeenCalledTimes(1);
    expect(clearSampleLoadFailure).toHaveBeenCalledTimes(1);
    expect(resetBundleSyncState).toHaveBeenCalledTimes(1);
    expect(setSkipDiscrepancyCheck).toHaveBeenCalledWith(false);
    expect(loadFromFile).toHaveBeenCalledTimes(1);
    expect(event.target.value).toBe("");
  });

  it("supports one-shot import skip-check flow and reference-face file import", async () => {
    const clearLoaderError = vi.fn();
    const clearSampleLoadFailure = vi.fn();
    const resetBundleSyncState = vi.fn();
    const loadFromFile = vi.fn(async () => undefined);
    const setSkipDiscrepancyCheck = vi.fn();
    const setReferenceFaceFile = vi.fn();
    const clickMain = vi.fn();
    const clickRef = vi.fn();
    const file = new File(["binary"], "robot.glb", {
      type: "model/gltf-binary",
    });
    const refFile = new File(["binary"], "reference.glb", {
      type: "model/gltf-binary",
    });

    const { result } = renderHook(() =>
      useImportFileHandlers({
        clearLoaderError,
        clearSampleLoadFailure,
        resetBundleSyncState,
        loadFromFile,
        setSkipDiscrepancyCheck,
        setReferenceFaceFile,
      }),
    );

    act(() => {
      result.current.fileInputRef.current = {
        click: clickMain,
      } as unknown as HTMLInputElement;
      result.current.referenceFaceFileInputRef.current = {
        click: clickRef,
      } as unknown as HTMLInputElement;
      result.current.handleImportSkipChecksClick();
    });

    expect(clickMain).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.handleFileChange(createChangeEvent(file));
    });
    expect(setSkipDiscrepancyCheck).toHaveBeenCalledWith(true);

    await act(async () => {
      await result.current.handleFileChange(createChangeEvent(file));
    });
    expect(setSkipDiscrepancyCheck).toHaveBeenLastCalledWith(false);

    act(() => {
      result.current.handleImportReferenceFaceClick();
    });
    expect(clickRef).toHaveBeenCalledTimes(1);

    const refEvent = createChangeEvent(refFile);
    act(() => {
      result.current.handleReferenceFaceFileChange(refEvent);
    });

    expect(setReferenceFaceFile).toHaveBeenCalledWith(refFile);
    expect(refEvent.target.value).toBe("");
  });
});
