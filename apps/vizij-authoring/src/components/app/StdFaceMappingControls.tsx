import { useMemo } from "react";
import { SidebarSection } from "../common/SidebarSection";
import { RowSlider } from "../ui";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { STANDARD_RIG_INPUTS, type StandardRigInput } from "@vizij/utils";

export function StdFaceMappingControls() {
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
