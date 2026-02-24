import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FaceLoadMilestones,
  FaceLoadStep,
  FaceLoadStepStatus,
} from "../../hooks/useVizijAssetLoader";

type GraphStatus = "idle" | "loading" | "ready" | "error";

interface FaceLoadingProgressBarProps {
  visible: boolean;
  progress: number;
  steps: FaceLoadStep[];
  milestones: FaceLoadMilestones;
  graphStatus: GraphStatus;
  graphError: string | null;
  runtimeInputReady: boolean;
  sessionStartedAtMs: number | null;
  sessionCompletedAtMs: number | null;
  inFlightOperations: number;
  sourceLabel: string | null;
}

type TimedStep = FaceLoadStep;

function nowMs(): number {
  return Date.now();
}

function statusTone(status: FaceLoadStepStatus): string {
  switch (status) {
    case "complete":
      return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
    case "active":
      return "text-accent border-accent/40 bg-accent/10";
    case "error":
      return "text-warning border-warning/50 bg-warning-subtle/30";
    default:
      return "text-text-muted border-border-default/60 bg-bg-panel/30";
  }
}

function formatDuration(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  const tenths = Math.floor((safeMs % 1000) / 100)
    .toString()
    .padStart(1, "0");
  return `${minutes}:${seconds}.${tenths}`;
}

function stepElapsedMs(
  step: {
    startedAtMs?: number;
    completedAtMs?: number;
    status: FaceLoadStepStatus;
  },
  now: number,
): number | null {
  if (typeof step.startedAtMs !== "number") {
    return null;
  }
  if (typeof step.completedAtMs === "number") {
    return Math.max(0, step.completedAtMs - step.startedAtMs);
  }
  if (step.status === "active") {
    return Math.max(0, now - step.startedAtMs);
  }
  return null;
}

function buildRuntimeReadyStep(params: {
  graphStatus: GraphStatus;
  graphError: string | null;
  runtimeInputReady: boolean;
  startedAtMs: number | null;
  completedAtMs: number | null;
}): TimedStep {
  const {
    graphStatus,
    graphError,
    runtimeInputReady,
    startedAtMs,
    completedAtMs,
  } = params;

  let status: FaceLoadStepStatus = "pending";
  if (graphStatus === "error") {
    status = "error";
  } else if (runtimeInputReady) {
    status = "complete";
  } else if (graphStatus === "loading" || graphStatus === "ready") {
    status = "active";
  }

  return {
    id: "runtime-ready",
    label: "Runtime Ready For Inputs",
    status,
    startedAtMs: status === "pending" ? undefined : (startedAtMs ?? undefined),
    completedAtMs:
      status === "complete" ? (completedAtMs ?? undefined) : undefined,
    substeps: [
      {
        id: "compile-runtime",
        label:
          graphStatus === "error" && graphError
            ? `Compile runtime graph (${graphError})`
            : "Compile runtime graph",
        status:
          graphStatus === "error"
            ? "error"
            : graphStatus === "ready" || runtimeInputReady
              ? "complete"
              : graphStatus === "loading"
                ? "active"
                : "pending",
      },
      {
        id: "input-bridge",
        label: "Input bridge ready",
        status: runtimeInputReady
          ? "complete"
          : graphStatus === "error"
            ? "error"
            : graphStatus === "ready"
              ? "active"
              : "pending",
      },
    ],
  };
}

