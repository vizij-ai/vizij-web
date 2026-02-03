import React from "react";
import { DiscrepancyWizard } from "../discrepancy/DiscrepancyWizard";
import { PoseGraphRemapWizard } from "../poseRig/PoseGraphRemapWizard";
import { ExportDialog } from "./ExportDialog";
import { useGraphRuntime } from "../../state/RigControllerProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";

interface AppWizardsProps {
  showExportDialog: boolean;
  onCloseExportDialog: () => void;
  rootId: string | null;
  sourceName: string | null;
  loadedBundle: any;
  canExport: boolean;
  handleImportPoseGraphFile: (file: File) => Promise<void>;
  poseGraphRemap: any;
  handlePoseGraphRemapApply: (remappedGraph: any) => void;
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
