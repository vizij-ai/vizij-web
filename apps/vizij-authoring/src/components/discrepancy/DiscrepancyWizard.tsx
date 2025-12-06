import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DiffResolutionChoice,
  DiscrepancyResolutionResult,
  DiscrepancyReviewState,
  GraphDiffCategory,
  MissingInputResolution,
} from "../../types/discrepancy";

const isDev = process.env.NODE_ENV !== "production";
const logDebug = (...args: unknown[]) => {
  if (!isDev) return;
  // eslint-disable-next-line no-console
  console.debug("[discrepancy]", ...args);
};

interface DiscrepancyWizardProps {
  state: DiscrepancyReviewState;
  onResolve: (result: DiscrepancyResolutionResult) => void;
}

type WizardStep = "overview" | "differences" | "missing";

const STEP_LABELS: Record<WizardStep, string> = {
  overview: "Summary",
  differences: "Graph Differences",
  missing: "Missing Inputs",
};

const CATEGORY_LABELS: Record<GraphDiffCategory, string> = {
  identifiers: "Identifiers",
  inputs: "Inputs",
  bindings: "Bindings",
  expressions: "Expressions",
  values: "Values & Ranges",
  metadata: "Metadata",
  structure: "Structure",
  other: "Other",
};

function formatDiffValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 77)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 120
      ? `${serialized.slice(0, 117)}…`
      : serialized;
  } catch {
    return String(value);
  }
}

function normalizeDiffResolutions(
  entries: DiscrepancyReviewState["diff"]["entries"],
): Record<string, DiffResolutionChoice | null> {
  return entries.reduce<Record<string, DiffResolutionChoice | null>>(
    (acc, entry) => {
      acc[entry.id] = null;
      return acc;
    },
    {},
  );
}

function normalizeMissingResolutions(
  paths: readonly string[],
): Record<string, MissingInputResolution | null> {
  return paths.reduce<Record<string, MissingInputResolution | null>>(
    (acc, path) => {
      acc[path] = null;
      return acc;
    },
    {},
  );
}

