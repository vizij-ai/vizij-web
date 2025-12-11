import { useCallback, useMemo, useRef, useState } from "react";
import { SidebarSection } from "../common/SidebarSection";
import { Button, RowSlider } from "../ui";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import type { AnimatableComponent, StandardRigInput } from "@vizij/utils";
import { normalizeStandardRigInputPath } from "@vizij/utils";
import type { AnimatableBinding } from "@vizij/node-graph-authoring";

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

// ============================================================================
// Group-Centric Mapping Editor
// ============================================================================

interface GroupMappingEditorProps {
  inputs: StandardRigInput[];
  mainFaceIsLoaded: boolean;
  refIsLoaded: boolean;
  mainFaceStandardInputsById: Map<string, StandardRigInput>;
  mainFaceInputIdsWithBindings: Set<string>;
  mainFaceAnimatableComponents: AnimatableComponent[];
  mainFaceBindings: Record<string, AnimatableBinding>;
  // Use proper binding handlers to ensure correct structure for export
  onBindingInputChange: (targetId: string, inputId: string | null, slotId?: string) => void;
  onAddBindingSlot: (targetId: string) => void;
  onRemoveBindingSlot: (targetId: string, slotId: string) => void;
  onUpdateBindingExpression: (targetId: string, expression: string) => void;
  onUpdateBindingSlotAlias: (targetId: string, slotId: string, alias: string) => void;
  onResetBinding: (targetId: string) => void;
}

