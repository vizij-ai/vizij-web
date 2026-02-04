import { useMemo, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { cn } from "../../utils/cn";

export interface PoseGraphRemapOption {
  path: string;
  label: string;
  score: number;
}

export interface PoseGraphRemapRow {
  id: string;
  nodeId: string;
  originalPath: string | null;
  suggestedPath: string | null;
  poseSlug?: string;
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

export function PoseGraphRemapWizard({
  autoRows,
  rows,
  standardInputs,
  onApply,
  onCancel,
}: PoseGraphRemapWizardProps) {
  const [edits, setEdits] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    rows.forEach((row) => {
      if (row.suggestedPath) {
        map[row.id] = row.suggestedPath;
      }
    });
    return map;
  });

  const standardOptions = useMemo(
    () =>
      standardInputs.map((input) => ({
        id: input.id,
        path: input.path,
        label: input.label,
      })),
    [standardInputs],
  );

  const canApply =
    rows.length === 0 ||
    rows.every((row) => Boolean((edits[row.id] ?? row.suggestedPath)?.trim()));

  const orderedAutoRows = useMemo(() => {
    return autoRows.slice().sort((a, b) => {
      const nameA = (a.poseSlug ?? a.id).toLowerCase();
      const nameB = (b.poseSlug ?? b.id).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [autoRows]);

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
                {rows.length} output{rows.length === 1 ? "" : "s"} need a new
                target · {autoRows.length} auto-matched
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-8 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {orderedAutoRows.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-200">
                  Auto-matched outputs
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-bold uppercase tracking-wider">
                  {orderedAutoRows.length}
                </span>
              </div>
              <p className="text-[13px] text-slate-400">
                The following outputs already map to known standard inputs and
                will be applied automatically.
              </p>
              <ul className="grid grid-cols-1 gap-2">
                {orderedAutoRows.map((row) => (
                  <li
                    key={row.id}
                    className="bg-slate-950/50 rounded-xl border border-white/5 p-3 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-200 min-w-[120px]">
                        {row.poseSlug ?? row.id}
                      </span>
                      <svg
                        className="w-4 h-4 text-slate-700"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M5 12h14m-7-7 7 7-7 7" />
                      </svg>
                      <code className="text-[11px] text-blue-400 font-mono">
                        {row.suggestedPath ?? row.originalPath}
                      </code>
                    </div>
                    {row.reason && (
                      <span className="text-[10px] text-slate-500 italic">
                        {row.reason}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-200">
                  Needs review
                </h2>
                {rows.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                    {rows.length}
                  </span>
                )}
              </div>
            </div>

            {rows.length > 0 ? (
              <div className="space-y-3">
                {rows.map((row) => (
                  <article
                    key={row.id}
                    className={cn(
                      "bg-slate-950 rounded-2xl border p-5 space-y-4 transition-all",
                      row.needsReview
                        ? "border-amber-500/30 bg-amber-500/[0.02]"
                        : "border-white/5",
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-200">
                          Pose {row.poseSlug ?? row.id}
                        </p>
                        <code className="text-[11px] text-slate-500 font-mono">
                          {row.originalPath ?? "(missing path)"}
                        </code>
                        {row.reason && (
                          <p className="text-[10px] text-amber-400/80 font-medium">
                            {row.reason}
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
                              <span className="text-[9px] font-black text-blue-500/60 bg-blue-500/10 px-1.5 py-0.5 rounded">
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
              const nextRows = rows.map((row) => ({
                ...row,
                suggestedPath:
                  edits[row.id]?.trim() || row.suggestedPath || null,
              }));
              void onApply(nextRows);
            }}
          >
            {rows.length === 0 ? "Finish import" : "Apply mappings & finish"}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
