import { useCallback, useMemo, useState } from "react";
import { SidebarSection } from "../common/SidebarSection";
import { Button, RowSlider } from "../ui";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import type { StandardRigInput } from "@vizij/utils";
import { normalizeStandardRigInputPath } from "@vizij/utils";
import { GroupMappingEditor } from "./StdFaceMappingEditor";

/**
 * Derives the group from a standard input path.
 * For paths like "/standard/left_eye/pos/x", returns "left_eye".
 * For paths like "rig/face_id/standard/left_eye/pos/x", extracts and returns "left_eye".
 */
function deriveGroupFromPath(path: string): string {
  // Extract the /standard/... portion from the path
  const standardMatch = path.match(/\/standard\/([^/]+)/);
  if (standardMatch && standardMatch[1]) {
    return standardMatch[1];
  }
  // Fallback: try normalizing and splitting
  const normalized = normalizeStandardRigInputPath(path);
  const withoutLeading = normalized.startsWith("/") ? normalized.slice(1) : normalized;
  if (!withoutLeading) return "custom";
  const segments = withoutLeading.split("/");
  if (segments[0] === "standard" && segments.length > 1) {
    return segments[1] || "custom";
  }
  return segments[0] || "custom";
}

export function StdFaceMappingControls() {
  const referenceFace = useReferenceFace();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // Get main face data for existence and binding checks
  const mainFaceStandardInputs = useBindingAuthoring(
    (state) => state.standardInputs,
  );
  const mainFaceStandardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  // bindings maps targetId -> AnimatableBinding, where binding.inputId or slot.inputId references a standard input
  const mainFaceBindings = useBindingAuthoring((state) => state.bindings);
  // Check if main face is actually loaded (animatableComponents only populated when a face with geometry is loaded)
  const mainFaceAnimatableComponents = useBindingAuthoring(
    (state) => state.animatableComponents,
  );
  const mainFaceIsLoaded = mainFaceAnimatableComponents.length > 0;

  // Get main face input values and handler
  const mainFaceInputValues = useBindingAuthoring((state) => state.inputValues);
  const mainFaceHandleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );

  // Get binding handlers for the mapping editor - use proper handlers to ensure correct structure
  const handleBindingInputChange = useBindingAuthoring(
    (state) => state.handleBindingInputChange,
  );
  const handleAddBindingSlot = useBindingAuthoring(
    (state) => state.handleAddBindingSlot,
  );
  const handleRemoveBindingSlot = useBindingAuthoring(
    (state) => state.handleRemoveBindingSlot,
  );
  const handleUpdateBindingExpression = useBindingAuthoring(
    (state) => state.handleUpdateBindingExpression,
  );
  const handleUpdateBindingSlotAlias = useBindingAuthoring(
    (state) => state.handleUpdateBindingSlotAlias,
  );
  const handleResetBinding = useBindingAuthoring(
    (state) => state.handleResetBinding,
  );

  // Compute which standard input IDs are used in bindings by checking slot.inputId values
  // This uses the same binding data that the Rigging tab uses - no bundle analysis needed
  const mainFaceInputIdsWithBindings = useMemo(() => {
    const ids = new Set<string>();
    for (const binding of Object.values(mainFaceBindings)) {
      for (const slot of binding.slots ?? []) {
        if (slot.inputId) {
          ids.add(slot.inputId);
        }
      }
    }
    return ids;
  }, [mainFaceBindings]);

  // Build a union of standard inputs from both reference and main face
  // Only include inputs with /standard/ in their path
  const combinedInputsById = useMemo(() => {
    const byId = new Map<string, StandardRigInput>();
    const isStandardInput = (input: StandardRigInput) =>
      input.path.includes("/standard/");

    // Add reference face inputs first (only /standard/ paths)
    for (const input of referenceFace.standardInputs) {
      if (isStandardInput(input)) {
        byId.set(input.id, input);
      }
    }
    // Add main face inputs (only /standard/ paths, won't override if already exists)
    for (const input of mainFaceStandardInputs) {
      if (isStandardInput(input) && !byId.has(input.id)) {
        byId.set(input.id, input);
      }
    }
    return byId;
  }, [referenceFace.standardInputs, mainFaceStandardInputs]);

  // Group standard inputs from the combined set (union of both faces)
  // Derive group from path to ensure consistent grouping regardless of how input was created
  const groupedInputs = useMemo(() => {
    const groups = new Map<string, StandardRigInput[]>();
    for (const input of combinedInputsById.values()) {
      // Derive group from path to ensure correct grouping
      // (main face inputs may have incorrect .group property)
      const group = deriveGroupFromPath(input.path);
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(input);
    }
    // Sort inputs within each group by label
    for (const inputs of groups.values()) {
      inputs.sort((a, b) => a.label.localeCompare(b.label));
    }
    return groups;
  }, [combinedInputsById]);

  const groupNames = useMemo(() => Array.from(groupedInputs.keys()), [groupedInputs]);

  // Default to first group if none selected
  const activeGroup = selectedGroup ?? groupNames[0] ?? null;

  // Use the binding information from the context to determine which inputs have bindings
  // This checks if the input node has outgoing edges in the graph
  const inputIdsWithBindings = referenceFace.inputIdsWithBindings;

  const formatGroupName = (name: string) => {
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Check if at least one face is loaded
  const anyFaceLoaded = referenceFace.isLoaded || mainFaceIsLoaded;
  const anyFaceLoading = referenceFace.isLoading;

  // Handler to reset all control channels to their neutral/default values
  const handleResetPose = useCallback(() => {
    for (const input of combinedInputsById.values()) {
      if (referenceFace.isLoaded && referenceFace.standardInputsById.has(input.id)) {
        referenceFace.handleInputValueChange(input.id, input.defaultValue);
      }
      if (mainFaceIsLoaded && mainFaceStandardInputsById.has(input.id)) {
        mainFaceHandleInputValueChange(input.id, input.defaultValue);
      }
    }
  }, [
    combinedInputsById,
    referenceFace.isLoaded,
    referenceFace.standardInputsById,
    referenceFace.handleInputValueChange,
    mainFaceIsLoaded,
    mainFaceStandardInputsById,
    mainFaceHandleInputValueChange,
  ]);

  return (
    <div className="mapping-controls-layout">
      <div className="mapping-controls-layout__section mapping-controls-layout__section--reference">
        <SidebarSection
          title="Matching Control"
          description="Control both faces simultaneously to compare their features."
        >
          {!anyFaceLoaded && !anyFaceLoading && (
            <p className="sidebar__placeholder-text">
              Load a face to control it here.
            </p>
          )}
          {anyFaceLoading && (
            <p className="sidebar__placeholder-text">Loading face...</p>
          )}
          {anyFaceLoaded && (
            <div className="sidebar__stack">
              <div className="group-selector">
                {groupNames.map((group) => (
                  <button
                    key={group}
                    type="button"
                    className={`group-selector__btn ${activeGroup === group ? "group-selector__btn--active" : ""}`}
                    onClick={() => setSelectedGroup(group)}
                  >
                    {formatGroupName(group)}
                  </button>
                ))}
                <Button variant="secondary" size="sm" onClick={handleResetPose}>
                  Reset Pose
                </Button>
              </div>
              {activeGroup && groupedInputs.has(activeGroup) && (
                <MatchingInputGroup
                  inputs={groupedInputs.get(activeGroup)!}
                  refInputIdsWithBindings={inputIdsWithBindings}
                  refInputsById={referenceFace.standardInputsById}
                  refInputValues={referenceFace.inputValues}
                  onRefInputChange={referenceFace.handleInputValueChange}
                  refIsLoaded={referenceFace.isLoaded}
                  mainInputIdsWithBindings={mainFaceInputIdsWithBindings}
                  mainInputsById={mainFaceStandardInputsById}
                  mainInputValues={mainFaceInputValues}
                  onMainInputChange={mainFaceHandleInputValueChange}
                  mainIsLoaded={mainFaceIsLoaded}
                />
              )}
            </div>
          )}
        </SidebarSection>
      </div>

      <div className="mapping-controls-layout__section mapping-controls-layout__section--mapping">
        <SidebarSection
          title="Mapping Editor"
          description="Configure bindings for your main face's standard inputs."
        >
          {!mainFaceIsLoaded ? (
            <p className="sidebar__placeholder-text">
              Load a main face to begin mapping.
            </p>
          ) : !activeGroup ? (
            <p className="sidebar__placeholder-text">
              Select a group above to see mapping options.
            </p>
          ) : (
            <div className="mapping-controls-layout__scroll">
              <GroupMappingEditor
                key={activeGroup}
                inputs={groupedInputs.get(activeGroup) ?? []}
                mainFaceIsLoaded={mainFaceIsLoaded}
                refIsLoaded={referenceFace.isLoaded}
                mainFaceStandardInputsById={mainFaceStandardInputsById}
                mainFaceInputIdsWithBindings={mainFaceInputIdsWithBindings}
                mainFaceAnimatableComponents={mainFaceAnimatableComponents}
                mainFaceBindings={mainFaceBindings}
                onBindingInputChange={handleBindingInputChange}
                onAddBindingSlot={handleAddBindingSlot}
                onRemoveBindingSlot={handleRemoveBindingSlot}
                onUpdateBindingExpression={handleUpdateBindingExpression}
                onUpdateBindingSlotAlias={handleUpdateBindingSlotAlias}
                onResetBinding={handleResetBinding}
              />
            </div>
          )}
        </SidebarSection>
      </div>
    </div>
  );
}

