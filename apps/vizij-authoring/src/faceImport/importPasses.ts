import type { MorphTrianglesReport } from "@vizij/import";

export interface ImportPassOptions {
  /**
   * Re-triangulate each part modelled as one large polygon so its triangles
   * stay unfolded across its morph targets.
   */
  optimizeMorphTriangles: boolean;
}

/** What the import passes did to a file, for the import notice. */
export type MorphTrianglesOutcome =
  | { status: "applied"; report: MorphTrianglesReport }
  | { status: "failed"; message: string };

export interface PreparedImport {
  /** The file to load: the input, or a rewritten copy when a pass changed it. */
  file: File;
  /** `null` when the pass was not requested. */
  morphTriangles: MorphTrianglesOutcome | null;
}

/**
 * Runs the import passes the options ask for over a face file before it is
 * parsed. A pass that fails leaves the file as it was and reports why: the
 * face still loads, as it would have with the pass off.
 */
export async function prepareImport(
  file: File,
  options: ImportPassOptions,
): Promise<PreparedImport> {
  if (!options.optimizeMorphTriangles) {
    return { file, morphTriangles: null };
  }
  try {
    // Loaded on first use, so an import that never asks for the pass never
    // fetches its wasm module.
    const { init, optimizeMorphTriangles } = await import("@vizij/import");
    await init();
    const result = optimizeMorphTriangles(
      new Uint8Array(await file.arrayBuffer()),
    );
    const prepared = result.bytes
      ? new File([result.bytes], file.name, {
          type: file.type || "model/gltf-binary",
          lastModified: file.lastModified,
        })
      : file;
    return {
      file: prepared,
      morphTriangles: { status: "applied", report: result.report },
    };
  } catch (err) {
    return {
      file,
      morphTriangles: {
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
