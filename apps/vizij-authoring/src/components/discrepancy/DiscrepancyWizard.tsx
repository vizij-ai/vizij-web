import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DiffResolutionChoice,
  DiscrepancyResolutionResult,
  DiscrepancyReviewState,
  GraphDiffCategory,
  GraphDiffEntry,
  GraphDiffEntityType,
  MissingInputResolution,
} from "../../types/discrepancy";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { cn } from "../../utils/cn";

const isDev = process.env.NODE_ENV !== "production";
const logDebug = (...args: unknown[]) => {
  if (!isDev) return;
  // eslint-disable-next-line no-console
  console.debug("[discrepancy]", ...args);
};

function formatDiffValue(
  value: unknown,
  options?: { expanded?: boolean },
): string {
  const expanded = options?.expanded ?? false;
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    if (expanded) {
      return value;
    }
    return value.length > 120 ? `${value.slice(0, 117)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const serialized = expanded
      ? JSON.stringify(value, null, 2)
      : JSON.stringify(value);
    if (serialized.length <= 1200) {
      return serialized;
    }
    return `${serialized.slice(0, 1197)}…`;
  } catch {
    return String(value);
  }
}

const ENTITY_LABELS: Record<GraphDiffEntityType, string> = {
  node: "Node",
  edge: "Edge",
  input: "Input",
  binding: "Binding",
  expression: "Expression",
  metadata: "Metadata",
  other: "Graph",
};

function formatEntityContext(entry: GraphDiffEntry): string {
  const context = entry.context;
  if (!context) {
    return "Graph";
  }
  const label = ENTITY_LABELS[context.entityType] ?? "Graph";
  return context.entityId ? `${label} ${context.entityId}` : label;
}

function formatTypeTransition(entry: GraphDiffEntry): string {
  const context = entry.context;
  if (!context) {
    return "unknown -> unknown";
  }
  return `${context.importedType} -> ${context.rebuiltType}`;
}

function describeDiffImpact(entry: GraphDiffEntry): string {
  const edgeConnection = entry.context?.connection;
  if (edgeConnection?.likelyNormalizationOnly) {
    return "Edge slot changed on a commutative target node. Usually benign normalization, but verify if this node has custom semantics.";
  }
  if (edgeConnection?.likelySemanticRisk) {
    return "Edge slot changed on a potentially non-commutative target node. This can change runtime output behavior.";
  }
  if (entry.kind === "missing") {
    return "Imported structure is missing after rebuild; behavior may no longer be represented.";
  }
  if (entry.kind === "unexpected") {
    return "Rebuild introduced structure that was not present in the imported graph.";
  }
  switch (entry.category) {
    case "bindings":
      return "Binding routing or weighting changed; output response can shift.";
    case "expressions":
      return "Expression math changed; driven values may evaluate differently.";
    case "inputs":
    case "values":
      return "Input defaults/ranges changed; controls may feel different at runtime.";
    case "identifiers":
      return "Identifier drift can impact links, references, and migration behavior.";
    case "metadata":
      return "Metadata changed; tooling behavior or labels may differ.";
    default:
      return "Graph structure changed; data flow may differ from the imported source.";
  }
}

function formatEdgeEndpoint(
  entry: GraphDiffEntry,
  side: "imported" | "rebuilt",
) {
  const connection = entry.context?.connection;
  const endpoint = connection?.[side];
  if (!endpoint) {
    return "unknown";
  }
  const fromNode = endpoint.fromNodeId ?? "?";
  const toNode = endpoint.toNodeId ?? "?";
  const fromType = endpoint.fromNodeType ? ` (${endpoint.fromNodeType})` : "";
  const toType = endpoint.toNodeType ? ` (${endpoint.toNodeType})` : "";
  const fromPort = endpoint.fromPort ? `.${endpoint.fromPort}` : "";
  const toPort = endpoint.toPort ? `.${endpoint.toPort}` : "";
  return `${fromNode}${fromType}${fromPort} -> ${toNode}${toType}${toPort}`;
}

function normalizeDiffResolutions(
  entries: DiscrepancyReviewState["diff"]["entries"],
): Record<string, DiffResolutionChoice | null> {
  return entries.reduce<Record<string, DiffResolutionChoice | null>>(
    (
      acc: Record<string, DiffResolutionChoice | null>,
      entry: { id: string },
    ) => {
      acc[entry.id] = null;
      return acc;
    },
    {},
  );
}

function normalizeMissingResolutions(
  paths: readonly string[],
): Record<string, MissingInputResolution | null> {
  return paths.reduce<Record<string, MissingInputResolution | null>>(
    (acc: Record<string, MissingInputResolution | null>, path: string) => {
      acc[path] = null;
      return acc;
    },
    {},
  );
}

type WizardStep = "overview" | "differences" | "missing";

const STEP_LABELS: Record<WizardStep, string> = {
  overview: "Summary",
  differences: "Graph Differences",
  missing: "Missing Inputs",
};

const CATEGORY_LABELS: Record<GraphDiffCategory, string> = {
  identifiers: "Identifiers",
  inputs: "Inputs",
  bindings: "Bindings",
  expressions: "Expressions",
  values: "Values & Ranges",
  metadata: "Metadata",
  structure: "Structure",
  other: "Other",
};

interface DiscrepancyWizardProps {
  state: DiscrepancyReviewState;
  onResolve: (result: DiscrepancyResolutionResult) => void;
}

export function DiscrepancyWizard({
  state,
  onResolve,
}: DiscrepancyWizardProps) {
  const [step, setStep] = useState<WizardStep>("overview");
  const [diffResolutions, setDiffResolutions] = useState<
    Record<string, DiffResolutionChoice | null>
  >(() => normalizeDiffResolutions(state.diff.entries));
  const [missingResolutions, setMissingResolutions] = useState<
    Record<string, MissingInputResolution | null>
  >(() => normalizeMissingResolutions(state.missingAutoInputs));
  const [notes, setNotes] = useState("");
  const [activeCategory, setActiveCategory] = useState<
    GraphDiffCategory | "all"
  >("all");
  const [faceRename, setFaceRename] = useState(
    state.importedFaceId ?? state.faceId ?? "",
  );

  useEffect(() => {
    logDebug("mount wizard", {
      id: state.id,
      faceId: state.faceId,
      importedFaceId: state.importedFaceId,
      diffEntries: state.diff.entries.length,
      missingInputs: state.missingAutoInputs.length,
    });
    return () => {
      logDebug("unmount wizard", { id: state.id });
    };
  }, [
    state.id,
    state.faceId,
    state.importedFaceId,
    state.diff.entries.length,
    state.missingAutoInputs.length,
  ]);

  const handleKeydown = useCallback(
    (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        logDebug("escape pressed – cancel import");
        onResolve({ accepted: false });
      }
    },
    [onResolve],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [handleKeydown]);

  const diffCounts = useMemo(() => {
    return state.diff.entries.reduce<Record<GraphDiffCategory, number>>(
      (
        acc: Record<GraphDiffCategory, number>,
        entry: { category: GraphDiffCategory },
      ) => {
        acc[entry.category] = (acc[entry.category] ?? 0) + 1;
        return acc;
      },
      {
        identifiers: 0,
        inputs: 0,
        bindings: 0,
        expressions: 0,
        values: 0,
        metadata: 0,
        structure: 0,
        other: 0,
      },
    );
  }, [state.diff.entries]);

  const filteredDiffs = useMemo(() => {
    if (activeCategory === "all") {
      return state.diff.entries;
    }
    return state.diff.entries.filter(
      (entry: { category: GraphDiffCategory }) =>
        entry.category === activeCategory,
    );
  }, [activeCategory, state.diff.entries]);

  const edgeDiffSummary = useMemo(() => {
    const edgeEntries = filteredDiffs.filter(
      (entry) => entry.context?.entityType === "edge",
    );
    const likelyNormalization = edgeEntries.filter(
      (entry) => entry.context?.connection?.likelyNormalizationOnly,
    ).length;
    const likelyRisk = edgeEntries.filter(
      (entry) => entry.context?.connection?.likelySemanticRisk,
    ).length;
    return {
      total: edgeEntries.length,
      likelyNormalization,
      likelyRisk,
    };
  }, [filteredDiffs]);

  const allDiffsResolved =
    state.diff.entries.length === 0 ||
    state.diff.entries.every((entry) => diffResolutions[entry.id]);

  const allMissingResolved =
    state.missingAutoInputs.length === 0 ||
    state.missingAutoInputs.every((path: string) => missingResolutions[path]);

  const canApply = allDiffsResolved && allMissingResolved;

  const submitResult = useCallback(
    (
      accepted: boolean,
      overrides?: { acceptAll?: boolean; renameFaceId?: string },
    ) => {
      if (!accepted) {
        logDebug("submit", { accepted: false });
        onResolve({ accepted: false });
        return;
      }
      const resolvedDiffs = Object.fromEntries(
        Object.entries(diffResolutions).filter(([, value]) => value),
      ) as Record<string, DiffResolutionChoice>;
      const resolvedMissing = Object.fromEntries(
        Object.entries(missingResolutions).filter(([, value]) => value),
      ) as Record<string, MissingInputResolution>;
      onResolve({
        accepted: true,
        diffResolutions: resolvedDiffs,
        missingInputChoices: resolvedMissing,
        notes: notes.trim().length > 0 ? notes.trim() : undefined,
        renameFaceId: overrides?.renameFaceId,
      });
      logDebug("submit", {
        accepted: true,
        resolvedDiffs: Object.keys(resolvedDiffs).length,
        resolvedMissing: Object.keys(resolvedMissing).length,
        renameFaceId: overrides?.renameFaceId,
      });
    },
    [diffResolutions, missingResolutions, notes, onResolve],
  );

  const handleDiffResolutionChange = useCallback(
    (id: string, value: DiffResolutionChoice) => {
      setDiffResolutions((current) => ({ ...current, [id]: value }));
    },
    [],
  );

  const handleMissingResolutionChange = useCallback(
    (path: string, value: MissingInputResolution) => {
      setMissingResolutions((current) => ({ ...current, [path]: value }));
    },
    [],
  );

  const applyRecommended = useCallback(() => {
    logDebug("applyRecommended");
    setDiffResolutions((current) => {
      const nextEntries: Record<string, DiffResolutionChoice> = {};
      Object.keys(current).forEach((id) => {
        nextEntries[id] = "use-rebuilt";
      });
      return nextEntries;
    });
    setMissingResolutions((current) => {
      const next: Record<string, MissingInputResolution> = {};
      Object.keys(current).forEach((path) => {
        next[path] = "create-placeholder";
      });
      return next;
    });
  }, []);

  useEffect(() => {
    logDebug("step change", { step });
  }, [step]);

  useEffect(() => {
    logDebug("faceRename change", { faceRename });
  }, [faceRename]);

  return (
    <Modal
      open={true}
      onClose={() => onResolve({ accepted: false })}
      title="Import Review"
      maxWidth="4xl"
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent-subtle text-accent">
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              Resolve Graph Discrepancies
            </h1>
          </div>
          <p className="text-xs text-text-muted font-medium">
            Loaded face:{" "}
            <span className="text-text-secondary font-mono">
              {state.faceId ?? "—"}
            </span>{" "}
            · Imported face:{" "}
            <span className="text-text-secondary font-mono">
              {state.importedFaceId ?? "unknown"}
            </span>{" "}
            · Captured at{" "}
            <span className="text-text-secondary">
              {new Date(state.createdAt).toLocaleString()}
            </span>
          </p>
        </header>

        <nav
          className="flex gap-1 p-1 bg-bg-panel rounded-xl border border-border-default"
          aria-label="Wizard steps"
        >
          {(Object.keys(STEP_LABELS) as WizardStep[]).map((stepId) => (
            <button
              key={stepId}
              type="button"
              className={cn(
                "flex-1 px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all",
                step === stepId
                  ? "bg-accent text-accent-fg shadow-lg shadow-accent/20"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-hover",
              )}
              onClick={() => setStep(stepId)}
            >
              {STEP_LABELS[stepId]}
            </button>
          ))}
        </nav>

        <div className="min-h-[400px]">
          {step === "overview" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-text-primary">
                  What changed?
                </h2>
                <p className="text-[13px] text-text-secondary leading-relaxed">
                  Importing the rig graph produced a normalized IR that does not
                  perfectly match the source graph. Review the detected
                  differences, note any follow-ups, and choose how to handle
                  missing inputs.
                </p>
              </div>

              {state.importedFaceId &&
                state.faceId &&
                state.importedFaceId !== state.faceId && (
                  <div className="bg-warning-subtle border border-warning-subtle rounded-xl p-4 space-y-3">
                    <p className="text-xs text-warning font-bold flex items-center gap-2">
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      Face mismatch detected
                    </p>
                    <p className="text-xs text-warning/80">
                      Imported graph face is "{state.importedFaceId}", but
                      loaded asset face is "{state.faceId}".
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={faceRename}
                        className="flex-1 h-9 bg-bg-input border border-border-default rounded-lg px-3 text-xs text-text-primary focus:outline-none focus:border-warning"
                        onChange={(event) => setFaceRename(event.target.value)}
                        placeholder="New face ID"
                      />
                      <Button
                        size="sm"
                        onClick={() =>
                          submitResult(true, {
                            renameFaceId: faceRename.trim(),
                          })
                        }
                        disabled={faceRename.trim().length === 0}
                      >
                        Rename to imported
                      </Button>
                    </div>
                  </div>
                )}

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-bg-card rounded-xl border border-border-default p-4 text-center">
                  <span className="block text-2xl font-bold text-text-primary">
                    {state.diff.entries.length}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Differences
                  </span>
                </div>
                <div className="bg-bg-card rounded-xl border border-border-default p-4 text-center">
                  <span className="block text-[11px] font-bold text-text-secondary mt-2">
                    {state.diff.limitReached ? "Capped" : "Complete"}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Diff Status
                  </span>
                </div>
                <div className="bg-bg-card rounded-xl border border-border-default p-4 text-center">
                  <span className="block text-2xl font-bold text-text-primary">
                    {state.missingAutoInputs.length}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Missing Inputs
                  </span>
                </div>
              </div>
              <ul className="discrepancy-wizard__summary-list">
                <li>
                  <strong>{state.diff.entries.length}</strong> structural
                  differences detected
                </li>
                <li>
                  {state.diff.limitReached
                    ? "Diff limit reached (showing first entries)"
                    : "Full diff captured"}
                </li>
                <li>
                  {state.missingAutoInputs.length} auto-generated inputs missing
                  from metadata
                </li>
              </ul>

              {state.mismatchReasons.length > 0 && (
                <div className="bg-bg-secondary rounded-xl border border-border-default p-5 space-y-3">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Likely causes
                  </h3>
                  <ul className="space-y-2">
                    {state.mismatchReasons.map((reason: string) => (
                      <li
                        key={reason}
                        className="text-xs text-text-secondary flex items-start gap-2"
                      >
                        <span className="w-1 h-1 rounded-full bg-accent mt-1.5 shrink-0" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">
                  Reviewer notes (optional)
                </span>
                <textarea
                  className="w-full h-24 bg-bg-input border border-border-default rounded-xl p-4 text-xs text-text-primary focus:outline-none focus:border-accent/50 resize-none transition-colors"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Capture context or follow-up owners"
                />
              </div>

              <div className="pt-4">
                <Button
                  variant="primary"
                  className="w-full h-11 font-bold"
                  onClick={() => {
                    applyRecommended();
                    submitResult(true);
                  }}
                >
                  Accept all (use rebuilt)
                </Button>
              </div>
            </div>
          )}

          {step === "differences" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-text-primary">
                  Graph differences
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={applyRecommended}
                >
                  Apply recommeded fixes
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border",
                    activeCategory === "all"
                      ? "bg-accent-subtle border-accent/30 text-accent"
                      : "bg-bg-card border-border-default text-text-muted hover:border-border-hover",
                  )}
                  onClick={() => setActiveCategory("all")}
                >
                  All ({state.diff.entries.length})
                </button>
                {(Object.keys(CATEGORY_LABELS) as GraphDiffCategory[]).map(
                  (category) => (
                    <button
                      key={category}
                      type="button"
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border",
                        activeCategory === category
                          ? "bg-accent-subtle border-accent/30 text-accent"
                          : "bg-bg-card border-border-default text-text-muted hover:border-border-hover",
                      )}
                      onClick={() => setActiveCategory(category)}
                    >
                      {CATEGORY_LABELS[category]} ({diffCounts[category] ?? 0})
                    </button>
                  ),
                )}
              </div>
              {edgeDiffSummary.total > 0 && (
                <div className="rounded-lg border border-border-default bg-bg-secondary p-3 space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Edge Diff Triage
                  </p>
                  <p className="text-[11px] text-text-secondary">
                    {edgeDiffSummary.total} edge-related differences in this
                    view.
                  </p>
                  <p className="text-[11px] text-success">
                    {edgeDiffSummary.likelyNormalization} look like commutative
                    slot-order normalization.
                  </p>
                  <p className="text-[11px] text-warning">
                    {edgeDiffSummary.likelyRisk} look like potential semantic
                    changes (slot change on non-commutative or unknown target).
                  </p>
                </div>
              )}
              {filteredDiffs.length === 0 ? (
                <div className="h-48 flex items-center justify-center bg-bg-secondary/50 rounded-2xl border border-border-dashed border-dashed">
                  <p className="text-xs text-text-muted italic">
                    No differences for this category.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                  {filteredDiffs.map((entry) => {
                    const scopePath = entry.context?.scopePath ?? "spec";
                    const fieldPath = entry.context?.fieldPath ?? entry.path;
                    return (
                      <article
                        key={entry.id}
                        className="bg-bg-card rounded-xl border border-border-default p-4 space-y-4 hover:border-border-hover transition-colors"
                      >
                        <header className="flex justify-between items-start gap-4">
                          <div className="space-y-1 min-w-0">
                            <p className="text-[11px] font-mono font-bold text-text-primary truncate">
                              {entry.path}
                            </p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
                              {CATEGORY_LABELS[entry.category]}
                            </p>
                          </div>
                          <Chip
                            tone={
                              entry.kind === "unexpected"
                                ? "success"
                                : entry.kind === "missing"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {entry.kind}
                          </Chip>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="bg-bg-secondary rounded-lg border border-border-subtle p-2.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">
                              Entity
                            </p>
                            <p className="text-[11px] font-mono text-text-secondary break-all">
                              {formatEntityContext(entry)}
                            </p>
                          </div>
                          <div className="bg-bg-secondary rounded-lg border border-border-subtle p-2.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">
                              Scope
                            </p>
                            <p className="text-[11px] font-mono text-text-secondary break-all">
                              {scopePath}
                            </p>
                          </div>
                          <div className="bg-bg-secondary rounded-lg border border-border-subtle p-2.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">
                              Field
                            </p>
                            <p className="text-[11px] font-mono text-text-secondary break-all">
                              {fieldPath}
                            </p>
                          </div>
                          <div className="bg-bg-secondary rounded-lg border border-border-subtle p-2.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">
                              Type Change
                            </p>
                            <p className="text-[11px] font-mono text-text-secondary break-all">
                              {formatTypeTransition(entry)}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-lg border border-warning-subtle bg-warning-subtle/30 p-2.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-warning mb-1">
                            Runtime Impact
                          </p>
                          <p className="text-[11px] text-warning">
                            {describeDiffImpact(entry)}
                          </p>
                        </div>
                        {entry.context?.connection && (
                          <div className="rounded-lg border border-border-subtle bg-bg-secondary p-2.5 space-y-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">
                              Edge Connection Context
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div className="rounded-md border border-border-subtle bg-bg-panel p-2">
                                <p className="text-[9px] uppercase tracking-widest text-text-muted mb-1">
                                  Imported
                                </p>
                                <p className="text-[11px] font-mono text-text-secondary break-all">
                                  {formatEdgeEndpoint(entry, "imported")}
                                </p>
                              </div>
                              <div className="rounded-md border border-border-subtle bg-bg-panel p-2">
                                <p className="text-[9px] uppercase tracking-widest text-text-muted mb-1">
                                  Rebuilt
                                </p>
                                <p className="text-[11px] font-mono text-text-secondary break-all">
                                  {formatEdgeEndpoint(entry, "rebuilt")}
                                </p>
                              </div>
                            </div>
                            <p
                              className={cn(
                                "text-[11px]",
                                entry.context.connection.likelyNormalizationOnly
                                  ? "text-success"
                                  : entry.context.connection.likelySemanticRisk
                                    ? "text-warning"
                                    : "text-text-secondary",
                              )}
                            >
                              {entry.context.connection.guidance}
                            </p>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-bg-secondary rounded-lg p-3 border border-border-subtle space-y-2">
                            <span className="block text-[9px] font-black uppercase tracking-widest text-text-muted">
                              Imported Value
                            </span>
                            <code className="block text-[11px] text-text-secondary font-mono break-all">
                              {formatDiffValue(entry.importedValue)}
                            </code>
                            <details className="text-[10px]">
                              <summary className="cursor-pointer text-text-muted hover:text-text-secondary">
                                Show full imported value
                              </summary>
                              <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-bg-panel p-2 text-[10px] text-text-secondary whitespace-pre-wrap break-words">
                                {formatDiffValue(entry.importedValue, {
                                  expanded: true,
                                })}
                              </pre>
                            </details>
                          </div>
                          <div className="bg-bg-secondary rounded-lg p-3 border border-border-subtle space-y-2">
                            <span className="block text-[9px] font-black uppercase tracking-widest text-text-muted">
                              Rebuilt Value
                            </span>
                            <code className="block text-[11px] text-accent font-mono break-all">
                              {formatDiffValue(entry.rebuiltValue)}
                            </code>
                            <details className="text-[10px]">
                              <summary className="cursor-pointer text-text-muted hover:text-text-secondary">
                                Show full rebuilt value
                              </summary>
                              <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-bg-panel p-2 text-[10px] text-text-secondary whitespace-pre-wrap break-words">
                                {formatDiffValue(entry.rebuiltValue, {
                                  expanded: true,
                                })}
                              </pre>
                            </details>
                          </div>
                        </div>
                        <div className="flex gap-4 pt-2 border-t border-border-default">
                          <label className="flex items-center gap-2.5 cursor-pointer group">
                            <input
                              type="radio"
                              name={`diff-${entry.id}`}
                              className="w-3.5 h-3.5 bg-bg-input border-border-default text-accent focus:ring-accent/50"
                              value="use-rebuilt"
                              checked={
                                diffResolutions[entry.id] === "use-rebuilt"
                              }
                              onChange={() =>
                                handleDiffResolutionChange(
                                  entry.id,
                                  "use-rebuilt",
                                )
                              }
                            />
                            <span className="text-[11px] font-bold text-text-secondary group-hover:text-text-primary transition-colors">
                              Use rebuilt value
                            </span>
                          </label>
                          <label className="flex items-center gap-2.5 cursor-pointer group">
                            <input
                              type="radio"
                              name={`diff-${entry.id}`}
                              className="w-3.5 h-3.5 bg-bg-input border-border-default text-accent focus:ring-accent/50"
                              value="needs-follow-up"
                              checked={
                                diffResolutions[entry.id] === "needs-follow-up"
                              }
                              onChange={() =>
                                handleDiffResolutionChange(
                                  entry.id,
                                  "needs-follow-up",
                                )
                              }
                            />
                            <span className="text-[11px] font-bold text-text-secondary group-hover:text-text-primary transition-colors">
                              Flag for follow-up
                            </span>
                          </label>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === "missing" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-text-primary">
                  Missing auto-generated inputs
                </h2>
                <p className="text-[13px] text-text-secondary leading-relaxed">
                  Decide whether to create a placeholder standard input or
                  ignore this discrepancy for now.
                </p>
              </div>

              {state.missingAutoInputs.length === 0 ? (
                <div className="h-48 flex items-center justify-center bg-bg-secondary/50 rounded-2xl border border-border-dashed border-dashed">
                  <p className="text-xs text-text-muted italic">
                    No missing inputs detected.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {state.missingAutoInputs.map((path: string) => (
                    <li
                      key={path}
                      className="bg-bg-card rounded-xl border border-border-default p-4 flex justify-between items-center gap-6"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="text-[11px] font-mono font-bold text-text-primary truncate">
                          {path}
                        </p>
                        <p className="text-[10px] text-text-muted">
                          Auto-generated in source graph
                        </p>
                      </div>
                      <div className="flex gap-4 shrink-0">
                        <label className="flex items-center gap-2.5 cursor-pointer group">
                          <input
                            type="radio"
                            name={`missing-${path}`}
                            className="w-3.5 h-3.5 bg-bg-input border-border-default text-accent focus:ring-accent/50"
                            value="create-placeholder"
                            checked={
                              missingResolutions[path] === "create-placeholder"
                            }
                            onChange={() =>
                              handleMissingResolutionChange(
                                path,
                                "create-placeholder",
                              )
                            }
                          />
                          <span className="text-[11px] font-bold text-text-secondary group-hover:text-text-primary transition-colors">
                            Create placeholder
                          </span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer group">
                          <input
                            type="radio"
                            name={`missing-${path}`}
                            className="w-3.5 h-3.5 bg-bg-input border-border-default text-accent focus:ring-accent/50"
                            value="ignore"
                            checked={missingResolutions[path] === "ignore"}
                            onChange={() =>
                              handleMissingResolutionChange(path, "ignore")
                            }
                          />
                          <span className="text-[11px] font-bold text-text-secondary group-hover:text-text-primary transition-colors">
                            Ignore
                          </span>
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="flex justify-between items-center pt-6 border-t border-border-default mt-4">
          <Button
            variant="ghost"
            className="text-text-muted hover:text-text-primary"
            onClick={() => submitResult(false)}
          >
            Cancel import
          </Button>
          <Button
            variant="primary"
            className="h-10 px-6 font-bold text-xs"
            disabled={!canApply}
            onClick={() => submitResult(true)}
          >
            Apply rebuilding & continue
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
