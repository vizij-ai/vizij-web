import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AuthoringUiProvider } from "../state/AuthoringUiProvider";
import { useImportPasses } from "./useImportPasses";

const pass = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  optimizeMorphTriangles: vi.fn(() => ({ bytes: null, report: { parts: [] } })),
}));

vi.mock("@vizij/import", () => pass);

function wrapper({ children }: { children: ReactNode }) {
  return <AuthoringUiProvider>{children}</AuthoringUiProvider>;
}

describe("useImportPasses", () => {
  it("imports the file untouched unless the cleanup is turned on", async () => {
    const { result } = renderHook(() => useImportPasses(), { wrapper });
    const file = new File([new Uint8Array([1, 2, 3])], "face.glb");

    let prepared: File | undefined;
    await act(async () => {
      prepared = await result.current.prepare(file);
    });

    expect(prepared).toBe(file);
    expect(pass.init).not.toHaveBeenCalled();
    expect(pass.optimizeMorphTriangles).not.toHaveBeenCalled();
    expect(result.current.morphTriangles).toBeNull();
  });

  it("runs the cleanup once it is turned on", async () => {
    const { result } = renderHook(() => useImportPasses(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthoringUiProvider initialState={{ optimizeMorphTriangles: true }}>
          {children}
        </AuthoringUiProvider>
      ),
    });
    await act(async () => {
      await result.current.prepare(new File([new Uint8Array([1])], "f.glb"));
    });
    expect(pass.optimizeMorphTriangles).toHaveBeenCalledTimes(1);
    expect(result.current.morphTriangles).toEqual({
      status: "applied",
      report: { parts: [] },
    });
  });
});
