import { useEffect, useMemo, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { cn } from "../../utils/cn";

export interface PoseGraphRemapOption {
  path: string;
  label: string;
  score: number;
  confidence: PoseRemapConfidence;
  rationale: string[];
}

export type PoseRemapConfidence = "high" | "medium" | "low";

export interface PoseGraphRemapRow {
  id: string;
  nodeId: string;
  originalPath: string | null;
  suggestedPath: string | null;
  poseSlug?: string;
  currentInputId?: string | null;
  confidence?: PoseRemapConfidence;
  confidenceScore?: number;
  rationale?: string[];
  status: "auto" | "review";
  reason?: string;
  needsReview?: boolean;
  options?: PoseGraphRemapOption[];
}

interface PoseGraphRemapWizardProps {
  autoRows: PoseGraphRemapRow[];
  rows: PoseGraphRemapRow[];
  standardInputs: StandardRigInput[];
  onApply: (rows: PoseGraphRemapRow[]) => Promise<void> | void;
  onCancel: () => void;
}

type RemapFilterMode = "all" | "attention" | "conflicts" | "low-confidence";

export function PoseGraphRemapWizard({
  autoRows,
  rows,
  standardInputs,
  onApply,
  onCancel,
}: PoseGraphRemapWizardProps) {
  const allRows = useMemo(
    () =>
      [...autoRows, ...rows].sort((a, b) => {
        const nameA = (a.poseSlug ?? a.currentInputId ?? a.id).toLowerCase();
        const nameB = (b.poseSlug ?? b.currentInputId ?? b.id).toLowerCase();
        return nameA.localeCompare(nameB);
      }),
    [autoRows, rows],
  );

  const [edits, setEdits] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    allRows.forEach((row) => {
      if (row.suggestedPath) {
        map[row.id] = row.suggestedPath;
      }
    });
    return map;
  });
  const [filterMode, setFilterMode] = useState<RemapFilterMode>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setEdits((current) => {
      const next = { ...current };
      let changed = false;
      const rowIds = new Set(allRows.map((row) => row.id));
      Object.keys(next).forEach((rowId) => {
        if (!rowIds.has(rowId)) {
          delete next[rowId];
          changed = true;
        }
      });
      allRows.forEach((row) => {
        if (!next[row.id] && row.suggestedPath) {
          next[row.id] = row.suggestedPath;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [allRows]);

  const standardOptions = useMemo(
    () =>
      standardInputs.map((input) => ({
        id: input.id,
        path: input.path,
        label: input.label,
      })),
    [standardInputs],
  );

  const { hasConflicts, conflictMessages, conflictRowIds } = useMemo(() => {
    const rowIdsByPath = new Map<string, string[]>();
    allRows.forEach((row) => {
      const resolvedPath = (edits[row.id] ?? row.suggestedPath ?? "").trim();
      if (!resolvedPath) {
        return;
      }
      const key = resolvedPath.toLowerCase();
      const ids = rowIdsByPath.get(key) ?? [];
      ids.push(row.id);
      rowIdsByPath.set(key, ids);
    });
    const nextConflictRowIds = new Set<string>();
    const messages: string[] = [];
    rowIdsByPath.forEach((rowIds, pathKey) => {
      if (rowIds.length < 2) {
        return;
      }
      rowIds.forEach((rowId) => nextConflictRowIds.add(rowId));
      messages.push(
        `${rowIds.length} outputs currently map to ${pathKey}. Choose unique targets.`,
      );
    });
    return {
      hasConflicts: nextConflictRowIds.size > 0,
      conflictMessages: messages,
      conflictRowIds: nextConflictRowIds,
    };
  }, [allRows, edits]);

  const summary = useMemo(() => {
    let mapped = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let needsAttention = 0;
    allRows.forEach((row) => {
      const resolvedPath = (edits[row.id] ?? row.suggestedPath ?? "").trim();
      if (resolvedPath) {
        mapped += 1;
      }
      if (row.confidence === "high") {
        high += 1;
      } else if (row.confidence === "medium") {
        medium += 1;
      } else if (row.confidence === "low") {
        low += 1;
      }
      if (
        row.needsReview ||
        row.confidence === "low" ||
        conflictRowIds.has(row.id)
      ) {
        needsAttention += 1;
      }
    });
    const unmapped = allRows.length - mapped;
    return {
      mapped,
      unmapped,
      high,
      medium,
      low,
      needsAttention,
      auto: autoRows.length,
      review: rows.length,
      conflicts: conflictRowIds.size,
    };
  }, [allRows, autoRows.length, conflictRowIds, edits, rows.length]);

  const filteredRows = useMemo(() => {
    const queryValue = query.trim().toLowerCase();
    return allRows.filter((row) => {
      const lowConfidence = row.confidence === "low";
      const needsAttention =
        row.needsReview || lowConfidence || conflictRowIds.has(row.id);
      if (filterMode === "attention" && !needsAttention) {
        return false;
      }
      if (filterMode === "conflicts" && !conflictRowIds.has(row.id)) {
        return false;
      }
      if (filterMode === "low-confidence" && !lowConfidence) {
        return false;
      }
      if (!queryValue) {
        return true;
      }
      const resolvedPath = edits[row.id] ?? row.suggestedPath ?? "";
      const haystack = [
        row.poseSlug,
        row.currentInputId,
        row.originalPath,
        row.suggestedPath,
        resolvedPath,
        row.reason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(queryValue);
    });
  }, [allRows, conflictRowIds, edits, filterMode, query]);

  const unresolvedRowsWithSuggestions = useMemo(
    () =>
      allRows.filter((row) => {
        const resolved = (edits[row.id] ?? row.suggestedPath ?? "").trim();
        return !resolved && Boolean(row.options?.length);
      }),
    [allRows, edits],
  );

  const canApply =
    allRows.length === 0 ||
    (allRows.every((row) =>
      Boolean((edits[row.id] ?? row.suggestedPath)?.trim()),
    ) &&
      !hasConflicts);

  const handleApplyTopSuggestions = () => {
    if (unresolvedRowsWithSuggestions.length === 0) {
      return;
    }
    setEdits((current) => {
      const next = { ...current };
      unresolvedRowsWithSuggestions.forEach((row) => {
        const bestPath = row.options?.[0]?.path;
        if (bestPath) {
          next[row.id] = bestPath;
        }
      });
      return next;
    });
  };

  const handleResetMappings = () => {
    const next: Record<string, string> = {};
    allRows.forEach((row) => {
      if (row.suggestedPath) {
        next[row.id] = row.suggestedPath;
      }
    });
    setEdits(next);
  };

  const confidenceLabel = (confidence?: PoseRemapConfidence) => {
    if (!confidence) {
      return null;
    }
    switch (confidence) {
      case "high":
        return "High confidence";
      case "medium":
        return "Medium confidence";
      default:
        return "Low confidence";
    }
  };

  return (
    <Modal
      open={true}
      onClose={onCancel}
      title="Pose Graph Import"
      maxWidth="4xl"
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10 text-blue-400">
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2v20M2 12h20" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight">
                Remap Pose Outputs
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                {allRows.length} output{allRows.length === 1 ? "" : "s"} ready
                for inspection and retargeting
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-8 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <section className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Chip tone="success">Mapped {summary.mapped}</Chip>
              <Chip tone={summary.unmapped > 0 ? "warning" : "muted"}>
                Unmapped {summary.unmapped}
              </Chip>
              <Chip tone={summary.conflicts > 0 ? "danger" : "muted"}>
                Conflicts {summary.conflicts}
              </Chip>
              <Chip tone="info">Auto {summary.auto}</Chip>
              <Chip tone="default">Review {summary.review}</Chip>
              <Chip tone="success">High {summary.high}</Chip>
              <Chip tone="info">Medium {summary.medium}</Chip>
              <Chip tone={summary.low > 0 ? "warning" : "muted"}>
                Low {summary.low}
              </Chip>
              <Chip tone={summary.needsAttention > 0 ? "warning" : "muted"}>
                Needs attention {summary.needsAttention}
              </Chip>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn(
                  "h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-colors",
                  filterMode === "all"
                    ? "bg-blue-500/20 border-blue-500/40 text-blue-200"
                    : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20",
                )}
                onClick={() => setFilterMode("all")}
              >
                All
              </button>
              <button
                type="button"
                className={cn(
                  "h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-colors",
                  filterMode === "attention"
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
                    : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20",
                )}
                onClick={() => setFilterMode("attention")}
              >
                Needs attention
              </button>
              <button
                type="button"
                className={cn(
                  "h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-colors",
                  filterMode === "conflicts"
                    ? "bg-red-500/20 border-red-500/40 text-red-200"
                    : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20",
                )}
                onClick={() => setFilterMode("conflicts")}
              >
                Conflicts
              </button>
              <button
                type="button"
                className={cn(
                  "h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-colors",
                  filterMode === "low-confidence"
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
                    : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20",
                )}
                onClick={() => setFilterMode("low-confidence")}
              >
                Low confidence
              </button>
              <input
                className="ml-auto h-8 min-w-[180px] bg-slate-900 border border-white/10 rounded-lg px-3 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500/50"
                placeholder="Search pose, variable, or path"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-[10px] px-3"
                disabled={unresolvedRowsWithSuggestions.length === 0}
                onClick={handleApplyTopSuggestions}
              >
                Fill unmapped from top suggestions (
                {unresolvedRowsWithSuggestions.length})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] px-3"
                onClick={handleResetMappings}
              >
                Reset edited mappings
              </Button>
              <span className="text-[10px] text-slate-500">
                Showing {filteredRows.length} of {allRows.length}
              </span>
            </div>
          </section>

          {hasConflicts && (
            <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-200">
              <div className="font-semibold uppercase tracking-wide text-[10px] mb-1">
                Resolve Mapping Conflicts
              </div>
              <div className="space-y-1">
                {conflictMessages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-200">
                  Pose outputs
                </h2>
                {filteredRows.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                    {filteredRows.length}
                  </span>
                )}
              </div>
            </div>

            {allRows.length > 0 ? (
              filteredRows.length > 0 ? (
                <div className="space-y-3">
                  {filteredRows.map((row) => (
                    <article
                      key={row.id}
                      className={cn(
                        "bg-slate-950 rounded-2xl border p-5 space-y-4 transition-all",
                        row.needsReview || conflictRowIds.has(row.id)
                          ? "border-amber-500/30 bg-amber-500/[0.02]"
                          : "border-white/5",
                      )}
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-200">
                            Pose {row.poseSlug ?? row.id}
                          </p>
                          {row.confidence && (
                            <span
                              className={cn(
                                "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                                row.confidence === "high" &&
                                  "bg-emerald-500/20 text-emerald-300",
                                row.confidence === "medium" &&
                                  "bg-sky-500/20 text-sky-300",
                                row.confidence === "low" &&
                                  "bg-amber-500/20 text-amber-300",
                              )}
                            >
                              {confidenceLabel(row.confidence)}
                            </span>
                          )}
                          <p className="text-[10px] text-slate-400 font-mono">
                            Variable:{" "}
                            {row.currentInputId ?? row.poseSlug ?? "(unknown)"}
                          </p>
                          <code className="text-[11px] text-slate-500 font-mono">
                            {row.originalPath ?? "(missing path)"}
                          </code>
                          {row.reason && (
                            <p className="text-[10px] text-amber-400/80 font-medium">
                              {row.reason}
                            </p>
                          )}
                          {row.rationale && row.rationale.length > 0 && (
                            <p className="text-[10px] text-slate-500">
                              {row.rationale.join(" · ")}
                            </p>
                          )}
                          {conflictRowIds.has(row.id) && (
                            <p className="text-[10px] text-amber-300 font-medium">
                              This mapping conflicts with another output.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Map to standard input
                        </div>
                        <div className="flex gap-2">
                          <input
                            id={`pose-remap-${row.id}`}
                            className="flex-1 h-10 bg-slate-900 border border-white/10 rounded-xl px-4 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                            list="pose-remap-options"
                            placeholder="/standard/face/..."
                            value={edits[row.id] ?? ""}
                            onChange={(event) =>
                              setEdits((current) => ({
                                ...current,
                                [row.id]: event.target.value,
                              }))
                            }
                          />
                        </div>

                        {row.options && row.options.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            <span className="w-full text-[9px] font-black uppercase tracking-widest text-slate-700 mb-1">
                              Suggestions
                            </span>
                            {row.options.map((option) => (
                              <button
                                key={`${row.id}-${option.path}`}
                                type="button"
                                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-[11px] font-bold text-slate-400 hover:text-slate-200 flex items-center gap-2"
                                onClick={() =>
                                  setEdits((current) => ({
                                    ...current,
                                    [row.id]: option.path,
                                  }))
                                }
                              >
                                {option.label ?? option.path}
                                <span
                                  className={cn(
                                    "text-[9px] font-black px-1.5 py-0.5 rounded",
                                    option.confidence === "high" &&
                                      "text-emerald-300 bg-emerald-500/20",
                                    option.confidence === "medium" &&
                                      "text-sky-300 bg-sky-500/20",
                                    option.confidence === "low" &&
                                      "text-amber-300 bg-amber-500/20",
                                  )}
                                >
                                  {(option.score * 100).toFixed(0)}%
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="h-32 flex flex-col items-center justify-center bg-slate-950/50 rounded-2xl border border-white/5 border-dashed gap-2">
                  <p className="text-xs text-slate-400 font-medium">
                    No rows match the current filters.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[11px] px-3"
                    onClick={() => {
                      setFilterMode("all");
                      setQuery("");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              )
            ) : (
              <div className="h-48 flex flex-col items-center justify-center bg-slate-950/50 rounded-2xl border border-white/5 border-dashed gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-green-500/10 text-green-400">
                  <svg
                    className="w-6 h-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  All outputs matched automatically. Review and finish.
                </p>
              </div>
            )}
          </section>
        </div>

        <datalist id="pose-remap-options">
          {standardOptions.map((option) => (
            <option key={option.id} value={option.path} label={option.label} />
          ))}
        </datalist>

        <footer className="flex justify-between items-center pt-6 border-t border-white/5 mt-4">
          <Button
            variant="ghost"
            className="text-slate-500 hover:text-slate-300"
            onClick={onCancel}
          >
            Cancel import
          </Button>
          <Button
            variant="primary"
            className="h-10 px-8 font-bold text-xs"
            disabled={!canApply}
            onClick={() => {
              const nextRows = allRows.map((row) => ({
                ...row,
                suggestedPath:
                  edits[row.id]?.trim() || row.suggestedPath || null,
              }));
              void onApply(nextRows);
            }}
          >
            {allRows.length === 0 ? "Finish import" : "Apply mappings & finish"}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
