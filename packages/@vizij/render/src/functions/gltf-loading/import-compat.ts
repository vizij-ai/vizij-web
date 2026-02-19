import type {
  VizijBundleCompatibilityDiagnostic,
  VizijBundleCompatibilitySource,
  VizijBundleExtractionResult,
  VizijBundleExtension,
} from "../../types";

export const VIZIJ_BUNDLE_EXTENSION_ALIASES = [
  "VIZIJ_bundle",
  "vizij_bundle",
  "VizijBundle",
  "VIZIJBundle",
] as const;

type BundleAlias = (typeof VIZIJ_BUNDLE_EXTENSION_ALIASES)[number];

type CandidateScope = VizijBundleCompatibilitySource["scope"];

interface BundleCandidate {
  alias: BundleAlias;
  aliasPriority: number;
  payload: unknown;
  sourceScope: CandidateScope;
  sourceIndex: number;
  scopePriority: number;
  entryIndex: number;
}

type BundleCandidateEvaluation =
  | {
      status: "supported";
      bundle: VizijBundleExtension;
      candidate: BundleCandidate;
    }
  | {
      status: "unsupported-version";
      version: number;
      candidate: BundleCandidate;
    }
  | {
      status: "unsupported-variant";
      variant: string;
      candidate: BundleCandidate;
    }
  | {
      status: "invalid";
      reason: string;
      candidate: BundleCandidate;
    };

