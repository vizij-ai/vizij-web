import { Button } from "../components/ui/Button";
import type { MorphTrianglesOutcome } from "./importPasses";

interface MorphTrianglesNoticeProps {
  outcome: MorphTrianglesOutcome;
  onDismiss: () => void;
}

/**
 * What the morph target cleanup did on import, in an author's terms: the
 * parts it fixed so they keep their outline as they change shape, the
 * shapes that still look partly filled in (which need a change in the
 * source model), and the parts it could not check.
 */
export function MorphTrianglesNotice({
  outcome,
  onDismiss,
}: MorphTrianglesNoticeProps) {
  let body: React.ReactNode;
  if (outcome.status === "failed") {
    body = (
      <p>
        The morph target shapes could not be adjusted, so the file is imported
        as it was: {outcome.message}
      </p>
    );
  } else {
    const { improved, remaining, unchecked } = outcome.summary;
    body = (
      <>
        {improved.length > 0 && (
          <p data-testid="morph-triangles-improved">
            Adjusted so their morph targets keep their outline instead of
            filling in: {improved.join(", ")}.
          </p>
        )}
        {improved.length === 0 && remaining.length === 0 && (
          <p>
            {unchecked.length === 0
              ? "Nothing needed adjusting."
              : "Nothing that could be checked needed adjusting."}
          </p>
        )}
        {remaining.length > 0 && (
          <>
            <p className="text-text-secondary">
              These still look partly filled in, because their triangles cannot
              follow the outline. Reshaping them in the source model, usually
              with more vertices along the curves, then importing again, fixes
              them:
            </p>
            <ul data-testid="morph-triangles-remaining">
              {remaining.map(({ part, shapes }) => (
                <li key={part}>
                  <span className="font-medium">{part}</span>:{" "}
                  {shapes.join(", ")}
                </li>
              ))}
            </ul>
          </>
        )}
        {unchecked.length > 0 && (
          <>
            <p className="text-text-secondary">Not checked:</p>
            <ul data-testid="morph-triangles-unchecked">
              {unchecked.map(({ part, reason }) => (
                <li key={part}>
                  <span className="font-medium">{part}</span> {reason}
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
