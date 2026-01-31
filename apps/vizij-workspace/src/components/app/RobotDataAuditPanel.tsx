import type { RobotDataAuditResult } from "../../utils/robotDataAudit";
import { Button, Card, CardHeader, CardBody } from "../ui";

interface RobotDataAuditPanelProps {
  result: RobotDataAuditResult | null;
  status: "idle" | "running" | "succeeded" | "error";
  progress: number;
  isStale: boolean;
  error: string | null;
  canRun: boolean;
  onRun: () => void;
  onCancel: () => void;
}

export function RobotDataAuditPanel({
  result,
  status,
  progress,
  isStale,
  error,
  canRun,
  onRun,
  onCancel,
}: RobotDataAuditPanelProps) {
  const nonVizijScene = (result?.robotDataNodes ?? 0) === 0;
  const running = status === "running";
  const hasResult = Boolean(result);
  return (
    <Card>
      <CardHeader>
        <h2 className="asset-card__title">RobotData Audit</h2>
        <p className="asset-card__description">
          Verify that GLB node metadata still matches the RobotData extension
          and live transforms.
        </p>
      </CardHeader>
      <CardBody className="asset-card__body--compact">
        <div className="asset-card__actions">
          <Button
            variant="primary"
            disabled={!canRun || running}
            onClick={onRun}
          >
            {running ? "Running…" : hasResult ? "Re-run audit" : "Run audit"}
          </Button>
          {running ? (
            <Button variant="subtle" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>

        {running ? (
          <p className="asset-card__hint">
            Scanning scene graph ({Math.round(progress * 100)}%)
          </p>
        ) : null}

        {error ? <p className="asset-card__hint">{error}</p> : null}

        {isStale && !running ? (
          <p className="asset-card__hint">
            Scene changed since the last audit. Run again to refresh results.
          </p>
        ) : null}

        {result ? (
          <div className="robot-audit__summary">
            <p>
              <strong>{result.robotDataNodes}</strong> / {result.totalNodes}{" "}
              nodes carry RobotData
              {nonVizijScene ? " (non-Vizij GLB detected)" : ""}
            </p>
            {result.nodesWithoutRobotData.length > 0 && (
              <p className="asset-card__hint">
                {result.nodesWithoutRobotData.length} nodes missing RobotData
                metadata.
              </p>
            )}
            {result.missingAnimatables.length > 0 && (
              <p className="asset-card__hint">
                {result.missingAnimatables.length} animated features reference
                missing animatables.
              </p>
            )}
            {result.drifts.length > 0 && (
              <p className="asset-card__hint">
                {result.drifts.length} features drifted from stored defaults.
              </p>
            )}
          </div>
        ) : (
          <p className="asset-card__hint">
            {canRun
              ? "Run the audit to inspect RobotData coverage."
              : "Load a GLB to enable RobotData audits."}
          </p>
        )}

        {result?.nodesWithoutRobotData.length ? (
          <div className="robot-audit__list">
            <strong>Nodes without RobotData</strong>
            <ul>
              {result.nodesWithoutRobotData.slice(0, 5).map((id) => (
                <li key={id}>{id}</li>
              ))}
              {result.nodesWithoutRobotData.length > 5 ? (
                <li>…{result.nodesWithoutRobotData.length - 5} more</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {result?.missingAnimatables.length ? (
          <div className="robot-audit__list">
            <strong>Missing animatables</strong>
            <ul>
              {result.missingAnimatables.slice(0, 5).map((entry) => (
                <li key={`${entry.nodeId}-${entry.animatableId}`}>
                  {entry.nodeName} · {entry.feature} → {entry.animatableId}
                </li>
              ))}
              {result.missingAnimatables.length > 5 ? (
                <li>…{result.missingAnimatables.length - 5} more</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {result?.drifts.length ? (
          <div className="robot-audit__list">
            <strong>Feature drift</strong>
            <ul>
              {result.drifts.slice(0, 5).map((entry) => (
                <li key={`${entry.nodeId}-${entry.feature}`}>
                  {entry.nodeName} · {entry.feature} (Δ {entry.delta.toFixed(4)}
                  )
                </li>
              ))}
              {result.drifts.length > 5 ? (
                <li>…{result.drifts.length - 5} more</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
