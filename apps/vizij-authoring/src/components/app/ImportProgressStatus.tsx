import { useEffect, useState } from "react";
import {
  getRuntimeImportPerfSessionSnapshot,
  type RuntimeImportPerfSessionSnapshot,
  subscribeRuntimePerfMetrics,
} from "../../perf/runtimePerfMetrics";
import { resolveImportProgressState } from "../../perf/importProgress";

interface ImportProgressStatusProps {
  isAssetLoading: boolean;
  rootId: string | null;
}

function resolveProgressFillClass(
  status: "running" | "success" | "failure" | "cancelled" | "idle",
) {
  if (status === "success") {
    return "bg-emerald-500";
  }
  if (status === "failure") {
    return "bg-red-500";
  }
  if (status === "cancelled") {
    return "bg-amber-500";
  }
  return "bg-blue-500";
}

export function ImportProgressStatus({
  isAssetLoading,
  rootId,
}: ImportProgressStatusProps) {
  const [sessionSnapshot, setSessionSnapshot] =
    useState<RuntimeImportPerfSessionSnapshot>(() =>
      getRuntimeImportPerfSessionSnapshot(),
    );

  useEffect(() => {
    return subscribeRuntimePerfMetrics(() => {
      setSessionSnapshot(getRuntimeImportPerfSessionSnapshot());
    });
  }, []);

  useEffect(() => {
    setSessionSnapshot(getRuntimeImportPerfSessionSnapshot());
  }, [isAssetLoading, rootId]);

  const progressState = resolveImportProgressState({
    isAssetLoading,
    rootId,
    sessionSnapshot,
  });

  if (!progressState.visible) {
    return (
      <div
        className="text-[11px] text-text-muted"
        data-testid="import-progress-idle"
      >
        Import status idle
      </div>
    );
  }

  const progressPercent = Math.round(progressState.progress * 100);

  return (
    <div className="w-full max-w-xl" data-testid="import-progress-status">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="font-medium text-text-primary">
          {progressState.label}
        </span>
        <span className="text-text-muted">{progressPercent}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-bg-canvas/80">
        <div
          className={`h-full transition-[width] duration-200 ${resolveProgressFillClass(
            progressState.status,
          )}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {progressState.detail ? (
        <p className="mt-1 truncate text-[10px] text-text-muted">
          {progressState.detail}
        </p>
      ) : null}
    </div>
  );
}
