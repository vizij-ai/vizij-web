import React from "react";
import { SceneObjectNode, SceneObjectFeature } from "../../scene/sceneGraph";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { RiggingPropertyRow } from "./RiggingPropertyRow";
import { Select } from "../ui";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { StandardRigInput } from "@vizij/utils";

interface RiggingMaterialSectionProps {
    node: SceneObjectNode;
}

export function RiggingMaterialSection({ node }: RiggingMaterialSectionProps) {
    const {
        bindings,
        standardInputsById,
        inputValues,
        handleInputValueChange,
        handleUpdateStandardInput
    } = useBindingAuthoring((state) => state);

    const { materials, assignMaterial } = useSceneComposer();

    // Helper to find feature by key
    const findFeature = (key: string) =>
        node.features.find((f) => f.key.toLowerCase() === key.toLowerCase());

    const colorFeature = findFeature("color");
    const opacityFeature = findFeature("opacity");

    // Material Logic
    const currentMaterial = materials.find((entry) => entry.memberShapeIds.includes(node.id)) ?? null;
    const materialOptions = materials.map((m) => ({ value: m.id, label: m.label }));

    // If node isn't a shape that supports material, skip material selector
    const showMaterialSelector = node.type === "shape";

    if (!showMaterialSelector && !colorFeature && !opacityFeature) {
        return null;
    }

    return (
        <div className="flex flex-col gap-1 p-2 bg-slate-900/40 rounded-lg border border-slate-800/50 mt-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 px-1">
                Appearance
            </div>

            {showMaterialSelector && (
                <div className="flex items-center gap-2 p-1 pl-2 min-h-[32px] border border-slate-800/20 bg-slate-900/10 rounded-lg mb-1">
                    <span className="text-[11px] font-medium text-slate-400 select-none flex-1">Material</span>
                    <div className="flex-1 min-w-[120px]">
                        <Select
                            value={currentMaterial?.id ?? ""}
                            options={[{ value: "", label: "None" }, ...materialOptions]}
                            onChange={(val) => assignMaterial(node.id, val)}
                            size="sm"
                            className="h-6 text-[11px]"
                        />
                    </div>
                </div>
            )}

            {colorFeature && (
                <RiggingColorRow
                    label="Color"
                    feature={colorFeature}
                    bindings={bindings}
                    standardInputsById={standardInputsById}
                    inputValues={inputValues}
                    onValueChange={handleInputValueChange}
                    onDefaultChange={(id, val) => handleUpdateStandardInput(id, { defaultValue: val })}
                />
            )}

            {opacityFeature && (
                <RiggingScalarRow
                    label="Opacity"
                    feature={opacityFeature}
                    bindings={bindings}
                    standardInputsById={standardInputsById}
                    inputValues={inputValues}
                    onValueChange={handleInputValueChange}
                    onDefaultChange={(id, val) => handleUpdateStandardInput(id, { defaultValue: val })}
                />
            )}
        </div>
    );
}

// Reusing Scalar Row logic for opacity
interface RiggingScalarRowProps {
    label: string;
    feature: SceneObjectFeature;
    bindings: any;
    standardInputsById: Map<string, StandardRigInput>;
    inputValues: Record<string, number>;
    onValueChange: (id: string, value: number) => void;
    onDefaultChange: (id: string, value: number) => void;
}

function RiggingScalarRow({
    label,
    feature,
    bindings,
    standardInputsById,
    inputValues,
    onValueChange,
    onDefaultChange,
}: RiggingScalarRowProps) {
    const component = feature.components[0];
    if (!component) return null;

    const targetId = component.targetId;
    let inputId = null;
    let standardInput = null;

    if (targetId) {
        const binding = bindings[targetId];
        if (binding?.slots?.[0]?.inputId) {
            inputId = binding.slots[0].inputId;
            standardInput = standardInputsById.get(inputId);
        }
    }

    const isBound = !!(inputId && standardInput);
    const currentValue = isBound
        ? (inputValues[inputId!] ?? standardInput!.defaultValue ?? 0)
        : (component.staticValue ?? 0);

    const defaultValue = isBound ? (standardInput!.defaultValue ?? 0) : (component.staticValue ?? 0);

    // Only difference meaningful if bound
    const hasDifferentDefault = isBound && Math.abs((currentValue as number) - (defaultValue as number)) > 0.0001;

    const handleReset = () => {
        if (isBound && inputId) onValueChange(inputId, defaultValue as number);
    };

    const renderInput = (isDefault: boolean) => {
        const val = isDefault ? defaultValue : currentValue;
        const canEdit = isBound;

        return (
            <div className={`flex items-center bg-slate-950/50 rounded border border-transparent ${canEdit ? 'focus-within:border-blue-500/50' : 'opacity-70'} relative flex-1 min-w-0`}>
                <input
                    type="number"
                    className="w-full bg-transparent border-0 text-xs p-1 h-6 focus:ring-0 text-slate-300 placeholder-slate-600 no-spinners"
                    value={typeof val === 'number' ? Math.round(val * 100) / 100 : val}
                    step={0.1}
                    min={0} max={1} // Generally opacity is 0-1
                    disabled={!canEdit}
                    title={!canEdit ? "Value is not driven by a rig input" : undefined}
                    onChange={(e) => {
                        if (!canEdit || !inputId) return;
                        const num = parseFloat(e.target.value);
                        if (!isNaN(num)) {
                            if (isDefault) onDefaultChange(inputId, num);
                            else onValueChange(inputId, num);
                        }
                    }}
                />
            </div>
        );
    };

    return (
        <RiggingPropertyRow
            label={label}
            hasDifferentDefault={hasDifferentDefault}
            onResetToDefault={hasDifferentDefault ? handleReset : undefined}
            renderMainInput={() => renderInput(false)}
            renderDefaultInput={hasDifferentDefault ? () => renderInput(true) : undefined}
        />
    );
}

// Color Row (R, G, B)
function RiggingColorRow({
    label,
    feature,
    bindings,
    standardInputsById,
    inputValues,
    onValueChange,
    onDefaultChange,
}: RiggingScalarRowProps) {

    const components = feature.components.map((comp) => {
        const compLabel = comp.componentKey?.toUpperCase() ?? comp.label;
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

        if (inputId && standardInput) {
            return {
                label: compLabel,
                inputId,
                currentValue: inputValues[inputId] ?? standardInput.defaultValue ?? 0,
                defaultValue: standardInput.defaultValue ?? 0,
                isBound: true
            };
        } else {
            const val = comp.staticValue ?? 0;
            return {
                label: compLabel,
                inputId: null,
                currentValue: val,
                defaultValue: val,
                isBound: false
            };
        }
    }).filter((c): c is NonNullable<typeof c> => c !== null);

    if (components.length === 0) return null;

    const hasDifferentDefault = components.some((c) => c.isBound && Math.abs((c.currentValue as number) - (c.defaultValue as number)) > 0.0001);

    const handleReset = () => {
        components.forEach((c) => {
            if (c.isBound && c.inputId) onValueChange(c.inputId, c.defaultValue as number);
        })
    };

    const renderInputs = (isDefault: boolean) => (
        <div className="flex gap-1 flex-1">
            {components.map((c, i) => {
                const val = isDefault ? c.defaultValue : c.currentValue;
                const canEdit = c.isBound;
                return (
                    <div key={i} className={`flex items-center bg-slate-950/50 rounded border border-transparent ${canEdit ? 'focus-within:border-blue-500/50' : 'opacity-70'} relative flex-1 min-w-0`}>
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
