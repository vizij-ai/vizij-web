import React from "react";
import { DiscrepancyWizard } from "../discrepancy/DiscrepancyWizard";
import { PoseGraphRemapWizard } from "../poseRig/PoseGraphRemapWizard";
import { useGraphRuntime } from "../../state/RigControllerProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import type { AnimationClipIR } from "../../types/animationClipIr";
import { ExportDialog } from "./ExportDialog";

interface AuthoredMotionGraphExportEntry {
  id: string;
  label: string;
  spec: { nodes: unknown[]; edges: unknown[] };
}

interface AppWizardsProps {
  showExportDialog: boolean;
  onCloseExportDialog: () => void;
  rootId: string | null;
  exportSceneRoot: unknown;
  runtimeExportBodies?: {
    rootFilteredBodies: unknown[];
    anyBodies: unknown[];
    runtimeRootId: string | null;
  };
  sourceName: string | null;
  loadedBundle: any;
  authoredAnimationClips: AnimationClipIR[];
  authoredProceduralPrograms: AuthoredMotionGraphExportEntry[];
  canExport: boolean;
  handleImportPoseGraphFile: (file: File) => Promise<void>;
  poseGraphRemap: any;
  handlePoseGraphRemapApply: (remappedGraph: any) => void;
  handlePoseGraphRemapCancel: () => void;
  onExportGlbComplete?: () => void;
  registerGlbExportHandler?: (handler: (() => Promise<void>) | null) => void;
}

export function AppWizards({
  showExportDialog,
  onCloseExportDialog,
  rootId,
  exportSceneRoot,
  runtimeExportBodies,
  sourceName,
  loadedBundle,
  authoredAnimationClips,
  authoredProceduralPrograms,
  canExport,
  handleImportPoseGraphFile,
  poseGraphRemap,
  handlePoseGraphRemapApply,
  handlePoseGraphRemapCancel,
  onExportGlbComplete,
  registerGlbExportHandler,
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
        rootId={rootId}
        exportSceneRoot={exportSceneRoot}
        runtimeExportBodies={runtimeExportBodies}
        sourceName={sourceName}
        loadedBundle={loadedBundle}
        authoredAnimationClips={authoredAnimationClips}
        authoredProceduralPrograms={authoredProceduralPrograms}
        canExport={canExport}
        onImportPoseGraph={handleImportPoseGraphFile}
        onExportGlbComplete={onExportGlbComplete}
        registerGlbExportHandler={registerGlbExportHandler}
      />
    </>
  );
}
