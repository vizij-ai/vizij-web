import type { GraphDiffResult } from "@vizij/studio-support";

export type {
  GraphDiffCategory,
  GraphDiffConnectionContext,
  GraphDiffConnectionEndpoint,
  GraphDiffContext,
  GraphDiffEntry,
  GraphDiffEntityType,
  GraphDiffKind,
  GraphDiffResult,
} from "@vizij/studio-support";

export interface DiscrepancyReviewState {
  id: string;
  createdAt: string;
  faceId: string | null;
  importedFaceId: string | null;
  mismatchReasons: readonly string[];
  diff: GraphDiffResult;
  missingAutoInputs: readonly string[];
}

export type DiffResolutionChoice = "use-rebuilt" | "needs-follow-up";

export type MissingInputResolution = "ignore" | "create-placeholder";

export interface DiscrepancyResolutionResult {
  accepted: boolean;
  diffResolutions?: Record<string, DiffResolutionChoice>;
  missingInputChoices?: Record<string, MissingInputResolution>;
  notes?: string;
  renameFaceId?: string;
}
