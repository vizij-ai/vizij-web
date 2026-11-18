import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareImport } from "./importPasses";

const pass = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  optimizeMorphTriangles: vi.fn(),
}));

vi.mock("@vizij/import", () => pass);

const report = {
  parts: [
    {
      mesh: 0,
      meshName: "mouth",
      primitive: 0,
      vertices: 65,
      outcome: "retriangulated",
      skipReason: null,
      folds: [],
    },
  ],
};

function face(): File {
  return new File([new Uint8Array([1, 2, 3])], "face.glb", {
    type: "model/gltf-binary",
  });
}

describe("prepareImport", () => {
  beforeEach(() => {
    pass.init.mockClear();
    pass.optimizeMorphTriangles.mockReset();
  });

  it("leaves the file alone when the pass is off", async () => {
    const file = face();
    const prepared = await prepareImport(file, {
      optimizeMorphTriangles: false,
    });
    expect(prepared).toEqual({ file, morphTriangles: null });
    expect(pass.optimizeMorphTriangles).not.toHaveBeenCalled();
  });

  it("loads the rewritten bytes under the same name", async () => {
    pass.optimizeMorphTriangles.mockReturnValue({
      bytes: new Uint8Array([9, 9]),
      report,
    });
    const prepared = await prepareImport(face(), {
      optimizeMorphTriangles: true,
    });
    expect(pass.init).toHaveBeenCalled();
    expect(Array.from(pass.optimizeMorphTriangles.mock.calls[0][0])).toEqual([
      1, 2, 3,
    ]);
    expect(prepared.file.name).toBe("face.glb");
    expect(new Uint8Array(await prepared.file.arrayBuffer())).toEqual(
      new Uint8Array([9, 9]),
    );
    expect(prepared.morphTriangles).toEqual({ status: "applied", report });
  });

  it("keeps the original file when the pass changed nothing", async () => {
    pass.optimizeMorphTriangles.mockReturnValue({
      bytes: null,
      report: { parts: [] },
    });
    const file = face();
    const prepared = await prepareImport(file, {
      optimizeMorphTriangles: true,
    });
    expect(prepared.file).toBe(file);
  });

  it("loads the original file and reports why when the pass fails", async () => {
    pass.optimizeMorphTriangles.mockImplementation(() => {
      throw new Error("not a GLB file");
    });
    const file = face();
    const prepared = await prepareImport(file, {
      optimizeMorphTriangles: true,
    });
    expect(prepared).toEqual({
      file,
      morphTriangles: { status: "failed", message: "not a GLB file" },
    });
  });
});
