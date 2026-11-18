import type { MorphTrianglesReport, ShapeFold } from "@vizij/import";

export interface ImportPassOptions {
  /**
   * Re-triangulate each part modelled as one large polygon so its triangles
   * stay unfolded across its morph targets.
   */
  optimizeMorphTriangles: boolean;
}

/**
 * Reversed area, relative to a shape's own area, below which the notice
 * does not mention the shape or the change: a few pixels at a curve's tip
 * are not worth an author's attention.
 */
export const NOTICEABLE = 0.05;

/** What the morph target cleanup did, in the terms the import notice uses. */
export interface MorphTrianglesSummary {
  /** Parts, by name and each once, whose shapes the cleanup visibly fixed. */
  improved: string[];
  /** Shapes still visibly drawn wrong, grouped by part name. */
  remaining: Array<{ part: string; shapes: string[] }>;
  /** Parts the cleanup could not check, by name, with the reason. */
  unchecked: Array<{ part: string; reason: string }>;
}

/** What the import passes did to a file, for the import notice. */
export type MorphTrianglesOutcome =
  | { status: "applied"; summary: MorphTrianglesSummary }
  | { status: "failed"; message: string };

export interface PreparedImport {
  /** The file to load: the input, or a rewritten copy when a pass changed it. */
  file: File;
  /** `null` when the pass was not requested. */
  morphTriangles: MorphTrianglesOutcome | null;
}

type Part = MorphTrianglesReport["parts"][number];
type StillFolding = (
  report: MorphTrianglesReport,
  threshold: number,
) => Array<{ part: Part; folds: ShapeFold[] }>;

function partName(part: Part): string {
  return part.meshName ?? `mesh ${part.mesh}`;
}

/** `rest` is the shape with no morph target applied. */
function shapeName(shape: string): string {
  return shape === "rest" ? "neutral" : shape;
}

/**
 * Condenses the pass's report for a face author. A part counts as fixed
 * only when some shape lost a noticeable amount of wrongly drawn area, so a
 * part whose triangles changed only marginally is not named. A part
 * exported as several pieces appears once in each list.
 */
export function summarizeMorphTriangles(
  report: MorphTrianglesReport,
  stillFolding: StillFolding,
): MorphTrianglesSummary {
  const improved = new Set<string>();
  const unchecked = new Map<string, string>();
  for (const part of report.parts) {
    if (
      part.folds.some(
        (fold) => (fold.before ?? 0) - (fold.after ?? 0) >= NOTICEABLE,
      )
    ) {
      improved.add(partName(part));
    }
    if (part.outcome === "skipped") {
      unchecked.set(partName(part), part.skipReason ?? "could not be read");
    }
  }
  const remaining = new Map<string, Set<string>>();
  for (const { part, folds } of stillFolding(report, NOTICEABLE)) {
    const shapes = remaining.get(partName(part)) ?? new Set<string>();
    folds.forEach((fold) => shapes.add(shapeName(fold.shape)));
    remaining.set(partName(part), shapes);
  }
  return {
    improved: [...improved],
    remaining: [...remaining].map(([part, shapes]) => ({
      part,
      shapes: [...shapes],
    })),
    unchecked: [...unchecked].map(([part, reason]) => ({ part, reason })),
  };
}

/**
 * Runs the import passes the options ask for over a face file before it is
 * parsed. A pass that fails leaves the file as it was and reports why; the
 * import then goes ahead as it would have with the pass off.
 */
export async function prepareImport(
  file: File,
  options: ImportPassOptions,
): Promise<PreparedImport> {
  if (!options.optimizeMorphTriangles) {
    return { file, morphTriangles: null };
  }
  try {
    // Loaded on first use, so a session that never turns the pass on never
    // fetches the package or its wasm module.
    const { init, optimizeMorphTriangles, stillFolding } =
      await import("@vizij/import");
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
      morphTriangles: {
        status: "applied",
        summary: summarizeMorphTriangles(result.report, stillFolding),
      },
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
