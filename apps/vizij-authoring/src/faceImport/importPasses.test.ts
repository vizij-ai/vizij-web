import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareImport } from "./importPasses";

const pass = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  optimizeMorphTriangles: vi.fn(),
  stillFolding: vi.fn(() => []),
}));

vi.mock("@semio/import", () => pass);

const report = {
  parts: [
    {
      mesh: 0,
      meshName: "mouth",
      primitive: 0,
      vertices: 65,
      outcome: "retriangulated",
      skipReason: null,
      flat: true,
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
      cleanup: "off",
    });
    expect(prepared.file).toBe(file);
    expect(prepared.morphTriangles).toBeNull();
    expect(pass.optimizeMorphTriangles).not.toHaveBeenCalled();
  });

  it("loads the rewritten bytes under the same name", async () => {
    pass.optimizeMorphTriangles.mockReturnValue({
      bytes: new Uint8Array([9, 9]),
      report,
    });
    const prepared = await prepareImport(face(), {
      cleanup: "safe",
    });
    expect(pass.init).toHaveBeenCalled();
    expect(Array.from(pass.optimizeMorphTriangles.mock.calls[0][0])).toEqual([
      1, 2, 3,
    ]);
    expect(pass.optimizeMorphTriangles.mock.calls[0][1]).toBe("safe");
    expect(prepared.file.name).toBe("face.glb");
    expect(new Uint8Array(await prepared.file.arrayBuffer())).toEqual(
      new Uint8Array([9, 9]),
    );
    expect(prepared.morphTriangles).toEqual({
      status: "applied",
      summary: {
        changed: true,
        improved: [],
        remaining: [],
        worsened: [],
        declined: [],
        unchecked: [],
      },
    });
  });

  it("keeps the original file when the pass changed nothing", async () => {
    pass.optimizeMorphTriangles.mockReturnValue({
      bytes: null,
      report: { parts: [] },
    });
    const file = face();
    const prepared = await prepareImport(file, {
      cleanup: "safe",
    });
    expect(prepared.file).toBe(file);
  });

  it("loads the original file and reports why when the pass fails", async () => {
    pass.optimizeMorphTriangles.mockImplementation(() => {
      throw new Error("not a GLB file");
    });
    const file = face();
    const prepared = await prepareImport(file, {
      cleanup: "safe",
    });
    expect(prepared.file).toBe(file);
    expect(prepared.morphTriangles).toEqual({
      status: "failed",
      stage: "file",
      message: "not a GLB file",
    });
  });
});

describe("prepareImport failures", () => {
  it("reports a cleanup that could not start as a load failure", async () => {
    pass.init.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    const file = face();
    const prepared = await prepareImport(file, { cleanup: "safe" });
    expect(prepared.file).toBe(file);
    expect(prepared.morphTriangles).toEqual({
      status: "failed",
      stage: "load",
      message: "offline",
    });
  });
});

describe("prepareImport modes", () => {
  it("passes the overall mode through to the pass", async () => {
    pass.optimizeMorphTriangles.mockReset();
    pass.optimizeMorphTriangles.mockReturnValue({
      bytes: null,
      report: { parts: [] },
    });
    await prepareImport(face(), { cleanup: "overall" });
    expect(pass.optimizeMorphTriangles.mock.calls[0][1]).toBe("overall");
  });
});
