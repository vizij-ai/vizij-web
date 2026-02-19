import React from "react";
import { DiscrepancyWizard } from "../discrepancy/DiscrepancyWizard";
import {
  PoseGraphRemapWizard,
  type PoseGraphRemapRow,
} from "../poseRig/PoseGraphRemapWizard";
import { useGraphRuntime } from "../../state/RigControllerProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import type { PoseImportResult } from "../../types/importOutcome";
import { ExportDialog } from "./ExportDialog";

interface AppWizardsProps {
  showExportDialog: boolean;
  onCloseExportDialog: () => void;
  rootId: string | null;
  sourceName: string | null;
  loadedBundle: any;
  canExport: boolean;
  handleImportPoseGraphFile: (file: File) => Promise<PoseImportResult>;
  poseGraphRemap: any;
  handlePoseGraphRemapApply: (
    rows: PoseGraphRemapRow[],
  ) => Promise<PoseImportResult>;
  handlePoseGraphRemapCancel: () => void;
}

export function AppWizards({
  showExportDialog,
  onCloseExportDialog,
  rootId,
  sourceName,
  loadedBundle,
  canExport,
  handleImportPoseGraphFile,
  poseGraphRemap,
  handlePoseGraphRemapApply,
  handlePoseGraphRemapCancel,
}: AppWizardsProps) {
  const discrepancyReview = useGraphRuntime((state) => state.discrepancyReview);
  const resolveDiscrepancyReview = useGraphRuntime(
    (state) => state.resolveDiscrepancyReview,
  );
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);

  return (
    <>
      {discrepancyReview ? (
        <DiscrepancyWizard
          key={discrepancyReview.id}
          state={discrepancyReview}
          onResolve={resolveDiscrepancyReview}
        />
      ) : null}

      {poseGraphRemap ? (
        <PoseGraphRemapWizard
          autoRows={poseGraphRemap.autoRows}
          rows={poseGraphRemap.reviewRows}
          standardInputs={standardInputs}
          onApply={handlePoseGraphRemapApply}
          onCancel={handlePoseGraphRemapCancel}
        />
      ) : null}

      <ExportDialog
        open={showExportDialog}
        onClose={onCloseExportDialog}
        rootId={rootId ?? ""}
        sourceName={sourceName ?? ""}
        loadedBundle={loadedBundle}
        canExport={canExport}
        onImportPoseGraph={handleImportPoseGraphFile}
      />
    </>
  );
}
