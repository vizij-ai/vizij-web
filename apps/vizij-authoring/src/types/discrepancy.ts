export type GraphDiffCategory =
  | "identifiers"
  | "inputs"
  | "bindings"
  | "expressions"
  | "values"
  | "metadata"
  | "structure"
  | "other";

export type GraphDiffKind = "missing" | "unexpected" | "mismatch";

export type GraphDiffEntityType =
  | "node"
  | "edge"
  | "input"
  | "binding"
  | "expression"
  | "metadata"
  | "other";

export interface GraphDiffContext {
  entityType: GraphDiffEntityType;
  entityId?: string;
  scopePath: string;
  fieldPath: string;
  fieldName: string;
  importedType: string;
  rebuiltType: string;
  connection?: GraphDiffConnectionContext;
}

export interface GraphDiffConnectionEndpoint {
  fromNodeId?: string;
  fromNodeType?: string;
  fromPort?: string;
  toNodeId?: string;
  toNodeType?: string;
  toPort?: string;
}

export interface GraphDiffConnectionContext {
  imported: GraphDiffConnectionEndpoint;
  rebuilt: GraphDiffConnectionEndpoint;
  sameNodePair: boolean;
  slotOnlyChange: boolean;
  commutativeTarget: boolean;
  likelyNormalizationOnly: boolean;
  likelySemanticRisk: boolean;
  guidance: string;
}

export interface GraphDiffEntry {
  id: string;
  path: string;
  kind: GraphDiffKind;
  category: GraphDiffCategory;
  importedValue?: unknown;
  rebuiltValue?: unknown;
  context?: GraphDiffContext;
}

export interface GraphDiffResult {
  entries: GraphDiffEntry[];
  limitReached: boolean;
}

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
