import { useEffect, useMemo, useState } from "react";
import type { ManagedStandardInput } from "../../../types/standardInputs";
import type { PersistedGraphInsight } from "../../../rig/persistence";
import type { IssueEntry } from "./types";

interface UseGraphDiagnosticsIssuesArgs {
  graphInsights: PersistedGraphInsight | null;
  managedStandardInputs: ManagedStandardInput[];
}

export function useGraphDiagnosticsIssues({
  graphInsights,
  managedStandardInputs,
}: UseGraphDiagnosticsIssuesArgs) {
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [issueFilter, setIssueFilter] = useState("");

  const entriesById = useMemo(
    () =>
      new Map(managedStandardInputs.map((entry) => [entry.input.id, entry])),
    [managedStandardInputs],
  );

  const issueEntries = useMemo<IssueEntry[]>(() => {
    if (!graphInsights) {
      return [];
    }
    const byTarget = graphInsights.issues?.byTarget ?? {};
    return Object.entries(byTarget)
      .map(([targetId, rawMessages]) => {
        const messages = rawMessages.filter(
          (message) => typeof message === "string" && message.trim().length > 0,
        );
        const entry = entriesById.get(targetId);
        const standardInput = entry?.input ?? null;
        return {
          targetId,
          label:
            standardInput?.path ??
            standardInput?.label ??
            entry?.input.label ??
            targetId,
          issues:
            messages.length > 0 ? messages : ["Unknown issue reported in IR"],
          isStandardInput: Boolean(standardInput),
          rootKey: entry?.metadata?.root ?? entry?.input.group ?? null,
        };
      })
      .sort((a, b) => {
        if (b.issues.length !== a.issues.length) {
          return b.issues.length - a.issues.length;
        }
        return a.label.localeCompare(b.label);
      });
  }, [entriesById, graphInsights]);

  const totalIssueCount = useMemo(
    () => issueEntries.reduce((sum, entry) => sum + entry.issues.length, 0),
    [issueEntries],
  );

  const filteredIssueEntries = useMemo(() => {
    const token = issueFilter.trim().toLowerCase();
    if (!token) {
      return issueEntries;
    }
    return issueEntries.filter((entry) => {
      if (entry.label.toLowerCase().includes(token)) {
        return true;
      }
      if (entry.targetId.toLowerCase().includes(token)) {
        return true;
      }
      return entry.issues.some((issue) => issue.toLowerCase().includes(token));
    });
  }, [issueEntries, issueFilter]);

  const issueToggleLabel = issuePanelOpen
    ? "Hide binding issues"
    : `Show binding issues (${issueEntries.length})`;

  useEffect(() => {
    if (issueEntries.length === 0) {
      setIssuePanelOpen(false);
      if (issueFilter) {
        setIssueFilter("");
      }
    }
  }, [issueEntries.length, issueFilter]);

  return {
    issuePanelOpen,
    setIssuePanelOpen,
    issueFilter,
    setIssueFilter,
    issueEntries,
    filteredIssueEntries,
    totalIssueCount,
    issueToggleLabel,
  };
}
