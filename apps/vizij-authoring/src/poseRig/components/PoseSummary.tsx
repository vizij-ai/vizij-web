import type { PoseRigGraphSummary } from "../types";
import type { PoseLibrarySummary } from "../usePoseRigAuthoring";
import { Button } from "../../components/ui";

interface PoseSummaryProps {
  summary: PoseRigGraphSummary | null;
  library: PoseLibrarySummary;
  disabled?: boolean;
  onApplyNeutral: () => void;
}

export function PoseSummary({
  summary,
  library,
  disabled,
  onApplyNeutral,
}: PoseSummaryProps) {
  const inputs = summary?.inputs ?? [];
  void inputs; // May be used again later.

  return (
    <section className="pose-rig-panel pose-rig-panel--summary">
      <header className="pose-rig-panel__header">
        <div>
          <h3 className="pose-rig-panel__title">Pose Preview</h3>
          <p className="pose-rig-panel__subtitle">
            Apply poses and inspect channel contributions.
          </p>
        </div>
      </header>
      <div className="pose-rig-summary">
        <div className="pose-rig-summary__actions">
          <Button variant="subtle" onClick={onApplyNeutral} disabled={disabled}>
            Apply Neutral
          </Button>
          <p className="pose-rig-summary__hint">
            {library.poses.length === 0
              ? "Capture a pose to enable preview."
              : "Select poses in the library to apply them live."}
          </p>
        </div>
        {/* <div className="pose-rig-summary__details">
          {inputs.length === 0 ? (
            <p className="pose-rig-empty">
              No pose contributions yet. Capture a pose to view breakdowns.
            </p>
          ) : (
            <table className="pose-rig-summary__table">
              <thead>
                <tr>
                  <th>Standard Input</th>
                  <th>Neutral</th>
                  <th>Contributions</th>
                </tr>
              </thead>
              <tbody>
                {inputs.map((input) => (
                  <tr key={input.id}>
                    <td>
                      <div className="pose-rig-summary__cell">
                        <span className="pose-rig-summary__input-id">
                          {input.id}
                        </span>
                        <span className="pose-rig-summary__input-path">
                          {input.path}
                        </span>
                      </div>
                    </td>
                    <td>{input.neutral.toFixed(3)}</td>
                    <td>
                      {input.contributions.length === 0 ? (
                        <span className="pose-rig-summary__no-data">
                          Neutral only
                        </span>
                      ) : (
                        <ul className="pose-rig-summary__contributions">
                          {input.contributions.map((entry) => (
                            <li key={`${input.id}:${entry.poseId}`}>
                              <span className="pose-rig-summary__pose-name">
                                {entry.poseName}
                              </span>
                              <span className="pose-rig-summary__pose-delta">
                                Δ {entry.delta.toFixed(3)}
                              </span>
                              <span className="pose-rig-summary__pose-value">
                                → {entry.value.toFixed(3)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div> */}
      </div>
    </section>
  );
}
