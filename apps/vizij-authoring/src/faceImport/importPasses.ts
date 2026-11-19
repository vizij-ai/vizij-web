import type { MorphTrianglesReport, ShapeFold, ShapeKind } from "@vizij/import";
import type { MorphTriangleCleanup } from "../state/AuthoringUiProvider";

export interface ImportPassOptions {
  /** The morph target cleanup to apply; `off` leaves the file as picked. */
  cleanup: MorphTriangleCleanup;
}

/**
 * Reversed area, relative to a shape's own area, below which the notice
 * does not mention the shape or the change: a few pixels at a curve's tip
 * are not worth an author's attention.
 */
export const NOTICEABLE = 0.05;

/** What the morph target cleanup did, in the terms the import notice uses. */
export interface MorphTrianglesSummary {
  /** Whether the cleanup rewrote any triangles at all. */
  changed: boolean;
  /** Parts, each once, whose poses the cleanup visibly improved. */
  improved: string[];
  /** Poses still visibly drawn wrong, grouped by part. */
  remaining: Array<{ part: string; shapes: string[] }>;
  /** Blends of two poses the cleanup made visibly worse, grouped by part. */
  worsened: Array<{ part: string; shapes: string[] }>;
  /** Parts the cleanup could not check, with the reason. */
  unchecked: Array<{ part: string; reason: string }>;
}

/** What the import passes did to a file, for the import notice. */
export type MorphTrianglesOutcome =
  | { status: "applied"; summary: MorphTrianglesSummary }
  | { status: "failed"; message: string };

export interface PreparedImport {
  /** The file to load: the input, or a rewritten copy when a pass changed it. */
  file: File;
  /** `null` when the cleanup was off. */
  morphTriangles: MorphTrianglesOutcome | null;
}

type Part = MorphTrianglesReport["parts"][number];
type StillFolding = (
  report: MorphTrianglesReport,
  threshold: number,
) => Array<{ part: Part; folds: ShapeFold[] }>;

/** Blends of two poses number in the hundreds; they are reported only when made worse. */
function isBlend(kind: ShapeKind): boolean {
  return kind === "blend" || kind === "blendHalfway";
}

/**
 * A label per mesh: its name, or its index when it has none. glTF does not
 * require mesh names to be unique, so a name two meshes share also carries
 * the index; the pieces of one mesh share its label.
 */
function partLabels(report: MorphTrianglesReport): (part: Part) => string {
  const meshesByName = new Map<string, Set<number>>();
  for (const part of report.parts) {
    if (part.meshName !== null) {
      const meshes = meshesByName.get(part.meshName) ?? new Set<number>();
      meshes.add(part.mesh);
      meshesByName.set(part.meshName, meshes);
    }
  }
  return (part) => {
    if (part.meshName === null) {
      return `mesh ${part.mesh}`;
    }
    return (meshesByName.get(part.meshName)?.size ?? 0) > 1
      ? `${part.meshName} (mesh ${part.mesh})`
      : part.meshName;
  };
}

/** `rest` is the shape with no morph target applied. */
function shapeName(shape: string): string {
  return shape === "rest" ? "neutral" : shape;
}

/** Shape names grouped by part label, each once, in report order. */
function grouped(
  entries: Array<{ part: string; shape: string }>,
): Array<{ part: string; shapes: string[] }> {
  const byPart = new Map<string, Set<string>>();
  for (const { part, shape } of entries) {
    const shapes = byPart.get(part) ?? new Set<string>();
    shapes.add(shape);
    byPart.set(part, shapes);
  }
  return [...byPart].map(([part, shapes]) => ({ part, shapes: [...shapes] }));
}

/**
 * Condenses the pass's report for a face author. Poses (the rest shape,
 * each target, each target halfway, the default pose) decide what counts as
 * improved and what still looks wrong; blends of two poses are reported
 * only when the cleanup made them noticeably worse. A part counts as
 * improved only when some pose lost a noticeable amount of wrongly drawn
 * area, so a part whose triangles changed only marginally is not named;
 * `changed` still records that they changed. A mesh exported as several
 * pieces appears once in each list.
 */
export function summarizeMorphTriangles(
  report: MorphTrianglesReport,
  stillFolding: StillFolding,
): MorphTrianglesSummary {
  const partName = partLabels(report);
  const improved = new Set<string>();
  const worsened: Array<{ part: string; shape: string }> = [];
  const unchecked = new Map<string, Set<string>>();
  for (const part of report.parts) {
    for (const fold of part.folds) {
      const gain = (fold.before ?? 0) - (fold.after ?? 0);
      if (isBlend(fold.kind)) {
        if (-gain >= NOTICEABLE) {
          worsened.push({ part: partName(part), shape: fold.shape });
        }
      } else if (gain >= NOTICEABLE) {
        improved.add(partName(part));
      }
    }
    if (part.outcome === "skipped") {
      const reasons = unchecked.get(partName(part)) ?? new Set<string>();
      reasons.add(part.skipReason ?? "could not be read");
      unchecked.set(partName(part), reasons);
    }
  }
  const remaining = stillFolding(report, NOTICEABLE).flatMap(
    ({ part, folds }) =>
      folds
        .filter((fold) => !isBlend(fold.kind))
        .map((fold) => ({
          part: partName(part),
          shape: shapeName(fold.shape),
        })),
  );
  return {
    changed: report.parts.some((part) => part.outcome === "retriangulated"),
    improved: [...improved],
    remaining: grouped(remaining),
    worsened: grouped(worsened),
    unchecked: [...unchecked].map(([part, reasons]) => ({
      part,
      reason: [...reasons].join("; "),
    })),
  };
}

/**
 * Runs the import passes the options ask for over a face file before it is
 * parsed. A pass that fails leaves the file as it was and reports why; the
 * import then goes ahead as it would have with the cleanup off.
 */
export async function prepareImport(
  file: File,
  options: ImportPassOptions,
): Promise<PreparedImport> {
  if (options.cleanup === "off") {
    return { file, morphTriangles: null };
  }
  try {
    // Loaded on first use, so a session that never turns the cleanup on
    // never fetches the package or its wasm module.
    const { init, optimizeMorphTriangles, stillFolding } =
      await import("@vizij/import");
    await init();
    const result = optimizeMorphTriangles(
      new Uint8Array(await file.arrayBuffer()),
      options.cleanup,
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
