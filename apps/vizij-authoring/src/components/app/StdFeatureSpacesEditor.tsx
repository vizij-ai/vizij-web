import { useCallback, useState } from "react";
import { AssetLoaderPanel } from "./AssetLoaderPanel";
import { SidebarSection } from "../common/SidebarSection";
import { Tabs } from "../ui";
import { StdFeatureSpacesControls } from "./StdFeatureSpacesControls";
import { StdFeatureSpacesChannelsPanel } from "./StdFeatureSpacesChannelsPanel";
import {
  useAuthoringUiActions,
  useAuthoringUiState,
} from "../../state/AuthoringUiProvider";

type StdFeatureSpacesTab = "setup" | "channels" | "mapping";

const TAB_ITEMS = [
  { id: "setup", label: "Setup" },
  { id: "channels", label: "Channels" },
  { id: "mapping", label: "Mapping" },
] as const;

interface StdFeatureSpacesEditorProps {
  onSelectFile: (file: File) => void;
}

export function StdFeatureSpacesEditor({
  onSelectFile,
}: StdFeatureSpacesEditorProps) {
  const [activeTab, setActiveTab] = useState<StdFeatureSpacesTab>("setup");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectFile = useCallback(
    (file: File) => {
      setIsLoading(true);
      setError(null);
      try {
        onSelectFile(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [onSelectFile],
  );

  const handleClearError = useCallback(() => setError(null), []);

  const renderTabPanel = (tabId: string) => {
    switch (tabId) {
      case "setup":
        return (
          <SetupTabContent
            isLoading={isLoading}
            error={error}
            onSelectFile={handleSelectFile}
            onClearError={handleClearError}
          />
        );
      case "channels":
        return <StdFeatureSpacesChannelsPanel />;
      case "mapping":
        return <StdFeatureSpacesControls />;
      default:
        return null;
    }
  };

  return (
    <Tabs
      items={TAB_ITEMS}
      value={activeTab}
      onValueChange={(id) => setActiveTab(id as StdFeatureSpacesTab)}
      renderPanel={renderTabPanel}
      size="sm"
      variant="pill"
    />
  );
}

interface SetupTabContentProps {
  isLoading: boolean;
  error: string | null;
  onSelectFile: (file: File) => void;
  onClearError: () => void;
}

function SetupTabContent({
  isLoading,
  error,
  onSelectFile,
  onClearError,
}: SetupTabContentProps) {
  const uiState = useAuthoringUiState();
  const uiActions = useAuthoringUiActions();
  return (
    <div className="workbench-panel__scroll">
      <SidebarSection
        title="Load reference face"
        description="Load a GLB with a Vizij bundle containing a face rigged to the Standard Feature Space to use as reference."
        instructions={{
          label: "Reference GLB loader",
          summary: "Load a GLB with a Vizij bundle containing a face rigged to a Standard Feature Space",
          size: "compact",
          content: (
            <ol>
              <li>
                Click "Choose File" to load a GLB file from your computer.
              </li>
              <li>
                The loader will displayed the loaded reference face side by side to your own loaded model.
              </li>
            </ol>
          ),
        }}
      >
        <div className="sidebar__stack">
          <AssetLoaderPanel
            isLoading={isLoading}
            error={error}
            onSelectFile={onSelectFile}
            onClearError={onClearError}
            skipDiscrepancyCheck={uiState.skipDiscrepancyCheck}
            onSkipDiscrepancyCheckChange={uiActions.setSkipDiscrepancyCheck}
          />
        </div>
      </SidebarSection>

      <SidebarSection
        title="Exporting (Soon)"
        description="Save your Standard Feature Spaces configuration for reuse in other projects."
        instructions={{
          label: "Work in Progress",
          summary: "Exporting feature space configurations is coming soon",
          size: "compact",
          content: (
            <ul>
              <li>
                Currently Standard Feature Spaces configurations are exported as part of the main Vizij bundle export.
              </li>
              <li>
                Please use the main Import / Export tool to save your feature space configuration to a Vizij bundle.
              </li>
            </ul>
          ),
        }}
      >
        <div className="sidebar__stack">
        </div>
      </SidebarSection>
    </div>
  );
}
