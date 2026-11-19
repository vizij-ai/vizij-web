import { useState } from "react";
import { Button } from "../components/ui/Button";
import type { MorphTriangleCleanup } from "../state/AuthoringUiProvider";
import type { MorphTrianglesSummary } from "./importPasses";
import type { ImportNotice } from "./useImportPasses";

interface MorphTrianglesNoticeProps {
  notice: ImportNotice;
  /** Imports the same picked file again with `cleanup`. */
  onReimport: (cleanup: MorphTriangleCleanup) => void;
  onDismiss: () => void;
}

/** What each re-import choice does, as its button says it. */
const REIMPORT_LABELS: Record<MorphTriangleCleanup, string> = {
  off: "Re-import as picked",
  safe: "Re-import with safe cleanup",
  overall: "Re-import with best-overall cleanup",
};

function PartList({
  testId,
  entries,
}: {
  testId: string;
  entries: Array<{ part: string; shapes: string[] }>;
}) {
  return (
    <ul data-testid={testId}>
      {entries.map(({ part, shapes }) => (
        <li key={part}>
          <span className="font-medium">{part}</span>: {shapes.join(", ")}
        </li>
      ))}
    </ul>
  );
}

function SummaryBody({ summary }: { summary: MorphTrianglesSummary }) {
  const { changed, improved, remaining, worsened, unchecked } = summary;
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
  return (
    <>
      {headline && <p data-testid="morph-triangles-headline">{headline}</p>}
      {worsened.length > 0 && (
        <>
          <p className="text-text-secondary">
            Some blends of two poses now look more filled in than before:
          </p>
          <PartList testId="morph-triangles-worsened" entries={worsened} />
        </>
      )}
      {remaining.length > 0 && (
        <>
          <p className="text-text-secondary">
            Some poses still look partly filled in, because no arrangement of
            their triangles follows the outline. Reshaping them in the source
            model, usually with more vertices along the curves, then importing
            again, fixes them:
          </p>
          <PartList testId="morph-triangles-remaining" entries={remaining} />
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

/**
 * What the morph target cleanup did to the file being imported, in an
 * author's terms, and a way to import the same file again with another
 * cleanup. It speaks only of the cleanup, which runs before the face loads,
 * never of whether the load itself succeeds.
 */
export function MorphTrianglesNotice({
  notice,
  onReimport,
  onDismiss,
}: MorphTrianglesNoticeProps) {
  const [confirming, setConfirming] = useState<MorphTriangleCleanup | null>(
    null,
  );
  const { cleanup, outcome } = notice;
  let body: React.ReactNode;
  if (outcome === null) {
    body = <p>Imported as picked, without the morph target cleanup.</p>;
  } else if (outcome.status === "failed") {
    body = (
      <p>
        The cleanup could not run on this file, so its triangles are as they
        were exported: {outcome.message}
      </p>
    );
  } else {
    body = <SummaryBody summary={outcome.summary} />;
  }
  const others = (["off", "safe", "overall"] as const).filter(
    (choice) => choice !== cleanup,
  );
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
      {confirming === null ? (
        <div className="flex flex-wrap gap-1 pt-1">
          {others.map((choice) => (
            <Button
              key={choice}
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              data-testid={`morph-triangles-reimport-${choice}`}
              onClick={() => setConfirming(choice)}
            >
              {REIMPORT_LABELS[choice]}
            </Button>
          ))}
        </div>
      ) : (
        <div
          className="flex flex-col gap-1 pt-1"
          data-testid="morph-triangles-reimport-confirm"
        >
          <p className="text-text-secondary">
            Re-importing starts a new session from the file you picked; changes
            made since this import are lost.
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              className="h-6 px-2 text-[10px]"
              data-testid="morph-triangles-reimport-go"
              onClick={() => {
                setConfirming(null);
                onReimport(confirming);
              }}
            >
              {REIMPORT_LABELS[confirming]}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
