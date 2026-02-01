import { useMemo } from "react";
import { Panel } from "../ui/Panel";
import { usePoseRig } from "../../state/PoseRigProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { PoseSummary } from "../../poseRig/components/PoseSummary"; // Assuming this exists or similar
import { RiggingPropertyRow } from "./RiggingPropertyRow"; // Reuse existing UI
import type { ManagedStandardInput } from "../../types/standardInputs";

interface VariableControllerProps {
    type: "pose" | "rig";
    id: string; // ID of the Pose or the StandardInput path/ID
}

export function VariableController({ type, id }: VariableControllerProps) {
    // Hooks
    const { poses, updatePoseValue, selectedPoseId } = usePoseRig();
    const {
        managedStandardInputs,
        handleInputValueChange,
        inputValues,
        standardInputsById
    } = useBindingAuthoring((state) => state);

    // 1. Pose Logic
    const pose = useMemo(() =>
        type === "pose" ? poses.find(p => p.id === id) : null,
        [poses, id, type]);

    // 2. Rig Logic
    const rigInput = useMemo(() =>
        type === "rig" ? managedStandardInputs.find(m => m.input.id === id) : null,
        [managedStandardInputs, id, type]);


    if (type === "pose" && pose) {
        return (
            <div className="flex flex-col gap-2 p-2">
                <Panel title={pose.name} badge="Pose">
                    <div className="flex flex-col gap-2 p-2 text-xs text-slate-400">
                        {/* Placeholder for real Pose editing UI. 
                             For now, maybe just show details or allowed actions.
                             Ideally we reuse components from PoseRigWorkbench but simplified.
                          */}
                        <p>Group: {pose.group || "Ungrouped"}</p>
                        <p>Values: {Object.keys(pose.values).length} driven inputs</p>

                        {/* We could add "Edit Pose" button here if we want to jump to the full workbench */}
                    </div>
                </Panel>
            </div>
        );
    }

    if (type === "rig" && rigInput) {
        const input = rigInput.input;
        const value = inputValues[input.id] ?? input.defaultValue ?? 0;

        return (
            <div className="flex flex-col gap-2 p-2">
                <Panel title={input.label || input.id} badge="Rig">
                    <div className="p-2">
                        <RiggingPropertyRow
                            label={input.label || "Value"}
                            renderMainInput={() => (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="range"
                                        min={-1}
                                        max={1}
                                        step={0.01}
                                        value={value}
                                        className="flex-1"
                                        onChange={(e) => handleInputValueChange(input.id, parseFloat(e.target.value))}
                                    />
                                    <span className="w-12 text-right font-mono text-xs">{value.toFixed(2)}</span>
                                </div>
                            )}
                        />
                    </div>
                </Panel>
            </div>
        );
    }

    return (
        <div className="p-4 text-slate-500 text-center text-xs">
            Select a variable to inspect.
        </div>
    );
}
