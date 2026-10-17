/**
 * The reasons a face's load stops, worded for the person waiting on it: they
 * are shown on Save and Export while the face is not loaded.
 */

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || "unknown error";
}

export function rigGraphFatalIssuesFailure(issues: readonly string[]): string {
  const count =
    issues.length === 1 ? "a fatal issue" : `${issues.length} fatal issues`;
  return `The face's rig graph has ${count}: ${issues.join("; ")}`;
}

export function rigGraphCompileFailure(detail: string): string {
  return `The face's rig graph does not compile: ${detail}`;
}

export function importFailure(
  part: "rig graph" | "pose config",
  error: unknown,
): string {
  return `The face's ${part} failed to import: ${describeError(error)}`;
}

export function poseGraphFailure(error: unknown): string {
  return `The face's pose graph failed to build: ${describeError(error)}`;
}

export const RIG_GRAPH_REVIEW_DECLINED_FAILURE =
  "The face's rig graph was not imported: its import review was declined.";
