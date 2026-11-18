import { stillFolding } from "@vizij/import";
import { Button } from "../components/ui/Button";
import type { MorphTrianglesOutcome } from "./importPasses";

interface MorphTrianglesNoticeProps {
  outcome: MorphTrianglesOutcome;
  onDismiss: () => void;
}

function percent(share: number | null): string {
  return `${Math.round((share ?? 0) * 100)}%`;
}

/**
 * What the morph-triangle import pass did: how many parts it re-triangulated,
 * and the shapes that still fold, which need remodelling (more vertices along
 * the bend) because no triangulation of their vertices follows them.
 */
export function MorphTrianglesNotice({
  outcome,
  onDismiss,
}: MorphTrianglesNoticeProps) {
  let body: React.ReactNode;
  if (outcome.status === "failed") {
    body = (
      <p>
        The face loaded without optimizing its morph triangles:{" "}
        {outcome.message}
      </p>
    );
  } else {
    const changed = outcome.report.parts.filter(
      (part) => part.outcome === "retriangulated",
    ).length;
    const folding = stillFolding(outcome.report);
    body = (
      <>
        <p>
          {changed === 0
            ? "No morph-target triangles needed changing."
            : `Re-triangulated ${changed} part${changed === 1 ? "" : "s"} so morph targets stay unfolded.`}
        </p>
        {folding.length > 0 && (
          <>
            <p className="text-text-secondary">
              Still folding — these need more vertices along the bend:
            </p>
            <ul data-testid="morph-triangles-still-folding">
              {folding.map(({ part, folds }) => (
                <li key={`${part.mesh}/${part.primitive}/${part.vertices}`}>
                  <span className="font-medium">
                    {part.meshName ?? `mesh ${part.mesh}`}
                  </span>
                  :{" "}
                  {folds
                    .map((fold) => `${fold.shape} ${percent(fold.after)}`)
                    .join(", ")}
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
        <span className="font-semibold">Morph triangles</span>
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