export function DiscrepancyWizard({
  state,
  onResolve,
}: DiscrepancyWizardProps) {
  const [step, setStep] = useState<WizardStep>("overview");
  const [diffResolutions, setDiffResolutions] = useState<
    Record<string, DiffResolutionChoice | null>
  >(() => normalizeDiffResolutions(state.diff.entries));
  const [missingResolutions, setMissingResolutions] = useState<
    Record<string, MissingInputResolution | null>
  >(() => normalizeMissingResolutions(state.missingAutoInputs));
  const [notes, setNotes] = useState("");
  const [activeCategory, setActiveCategory] = useState<
    GraphDiffCategory | "all"
  >("all");
  const [faceRename, setFaceRename] = useState(
    state.importedFaceId ?? state.faceId ?? "",
  );

  useEffect(() => {
    logDebug("mount wizard", {
      id: state.id,
      faceId: state.faceId,
      importedFaceId: state.importedFaceId,
      diffEntries: state.diff.entries.length,
      missingInputs: state.missingAutoInputs.length,
    });
    return () => {
      logDebug("unmount wizard", { id: state.id });
    };
  }, [
    state.id,
    state.faceId,
    state.importedFaceId,
    state.diff.entries.length,
    state.missingAutoInputs.length,
  ]);

  const handleKeydown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        logDebug("escape pressed – cancel import");
        onResolve({ accepted: false });
      }
    },
    [onResolve],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [handleKeydown]);

  const diffCounts = useMemo(() => {
    return state.diff.entries.reduce<Record<GraphDiffCategory, number>>(
      (acc, entry) => {
        acc[entry.category] = (acc[entry.category] ?? 0) + 1;
        return acc;
      },
      {
        identifiers: 0,
        inputs: 0,
        bindings: 0,
        expressions: 0,
        values: 0,
        metadata: 0,
        structure: 0,
        other: 0,
      },
    );
  }, [state.diff.entries]);

  const filteredDiffs = useMemo(() => {
    if (activeCategory === "all") {
      return state.diff.entries;
    }
    return state.diff.entries.filter(
      (entry) => entry.category === activeCategory,
    );
  }, [activeCategory, state.diff.entries]);

  const allDiffsResolved =
    state.diff.entries.length === 0 ||
    state.diff.entries.every((entry) => diffResolutions[entry.id]);

  const allMissingResolved =
    state.missingAutoInputs.length === 0 ||
    state.missingAutoInputs.every((path) => missingResolutions[path]);

  const canApply = allDiffsResolved && allMissingResolved;

  const submitResult = useCallback(
    (
      accepted: boolean,
      overrides?: { acceptAll?: boolean; renameFaceId?: string },
    ) => {
      if (!accepted) {
        logDebug("submit", { accepted: false });
        onResolve({ accepted: false });
        return;
      }
      const resolvedDiffs = Object.fromEntries(
        Object.entries(diffResolutions).filter(([, value]) => value),
      ) as Record<string, DiffResolutionChoice>;
      const resolvedMissing = Object.fromEntries(
        Object.entries(missingResolutions).filter(([, value]) => value),
      ) as Record<string, MissingInputResolution>;
      onResolve({
        accepted: true,
        diffResolutions: resolvedDiffs,
        missingInputChoices: resolvedMissing,
        notes: notes.trim().length > 0 ? notes.trim() : undefined,
        renameFaceId: overrides?.renameFaceId,
      });
      logDebug("submit", {
        accepted: true,
        resolvedDiffs: Object.keys(resolvedDiffs).length,
        resolvedMissing: Object.keys(resolvedMissing).length,
        renameFaceId: overrides?.renameFaceId,
      });
    },
    [diffResolutions, missingResolutions, notes, onResolve],
  );

  const handleDiffResolutionChange = useCallback(
    (id: string, value: DiffResolutionChoice) => {
      setDiffResolutions((current) => ({ ...current, [id]: value }));
    },
    [],
  );

  const handleMissingResolutionChange = useCallback(
    (path: string, value: MissingInputResolution) => {
      setMissingResolutions((current) => ({ ...current, [path]: value }));
    },
    [],
  );

  const applyRecommended = useCallback(() => {
    logDebug("applyRecommended");
    setDiffResolutions((current) => {
      const nextEntries: Record<string, DiffResolutionChoice> = {};
      Object.keys(current).forEach((id) => {
        nextEntries[id] = "use-rebuilt";
      });
      return nextEntries;
    });
    setMissingResolutions((current) => {
      const next: Record<string, MissingInputResolution> = {};
      Object.keys(current).forEach((path) => {
        next[path] = "create-placeholder";
      });
      return next;
    });
  }, []);

  useEffect(() => {
    logDebug("step change", { step });
  }, [step]);

  useEffect(() => {
    logDebug("faceRename change", { faceRename });
  }, [faceRename]);

  return (
    <div className="discrepancy-overlay" role="presentation">
      <div
        className="discrepancy-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discrepancy-wizard-title"
      >
        <header className="discrepancy-wizard__header">
          <div>
            <p className="discrepancy-wizard__eyebrow">Import Review</p>
            <h1 id="discrepancy-wizard-title">Resolve Graph Discrepancies</h1>
            <p className="discrepancy-wizard__meta">
              Loaded face: {state.faceId ?? "—"} · Imported face:{" "}
              {state.importedFaceId ?? "unknown"} · Captured at{" "}
              {new Date(state.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            className="button subtle"
            onClick={() => onResolve({ accepted: false })}
          >
            Cancel import
          </button>
        </header>

        <nav className="discrepancy-wizard__steps" aria-label="Wizard steps">
          {(Object.keys(STEP_LABELS) as WizardStep[]).map((stepId) => (
            <button
              key={stepId}
              type="button"
              className={`discrepancy-wizard__step-button${
                step === stepId ? " is-active" : ""
              }`}
              onClick={() => setStep(stepId)}
            >
              {STEP_LABELS[stepId]}
            </button>
          ))}
        </nav>

        <section className="discrepancy-wizard__content">
          {step === "overview" && (
            <div className="discrepancy-wizard__panel">
              <h2>What changed?</h2>
              <p>
                Importing the rig graph produced a normalized IR that does not
                perfectly match the source graph. Review the detected
                differences, note any follow-ups, and choose how to handle
                missing inputs.
              </p>
              {state.importedFaceId &&
                state.faceId &&
                state.importedFaceId !== state.faceId && (
                  <div className="discrepancy-wizard__alert">
                    <strong>Face mismatch:</strong> Imported graph face is "
                    {state.importedFaceId}", loaded asset face is "
                    {state.faceId}".
                    <div className="discrepancy-wizard__rename">
                      <input
                        type="text"
                        value={faceRename}
                        onChange={(event) => setFaceRename(event.target.value)}
                        aria-label="Rename face ID"
                      />
                      <button
                        type="button"
                        className="button"
                        onClick={() =>
                          submitResult(true, {
                            renameFaceId: faceRename.trim(),
                          })
                        }
                        disabled={faceRename.trim().length === 0}
                      >
                        Rename project face to imported
                      </button>
                    </div>
                  </div>
                )}
              <ul className="discrepancy-wizard__summary-list">
                <li>
                  <strong>{state.diff.entries.length}</strong> structural
                  differences detected
                </li>
                <li>
                  {state.diff.limitReached
                    ? "Diff limit reached (showing first entries)"
                    : "Full diff captured"}
                </li>
                <li>
                  {state.missingAutoInputs.length} auto-generated inputs missing
                  from metadata
                </li>
              </ul>

              {state.mismatchReasons.length > 0 && (
                <div className="discrepancy-wizard__reasons">
                  <h3>Likely causes</h3>
                  <ul>
                    {state.mismatchReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              <label className="discrepancy-wizard__notes">
                <span>Reviewer notes (optional)</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Capture context or follow-up owners"
                />
              </label>
              <div className="discrepancy-wizard__actions-row">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    applyRecommended();
                    submitResult(true);
                  }}
                >
                  Accept all (use rebuilt)
                </button>
              </div>
            </div>
          )}

          {step === "differences" && (
            <div className="discrepancy-wizard__panel">
              <div className="discrepancy-wizard__panel-header">
                <h2>Graph differences</h2>
                <button
                  type="button"
                  className="button subtle"
                  onClick={applyRecommended}
                >
                  Accept recommended fixes
                </button>
              </div>
              <div className="discrepancy-wizard__filters">
                <button
                  type="button"
                  className={`discrepancy-wizard__filter${
                    activeCategory === "all" ? " is-active" : ""
                  }`}
                  onClick={() => setActiveCategory("all")}
                >
                  All ({state.diff.entries.length})
                </button>
                {(Object.keys(CATEGORY_LABELS) as GraphDiffCategory[]).map(
                  (category) => (
                    <button
                      key={category}
                      type="button"
                      className={`discrepancy-wizard__filter${
                        activeCategory === category ? " is-active" : ""
                      }`}
                      onClick={() => setActiveCategory(category)}
                    >
                      {CATEGORY_LABELS[category]} ({diffCounts[category] ?? 0})
                    </button>
                  ),
                )}
              </div>
              {filteredDiffs.length === 0 ? (
                <p className="discrepancy-wizard__empty">
                  No differences for this category.
                </p>
              ) : (
                <div className="discrepancy-wizard__diff-list">
                  {filteredDiffs.map((entry) => (
                    <article
                      key={entry.id}
                      className="discrepancy-wizard__diff"
                    >
                      <header className="discrepancy-wizard__diff-header">
                        <span className={`diff-chip diff-chip--${entry.kind}`}>
                          {entry.kind}
                        </span>
                        <div>
                          <p className="discrepancy-wizard__diff-path">
                            {entry.path}
                          </p>
                          <p className="discrepancy-wizard__diff-category">
                            {CATEGORY_LABELS[entry.category]}
                          </p>
                        </div>
                      </header>
                      <div className="discrepancy-wizard__diff-values">
                        <div>
                          <span>Imported</span>
                          <code>{formatDiffValue(entry.importedValue)}</code>
                        </div>
                        <div>
                          <span>Rebuilt</span>
                          <code>{formatDiffValue(entry.rebuiltValue)}</code>
                        </div>
                      </div>
                      <div className="discrepancy-wizard__diff-actions">
                        <label>
                          <input
                            type="radio"
                            name={`diff-${entry.id}`}
                            value="use-rebuilt"
                            checked={
                              diffResolutions[entry.id] === "use-rebuilt"
                            }
                            onChange={() =>
                              handleDiffResolutionChange(
                                entry.id,
                                "use-rebuilt",
                              )
                            }
                          />
                          Use rebuilt value
                        </label>
                        <label>
                          <input
                            type="radio"
                            name={`diff-${entry.id}`}
                            value="needs-follow-up"
                            checked={
                              diffResolutions[entry.id] === "needs-follow-up"
                            }
                            onChange={() =>
                              handleDiffResolutionChange(
                                entry.id,
                                "needs-follow-up",
                              )
                            }
                          />
                          Flag for follow-up
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "missing" && (
            <div className="discrepancy-wizard__panel">
              <h2>Missing auto-generated inputs</h2>
              {state.missingAutoInputs.length === 0 ? (
                <p className="discrepancy-wizard__empty">
                  No missing inputs detected.
                </p>
              ) : (
                <ul className="discrepancy-wizard__missing-list">
                  {state.missingAutoInputs.map((path) => (
                    <li key={path} className="discrepancy-wizard__missing-item">
                      <div>
                        <p>{path}</p>
                        <p className="discrepancy-wizard__missing-hint">
                          Decide whether to create a placeholder standard input
                          or ignore this discrepancy for now.
                        </p>
                      </div>
                      <div className="discrepancy-wizard__missing-actions">
                        <label>
                          <input
                            type="radio"
                            name={`missing-${path}`}
                            value="create-placeholder"
                            checked={
                              missingResolutions[path] === "create-placeholder"
                            }
                            onChange={() =>
                              handleMissingResolutionChange(
                                path,
                                "create-placeholder",
                              )
                            }
                          />
                          Create placeholder input
                        </label>
                        <label>
                          <input
                            type="radio"
                            name={`missing-${path}`}
                            value="ignore"
                            checked={missingResolutions[path] === "ignore"}
                            onChange={() =>
                              handleMissingResolutionChange(path, "ignore")
                            }
                          />
                          Ignore for now
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <footer className="discrepancy-wizard__footer">
          <button
            type="button"
            className="button subtle"
            onClick={() => submitResult(false)}
          >
            Cancel import
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!canApply}
            onClick={() => submitResult(true)}
          >
            Apply rebuilt bindings
          </button>
        </footer>
      </div>
    </div>
  );
}