interface MatchingInputGroupProps {
  inputs: StandardRigInput[];
  // Reference face
  refInputIdsWithBindings: Set<string>;
  refInputsById: Map<string, StandardRigInput>;
  refInputValues: Record<string, number>;
  onRefInputChange: (inputId: string, value: number) => void;
  refIsLoaded: boolean;
  // Main face
  mainInputIdsWithBindings: Set<string>;
  mainInputsById: Map<string, StandardRigInput>;
  mainInputValues: Record<string, number>;
  onMainInputChange: (inputId: string, value: number) => void;
  mainIsLoaded: boolean;
}

function MatchingInputGroup({
  inputs,
  refInputIdsWithBindings,
  refInputsById,
  refInputValues,
  onRefInputChange,
  refIsLoaded,
  mainInputIdsWithBindings,
  mainInputsById,
  mainInputValues,
  onMainInputChange,
  mainIsLoaded,
}: MatchingInputGroupProps) {
  return (
    <div className="reference-input-group">
      <div className="reference-input-group__inputs">
        {inputs.map((input) => {
          // Check which faces have this input
          const existsInRef = refIsLoaded && refInputsById.has(input.id);
          const existsInMain = mainIsLoaded && mainInputsById.has(input.id);

          // Check if either face has a binding for this input
          const hasRefBinding = existsInRef && refInputIdsWithBindings.has(input.id);
          const hasMainBinding = existsInMain && mainInputIdsWithBindings.has(input.id);
          const hasAnyBinding = hasRefBinding || hasMainBinding;

          // Get current value (prefer ref if loaded, else main)
          const value = existsInRef
            ? (refInputValues[input.id] ?? input.defaultValue)
            : (mainInputValues[input.id] ?? input.defaultValue);

          // Handle change - update both faces if they have this input
          const handleChange = (newValue: number) => {
            if (existsInRef) {
              onRefInputChange(input.id, newValue);
            }
            if (existsInMain) {
              onMainInputChange(input.id, newValue);
            }
          };

          // Build indicator showing which faces have this input
          const indicators: string[] = [];
          if (existsInRef) indicators.push(hasRefBinding ? "Ref: bound" : "Ref: unbound");
          if (existsInMain) indicators.push(hasMainBinding ? "Main: bound" : "Main: unbound");
          const indicatorText = indicators.join(" | ");

          // If neither face has a binding, show as no-binding row
          if (!hasAnyBinding) {
            return (
              <div key={input.id} className="reference-input-row reference-input-row--no-binding">
                <span className="reference-input-row__label">{input.label}</span>
                <span className="reference-input-row__status reference-input-row__status--no-binding">
                  <span className="reference-input-row__status-icon">○</span>
                  No binding
                </span>
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
                onChange={handleChange}
              />
              <span className="reference-input-row__indicator" title={indicatorText}>
                {existsInRef && existsInMain ? "⬌" : existsInRef ? "R" : "M"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
