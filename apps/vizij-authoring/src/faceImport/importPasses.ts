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
  /** Parts, each once, with a pose or blend the cleanup visibly improved. */
  improved: string[];
  /**
   * Poses still visibly drawn wrong, grouped by part: in parts the cleanup
   * could do no better for, which need reshaping in the source model.
   */
  remaining: Array<{ part: string; shapes: string[] }>;
  /** Poses and blends the cleanup made visibly worse, grouped by part. */
  worsened: Array<{ part: string; shapes: string[] }>;
  /**
   * Parts safe mode left as exported because the rewrite that improves
   * them overall would make some shape visibly worse.
   */
  declined: string[];
  /** Parts the cleanup could not check, with the reason. */
  unchecked: Array<{ part: string; reason: string }>;
}

/**
 * What the import passes did to a file, for the import notice. A failure
 * is either the cleanup itself not starting (`load`: its module could not
 * be fetched or initialised) or the cleanup failing on this file (`file`).
 */
export type MorphTrianglesOutcome =
  | { status: "applied"; summary: MorphTrianglesSummary }
  | { status: "failed"; stage: "load" | "file"; message: string };

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

/** Blends of two poses number in the hundreds; they are never listed as still wrong. */
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
 * Condenses the pass's report for a face author. A part counts as improved
 * when any pose or blend lost a noticeable amount of wrongly drawn area, so
 * a part whose triangles changed only marginally is not named; `changed`
 * still records that they changed. Any shape that gained a noticeable amount
 * is listed as worsened. Poses still drawn wrong are listed for remodelling
 * only in parts the cleanup could do no better for: a part safe mode
 * declined is listed as such instead, since best overall improves it. A
 * mesh exported as several pieces appears once in each list.
 */
export function summarizeMorphTriangles(
  report: MorphTrianglesReport,
  stillFolding: StillFolding,
): MorphTrianglesSummary {
  const partName = partLabels(report);
  const improved = new Set<string>();
  const declined = new Set<string>();
  const worsened: Array<{ part: string; shape: string }> = [];
  const worsenedShapes = new Map<string, Set<string>>();
  const unchecked = new Map<string, Set<string>>();
  for (const part of report.parts) {
    const name = partName(part);
    for (const fold of part.folds) {
      const gain = (fold.before ?? 0) - (fold.after ?? 0);
      if (gain >= NOTICEABLE) {
        improved.add(name);
      } else if (-gain >= NOTICEABLE) {
        worsened.push({ part: name, shape: shapeName(fold.shape) });
        const shapes = worsenedShapes.get(name) ?? new Set<string>();
        shapes.add(fold.shape);
        worsenedShapes.set(name, shapes);
      }
    }
    if (part.outcome === "declined") {
      declined.add(name);
    }
    if (part.outcome === "skipped") {
      const reasons = unchecked.get(name) ?? new Set<string>();
      reasons.add(part.skipReason ?? "could not be read");
      unchecked.set(name, reasons);
    }
  }
  const remaining = stillFolding(report, NOTICEABLE).flatMap(
    ({ part, folds }) =>
      part.outcome === "declined"
        ? []
        : folds
            .filter(
              (fold) =>
                !isBlend(fold.kind) &&
                !worsenedShapes.get(partName(part))?.has(fold.shape),
            )
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
    declined: [...declined],
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
  const failed = (stage: "load" | "file", err: unknown): PreparedImport => ({
    file,
    morphTriangles: {
      status: "failed",
      stage,
      message: err instanceof Error ? err.message : String(err),
    },
  });
  let pass: typeof import("@vizij/import");
  try {
    // Loaded on first use, so a session that never turns the cleanup on
    // never fetches the package or its wasm module.
    pass = await import("@vizij/import");
    await pass.init();
  } catch (err) {
    return failed("load", err);
  }
  try {
    const result = pass.optimizeMorphTriangles(
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
        summary: summarizeMorphTriangles(result.report, pass.stillFolding),
      },
    };
  } catch (err) {
    return failed("file", err);
  }
}
