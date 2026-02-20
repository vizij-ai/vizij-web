import type { MachineDiffResult } from "@vizij/node-graph-authoring";

interface DiffResultListProps {
  entries: MachineDiffResult["differences"];
  limitReached: boolean;
}

export function DiffResultList({ entries, limitReached }: DiffResultListProps) {
  if (!entries.length) {
    return (
      <p className="text-xs text-text-muted italic mt-2">
        No differences detected.
      </p>
    );
  }

  return (
    <div className="bg-bg-panel border border-border-default rounded-lg p-4 flex flex-col gap-3">
      <p className="text-[11px] font-bold text-text-muted">
        {entries.length} difference{entries.length === 1 ? "" : "s"}
        {limitReached ? " (diff limit reached)" : null}
      </p>
      <ul className="space-y-1.5 list-none">
        {entries.map((entry, index) => (
          <li
            key={`${entry.path}-${index}`}
            className="text-[11px] text-text-secondary flex gap-2 overflow-hidden"
          >
            <code className="text-accent shrink-0">{entry.path}</code>
            <span className="text-text-muted shrink-0">–</span>
            <span className="truncate">
              {entry.kind}
              {entry.kind === "mismatch" && (
                <>
                  : expected {formatDiffValue(entry.expected)}, actual{" "}
                  {formatDiffValue(entry.actual)}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value.length > 60 ? `${value.slice(0, 57)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const asString = JSON.stringify(value);
    return asString.length > 60 ? `${asString.slice(0, 57)}…` : asString;
  } catch {
    return String(value);
  }
}
