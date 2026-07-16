import { useCallback, useState } from "react";
import { SidebarSection } from "../common/SidebarSection";
import { Tabs } from "../ui";
import {
  useAuthoringUiActions,
  useAuthoringUiState,
} from "../../state/AuthoringUiProvider";
import { AssetLoaderPanel } from "./AssetLoaderPanel";
import { StdFeatureSpacesControls } from "./StdFeatureSpacesControls";
import { StdFeatureSpacesChannelsPanel } from "./StdFeatureSpacesChannelsPanel";

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
        title="Load comparison face"
        description="Load a GLB with a Face Package containing a face rigged to the Standard Controls to use for comparison."
        instructions={{
          label: "Comparison GLB loader",
          summary:
            "Load a GLB with a Face Package containing a face rigged to Standard Controls",
          size: "compact",
          content: (
            <ol>
              <li>
                Click "Choose File" to load a GLB file from your computer.
              </li>
              <li>
                The loader will displayed the loaded comparison face side by
                side to your own loaded model.
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
        description="Save your Standard Controls configuration for reuse in other projects."
        instructions={{
          label: "Work in Progress",
          summary: "Exporting standard controls configurations is coming soon",
          size: "compact",
          content: (
            <ul>
              <li>
                Currently Standard Controls configurations are exported as part
                of the main Face Package export.
              </li>
              <li>
                Please use the main Import / Export tool to save your standard
                controls configuration to a Face Package.
              </li>
            </ul>
          ),
        }}
      >
        <div className="sidebar__stack"></div>
      </SidebarSection>
    </div>
  );
}
