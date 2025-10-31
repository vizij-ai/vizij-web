import { useState } from "react";
import { AssetLoaderPanel } from "./AssetLoaderPanel";
import { GraphImportPanel } from "./GraphImportPanel";
import { PoseRigImportPanel, PoseRigExportPanel } from "./PoseRigPanels";
import { ExportPanel } from "./ExportPanel";
import { RigGraphExportPanel } from "./RigGraphExportPanel";
import {
  VizijBundleSummaryPanel,
  type VizijBundleSummary,
} from "./VizijBundleSummaryPanel";

interface ImportExportWorkbenchProps {
  isLoading: boolean;
  error: string | null;
  onSelectFile: (file: File) => void | Promise<void>;
  onClearError: () => void;
  onImportGraph: (file: File) => Promise<void> | void;
  canImportGraph: boolean;
  onImportPoseConfig: (file: File) => Promise<void>;
  poseConfigWarnings: readonly string[];
  poseRigReady: boolean;
  graphFileName: string;
  onGraphFileNameChange: (value: string) => void;
  exportFileName: string;
  onExportFileNameChange: (value: string) => void;
  canExport: boolean;
  onExportGraph: () => void;
  onExportGlb: () => void | Promise<void>;
  rigName: string;
  onRigNameChange: (value: string) => void;
  poseGraphFileName: string;
  onPoseGraphFileNameChange: (value: string) => void;
  poseConfigFileName: string;
  onPoseConfigFileNameChange: (value: string) => void;
  onExportPoseGraph: () => void;
  onExportPoseConfig: () => void;
  bundleSummary: VizijBundleSummary;
  includeBundle: boolean;
  onIncludeBundleChange: (value: boolean) => void;
  includeAnimations: boolean;
  onIncludeAnimationsChange: (value: boolean) => void;
}

export function ImportExportWorkbench({
  isLoading,
  error,
  onSelectFile,
  onClearError,
  onImportGraph,
  canImportGraph,
  onImportPoseConfig,
  poseConfigWarnings,
  poseRigReady,
  graphFileName,
  onGraphFileNameChange,
  exportFileName,
  onExportFileNameChange,
  canExport,
  onExportGraph,
  onExportGlb,
  rigName,
  onRigNameChange,
  poseGraphFileName,
  onPoseGraphFileNameChange,
  poseConfigFileName,
  onPoseConfigFileNameChange,
  onExportPoseGraph,
  onExportPoseConfig,
  bundleSummary,
  includeBundle,
  onIncludeBundleChange,
  includeAnimations,
  onIncludeAnimationsChange,
}: ImportExportWorkbenchProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <div className="workbench-panel__scroll">
      <section className="sidebar__section">
        <header className="sidebar__section-header">
          <h2 className="sidebar__section-title">GLB Workflow</h2>
          <p className="sidebar__section-description">
            Load a Vizij GLB, make adjustments, then export it back out.
          </p>
        </header>
        <div className="sidebar__stack">
          <AssetLoaderPanel
            isLoading={isLoading}
            error={error}
            onSelectFile={onSelectFile}
            onClearError={onClearError}
          />

          <VizijBundleSummaryPanel summary={bundleSummary} />
        </div>
      </section>

      <section className="sidebar__section">
        <header className="sidebar__section-header">
          <h2 className="sidebar__section-title">Exporting</h2>
          <p className="sidebar__section-description">
            Package Vizij outputs for tooling or runtime hand-off.
          </p>
        </header>
        <div className="sidebar__stack">
          <ExportPanel
            exportFileName={exportFileName}
            onExportFileNameChange={onExportFileNameChange}
            canExport={canExport}
            onExportGlb={() => {
              void onExportGlb();
            }}
            animationCount={bundleSummary.animationCount}
            includeBundle={includeBundle}
            onIncludeBundleChange={onIncludeBundleChange}
            includeAnimations={includeAnimations}
            onIncludeAnimationsChange={onIncludeAnimationsChange}
          />
        </div>
      </section>

      <section className="sidebar__section">
        <header className="sidebar__section-header">
          <h2 className="sidebar__section-title">Optional Imports & Exports</h2>
          <p className="sidebar__section-description">
            Access legacy rig graph files and pose rig configs when you need
            them.
          </p>
        </header>
        <div className="sidebar__stack">
          <div className="asset-card">
            <div className="asset-card__body asset-card__body--compact">
              <button
                type="button"
                className="button subtle"
                onClick={() => setIsAdvancedOpen((current) => !current)}
                aria-expanded={isAdvancedOpen}
                aria-controls="vizij-advanced-import-export"
              >
                {isAdvancedOpen
                  ? "Hide optional imports & exports"
                  : "Show optional imports & exports"}
              </button>
              <p className="asset-card__hint asset-card__hint--muted">
                Legacy rig graph and pose rig files remain available when
                required.
              </p>
            </div>
          </div>

          {isAdvancedOpen ? (
            <div
              id="vizij-advanced-import-export"
              className="sidebar__stack"
              style={{ marginTop: "0.75rem" }}
            >
              <GraphImportPanel
                onSelectGraphFile={(file) => {
                  void onImportGraph(file);
                }}
                disabled={!canImportGraph}
              />

              <RigGraphExportPanel
                graphFileName={graphFileName}
                onGraphFileNameChange={onGraphFileNameChange}
                canExport={canExport}
                onExportGraph={onExportGraph}
              />

              <PoseRigImportPanel
                onImportPoseConfig={onImportPoseConfig}
                poseConfigWarnings={poseConfigWarnings}
                disabled={!poseRigReady}
              />

              <PoseRigExportPanel
                rigName={rigName}
                onRigNameChange={onRigNameChange}
                poseGraphFileName={poseGraphFileName}
                onPoseGraphFileNameChange={onPoseGraphFileNameChange}
                poseConfigFileName={poseConfigFileName}
                onPoseConfigFileNameChange={onPoseConfigFileNameChange}
                onExportPoseGraph={onExportPoseGraph}
                onExportPoseConfig={onExportPoseConfig}
                disabled={!poseRigReady}
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
