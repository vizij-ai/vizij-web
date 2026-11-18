import { stillFolding, type MorphTrianglesReport } from "@vizij/import";
import { Button } from "../components/ui/Button";
import type { MorphTrianglesOutcome } from "./importPasses";

interface MorphTrianglesNoticeProps {
  outcome: MorphTrianglesOutcome;
  onDismiss: () => void;
}

/**
 * Share of a shape's area that must still be drawn wrongly for the notice to
 * name it. Smaller remainders are a few pixels at a curve's tip and not worth
 * an author's attention.
 */
const NOTICEABLE = 0.05;

function partName(part: { meshName: string | null; mesh: number }): string {
  return part.meshName ?? `mesh ${part.mesh}`;
}

/** `rest` is the shape with no morph target applied. */
function shapeName(shape: string): string {
  return shape === "rest" ? "neutral" : shape;
}

type Part = MorphTrianglesReport["parts"][number];

/**
 * Whether the cleanup visibly changed a part: some shape lost at least a
 * noticeable share of wrongly drawn area. A part whose triangles changed
 * only marginally is not named, so the list points at what an author will
 * actually see differently.
 */
function visiblyImproved(part: Part): boolean {
  return (
    part.outcome === "retriangulated" &&
    part.folds.some(
      (fold) => (fold.before ?? 0) - (fold.after ?? 0) >= NOTICEABLE,
    )
  );
}

/** Each named part once, in report order. */
function uniqueNames(parts: Part[]): string[] {
  return [...new Set(parts.map(partName))];
}

/**
 * The shapes still drawn wrongly, grouped by part name: a part exported as
 * several pieces is listed once, with each shape once.
 */
function remainingByPart(
  report: MorphTrianglesReport,
): Array<{ name: string; shapes: string[] }> {
  const byName = new Map<string, Set<string>>();
  for (const { part, folds } of stillFolding(report, NOTICEABLE)) {
    const shapes = byName.get(partName(part)) ?? new Set<string>();
    folds.forEach((fold) => shapes.add(shapeName(fold.shape)));
    byName.set(partName(part), shapes);
  }
  return [...byName].map(([name, shapes]) => ({ name, shapes: [...shapes] }));
}

/**
 * What the morph-target cleanup did on import, in an author's terms: which
 * parts were adjusted so they keep their outline as they change shape, and
 * which shapes still look filled in where they should be open. Those need a
 * change in the source model, since no arrangement of their existing
 * vertices follows the outline.
 */
export function MorphTrianglesNotice({
  outcome,
  onDismiss,
}: MorphTrianglesNoticeProps) {
  let body: React.ReactNode;
  if (outcome.status === "failed") {
    body = (
      <p>
        The morph target shapes could not be adjusted, so the face loaded
        unchanged: {outcome.message}
      </p>
    );
  } else {
    const adjusted = uniqueNames(outcome.report.parts.filter(visiblyImproved));
    const remaining = remainingByPart(outcome.report);
    body = (
      <>
        <p>
          {adjusted.length === 0
            ? "Nothing needed a visible adjustment."
            : `Adjusted so their morph targets keep their outline instead of filling in: ${adjusted.join(", ")}.`}
        </p>
        {remaining.length > 0 && (
          <>
            <p className="text-text-secondary">
              These may still look partly filled in. Adding vertices along their
              curves in the source model, then importing again, fixes them:
            </p>
            <ul data-testid="morph-triangles-remaining">
              {remaining.map(({ name, shapes }) => (
                <li key={name}>
                  <span className="font-medium">{name}</span>:{" "}
                  {shapes.join(", ")}
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }
  return (
    <div
      data-testid="morph-triangles-notice"
      role="status"
      className="flex flex-col gap-1 max-w-sm p-3 rounded-lg border border-border bg-bg-panel text-xs text-text-primary shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold">Morph target cleanup</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
      {body}
    </div>
  );
}