export function FaceLoadingProgressBar({
  visible,
  progress,
  steps,
  milestones,
  graphStatus,
  graphError,
  runtimeInputReady,
  sessionStartedAtMs,
  sessionCompletedAtMs,
  inFlightOperations,
  sourceLabel,
}: FaceLoadingProgressBarProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [clockNow, setClockNow] = useState(() => nowMs());

  const runtimeStepStartedAtRef = useRef<number | null>(null);
  const runtimeStepCompletedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (graphStatus !== "idle" && runtimeStepStartedAtRef.current === null) {
      runtimeStepStartedAtRef.current = nowMs();
    }
    if (runtimeInputReady && runtimeStepCompletedAtRef.current === null) {
      runtimeStepCompletedAtRef.current = nowMs();
    }
    if (!visible) {
      runtimeStepStartedAtRef.current = null;
      runtimeStepCompletedAtRef.current = null;
    }
  }, [graphStatus, runtimeInputReady, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const timer = window.setInterval(() => {
      setClockNow(nowMs());
    }, 250);
    return () => window.clearInterval(timer);
  }, [visible]);

  const allSteps = useMemo(() => {
    const runtimeStep = buildRuntimeReadyStep({
      graphStatus,
      graphError,
      runtimeInputReady,
      startedAtMs: runtimeStepStartedAtRef.current,
      completedAtMs: runtimeStepCompletedAtRef.current,
    });
    return [...steps, runtimeStep];
  }, [graphError, graphStatus, runtimeInputReady, steps]);

  const normalizedProgress = Math.max(0, Math.min(1, progress));
  const currentStep =
    allSteps.find((step) => step.status === "active") ??
    allSteps.find((step) => step.status === "error") ??
    null;

  if (!visible) {
    return null;
  }

  const totalElapsedMs =
    typeof sessionStartedAtMs === "number"
      ? Math.max(
          0,
          (typeof sessionCompletedAtMs === "number"
            ? sessionCompletedAtMs
            : clockNow) - sessionStartedAtMs,
        )
      : 0;
  const currentStepElapsed = currentStep
    ? stepElapsedMs(currentStep, clockNow)
    : null;

  return (
    <div className="pointer-events-auto w-full rounded border border-border-default/70 bg-bg-panel/90 backdrop-blur-md px-3 py-2 flex flex-col gap-1.5 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide text-text-secondary font-semibold truncate">
          Face Loading{sourceLabel ? ` · ${sourceLabel}` : ""}
        </div>
        <button
          type="button"
          className="text-[9px] text-text-muted hover:text-text-primary transition-colors"
          onClick={() => setShowDetails((current) => !current)}
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
      </div>

      <div className="w-full h-1.5 rounded bg-bg-app/50 overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${Math.round(normalizedProgress * 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-text-muted truncate">
          {currentStep ? `Step: ${currentStep.label}` : "Step: Finalizing"}
          {typeof currentStepElapsed === "number"
            ? ` (${formatDuration(currentStepElapsed)})`
            : ""}
        </div>
        <div className="text-[10px] font-mono text-text-secondary">
          {Math.round(normalizedProgress * 100)}% · ops {inFlightOperations} ·
          total {formatDuration(totalElapsedMs)}
        </div>
      </div>

      <div className="text-[9px] text-text-muted truncate">
        Path: asset {milestones["asset-loaded"] ? "✓" : "…"}
        {" -> "}bundle {milestones["bundle-synced"] ? "✓" : "…"}
        {" -> "}graph {milestones["graph-ready"] ? "✓" : "…"}
        {" -> "}runtime {milestones["runtime-ready"] ? "✓" : "…"}
      </div>

      <div className="flex flex-wrap gap-1">
        {allSteps.map((step) => {
          const elapsed = stepElapsedMs(step, clockNow);
          return (
            <span
              key={step.id}
              className={`px-1.5 py-0.5 rounded border text-[9px] ${statusTone(step.status)}`}
            >
              {step.label}
              {typeof elapsed === "number"
                ? ` (${formatDuration(elapsed)})`
                : ""}
            </span>
          );
        })}
      </div>

      {showDetails && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
          {allSteps.map((step) => (
            <div
              key={`${step.id}:details`}
              className="rounded border border-border-default/60 bg-bg-panel/40 p-1.5"
            >
              <div className="text-[9px] font-semibold text-text-secondary uppercase">
                {step.label}
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {step.substeps.map((substep) => (
                  <span
                    key={`${step.id}:${substep.id}`}
                    className={`px-1 py-0.5 rounded border text-[8px] ${statusTone(substep.status)}`}
                  >
                    {substep.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
