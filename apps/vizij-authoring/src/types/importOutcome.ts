export type ImportOutcomeStatus =
  | "success"
  | "success_with_repair"
  | "blocked_recoverable"
  | "blocked_fatal";

export interface ImportOutcome {
  status: ImportOutcomeStatus;
  message?: string;
}

export interface GraphImportResult extends ImportOutcome {
  faceChanged: boolean;
  importedFaceId: string | null;
}

export type PoseImportResult = ImportOutcome;

export function isImportOutcomeSuccess(status: ImportOutcomeStatus): boolean {
  return status === "success" || status === "success_with_repair";
}

export function resolveImportSuccessStatus(
  hasRepair: boolean,
): "success" | "success_with_repair" {
  return hasRepair ? "success_with_repair" : "success";
}

export interface RigImportRepairSignals {
  discrepancyReviewed: boolean;
  normalizationCount: number;
  animatableFallbackCount: number;
  missingBlueprintPathCount: number;
}

export function resolveRigImportSuccessStatus({
  discrepancyReviewed,
  normalizationCount,
  animatableFallbackCount,
  missingBlueprintPathCount,
}: RigImportRepairSignals): "success" | "success_with_repair" {
  return resolveImportSuccessStatus(
    discrepancyReviewed ||
      normalizationCount > 0 ||
      animatableFallbackCount > 0 ||
      missingBlueprintPathCount > 0,
  );
}

export function createPoseImportResult(
  status: PoseImportResult["status"],
  message?: string,
): PoseImportResult {
  return { status, message };
}
