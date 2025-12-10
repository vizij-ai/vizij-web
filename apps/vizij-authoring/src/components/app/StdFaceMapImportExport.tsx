import { useCallback, useState, useMemo } from "react";
import { AssetLoaderPanel } from "./AssetLoaderPanel";
import { SidebarSection } from "../common/SidebarSection";
import { Tabs, RowSlider } from "../ui";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { STANDARD_RIG_INPUTS, type StandardRigInput } from "@vizij/utils";

type StdFaceMapTab = "setup" | "mapping";

const TAB_ITEMS = [
  { id: "setup", label: "Setup" },
  { id: "mapping", label: "Mapping" },
] as const;

interface StdFaceMapImportExportProps {
  onSelectFile: (file: File) => void;
}

export function StdFaceMapImportExport({
  onSelectFile,
}: StdFaceMapImportExportProps) {
  const [activeTab, setActiveTab] = useState<StdFaceMapTab>("setup");
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
      case "mapping":
        return <MappingTabContent />;
      default:
        return null;
    }
  };

  return (
    <Tabs
      items={TAB_ITEMS}
      value={activeTab}
      onValueChange={(id) => setActiveTab(id as StdFaceMapTab)}
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
  return (
    <div className="workbench-panel__scroll">
      <SidebarSection
        title="Load reference Standard face"
        description="Load a GLB with a Vizij bundle containing a Standard face to use as reference."
        instructions={{
          label: "Reference GLB loader",
          summary: "Load a GLB with a Vizij bundle containing a Standard face",
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
          />
        </div>
      </SidebarSection>

      <SidebarSection
        title="Exporting (Soon)"
        description="Save your Standard face mapping for reuse in other projects."
        instructions={{
          label: "Work in Progress",
          summary: "Exporting face mappings is coming soon",
          size: "compact",
          content: (
            <ul>
              <li>
                Currently Standard face mapping are exported as part of the main Vizij bundle export.
              </li>
              <li>
                Please use the main Import / Export tool to save your face mapping to a Vizij bundle.
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

function MappingTabContent() {
  const referenceFace = useReferenceFace();

  const groupedInputs = useMemo(() => {
    const groups = new Map<string, StandardRigInput[]>();
    for (const input of STANDARD_RIG_INPUTS) {
      const group = input.group;
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(input);
    }
    return groups;
  }, []);

  const availableInputIds = useMemo(() => {
    return new Set(referenceFace.standardInputs.map((input) => input.id));
  }, [referenceFace.standardInputs]);

  return (
    <div className="workbench-panel__scroll">
      <SidebarSection
        title="Reference Control"
        description="Control the reference face to set target feature values."
      >
        {!referenceFace.isLoaded && !referenceFace.isLoading && (
          <p className="sidebar__placeholder-text">
            Load a reference face in the Setup tab to control it here.
          </p>
        )}
        {referenceFace.isLoading && (
          <p className="sidebar__placeholder-text">Loading reference face...</p>
        )}
        {referenceFace.isLoaded && (
          <div className="sidebar__stack">
            {Array.from(groupedInputs.entries()).map(([group, inputs]) => (
              <ReferenceInputGroup
                key={group}
                group={group}
                inputs={inputs}
                availableInputIds={availableInputIds}
                inputValues={referenceFace.inputValues}
                onInputChange={referenceFace.handleInputValueChange}
              />
            ))}
          </div>
        )}
      </SidebarSection>

      <SidebarSection
        title="Mapping Editor"
        description="Adjust your face to match the reference features."
      >
        <div className="sidebar__stack">
          <p className="sidebar__placeholder-text">
            Mapping controls will appear here.
          </p>
        </div>
      </SidebarSection>
    </div>
  );
}

interface ReferenceInputGroupProps {
  group: string;
  inputs: StandardRigInput[];
  availableInputIds: Set<string>;
  inputValues: Record<string, number>;
  onInputChange: (inputId: string, value: number) => void;
}

function ReferenceInputGroup({
  group,
  inputs,
  availableInputIds,
  inputValues,
  onInputChange,
}: ReferenceInputGroupProps) {
  const formatGroupName = (name: string) => {
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="reference-input-group">
      <h4 className="reference-input-group__title">{formatGroupName(group)}</h4>
      <div className="reference-input-group__inputs">
        {inputs.map((input) => {
          const isAvailable = availableInputIds.has(input.id);
          const value = inputValues[input.id] ?? input.defaultValue;

          if (!isAvailable) {
            return (
              <div key={input.id} className="reference-input-row reference-input-row--missing">
                <span className="reference-input-row__label">{input.label}</span>
                <span className="reference-input-row__missing">Not in rig</span>
              </div>
            );
          }

          return (
            <div key={input.id} className="reference-input-row">
              <RowSlider
                label={input.label}
                value={value}
                min={input.range.min}
                max={input.range.max}
                step={0.01}
                onChange={(newValue) => {
                  onInputChange(input.id, newValue);
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
