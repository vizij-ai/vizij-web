import type {
  RuntimeImportFaceScope,
  RuntimeImportProgressSnapshot,
} from "./runtimePerfMetrics";

export type ImportProgressPhase =
  | "idle"
  | "asset-load"
  | "rig-prepare"
  | "rig-normalize"
  | "rig-import"
  | "pose-normalize"
  | "runtime-sync"
  | "ready"
  | "failed"
  | "cancelled";

export type ImportProgressStatus =
  | "idle"
  | "running"
  | "success"
  | "failure"
  | "cancelled";

export type ImportProgressState = {
  visible: boolean;
  phase: ImportProgressPhase;
  status: ImportProgressStatus;
  progress: number;
  label: string;
  detail: string | null;
};

interface ResolveImportProgressOptions {
  isAssetLoading: boolean;
  rootId: string | null;
  faceScope?: RuntimeImportFaceScope;
  sessionSnapshot: RuntimeImportProgressSnapshot;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function formatDuration(durationMs: number | null | undefined): string {
  if (
    durationMs === null ||
    durationMs === undefined ||
    !Number.isFinite(durationMs)
  ) {
    return "n/a";
  }
  return `${Math.round(durationMs)}ms`;
}

function buildSummaryDetail(
  summary: RuntimeImportProgressSnapshot["lastSummary"],
): string {
  if (!summary) {
    return "";
  }
  return [
    `duration ${formatDuration(summary.durationMs)}`,
    `root->ready ${formatDuration(summary.rootAssignedToReadyMs)}`,
    `ready->frame ${formatDuration(summary.readyToFirstFrameMs)}`,
    `updates ${summary.graphBridgeAcceptedUpdates}/${summary.graphBridgePublishAttempts}`,
  ].join(" • ");
}

export function resolveImportProgressState({
  isAssetLoading,
  rootId,
  faceScope = "main",
  sessionSnapshot,
}: ResolveImportProgressOptions): ImportProgressState {
  const isReferenceFace = faceScope === "reference";
  if (isAssetLoading) {
    return {
      visible: true,
      phase: "asset-load",
      status: "running",
      progress: 0.12,
      label: isReferenceFace ? "Loading reference asset" : "Loading asset",
      detail: "Reading world, animatables, and bundle payload.",
    };
  }

  const activeSession = sessionSnapshot.activeSession;
  if (activeSession) {
    let phase: ImportProgressPhase = isReferenceFace
      ? "runtime-sync"
      : "rig-prepare";
    let label = isReferenceFace ? "Preparing runtime" : "Preparing rig graph";
    let progress = isReferenceFace ? 0.62 : 0.25;

    if (!isReferenceFace && activeSession.rigNormalizeCalls > 0) {
      phase = "rig-normalize";
      label = "Normalizing rig graph";
      progress = 0.45;
    }
    if (!isReferenceFace && activeSession.rigGraphImportRuns > 0) {
      phase = "rig-import";
      label = "Importing rig graph";
      progress = 0.62;
    }
    if (!isReferenceFace && activeSession.poseNormalizeRuns > 0) {
      phase = "pose-normalize";
      label = "Normalizing pose graph";
      progress = 0.74;
    }
    if (activeSession.graphBridgeAcceptedUpdates > 0) {
      phase = "runtime-sync";
      label = "Synchronizing runtime";
      progress = 0.88;
    }
    if (activeSession.firstControllableFrameAtMs !== null) {
      phase = "ready";
      label = "Import ready";
      progress = 1;
    }

    return {
      visible: true,
      phase,
      status:
        activeSession.firstControllableFrameAtMs !== null
          ? "success"
          : "running",
      progress: clampProgress(progress),
      label,
      detail: `updates ${activeSession.graphBridgeAcceptedUpdates}/${activeSession.graphBridgePublishAttempts}`,
    };
  }

  const summary = sessionSnapshot.lastSummary;
  if (summary && rootId && summary.rootId === rootId) {
    if (summary.status === "failure") {
      return {
        visible: true,
        phase: "failed",
        status: "failure",
        progress: 0,
        label: "Import failed",
        detail: buildSummaryDetail(summary),
      };
    }
    if (summary.status === "cancelled") {
      return {
        visible: true,
        phase: "cancelled",
        status: "cancelled",
        progress: 0,
        label: "Import cancelled",
        detail: buildSummaryDetail(summary),
      };
    }
    return {
      visible: true,
      phase: "ready",
      status: "success",
      progress: 1,
      label: "Import ready",
      detail: buildSummaryDetail(summary),
    };
  }

  return {
    visible: false,
    phase: "idle",
    status: "idle",
    progress: 0,
    label: "",
    detail: null,
  };
}
