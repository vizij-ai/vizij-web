import { useCallback, useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { downloadBlob } from "../../utils/download";
import { alertDialog } from "../../utils/dialogs";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui";
import { cn } from "../../utils/cn";
import { IrInspectorDrawer } from "./graphDiagnostics/IrInspectorDrawer";
import { IssueListPanel } from "./graphDiagnostics/IssueListPanel";
import { useGraphDiagnosticsIssues } from "./graphDiagnostics/useGraphDiagnosticsIssues";

const REVEAL_EVENT = "vizij-authoring:reveal-binding-target";

export function GraphDiagnosticsPanel() {
  const faceId = useGraphRuntime((state) => state.faceId);
  const graphInsights = useGraphRuntime((state) => state.graphInsights);
  const graphReport = useGraphRuntime((state) => state.graphMachineReport);
  const getGraphIr = useGraphRuntime((state) => state.getGraphIr);
  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const {
    issuePanelOpen,
    setIssuePanelOpen,
    issueFilter,
    setIssueFilter,
    issueEntries,
    filteredIssueEntries,
    totalIssueCount,
    issueToggleLabel,
  } = useGraphDiagnosticsIssues({
    graphInsights,
    managedStandardInputs,
  });

  useEffect(() => {
    if (!graphReport) {
      setInspectorOpen(false);
    }
  }, [graphReport]);

  const handleDownloadIr = useCallback(() => {
    const graph = getGraphIr();
    if (!graph) {
      alertDialog("No IR graph is ready yet. Build the graph first.");
      return;
    }
    const safeFaceId =
      faceId && faceId.trim().length > 0 ? faceId.trim() : "vizij";
    const fileName = `${safeFaceId}_rig.ir.json`;
    const blob = new Blob([JSON.stringify(graph, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, fileName);
  }, [faceId, getGraphIr]);

  const handleDownloadMachineReport = useCallback(() => {
    if (!graphReport) {
      alertDialog("No machine report is ready yet. Build the graph first.");
      return;
    }
    const safeFaceId =
      faceId && faceId.trim().length > 0 ? faceId.trim() : "vizij";
    const blob = new Blob([JSON.stringify(graphReport, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, `${safeFaceId}_machine-report.json`);
  }, [faceId, graphReport]);

  const handleRevealIssueTarget = useCallback((targetId: string) => {
    window.dispatchEvent(
      new CustomEvent(REVEAL_EVENT, { detail: { targetId } }),
    );
  }, []);

  return (
    <Card className="bg-bg-panel border border-border-default shadow-md">
      <CardHeader className="flex flex-row items-start justify-between pb-4 border-b border-border-default">
        <div className="space-y-1">
          <CardTitle className="text-sm font-bold text-text-primary">
            Graph Diagnostics
          </CardTitle>
          <CardDescription className="text-xs text-text-muted">
            Analyze compiled graph status and debug configuration issues.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownloadIr}
            title="Download IR Graph"
          >
            <Download className="h-4 w-4 text-text-muted" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setInspectorOpen((prev) => !prev)}
            disabled={!graphReport}
            title="Open Inspector"
            className={cn(inspectorOpen && "bg-accent-subtle text-accent")}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardBody className="pt-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadMachineReport}
            disabled={!graphReport}
            className="flex-1"
          >
            Download Report
          </Button>
        </div>

        {issueEntries.length > 0 ? (
          <div className="flex items-center justify-between gap-4 p-4 bg-bg-secondary/40 border border-border-subtle rounded-xl">
            <div className="text-sm text-text-secondary">
              <strong className="text-accent">{totalIssueCount}</strong> issue
              {totalIssueCount === 1 ? "" : "s"} across {issueEntries.length}{" "}
              binding{issueEntries.length === 1 ? "" : "s"}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIssuePanelOpen((previous) => !previous)}
              className={cn(
                "h-8 text-xs font-bold uppercase tracking-wider",
                issuePanelOpen && "text-accent",
              )}
            >
              {issueToggleLabel}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-text-muted italic px-4">
            Build the rig to capture a machine report and populate diagnostics.
          </p>
        )}

        {issuePanelOpen && issueEntries.length > 0 ? (
          <IssueListPanel
            entries={filteredIssueEntries}
            totalTargets={issueEntries.length}
            totalIssues={totalIssueCount}
            filter={issueFilter}
            onFilterChange={setIssueFilter}
            onReveal={handleRevealIssueTarget}
          />
        ) : null}
      </CardBody>

      <IrInspectorDrawer
        open={inspectorOpen}
        report={graphReport}
        onClose={() => setInspectorOpen(false)}
        onDownloadIr={handleDownloadIr}
        onDownloadReport={handleDownloadMachineReport}
      />
    </Card>
  );
}

export { REVEAL_EVENT };
export type { IssueEntry } from "./graphDiagnostics/types";