const SCOPE_PRIORITY: Record<CandidateScope, number> = {
  object: 0,
  "parser-node": 1,
  "parser-scene": 2,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSupportedBundlePayload(
  value: unknown,
): value is VizijBundleExtension {
  return isRecord(value) && value.version === 1;
}

function toDiagnosticSource(
  candidate: BundleCandidate,
): VizijBundleCompatibilitySource {
  return {
    scope: candidate.sourceScope,
    index: candidate.sourceIndex,
    alias: candidate.alias,
    entryIndex: candidate.entryIndex,
  };
}

function compareCandidates(a: BundleCandidate, b: BundleCandidate): number {
  return (
    a.scopePriority - b.scopePriority ||
    a.sourceIndex - b.sourceIndex ||
    a.aliasPriority - b.aliasPriority ||
    a.entryIndex - b.entryIndex
  );
}

function detectVariant(payload: Record<string, unknown>): string | null {
  if (typeof payload.variant === "string" && payload.variant.length > 0) {
    return payload.variant;
  }
  if (typeof payload.format === "string" && payload.format.length > 0) {
    return payload.format;
  }
  if (typeof payload.type === "string" && payload.type.length > 0) {
    return payload.type;
  }
  return null;
}

function evaluateCandidate(
  candidate: BundleCandidate,
): BundleCandidateEvaluation {
  const payload = candidate.payload;
  if (!isRecord(payload)) {
    return {
      status: "invalid",
      reason: "bundle payload is not an object",
      candidate,
    };
  }

  if (typeof payload.version === "number") {
    if (isSupportedBundlePayload(payload)) {
      return {
        status: "supported",
        bundle: payload,
        candidate,
      };
    }
    return {
      status: "unsupported-version",
      version: payload.version,
      candidate,
    };
  }

  const wrappedBundle = payload.bundle;
  if (isRecord(wrappedBundle) && typeof wrappedBundle.version === "number") {
    if (isSupportedBundlePayload(wrappedBundle)) {
      return {
        status: "supported",
        bundle: wrappedBundle,
        candidate,
      };
    }
    return {
      status: "unsupported-version",
      version: wrappedBundle.version,
      candidate,
    };
  }

  const variant = detectVariant(payload);
  if (variant) {
    return {
      status: "unsupported-variant",
      variant,
      candidate,
    };
  }

  return {
    status: "invalid",
    reason: "bundle payload is missing a supported version",
    candidate,
  };
}

function makeDiagnostic(
  candidate: BundleCandidate,
  diagnostic: Omit<VizijBundleCompatibilityDiagnostic, "source">,
): VizijBundleCompatibilityDiagnostic {
  return {
    ...diagnostic,
    source: toDiagnosticSource(candidate),
  };
}

export function collectVizijBundleCandidates(
  extensionContainer: Record<string, unknown>,
  sourceScope: CandidateScope,
  sourceIndex: number,
): BundleCandidate[] {
  const candidates: BundleCandidate[] = [];
  for (
    let aliasPriority = 0;
    aliasPriority < VIZIJ_BUNDLE_EXTENSION_ALIASES.length;
    aliasPriority += 1
  ) {
    const alias = VIZIJ_BUNDLE_EXTENSION_ALIASES[aliasPriority];
    if (!Object.prototype.hasOwnProperty.call(extensionContainer, alias)) {
      continue;
    }
    const value = extensionContainer[alias];
    if (Array.isArray(value)) {
      value.forEach((entry, entryIndex) => {
        candidates.push({
          alias,
          aliasPriority,
          payload: entry,
          sourceScope,
          sourceIndex,
          scopePriority: SCOPE_PRIORITY[sourceScope],
          entryIndex,
        });
      });
      continue;
    }
    candidates.push({
      alias,
      aliasPriority,
      payload: value,
      sourceScope,
      sourceIndex,
      scopePriority: SCOPE_PRIORITY[sourceScope],
      entryIndex: 0,
    });
  }

  return candidates;
}

export function resolveVizijBundleCandidates(
  candidates: BundleCandidate[],
): VizijBundleExtractionResult {
  if (candidates.length === 0) {
    return { bundle: null, selection: null, diagnostics: [] };
  }

  const sorted = [...candidates].sort(compareCandidates);
  const evaluations = sorted.map(evaluateCandidate);
  const selected = evaluations.find(
    (
      evaluation,
    ): evaluation is Extract<
      BundleCandidateEvaluation,
      { status: "supported" }
    > => evaluation.status === "supported",
  );

  const diagnostics: VizijBundleCompatibilityDiagnostic[] = [];

  if (selected) {
    diagnostics.push(
      makeDiagnostic(selected.candidate, {
        code: "bundle-selected",
        severity: "info",
        message:
          "selected bundle candidate using deterministic compatibility precedence",
      }),
    );
  }

  for (const evaluation of evaluations) {
    if (evaluation.status === "supported") {
      if (selected && evaluation !== selected) {
        diagnostics.push(
          makeDiagnostic(evaluation.candidate, {
            code: "bundle-candidate-ignored",
            severity: "warning",
            message:
              "bundle candidate ignored because a higher-precedence candidate was selected",
          }),
        );
      }
      continue;
    }

    if (evaluation.status === "unsupported-version") {
      diagnostics.push(
        makeDiagnostic(evaluation.candidate, {
          code: "unsupported-bundle-version",
          severity: "error",
          message: `unsupported bundle version ${evaluation.version}`,
        }),
      );
      continue;
    }

    if (evaluation.status === "unsupported-variant") {
      diagnostics.push(
        makeDiagnostic(evaluation.candidate, {
          code: "unsupported-bundle-variant",
          severity: "error",
          message: `unsupported bundle variant ${evaluation.variant}`,
        }),
      );
      continue;
    }

    diagnostics.push(
      makeDiagnostic(evaluation.candidate, {
        code: "invalid-bundle-candidate",
        severity: "warning",
        message: evaluation.reason,
      }),
    );
  }

  if (!selected) {
    diagnostics.push(
      makeDiagnostic(sorted[0], {
        code: "no-supported-bundle-candidate",
        severity: "error",
        message: "no supported Vizij bundle candidates were found",
      }),
    );
  }

  return {
    bundle: selected?.bundle ?? null,
    selection: selected
      ? {
          source: toDiagnosticSource(selected.candidate),
        }
      : null,
    diagnostics,
  };
}
