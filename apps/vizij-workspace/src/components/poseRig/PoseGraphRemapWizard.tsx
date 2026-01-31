import { useMemo, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";

export interface PoseGraphRemapOption {
  path: string;
  label: string;
  score: number;
}

export interface PoseGraphRemapRow {
  id: string;
  nodeId: string;
  originalPath: string | null;
  suggestedPath: string | null;
  poseSlug?: string;
  status: "auto" | "review";
  reason?: string;
  needsReview?: boolean;
  options?: PoseGraphRemapOption[];
}

interface PoseGraphRemapWizardProps {
  autoRows: PoseGraphRemapRow[];
  rows: PoseGraphRemapRow[];
  standardInputs: StandardRigInput[];
  onApply: (rows: PoseGraphRemapRow[]) => Promise<void> | void;
  onCancel: () => void;
}

export function PoseGraphRemapWizard({
  autoRows,
  rows,
  standardInputs,
  onApply,
  onCancel,
}: PoseGraphRemapWizardProps) {
  const [edits, setEdits] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    rows.forEach((row) => {
      if (row.suggestedPath) {
        map[row.id] = row.suggestedPath;
      }
    });
    return map;
  });

  const standardOptions = useMemo(
    () =>
      standardInputs.map((input) => ({
        id: input.id,
        path: input.path,
        label: input.label,
      })),
    [standardInputs],
  );

  const canApply =
    rows.length === 0 ||
    rows.every((row) => Boolean((edits[row.id] ?? row.suggestedPath)?.trim()));

  const orderedAutoRows = useMemo(() => {
    return autoRows.slice().sort((a, b) => {
      const nameA = (a.poseSlug ?? a.id).toLowerCase();
      const nameB = (b.poseSlug ?? b.id).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [autoRows]);

  return (
    <div className="discrepancy-overlay" role="presentation">
      <div
        className="discrepancy-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pose-remap-title"
      >
        <header className="discrepancy-wizard__header">
          <div>
            <p className="discrepancy-wizard__eyebrow">Pose Graph Import</p>
            <h1 id="pose-remap-title">Remap Pose Outputs</h1>
            <p className="discrepancy-wizard__meta">
              {rows.length} output{rows.length === 1 ? "" : "s"} need a new
              target · {autoRows.length} auto-matched
            </p>
          </div>
          <button type="button" className="button subtle" onClick={onCancel}>
            Cancel import
          </button>
        </header>

        <section className="discrepancy-wizard__content">
          {orderedAutoRows.length > 0 ? (
            <div className="pose-remap-auto">
              <h2>Auto-matched outputs</h2>
              <p>
                The following outputs already map to known standard inputs and
                will be applied automatically.
              </p>
              <ul>
                {orderedAutoRows.map((row) => (
                  <li key={row.id}>
                    <strong>{row.poseSlug ?? row.id}</strong> →
                    <code>{row.suggestedPath ?? row.originalPath}</code>
                    {row.reason ? (
                      <span className="pose-remap-row__reason">
                        {row.reason}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="pose-remap-table">
              <h2>Needs review ({rows.length})</h2>
              {rows.map((row) => (
                <article
                  key={row.id}
                  className={
                    row.needsReview
                      ? "pose-remap-row pose-remap-row--needs-review"
                      : "pose-remap-row"
                  }
                >
                  <div className="pose-remap-row__info">
                    <p className="pose-remap-row__label">
                      Pose {row.poseSlug ?? row.id}
                    </p>
                    <code>{row.originalPath ?? "(missing path)"}</code>
                    {row.reason ? (
                      <p className="pose-remap-row__reason">{row.reason}</p>
                    ) : null}
                  </div>
                  <div className="pose-remap-row__editor">
                    <label htmlFor={`pose-remap-${row.id}`}>
                      Map to standard input
                    </label>
                    <input
                      id={`pose-remap-${row.id}`}
                      className="input"
                      list="pose-remap-options"
                      placeholder="/standard/face/..."
                      value={edits[row.id] ?? ""}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                    />
                    <p className="pose-remap-row__hint">
                      Provide a standard input path (e.g.,
                      /standard/face/eyes/blink). Leave blank to keep the
                      existing path.
                    </p>
                    {row.options && row.options.length > 0 ? (
                      <div className="pose-remap-row__suggestions">
                        {row.options.map((option) => (
                          <button
                            key={`${row.id}-${option.path}`}
                            type="button"
                            className="button subtle"
                            onClick={() =>
                              setEdits((current) => ({
                                ...current,
                                [row.id]: option.path,
                              }))
                            }
                          >
                            {option.label ?? option.path}
                            <span className="pose-remap-row__score">
                              {(option.score * 100).toFixed(0)}%
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="pose-remap-table">
              <p>All outputs matched automatically. Review and finish.</p>
            </div>
          )}
          <datalist id="pose-remap-options">
            {standardOptions.map((option) => (
              <option
                key={option.id}
                value={option.path}
                label={option.label}
              />
            ))}
          </datalist>
        </section>

        <footer className="discrepancy-wizard__footer">
          <button type="button" className="button subtle" onClick={onCancel}>
            Cancel import
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!canApply}
            onClick={() => {
              const nextRows = rows.map((row) => ({
                ...row,
                suggestedPath:
                  edits[row.id]?.trim() || row.suggestedPath || null,
              }));
              void onApply(nextRows);
            }}
          >
            {rows.length === 0 ? "Finish import" : "Apply mappings & finish"}
          </button>
        </footer>
      </div>
    </div>
  );
}
