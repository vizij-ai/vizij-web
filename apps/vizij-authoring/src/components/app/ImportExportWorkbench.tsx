import { AssetLoaderPanel } from "./AssetLoaderPanel";
import { GraphImportPanel } from "./GraphImportPanel";
import { PoseRigImportPanel, PoseRigExportPanel } from "./PoseRigPanels";
import { ExportPanel } from "./ExportPanel";

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
}: ImportExportWorkbenchProps) {
  return (
    <div className="workbench-panel__scroll">
      <section className="sidebar__section">
        <header className="sidebar__section-header">
          <h2 className="sidebar__section-title">Importing</h2>
          <p className="sidebar__section-description">
            Bring in geometry, rig graphs, and legacy pose data to continue
            authoring.
          </p>
        </header>
        <div className="sidebar__stack">
          <AssetLoaderPanel
            isLoading={isLoading}
            error={error}
            onSelectFile={onSelectFile}
            onClearError={onClearError}
          />

          <GraphImportPanel
            onSelectGraphFile={(file) => {
              void onImportGraph(file);
            }}
            disabled={!canImportGraph}
          />

          <PoseRigImportPanel
            onImportPoseConfig={onImportPoseConfig}
            poseConfigWarnings={poseConfigWarnings}
            disabled={!poseRigReady}
          />
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
            graphFileName={graphFileName}
            onGraphFileNameChange={onGraphFileNameChange}
            exportFileName={exportFileName}
            onExportFileNameChange={onExportFileNameChange}
            canExport={canExport}
            onExportGraph={onExportGraph}
            onExportGlb={() => {
              void onExportGlb();
            }}
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
      </section>
    </div>
  );
}
