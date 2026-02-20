import { useCallback } from "react";
import type { ChangeEvent } from "react";
import { Button, Input, ListRow, Chip } from "../../ui";
import type { IssueEntry } from "./types";

interface IssueListPanelProps {
  entries: IssueEntry[];
  totalTargets: number;
  totalIssues: number;
  filter: string;
  onFilterChange: (value: string) => void;
  onReveal: (targetId: string) => void;
}

export function IssueListPanel({
  entries,
  totalTargets,
  totalIssues,
  filter,
  onFilterChange,
  onReveal,
}: IssueListPanelProps) {
  const handleFilterChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onFilterChange(event.target.value);
    },
    [onFilterChange],
  );

  return (
    <div className="bg-bg-secondary/40 border border-border-default rounded-xl p-5 flex flex-col gap-6">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
            Filter binding issues
          </span>
          <Input
            value={filter}
            onChange={handleFilterChange}
            placeholder="Search by id or message"
            className="h-9"
          />
        </div>
        <span className="text-[10px] font-bold text-text-muted mb-2">
          Showing {entries.length} of {totalTargets} targets ({totalIssues}{" "}
          issues)
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-center py-12 text-text-muted text-sm italic bg-bg-secondary/20 rounded-lg border border-dashed border-border-default">
          No bindings match the current filter.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <ListRow
              key={entry.targetId}
              title={entry.label}
              description={
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <code className="text-[10px] bg-bg-panel/60 px-1.5 py-0.5 rounded border border-border-default text-accent font-mono">
                    {entry.targetId}
                  </code>
                  {entry.rootKey ? (
                    <span className="text-[10px] text-text-muted font-medium tracking-tight">
                      · {entry.rootKey}
                    </span>
                  ) : null}
                </div>
              }
              meta={
                entry.isStandardInput ? (
                  <Chip tone="info">Standard</Chip>
                ) : (
                  <Chip tone="muted">Non-standard</Chip>
                )
              }
              actions={
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => onReveal(entry.targetId)}
                  disabled={!entry.isStandardInput}
                  className="h-7 text-[10px] px-3 font-bold"
                  title={
                    entry.isStandardInput
                      ? "Reveal this input card"
                      : "Issue targets a non-standard binding"
                  }
                >
                  Reveal
                </Button>
              }
            >
              <ul className="mt-2 space-y-1.5 list-none">
                {entry.issues.map((issue, index) => (
                  <li
                    key={`${entry.targetId}-${index}`}
                    className="text-[11px] text-text-secondary flex gap-2"
                  >
                    <span className="text-red-500 shrink-0 mt-0.5">●</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </ListRow>
          ))}
        </div>
      )}
    </div>
  );
}
