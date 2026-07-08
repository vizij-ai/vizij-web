export type MappingRowStatus =
  | "resolved"
  | "ambiguous"
  | "unmapped"
  | "skipped";

export type UnresolvedMappingRowStatus = Exclude<
  MappingRowStatus,
  "resolved" | "skipped"
>;

export type MappingConfidence = "high" | "medium" | "low" | "none";

export type MergeDecisionMode = "source" | "destination" | "custom";

export interface NumericMergeDecision {
  mode: MergeDecisionMode;
  value?: number;
}

export interface ReferenceInputRange {
  min: number;
  max: number;
}

export type ReferencePipelineLinkSource =
  | "pipeline-link"
  | "by-input-parent"
  | "merged";

export interface ReferenceCatalogPipelineLink {
  linkId: string;
  parentInputId: string;
  childInputId: string;
  scale: number;
  offset: number;
  enabled: boolean;
  source: ReferencePipelineLinkSource;
}

export interface ReferenceCatalogParentLink {
  linkId: string;
  parentInputId: string;
  scale: number;
  offset: number;
  enabled: boolean;
}

export interface ReferenceCatalogChildLink {
  linkId: string;
  childInputId: string;
  scale: number;
  offset: number;
  enabled: boolean;
}

export interface ReferenceCatalogInput {
  id: string;
  path: string;
  label: string;
  defaultValue: number;
  range: ReferenceInputRange;
  parents: readonly ReferenceCatalogParentLink[];
  children: readonly ReferenceCatalogChildLink[];
}

export interface ReferencePoseTarget {
  inputId: string;
  value: number;
}

export interface ReferencePoseDefinition {
  id: string;
  name: string;
  /** Optional legacy/canonical group path for foldering */
  group?: string;
  /** Optional legacy primary group id/path */
  groupId?: string;
  /** Optional multi-group membership ids/paths */
  groupIds?: readonly string[];
  targets: readonly ReferencePoseTarget[];
}

export interface ReferenceCatalog {
  inputs: readonly ReferenceCatalogInput[];
  inputsById: ReadonlyMap<string, ReferenceCatalogInput>;
  inputsByPath: ReadonlyMap<string, readonly ReferenceCatalogInput[]>;
  pipelineLinks: readonly ReferenceCatalogPipelineLink[];
  poses: readonly ReferencePoseDefinition[];
  posesById: ReadonlyMap<string, ReferencePoseDefinition>;
}

export interface MappingRowBase {
  rowId: string;
  status: MappingRowStatus;
  confidence: MappingConfidence;
  rationale: readonly string[];
  critical: boolean;
  candidateDestinationInputIds: readonly string[];
}

export interface InputDestinationMappingRow extends MappingRowBase {
  sourceInputId: string;
  sourcePath: string | null;
  sourceLabel: string;
  destinationInputId: string | null;
  destinationPath: string | null;
  destinationLabel: string | null;
}

export interface VariableLinkMergeDecisions {
  scale: NumericMergeDecision;
  offset: NumericMergeDecision;
}

export interface VariableLinkMappingRow extends InputDestinationMappingRow {
  relationship: "parent" | "child";
  linkId: string;
  sourceScale: number;
  sourceOffset: number;
  destinationScale: number | null;
  destinationOffset: number | null;
  merge: VariableLinkMergeDecisions;
}

export interface VariableValueMergeDecisions {
  min: NumericMergeDecision;
  max: NumericMergeDecision;
  defaultValue: NumericMergeDecision;
}

export interface VariableCopyProposal {
  kind: "variable";
  sourceInputId: string;
  sourceInputPath: string;
  sourceInputLabel: string;
  destinationRow: InputDestinationMappingRow;
  parentRows: readonly VariableLinkMappingRow[];
  childRows: readonly VariableLinkMappingRow[];
  valueMerge: VariableValueMergeDecisions;
  unresolvedRows: readonly (
    | InputDestinationMappingRow
    | VariableLinkMappingRow
  )[];
}

export interface PoseTargetMappingRow extends MappingRowBase {
  sourcePoseId: string;
  sourcePoseName: string;
  sourceInputId: string;
  sourcePath: string | null;
  sourceValue: number;
  destinationInputId: string | null;
  destinationPath: string | null;
  destinationLabel: string | null;
  valueMerge: NumericMergeDecision;
}

export interface PoseCopyProposal {
  kind: "pose";
  sourcePoseId: string;
  sourcePoseName: string;
  destinationPoseName: string;
  targetRows: readonly PoseTargetMappingRow[];
  unresolvedRows: readonly PoseTargetMappingRow[];
}

export type AnyCopyProposal = VariableCopyProposal | PoseCopyProposal;

export interface ProposalPreflightBlockingError {
  proposalKind: AnyCopyProposal["kind"];
  rowId: string;
  status: UnresolvedMappingRowStatus;
  message: string;
}

export interface ProposalPreflightResult {
  ok: boolean;
  blockingErrors: readonly ProposalPreflightBlockingError[];
}
