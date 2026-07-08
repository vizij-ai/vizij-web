import type {
  AnyCopyProposal,
  InputDestinationMappingRow,
  MappingConfidence,
  MappingRowStatus,
  PoseCopyProposal,
  PoseTargetMappingRow,
  ProposalPreflightBlockingError,
  ProposalPreflightResult,
  ReferenceCatalog,
  ReferenceCatalogInput,
  VariableCopyProposal,
  VariableLinkMappingRow,
} from "./types";

function sortInputs(
  left: Pick<ReferenceCatalogInput, "path" | "id">,
  right: Pick<ReferenceCatalogInput, "path" | "id">,
): number {
  const byPath = left.path.localeCompare(right.path);
  if (byPath !== 0) {
    return byPath;
  }
  return left.id.localeCompare(right.id);
}

function normalizeLookupPath(path: string | null | undefined): string {
  if (!path) {
    return "";
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
}

function normalizeLookupLabel(label: string | null | undefined): string {
  if (!label) {
    return "";
  }
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function firstOrNull<T>(entries: readonly T[]): T | null {
  return entries.length > 0 ? entries[0] : null;
}

interface DestinationResolution {
  status: MappingRowStatus;
  confidence: MappingConfidence;
  rationale: string[];
  candidates: ReferenceCatalogInput[];
}

function buildResolutionFromCandidates(params: {
  candidates: ReferenceCatalogInput[];
  resolvedConfidence: MappingConfidence;
  resolvedRationale: string;
  ambiguousRationale: string;
}): DestinationResolution {
  if (params.candidates.length === 1) {
    return {
      status: "resolved",
      confidence: params.resolvedConfidence,
      rationale: [params.resolvedRationale],
      candidates: params.candidates,
    };
  }
  if (params.candidates.length > 1) {
    return {
      status: "ambiguous",
      confidence: "low",
      rationale: [params.ambiguousRationale],
      candidates: params.candidates,
    };
  }
  return {
    status: "unmapped",
    confidence: "none",
    rationale: [],
    candidates: [],
  };
}

function resolveDestinationByPathThenLabel(
  sourceInput: Pick<ReferenceCatalogInput, "path" | "label">,
  destinationCatalog: ReferenceCatalog,
): DestinationResolution {
  const sourcePathKey = normalizeLookupPath(sourceInput.path);
  if (sourcePathKey) {
    const byPath = [
      ...(destinationCatalog.inputsByPath.get(sourcePathKey) ?? []),
    ].sort(sortInputs);
    const pathResolution = buildResolutionFromCandidates({
      candidates: byPath,
      resolvedConfidence: "high",
      resolvedRationale: "Resolved by exact normalized path match",
      ambiguousRationale:
        "Multiple destination inputs matched exact normalized path",
    });
    if (pathResolution.status !== "unmapped") {
      return pathResolution;
    }
  }

  const normalizedLabel = normalizeLookupLabel(sourceInput.label);
  if (normalizedLabel) {
    const byLabel = destinationCatalog.inputs
      .filter(
        (candidate) =>
          normalizeLookupLabel(candidate.label) === normalizedLabel,
      )
      .sort(sortInputs);
    const labelResolution = buildResolutionFromCandidates({
      candidates: byLabel,
      resolvedConfidence: "medium",
      resolvedRationale: "Resolved by normalized label fallback",
      ambiguousRationale:
        "Multiple destination inputs matched normalized label fallback",
    });
    if (labelResolution.status !== "unmapped") {
      return labelResolution;
    }
  }

  return {
    status: "unmapped",
    confidence: "none",
    rationale: ["No destination input matched by path or normalized label"],
    candidates: [],
  };
}

function resolveDestinationByPathOnly(
  sourcePath: string | null,
  destinationCatalog: ReferenceCatalog,
): DestinationResolution {
  const sourcePathKey = normalizeLookupPath(sourcePath);
  if (!sourcePathKey) {
    return {
      status: "unmapped",
      confidence: "none",
      rationale: ["Source input path missing"],
      candidates: [],
    };
  }

  const candidates = [
    ...(destinationCatalog.inputsByPath.get(sourcePathKey) ?? []),
  ].sort(sortInputs);
  const resolution = buildResolutionFromCandidates({
    candidates,
    resolvedConfidence: "high",
    resolvedRationale: "Resolved by exact normalized path match",
    ambiguousRationale:
      "Multiple destination inputs matched exact normalized path",
  });
  if (resolution.status !== "unmapped") {
    return resolution;
  }

  return {
    status: "unmapped",
    confidence: "none",
    rationale: ["No destination input matched source input path"],
    candidates: [],
  };
}

function toDestinationRow(params: {
  rowId: string;
  sourceInputId: string;
  sourcePath: string | null;
  sourceLabel: string;
  critical: boolean;
  resolution: DestinationResolution;
}): InputDestinationMappingRow {
  const destination = firstOrNull(params.resolution.candidates);
  return {
    rowId: params.rowId,
    sourceInputId: params.sourceInputId,
    sourcePath: params.sourcePath,
    sourceLabel: params.sourceLabel,
    destinationInputId: destination?.id ?? null,
    destinationPath: destination?.path ?? null,
    destinationLabel: destination?.label ?? null,
    candidateDestinationInputIds: params.resolution.candidates.map(
      (candidate) => candidate.id,
    ),
    status: params.resolution.status,
    confidence: params.resolution.confidence,
    rationale: params.resolution.rationale,
    critical: params.critical,
  };
}

function createDefaultNumericMergeDecision() {
  return { mode: "source" } as const;
}

function isUnresolvedStatus(
  status: MappingRowStatus,
): status is "ambiguous" | "unmapped" {
  return status === "ambiguous" || status === "unmapped";
}

function buildVariableLinkRow(params: {
  sourceCatalog: ReferenceCatalog;
  destinationCatalog: ReferenceCatalog;
  destinationVariable: ReferenceCatalogInput | null;
  sourceInputId: string;
  sourceInputPath: string | null;
  sourceInputLabel: string;
  relationship: "parent" | "child";
  linkId: string;
  sourceScale: number;
  sourceOffset: number;
  linkedSourceInputId: string;
}): VariableLinkMappingRow {
  const linkedSource =
    params.sourceCatalog.inputsById.get(params.linkedSourceInputId) ?? null;
  const resolution =
    linkedSource === null
      ? {
          status: "unmapped" as const,
          confidence: "none" as const,
          rationale: [
            "Source link references an input that is missing from the source catalog",
          ],
          candidates: [],
        }
      : resolveDestinationByPathThenLabel(
          linkedSource,
          params.destinationCatalog,
        );

  const baseRow = toDestinationRow({
    rowId: `variable.${params.relationship}.${params.sourceInputId}.${params.linkId}`,
    sourceInputId: params.linkedSourceInputId,
    sourcePath: linkedSource?.path ?? params.sourceInputPath,
    sourceLabel: linkedSource?.label ?? params.sourceInputLabel,
    critical: true,
    resolution,
  });
  const destinationLinkedInput =
    baseRow.destinationInputId === null
      ? null
      : (params.destinationCatalog.inputsById.get(baseRow.destinationInputId) ??
        null);

  let destinationScale: number | null = null;
  let destinationOffset: number | null = null;
  if (params.destinationVariable && destinationLinkedInput) {
    if (params.relationship === "parent") {
      const destinationLink =
        params.destinationVariable.parents.find(
          (parent) => parent.parentInputId === destinationLinkedInput.id,
        ) ?? null;
      destinationScale = destinationLink?.scale ?? null;
      destinationOffset = destinationLink?.offset ?? null;
    } else {
      const destinationLink =
        params.destinationVariable.children.find(
          (child) => child.childInputId === destinationLinkedInput.id,
        ) ?? null;
      destinationScale = destinationLink?.scale ?? null;
      destinationOffset = destinationLink?.offset ?? null;
    }
  }

  return {
    ...baseRow,
    relationship: params.relationship,
    linkId: params.linkId,
    sourceScale: params.sourceScale,
    sourceOffset: params.sourceOffset,
    destinationScale,
    destinationOffset,
    merge: {
      scale: createDefaultNumericMergeDecision(),
      offset: createDefaultNumericMergeDecision(),
    },
  };
}

export function buildVariableCopyProposal(params: {
  sourceCatalog: ReferenceCatalog;
  destinationCatalog: ReferenceCatalog;
  sourceInputId: string;
}): VariableCopyProposal {
  const sourceInput = params.sourceCatalog.inputsById.get(params.sourceInputId);
  if (!sourceInput) {
    throw new Error(
      `Cannot build variable copy proposal: source input "${params.sourceInputId}" was not found.`,
    );
  }

  const destinationRow = toDestinationRow({
    rowId: `variable.destination.${sourceInput.id}`,
    sourceInputId: sourceInput.id,
    sourcePath: sourceInput.path,
    sourceLabel: sourceInput.label,
    critical: true,
    resolution: resolveDestinationByPathThenLabel(
      sourceInput,
      params.destinationCatalog,
    ),
  });
  const destinationInput =
    destinationRow.destinationInputId === null
      ? null
      : (params.destinationCatalog.inputsById.get(
          destinationRow.destinationInputId,
        ) ?? null);

  const parentRows = [...sourceInput.parents]
    .sort((left, right) => left.linkId.localeCompare(right.linkId))
    .map((parentLink) =>
      buildVariableLinkRow({
        sourceCatalog: params.sourceCatalog,
        destinationCatalog: params.destinationCatalog,
        destinationVariable: destinationInput,
        sourceInputId: sourceInput.id,
        sourceInputPath: sourceInput.path,
        sourceInputLabel: sourceInput.label,
        relationship: "parent",
        linkId: parentLink.linkId,
        sourceScale: parentLink.scale,
        sourceOffset: parentLink.offset,
        linkedSourceInputId: parentLink.parentInputId,
      }),
    );

  const childRows = [...sourceInput.children]
    .sort((left, right) => left.linkId.localeCompare(right.linkId))
    .map((childLink) =>
      buildVariableLinkRow({
        sourceCatalog: params.sourceCatalog,
        destinationCatalog: params.destinationCatalog,
        destinationVariable: destinationInput,
        sourceInputId: sourceInput.id,
        sourceInputPath: sourceInput.path,
        sourceInputLabel: sourceInput.label,
        relationship: "child",
        linkId: childLink.linkId,
        sourceScale: childLink.scale,
        sourceOffset: childLink.offset,
        linkedSourceInputId: childLink.childInputId,
      }),
    );

  const unresolvedRows = [destinationRow, ...parentRows, ...childRows].filter(
    (row) => isUnresolvedStatus(row.status),
  );

  return {
    kind: "variable",
    sourceInputId: sourceInput.id,
    sourceInputPath: sourceInput.path,
    sourceInputLabel: sourceInput.label,
    destinationRow,
    parentRows,
    childRows,
    valueMerge: {
      min: createDefaultNumericMergeDecision(),
      max: createDefaultNumericMergeDecision(),
      defaultValue: createDefaultNumericMergeDecision(),
    },
    unresolvedRows,
  };
}

export function buildPoseCopyProposal(params: {
  sourceCatalog: ReferenceCatalog;
  destinationCatalog: ReferenceCatalog;
  sourcePoseId: string;
  destinationPoseName?: string;
}): PoseCopyProposal {
  const sourcePose = params.sourceCatalog.posesById.get(params.sourcePoseId);
  if (!sourcePose) {
    throw new Error(
      `Cannot build pose copy proposal: source pose "${params.sourcePoseId}" was not found.`,
    );
  }

  const targetRows: PoseTargetMappingRow[] = sourcePose.targets.map(
    (target, index) => {
      const sourceInput =
        params.sourceCatalog.inputsById.get(target.inputId) ?? null;
      const resolution =
        sourceInput === null
          ? {
              status: "unmapped" as const,
              confidence: "none" as const,
              rationale: [
                "Source pose target references an input that is missing from the source catalog",
              ],
              candidates: [],
            }
          : resolveDestinationByPathOnly(
              sourceInput.path,
              params.destinationCatalog,
            );

      const destination = firstOrNull(resolution.candidates);
      return {
        rowId: `pose.target.${sourcePose.id}.${index + 1}.${target.inputId}`,
        sourcePoseId: sourcePose.id,
        sourcePoseName: sourcePose.name,
        sourceInputId: target.inputId,
        sourcePath: sourceInput?.path ?? null,
        sourceValue: target.value,
        destinationInputId: destination?.id ?? null,
        destinationPath: destination?.path ?? null,
        destinationLabel: destination?.label ?? null,
        candidateDestinationInputIds: resolution.candidates.map(
          (candidate) => candidate.id,
        ),
        status: resolution.status,
        confidence: resolution.confidence,
        rationale: resolution.rationale,
        critical: true,
        valueMerge: {
          mode: "source",
          value: target.value,
        },
      };
    },
  );

  const unresolvedRows = targetRows.filter((row) =>
    isUnresolvedStatus(row.status),
  );
  return {
    kind: "pose",
    sourcePoseId: sourcePose.id,
    sourcePoseName: sourcePose.name,
    destinationPoseName: params.destinationPoseName ?? sourcePose.name,
    targetRows,
    unresolvedRows,
  };
}

function collectPreflightErrors(
  proposalKind: AnyCopyProposal["kind"],
  rows: ReadonlyArray<
    Pick<InputDestinationMappingRow, "rowId" | "status" | "critical">
  >,
): ProposalPreflightBlockingError[] {
  const blockingErrors: ProposalPreflightBlockingError[] = [];
  rows.forEach((row) => {
    if (!row.critical || !isUnresolvedStatus(row.status)) {
      return;
    }
    blockingErrors.push({
      proposalKind,
      rowId: row.rowId,
      status: row.status,
      message: `Blocking unresolved mapping: ${row.rowId} (${row.status}).`,
    });
  });
  return blockingErrors;
}

export function validateVariableCopyProposalPreflight(
  proposal: VariableCopyProposal,
): ProposalPreflightResult {
  const rows = [
    proposal.destinationRow,
    ...proposal.parentRows,
    ...proposal.childRows,
  ];
  const blockingErrors = collectPreflightErrors("variable", rows);
  return {
    ok: blockingErrors.length === 0,
    blockingErrors,
  };
}

export function validatePoseCopyProposalPreflight(
  proposal: PoseCopyProposal,
): ProposalPreflightResult {
  const blockingErrors = collectPreflightErrors("pose", proposal.targetRows);
  return {
    ok: blockingErrors.length === 0,
    blockingErrors,
  };
}

export function validateCopyProposalPreflight(
  proposal: AnyCopyProposal,
): ProposalPreflightResult {
  return proposal.kind === "variable"
    ? validateVariableCopyProposalPreflight(proposal)
    : validatePoseCopyProposalPreflight(proposal);
}
