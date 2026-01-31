import React, { useMemo } from "react";
import { SceneObjectNode, SceneObjectFeature } from "../../scene/sceneGraph";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { RiggingPropertyRow } from "./RiggingPropertyRow";
import { Input } from "../ui"; // Using Input for now, could upgrade to draggable later
import { StandardRigInput } from "@vizij/utils";

interface RiggingTransformSectionProps {
    node: SceneObjectNode;
}

export function RiggingTransformSection({ node }: RiggingTransformSectionProps) {
    const {
        bindings,
        standardInputs,
        standardInputsById,
        inputValues,
        handleInputValueChange,
        handleUpdateStandardInput // To update default value
    } = useBindingAuthoring((state) => state);

    // Helper to find feature by key
    const findFeature = (key: string) =>
        node.features.find((f) => f.key.toLowerCase() === key.toLowerCase());

    const positionFeature = findFeature("translation") ?? findFeature("position");
    const rotationFeature = findFeature("rotation");
    const scaleFeature = findFeature("scale");

    if (!positionFeature && !rotationFeature && !scaleFeature) {
        return null;
    }

    return (
        <div className="flex flex-col gap-1 p-2 bg-slate-900/40 rounded-lg border border-slate-800/50">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 px-1">
                Transform
            </div>

            {positionFeature && (
                <RiggingVectorRow
                    label="Position"
                    feature={positionFeature}
                    bindings={bindings}
                    standardInputs={standardInputs}
                    standardInputsById={standardInputsById}
                    inputValues={inputValues}
                    onValueChange={handleInputValueChange}
                    onDefaultChange={(id, val) => handleUpdateStandardInput(id, { defaultValue: val })}
                />
            )}

            {rotationFeature && (
                <RiggingVectorRow
                    label="Rotation"
                    feature={rotationFeature}
                    bindings={bindings}
                    standardInputs={standardInputs}
                    standardInputsById={standardInputsById}
                    inputValues={inputValues}
                    onValueChange={handleInputValueChange}
                    onDefaultChange={(id, val) => handleUpdateStandardInput(id, { defaultValue: val })}
                />
            )}

            {scaleFeature && (
                <RiggingVectorRow
                    label="Scale"
                    feature={scaleFeature}
                    bindings={bindings}
                    standardInputs={standardInputs}
                    standardInputsById={standardInputsById}
                    inputValues={inputValues}
                    onValueChange={handleInputValueChange}
                    onDefaultChange={(id, val) => handleUpdateStandardInput(id, { defaultValue: val })}
                />
            )}
        </div>
    );
}


// Sub-component for Vector3 (X, Y, Z)
interface RiggingVectorRowProps {
    label: string;
    feature: SceneObjectFeature;
    bindings: any;
    standardInputs: StandardRigInput[];
    standardInputsById: Map<string, StandardRigInput>;
    inputValues: Record<string, number>;
    onValueChange: (id: string, value: number) => void;
    onDefaultChange: (id: string, value: number) => void;
}

function RiggingVectorRow({
    label,
    feature,
    bindings,
    standardInputsById,
    inputValues,
    onValueChange,
    onDefaultChange,
}: RiggingVectorRowProps) {

    // Extract inputs for x, y, z components
    const components = useMemo(() => {
        return feature.components.map(comp => {
            const label = comp.componentKey?.toUpperCase() ?? comp.label;

            // 1. Try to find active binding/driver
            const targetId = comp.targetId;
            let inputId = null;
            let standardInput = null;

            if (targetId) {
                const binding = bindings[targetId];
                if (binding?.slots?.[0]?.inputId) {
                    inputId = binding.slots[0].inputId;
                    standardInput = standardInputsById.get(inputId);
                }
            }

            // 2. Determine values
            if (standardInput && inputId) {
                // Bound Case
                return {
                    componentLabel: label,
                    inputId,
                    currentValue: inputValues[inputId] ?? standardInput.defaultValue ?? 0,
                    defaultValue: standardInput.defaultValue ?? 0,
                    isBound: true
                };
            } else {
                // Unbound/Static Case
                // If it has a static value, use it. If it's an animatable without binding, use its value?
                // For now, fall back to staticValue or 0.
                // Note: To edit static values, we need a different handler than 'onValueChange' which expects inputId.
                // But the props only provide onValueChange (for drivers).
                // TODO: Support static editing. For now, valid display is better than hidden.
                // We'll show 0 or static value, but mark as read-only or similar if we can't edit.
                const val = comp.staticValue ?? 0;
                return {
                    componentLabel: label,
                    inputId: null,
                    currentValue: val,
                    defaultValue: val,
                    isBound: false
                };
            }
        });
    }, [feature, bindings, standardInputsById, inputValues]);

    if (components.length === 0) return null;

    // Only show reset if ANY component is bound and differs
    const hasDifferentDefault = components.some(c => c.isBound && Math.abs((c.currentValue as number) - (c.defaultValue as number)) > 0.0001);

    const handleReset = () => {
        components.forEach((c) => {
            if (c.isBound && c.inputId) onValueChange(c.inputId, c.defaultValue as number);
        });
    };

    const renderInputs = (isDefault: boolean) => (
        <div className="flex gap-1 flex-1">
            {components.map((c, i) => {
                const val = isDefault ? c.defaultValue : c.currentValue;
                const canEdit = c.isBound; // Limits editing to bound values for now

                return (
                    <div key={i} className={`flex items-center bg-slate-950/50 rounded border border-transparent ${canEdit ? 'focus-within:border-blue-500/50' : 'opacity-70'} relative flex-1 min-w-0`}>
                        <span className={`text-[10px] font-bold px-1.5 select-none ${c.componentLabel === 'X' ? 'text-red-500' :
                            c.componentLabel === 'Y' ? 'text-green-500' :
                                c.componentLabel === 'Z' ? 'text-blue-500' : 'text-slate-500'
                            }`}>
                            {c.componentLabel}
                        </span>
                        <input
                            type="number"
                            className="w-full bg-transparent border-0 text-xs p-1 h-6 focus:ring-0 text-slate-300 placeholder-slate-600 no-spinners"
                            value={typeof val === 'number' ? Math.round(val * 100) / 100 : 0}
                            step={0.1}
                            disabled={!canEdit}
                            title={!canEdit ? "Value is not driven by a rig input" : undefined}
                            onChange={(e) => {
                                if (!canEdit || !c.inputId) return;
                                const num = parseFloat(e.target.value);
                                if (!isNaN(num)) {
                                    if (isDefault) onDefaultChange(c.inputId, num);
                                    else onValueChange(c.inputId, num);
                                }
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );

    return (
        <RiggingPropertyRow
            label={label}
            hasDifferentDefault={hasDifferentDefault}
            onResetToDefault={hasDifferentDefault ? handleReset : undefined}
            renderMainInput={() => renderInputs(false)}
            renderDefaultInput={hasDifferentDefault ? () => renderInputs(true) : undefined}
        />
    );
}