function GroupMappingEditor({
  inputs,
  refIsLoaded,
  mainFaceStandardInputsById,
  mainFaceInputIdsWithBindings,
  mainFaceAnimatableComponents,
  mainFaceBindings,
  onBindingInputChange,
  onAddBindingSlot,
  onRemoveBindingSlot,
  onUpdateBindingExpression,
  onUpdateBindingSlotAlias,
  onResetBinding,
}: GroupMappingEditorProps) {
  // State for driven tracks (animatable IDs that are driven by this group)
  const [drivenTracks, setDrivenTracks] = useState<string[]>([]);
  // State for the currently selected driven track
  const [selectedDrivenTrack, setSelectedDrivenTrack] = useState<string | null>(null);

  // Remember aliases when slots are disabled, so we can restore them when re-enabled
  // Key: inputId, Value: { alias, slotId } - the alias and slot ID that was used before disabling
  const rememberedAliasesRef = useRef<Map<string, { alias: string; slotId: string }>>(new Map());

  // Get binding for selected driven track - this is the SINGLE SOURCE OF TRUTH for slots/aliases
  const selectedBinding = selectedDrivenTrack ? mainFaceBindings[selectedDrivenTrack] : null;

  // Build a map from semantic inputId (like "l_eye_translation_x") to UUID targetId (like "uuid:x")
  // This lets us resolve slot.inputId to the actual animatable component ID
  // We include both binding.inputId mappings AND component.safeId mappings
  const semanticIdToTargetId = useMemo(() => {
    const map = new Map<string, string>();
    // First add all component safeId -> component.id mappings
    for (const component of mainFaceAnimatableComponents) {
      map.set(component.safeId, component.id);
    }
    // Then overlay binding.inputId mappings (these take precedence if they exist)
    for (const [targetId, binding] of Object.entries(mainFaceBindings)) {
      if (binding.inputId) {
        map.set(binding.inputId, targetId);
      }
    }
    return map;
  }, [mainFaceAnimatableComponents, mainFaceBindings]);

  // Build a map of inputId -> slot from the selected binding
  // KEY POINT: Read actual slot data from the binding, don't make up aliases
  const selectedBindingSlotsByInputId = useMemo(() => {
    const map = new Map<string, { id: string; alias: string }>();
    if (selectedBinding?.slots) {
      for (const slot of selectedBinding.slots) {
        if (slot.inputId) {
          map.set(slot.inputId, { id: slot.id, alias: slot.alias });
        }
      }
    }
    return map;
  }, [selectedBinding]);

  // Helper to find slot by ID
  // Handles the case where slots use semantic IDs (like "l_eye_translation_x")
  // but we're looking up by UUID component IDs (like "f19f2ad3-...:x")
  const getSlotForId = useCallback((id: string) => {
    // Try direct match first - works for standard inputs (e.g., "standard_left_eye_pos_x")
    const direct = selectedBindingSlotsByInputId.get(id);
    if (direct) return direct;

    // For standard inputs, only use direct match - don't apply semantic ID resolution
    if (id.startsWith("standard_")) {
      return undefined;
    }

    // For driven references (UUID component IDs like "f19f2ad3-...:x"),
    // check if any slot's semantic inputId resolves to this target ID
    for (const [semanticInputId, slotInfo] of selectedBindingSlotsByInputId) {
      // Skip standard inputs when looking for driven references
      if (semanticInputId.startsWith("standard_")) {
        continue;
      }
      const resolvedTargetId = semanticIdToTargetId.get(semanticInputId);
      if (resolvedTargetId === id) {
        return slotInfo;
      }
    }

    return undefined;
  }, [selectedBindingSlotsByInputId, semanticIdToTargetId]);

  // Find animatables that are driven by any of the group's inputs
  // This auto-populates drivenTracks based on existing bindings
  const existingDrivenTracks = useMemo(() => {
    const driven = new Set<string>();
    const inputIds = new Set(inputs.map(i => i.id));

    for (const [targetId, binding] of Object.entries(mainFaceBindings)) {
      // Check if binding uses any of our group's inputs
      if (binding.inputId && inputIds.has(binding.inputId)) {
        driven.add(targetId);
      }
      for (const slot of binding.slots ?? []) {
        if (slot.inputId && inputIds.has(slot.inputId)) {
          driven.add(targetId);
        }
      }
    }
    return driven;
  }, [mainFaceBindings, inputs]);

  // Combined driven tracks: user-added + existing from bindings
  const allDrivenTracks = useMemo(() => {
    const combined = new Set([...drivenTracks, ...existingDrivenTracks]);
    return Array.from(combined);
  }, [drivenTracks, existingDrivenTracks]);

  // Validate that the selected driven track is in the current group's driven tracks
  // This handles the case when the user switches groups - the selection should be invalidated
  const validSelectedTrack = selectedDrivenTrack && allDrivenTracks.includes(selectedDrivenTrack)
    ? selectedDrivenTrack
    : null;
  const validSelectedBinding = validSelectedTrack ? mainFaceBindings[validSelectedTrack] : null;

  // Get label for an animatable ID
  const getAnimatableLabel = useCallback((id: string) => {
    return mainFaceAnimatableComponents.find(a => a.id === id)?.label ?? id;
  }, [mainFaceAnimatableComponents]);

  // Handler for adding a driven track - uses proper handler to ensure correct binding structure
  // Called directly from dropdown onChange for immediate add-on-select behavior
  const handleAddDrivenTrack = useCallback((trackId: string) => {
    if (!trackId || allDrivenTracks.includes(trackId)) {
      return;
    }
    setDrivenTracks(prev => [...prev, trackId]);

    // Create a default binding using proper handler - this ensures correct structure
    // Calling with null inputId creates a properly structured default binding with primary slot
    if (!mainFaceBindings[trackId]) {
      onBindingInputChange(trackId, null);
    }

    setSelectedDrivenTrack(trackId);
  }, [allDrivenTracks, mainFaceBindings, onBindingInputChange]);

  // Handler for removing a driven track
  const handleRemoveDrivenTrack = useCallback(() => {
    if (!selectedDrivenTrack) return;

    // Remove from local state
    setDrivenTracks(prev => prev.filter(id => id !== selectedDrivenTrack));

    // Remove the binding using proper handler
    onResetBinding(selectedDrivenTrack);

    setSelectedDrivenTrack(null);
  }, [selectedDrivenTrack, onResetBinding]);

  // Handler for expression change - uses the same mechanism as the Rigging panel
  const handleExpressionChange = useCallback((expression: string) => {
    if (!selectedDrivenTrack) return;
    onUpdateBindingExpression(selectedDrivenTrack, expression);
  }, [selectedDrivenTrack, onUpdateBindingExpression]);

  // Handler to toggle a slot for an input in the selected binding
  // Uses proper handlers to ensure correct binding structure for export
  const handleToggleInputSlot = useCallback((inputId: string, _inputLabel: string, checked: boolean) => {
    if (!selectedDrivenTrack || !selectedBinding) return;

    const currentSlots = selectedBinding.slots ?? [];

    if (checked) {
      // Check if slot already exists for this inputId
      const existingSlot = currentSlots.find((s: { inputId: string | null }) => s.inputId === inputId);
      if (existingSlot) {
        // Slot already exists, nothing to do
        return;
      }

      // Calculate the next slot ID that will be created
      const existingSlotIds = new Set(currentSlots.map((s: { id: string }) => s.id));
      let slotIdCounter = 1;
      while (existingSlotIds.has(`s${slotIdCounter}`)) {
        slotIdCounter++;
      }
      const newSlotId = `s${slotIdCounter}`;

      // Add a new slot using proper handler
      onAddBindingSlot(selectedDrivenTrack);

      // Set the input on the new slot - use setTimeout to ensure slot is created first
      setTimeout(() => {
        onBindingInputChange(selectedDrivenTrack, inputId, newSlotId);
      }, 0);
    } else {
      // Find the slot with the matching inputId
      const slotToRemove = currentSlots.find((s: { inputId: string | null }) => s.inputId === inputId);
      if (slotToRemove) {
        // Remember the alias before removing (for potential re-enable)
        rememberedAliasesRef.current.set(inputId, {
          alias: slotToRemove.alias,
          slotId: slotToRemove.id,
        });
        // Remove the slot using proper handler
        onRemoveBindingSlot(selectedDrivenTrack, slotToRemove.id);
      }
    }
  }, [selectedDrivenTrack, selectedBinding, onAddBindingSlot, onBindingInputChange, onRemoveBindingSlot]);

  // Build a map from component ID to safeId for semantic identification
  const componentSafeIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const component of mainFaceAnimatableComponents) {
      map.set(component.id, component.safeId);
    }
    return map;
  }, [mainFaceAnimatableComponents]);

  // Handler to toggle a slot for a driven reference (another animatable) in the selected binding
  // Uses proper handlers to ensure correct binding structure for export
  const handleToggleDrivenSlot = useCallback((trackId: string, _trackLabel: string, checked: boolean) => {
    if (!selectedDrivenTrack || !selectedBinding) return;

    const currentSlots = selectedBinding.slots ?? [];

    // Get the semantic ID for this track
    // Use the binding's inputId if it exists, otherwise use component's safeId
    // This applies to both self-references and other driven references (Hugo's approach)
    const trackBinding = mainFaceBindings[trackId];
    const semanticInputId = trackBinding?.inputId ?? componentSafeIds.get(trackId);
    if (!semanticInputId) {
      console.warn("Cannot toggle driven slot: no semantic ID found for track", { trackId });
      return;
    }

    if (checked) {
      // Check if slot already exists for this semantic ID
      const existingSlot = currentSlots.find((s: { inputId: string | null }) => s.inputId === semanticInputId);
      if (existingSlot) {
        return;
      }

      // Calculate the next slot ID that will be created
      const existingSlotIds = new Set(currentSlots.map((s: { id: string }) => s.id));
      let slotIdCounter = 1;
      while (existingSlotIds.has(`s${slotIdCounter}`)) {
        slotIdCounter++;
      }
      const newSlotId = `s${slotIdCounter}`;

      // Add a new slot using proper handler
      onAddBindingSlot(selectedDrivenTrack);

      // Set the input on the new slot - use setTimeout to ensure slot is created first
      setTimeout(() => {
        onBindingInputChange(selectedDrivenTrack, semanticInputId, newSlotId);
      }, 0);
    } else {
      // Find the slot with the matching semantic inputId
      const slotToRemove = currentSlots.find((s: { inputId: string | null }) => s.inputId === semanticInputId);
      if (slotToRemove) {
        // Remember the alias before removing (for potential re-enable)
        rememberedAliasesRef.current.set(semanticInputId, {
          alias: slotToRemove.alias,
          slotId: slotToRemove.id,
        });
        // Remove the slot using proper handler
        onRemoveBindingSlot(selectedDrivenTrack, slotToRemove.id);
      }
    }
  }, [selectedDrivenTrack, selectedBinding, mainFaceBindings, componentSafeIds, onAddBindingSlot, onBindingInputChange, onRemoveBindingSlot]);

  // Handler to update a slot's alias - uses proper handler to ensure correct structure
  const handleSlotAliasChange = useCallback((slotId: string, newAlias: string) => {
    if (!selectedDrivenTrack || !selectedBinding) return;

    const trimmedAlias = newAlias.trim();
    if (trimmedAlias.length === 0) return; // Don't allow empty aliases

    const currentSlots = selectedBinding.slots ?? [];

    // Check if alias is already taken by another slot
    const aliasInUse = currentSlots.some((s: { id: string; alias: string }) => s.id !== slotId && s.alias === trimmedAlias);
    if (aliasInUse) {
      console.warn("[handleSlotAliasChange] alias already in use", { trimmedAlias });
      return;
    }

    // Use proper handler to update the slot alias
    onUpdateBindingSlotAlias(selectedDrivenTrack, slotId, trimmedAlias);
  }, [selectedDrivenTrack, selectedBinding, onUpdateBindingSlotAlias]);

  if (inputs.length === 0) {
    return (
      <p className="sidebar__placeholder-text">
        No tracks in this group.
      </p>
    );
  }

  return (
    <div className="group-mapping-editor">
      {/* Driven Tracks Section */}
      <div className="group-mapping-editor__section">
        <h4 className="group-mapping-editor__title">Driven Tracks</h4>
        <div className="group-mapping-editor__driven-controls">
          <select
            className="group-mapping-editor__select"
            value=""
            onChange={(e) => handleAddDrivenTrack(e.target.value)}
          >
            <option value="">Select an animatable to add...</option>
            {mainFaceAnimatableComponents
              .filter(a => !allDrivenTracks.includes(a.id))
              .map((animatable) => (
                <option key={animatable.id} value={animatable.id}>
                  {animatable.label}
                </option>
              ))}
          </select>
          <Button
            variant="danger"
            size="sm"
            onClick={handleRemoveDrivenTrack}
            disabled={!selectedDrivenTrack}
          >
            Remove
          </Button>
        </div>
        {allDrivenTracks.length > 0 ? (
          <div className="group-mapping-editor__driven-list">
            {allDrivenTracks.map((trackId) => (
              <button
                key={trackId}
                type="button"
                className={`group-mapping-editor__driven-item ${selectedDrivenTrack === trackId ? "group-mapping-editor__driven-item--selected" : ""}`}
                onClick={() => setSelectedDrivenTrack(selectedDrivenTrack === trackId ? null : trackId)}
              >
                {getAnimatableLabel(trackId)}
              </button>
            ))}
          </div>
        ) : (
          <p className="group-mapping-editor__placeholder">
            No driven tracks. Add animatables above.
          </p>
        )}
      </div>

      {/* Two-column Slot Configuration Section - only shown when a valid track is selected */}
      {validSelectedTrack && validSelectedBinding && (
        <div className="group-mapping-editor__section">
          <div className="group-mapping-editor__columns">
            {/* Input Drivers Column */}
            <div className="group-mapping-editor__column">
              <h4 className="group-mapping-editor__title">Input Drivers</h4>
              <div className="group-mapping-editor__slot-header">
                <span></span>
                <span>Use</span>
                <span>Path</span>
                <span>Alias</span>
              </div>
              <div className="group-mapping-editor__slot-list">
                {inputs.map((input) => {
                  const slotInfo = getSlotForId(input.id);
                  const isUsed = !!slotInfo;
                  // Check if input exists in main face and has binding
                  const existsInMain = mainFaceStandardInputsById.has(input.id);
                  const hasBoundBinding = mainFaceInputIdsWithBindings.has(input.id);
                  // Status colors differ based on whether reference face is loaded:
                  // - With ref face: grey=missing, blue=unbound, green=bound
                  // - Main-face only: grey=unbound, blue=bound (no green)
                  let statusClass: string;
                  let statusTitle: string;
                  if (!existsInMain) {
                    statusClass = "group-mapping-editor__status--missing";
                    statusTitle = "Missing";
                  } else if (refIsLoaded) {
                    // With reference face: 3-color scheme
                    statusClass = hasBoundBinding
                      ? "group-mapping-editor__status--bound"
                      : "group-mapping-editor__status--unbound";
                    statusTitle = hasBoundBinding ? "Bound" : "Unbound";
                  } else {
                    // Main-face only: 2-color scheme (grey=unbound, blue=bound)
                    statusClass = hasBoundBinding
                      ? "group-mapping-editor__status--unbound" // blue for bound
                      : "group-mapping-editor__status--missing"; // grey for unbound
                    statusTitle = hasBoundBinding ? "Bound" : "Unbound";
                  }

                  return (
                    <div key={input.id} className="group-mapping-editor__slot-row">
                      <span className={`group-mapping-editor__status ${statusClass}`} title={statusTitle}>●</span>
                      <input
                        type="checkbox"
                        className="group-mapping-editor__slot-checkbox"
                        checked={isUsed}
                        onChange={(e) => handleToggleInputSlot(input.id, input.label, e.target.checked)}
                      />
                      <span className="group-mapping-editor__slot-path" title={input.path}>
                        {input.label}
                      </span>
                      {isUsed ? (
                        <input
                          type="text"
                          className="group-mapping-editor__slot-alias-input"
                          value={slotInfo.alias}
                          onChange={(e) => handleSlotAliasChange(slotInfo.id, e.target.value)}
                        />
                      ) : (
                        <span className="group-mapping-editor__slot-alias-empty">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Driven References Column - shows all driven tracks (including self) */}
            <div className="group-mapping-editor__column">
              <h4 className="group-mapping-editor__title">Driven References</h4>
              <div className="group-mapping-editor__slot-header">
                <span></span>
                <span>Use</span>
                <span>Path</span>
                <span>Alias</span>
              </div>
              <div className="group-mapping-editor__slot-list">
                {allDrivenTracks.map((trackId) => {
                  const isSelf = trackId === validSelectedTrack;
                  const slotInfo = getSlotForId(trackId);
                  const isUsed = !!slotInfo;
                  const label = getAnimatableLabel(trackId);

                  return (
                    <div key={trackId} className="group-mapping-editor__slot-row">
                      <span></span>{/* Status placeholder for grid alignment */}
                      <input
                        type="checkbox"
                        className="group-mapping-editor__slot-checkbox"
                        checked={isUsed}
                        onChange={(e) => handleToggleDrivenSlot(trackId, label, e.target.checked)}
                      />
                      <span className="group-mapping-editor__slot-path" title={trackId}>
                        {label}{isSelf ? " (self)" : ""}
                      </span>
                      {isUsed ? (
                        <input
                          type="text"
                          className="group-mapping-editor__slot-alias-input"
                          value={slotInfo.alias}
                          onChange={(e) => handleSlotAliasChange(slotInfo.id, e.target.value)}
                        />
                      ) : (
                        <span className="group-mapping-editor__slot-alias-empty">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mapping Expression Section */}
      {validSelectedTrack && validSelectedBinding && (
        <div className="group-mapping-editor__section">
          <h4 className="group-mapping-editor__title">
            Mapping for {getAnimatableLabel(validSelectedTrack)}
          </h4>
          <div className="group-mapping-editor__expression">
            <input
              type="text"
              className="group-mapping-editor__expression-input"
              value={validSelectedBinding.expression}
              onChange={(e) => handleExpressionChange(e.target.value)}
              placeholder="self"
            />
          </div>
        </div>
      )}
    </div>
  );
}
