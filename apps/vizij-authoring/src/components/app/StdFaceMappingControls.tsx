import { useMemo, useState } from "react";
import { SidebarSection } from "../common/SidebarSection";
import { RowSlider } from "../ui";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import type { StandardRigInput } from "@vizij/utils";

export function StdFaceMappingControls() {
  const referenceFace = useReferenceFace();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  // Get main face data for existence and binding checks
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

  // Build a set of standard input IDs that are used in any binding
  const mainFaceInputIdsWithBindings = useMemo(() => {
    const usedIds = new Set<string>();
    for (const binding of Object.values(mainFaceBindings)) {
      if (binding.inputId) {
        usedIds.add(binding.inputId);
      }
      for (const slot of binding.slots ?? []) {
        if (slot.inputId) {
          usedIds.add(slot.inputId);
        }
      }
    }
    return usedIds;
  }, [mainFaceBindings]);

  // Group standard inputs from the reference face (not a hardcoded list)
  const groupedInputs = useMemo(() => {
    const groups = new Map<string, StandardRigInput[]>();
    for (const input of referenceFace.standardInputs) {
      const group = input.group;
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(input);
    }
    return groups;
  }, [referenceFace.standardInputs]);

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

  return (
    <div className="mapping-controls-layout">
      <div className="mapping-controls-layout__section mapping-controls-layout__section--reference">
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
              </div>
              {activeGroup && groupedInputs.has(activeGroup) && (
                <ReferenceInputGroup
                  inputs={groupedInputs.get(activeGroup)!}
                  inputIdsWithBindings={inputIdsWithBindings}
                  inputValues={referenceFace.inputValues}
                  onInputChange={referenceFace.handleInputValueChange}
                />
              )}
            </div>
          )}
        </SidebarSection>
      </div>

      <div className="mapping-controls-layout__section mapping-controls-layout__section--mapping">
        <SidebarSection
          title="Mapping Editor"
          description="Adjust your face to match the reference features."
        >
          {!referenceFace.isLoaded ? (
            <p className="sidebar__placeholder-text">
              Load a reference face to begin mapping.
            </p>
          ) : !mainFaceIsLoaded ? (
            <p className="sidebar__placeholder-text">
              Load a main face to begin mapping.
            </p>
          ) : !activeGroup ? (
            <p className="sidebar__placeholder-text">
              Select a group above to see mapping options.
            </p>
          ) : (
            <div className="mapping-controls-layout__scroll">
              <MappingTrackSelector
                inputs={groupedInputs.get(activeGroup) ?? []}
                selectedTrackId={selectedTrackId}
                onSelectTrack={setSelectedTrackId}
                mainFaceIsLoaded={mainFaceIsLoaded}
                mainFaceStandardInputsById={mainFaceStandardInputsById}
                mainFaceInputIdsWithBindings={mainFaceInputIdsWithBindings}
              />
            </div>
          )}
        </SidebarSection>
      </div>
    </div>
  );
}

interface ReferenceInputGroupProps {
  inputs: StandardRigInput[];
  inputIdsWithBindings: Set<string>;
  inputValues: Record<string, number>;
  onInputChange: (inputId: string, value: number) => void;
}

function ReferenceInputGroup({
  inputs,
  inputIdsWithBindings,
  inputValues,
  onInputChange,
}: ReferenceInputGroupProps) {
  return (
    <div className="reference-input-group">
      <div className="reference-input-group__inputs">
        {inputs.map((input) => {
          const hasBinding = inputIdsWithBindings.has(input.id);
          const value = inputValues[input.id] ?? input.defaultValue;

          if (!hasBinding) {
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

interface MappingTrackSelectorProps {
  inputs: StandardRigInput[];
  selectedTrackId: string | null;
  onSelectTrack: (trackId: string | null) => void;
  mainFaceIsLoaded: boolean;
  mainFaceStandardInputsById: Map<string, StandardRigInput>;
  mainFaceInputIdsWithBindings: Set<string>;
}

function MappingTrackSelector({
  inputs,
  selectedTrackId,
  onSelectTrack,
  mainFaceIsLoaded,
  mainFaceStandardInputsById,
  mainFaceInputIdsWithBindings,
}: MappingTrackSelectorProps) {

  if (inputs.length === 0) {
    return (
      <p className="sidebar__placeholder-text">
        No tracks in this group.
      </p>
    );
  }

  return (
    <div className="mapping-track-selector">
      <div className="mapping-track-selector__list">
        {inputs.map((input) => {
          // If main face isn't loaded, nothing exists there
          const existsInMainFace = mainFaceIsLoaded && mainFaceStandardInputsById.has(input.id);
          const hasBindingInMainFace = mainFaceIsLoaded && mainFaceInputIdsWithBindings.has(input.id);
          const isSelected = selectedTrackId === input.id;

          // Determine combined status: green = bound, blue = exists but unbound, gray = missing
          const status = !existsInMainFace
            ? "missing"
            : hasBindingInMainFace
              ? "bound"
              : "unbound";

          const statusTitle = {
            missing: "Track missing in main face",
            unbound: "Track exists but has no binding",
            bound: "Track exists and is bound",
          }[status];

          return (
            <button
              key={input.id}
              type="button"
              className={`mapping-track-item ${isSelected ? "mapping-track-item--selected" : ""}`}
              onClick={() => onSelectTrack(isSelected ? null : input.id)}
            >
              <span className="mapping-track-item__label">{input.label}</span>
              <span
                className={`mapping-track-item__status mapping-track-item__status--${status}`}
                title={statusTitle}
              >
                ●
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
