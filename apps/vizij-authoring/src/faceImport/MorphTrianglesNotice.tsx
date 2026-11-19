import { Button } from "../components/ui/Button";
import type { MorphTrianglesOutcome } from "./importPasses";

interface MorphTrianglesNoticeProps {
  outcome: MorphTrianglesOutcome;
  onDismiss: () => void;
}

/**
 * What the morph target cleanup did to the file being imported, in an
 * author's terms: the parts it improved, the shapes that still look partly
 * filled in (which need a change in the source model), and the parts it
 * could not check. It speaks only of the cleanup, which runs before the
 * face loads, never of whether the load itself succeeds.
 */
export function MorphTrianglesNotice({
  outcome,
  onDismiss,
}: MorphTrianglesNoticeProps) {
  let body: React.ReactNode;
  if (outcome.status === "failed") {
    body = (
      <p>
        The cleanup could not run on this file, so its triangles are as they
        were exported: {outcome.message}
      </p>
    );
  } else {
    const { changed, improved, remaining, unchecked } = outcome.summary;
    let headline: string | null = null;
    if (improved.length > 0) {
      headline = `Improved how these keep their outline across their morph targets: ${improved.join(", ")}.`;
    } else if (changed) {
      headline =
        "Rearranged some triangles, with no difference large enough to notice.";
    } else if (remaining.length === 0) {
      headline =
        unchecked.length === 0
          ? "Nothing needed adjusting."
          : "Nothing that could be checked needed adjusting.";
    }
    body = (
      <>
        {headline && <p data-testid="morph-triangles-headline">{headline}</p>}
        {remaining.length > 0 && (
          <>
            <p className="text-text-secondary">
              Some shapes still look partly filled in, because no arrangement of
              their triangles follows the outline. Reshaping them in the source
              model, usually with more vertices along the curves, then importing
              again, fixes them:
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
