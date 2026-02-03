
import React, { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Sliders, Play, Box } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Button } from "../ui/Button";
import { Slider } from "../ui/Slider";
import { NumberField } from "../ui/NumberField";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { usePoseRig } from "../../state/PoseRigProvider";
import {
    useBindingAuthoring,
    useSelectionStore,
} from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { cn } from "../../utils/cn";
import { RiggingPropertyRow, ScrubbableLabel } from "./RiggingPropertyRow";
import { VariableSelector, type VariableSelection } from "./VariableSelector";
import { InspectorHeader } from "./InspectorHeader";
import { RiggingTransformSection } from "./RiggingTransformSection";
import { BindingConnections } from "./BindingConnections";
import { RiggingMorphTargetsSection } from "./RiggingMorphTargetsSection";
import { RiggingMaterialSection } from "./RiggingMaterialSection";

// --- Conversion Helpers ---
const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (c: number) => {
        const hex = Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
};

const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255,
        }
        : null;
};

// Helper to shorten labels when they repeat group context
const cleanLabel = (label: string, groupLabel: string) => {
    if (groupLabel === "Unassigned") return label;
    const groupWords = groupLabel.toLowerCase().split(/[_\s]+/);
    const labelWords = label.toLowerCase().split(/[_\s]+/);
    let matchCount = 0;
    for (let i = 0; i < Math.min(groupWords.length, labelWords.length); i++) {
        if (
            groupWords[i] === labelWords[i] ||
            (groupWords[i].length > 2 && labelWords[i].startsWith(groupWords[i])) ||
            (labelWords[i].length > 2 && groupWords[i].startsWith(labelWords[i]))
        ) {
            matchCount++;
        } else {
            break;
        }
    }
    if (matchCount > 0) {
        const originalWords = label.split(/[\s_]+/);
        const remaining = originalWords.slice(matchCount);
        if (remaining.length > 0) return remaining.join(" ");
    }
    return label;
};

type PoseVariableItem =
    | { type: "scalar"; varId: string; poseVal: number }
    | {
        type: "color";
        label: string;
        featureId: string;
        components: {
            varId: string;
            poseVal: number;
            channel: "r" | "g" | "b";
        }[];
    };

export function InspectorContent() {
    const [showSelector, setShowSelector] = useState(false);
    const [blendAmount, setBlendAmount] = useState(0);
    const scrubValuesRef = useRef<Record<string, number>>({});

    // Hooks
    const selectionStack = useSelectionStore((state) => state.selectionStack);
    const activeSelection = selectionStack[0] ?? null;
    const { getNode, objects } = useSceneComposer();
    const {
        poses,
        updatePoseValue,
        applyPose,
        removePoseInput,
        updatePoseName,
        updatePoseGroup,
        selectedPoseId,
    } = usePoseRig();
    const {
        managedStandardInputs,
        handleInputValueChange,
        applyStandardInputBatch,
        inputValues,
        bindings,
        handleCreateCustomStandardInput,
        handleAddBindingSlot,
        handleUpdateStandardInput,
        handleRenameShape,
        handleBindingInputChange,
        handleResetBinding,
        selectedRigId,
    } = useBindingAuthoring((state) => state);

    // Reset blend amount when selected pose changes
    useEffect(() => {
        setBlendAmount(0);
    }, [selectedPoseId]);

    // 1. Scene Object Mode
    if (activeSelection) {
        const node = getNode(activeSelection.id);
        if (node) {
            return (
                <div className="flex flex-col gap-1 p-1">
                    <InspectorHeader
                        name={node.name || node.id}
                        typeLabel={node.type}
                        id={node.id}
                        onNameChange={(name) => handleRenameShape(node.id, name)}
                    />
                    <RiggingTransformSection node={node} />
                    <RiggingMorphTargetsSection node={node} />
                    <RiggingMaterialSection node={node} />
                    <BindingConnections node={node} />
                </div>
            );
        }
    }

    // 2. Pose Mode
    if (selectedPoseId) {
        const pose = poses.find((p) => p.id === selectedPoseId);
        if (pose) {
            // Grouping Logic for Pose
            const groupedVariables = (() => {
                const targetToFeature: Record<
                    string,
                    {
                        featureId: string;
                        featureKey: string;
                        objectId: string;
                        objectName: string;
                        componentKey: string;
                    }
                > = {};
                for (const obj of objects) {
                    for (const feat of obj.features) {
                        for (const comp of feat.components) {
                            if (comp.targetId) {
                                targetToFeature[comp.targetId] = {
                                    featureId: feat.id,
                                    featureKey: feat.key,
                                    objectId: obj.id,
                                    objectName: obj.name,
                                    componentKey: comp.componentKey || comp.label,
                                };
                            }
                        }
                    }
                }

                const groups: Record<
                    string,
                    { label: string; items: PoseVariableItem[] }
                > = {};
                const colorFeatures: Record<
                    string,
                    {
                        label: string;
                        featureId: string;
                        groupKey: string;
                        components: {
                            varId: string;
                            poseVal: number;
                            channel: "r" | "g" | "b";
                        }[];
                    }
                > = {};

                Object.entries(pose.values).forEach(([varId, val]) => {
                    const mInput = managedStandardInputs.find(
                        (m) => m.input.id === varId,
                    );
                    const inputDef = mInput?.input;
                    let groupKey = "Unassigned";
                    let groupLabel = "Unassigned";

                    let featureInfo = null;
                    for (const [targetId, binding] of Object.entries(bindings)) {
                        if (
                            binding.inputId === varId ||
                            (binding.slots && binding.slots.some((s) => s.inputId === varId))
                        ) {
                            if (targetToFeature[targetId]) {
                                featureInfo = targetToFeature[targetId];
                                groupKey = `obj:${featureInfo.objectId} `;
                                groupLabel = featureInfo.objectName;
                                break;
                            }
                        }
                    }

                    if (!featureInfo && inputDef?.group) {
                        groupKey = `group:${inputDef.group} `;
                        groupLabel = inputDef.group;
                    }

                    if (featureInfo && featureInfo.featureKey.toLowerCase() === "color") {
                        const colorKey = `${featureInfo.objectId}:${featureInfo.featureId} `;
                        if (!colorFeatures[colorKey]) {
                            colorFeatures[colorKey] = {
                                label: "Color",
                                featureId: featureInfo.featureId,
                                groupKey,
                                components: [],
                            };
                        }
                        const channel = featureInfo.componentKey.toLowerCase() as
                            | "r"
                            | "g"
                            | "b";
                        colorFeatures[colorKey].components.push({
                            varId,
                            poseVal: val,
                            channel,
                        });
                    } else {
                        if (!groups[groupKey])
                            groups[groupKey] = { label: groupLabel, items: [] };
                        groups[groupKey].items.push({
                            type: "scalar",
                            varId,
                            poseVal: val,
                        });
                    }
                });

                Object.values(colorFeatures).forEach((cf) => {
                    if (!groups[cf.groupKey])
                        groups[cf.groupKey] = { label: cf.label, items: [] };
                    groups[cf.groupKey].items.push({
                        type: "color",
                        label: cf.label,
                        featureId: cf.featureId,
                        components: cf.components,
                    });
                });

                return Object.values(groups).sort((a, b) => {
                    if (a.label === "Unassigned") return 1;
                    if (b.label === "Unassigned") return -1;
                    return a.label.localeCompare(b.label);
                });
            })();

            const handleAddVariable = (selection: VariableSelection) => {
                setShowSelector(false);
                let variableId = "";
                if (selection.type === "variable") {
                    variableId = selection.id;
                } else if (selection.type === "property") {
                    const nameSafe = selection.label.replace(/[^a-zA-Z0-9]/g, "_");
                    const newVar = handleCreateCustomStandardInput(`/ ${nameSafe} `);
                    if (!newVar) return;
                    variableId = newVar.id;
                    const obj = objects.find((o) => o.id === selection.objectId);
                    const feat = obj?.features.find((f) => f.id === selection.featureId);
                    if (feat && feat.components.length > 0) {
                        const targetId = feat.components[0].targetId;
                        if (targetId) handleAddBindingSlot(targetId);
                    }
                }
                if (variableId) updatePoseValue(pose.id, variableId, 0);
            };

            const captureStartValues = () => {
                if (blendAmount === 0) {
                    Object.keys(pose.values).forEach((varId) => {
                        scrubValuesRef.current[varId] = inputValues[varId] ?? 0;
                    });
                }
            };

            // Allow manual capture for Play button even if blendAmount > 0
            const forceCaptureValues = () => {
                Object.keys(pose.values).forEach((varId) => {
                    scrubValuesRef.current[varId] = inputValues[varId] ?? 0;
                });
            };

            const handleBlend = (amount: number) => {
                setBlendAmount(amount);
                const updates: Record<string, number> = {};
                Object.entries(pose.values).forEach(([varId, targetVal]) => {
                    const startVal = scrubValuesRef.current[varId] ?? 0;
                    const newVal = startVal + (targetVal - startVal) * amount;
                    updates[varId] = newVal;
                });
                applyStandardInputBatch(updates);
            };

            return (
                <div className="flex flex-col gap-2 p-2 min-h-0 flex-1">
                    <InspectorHeader
                        name={pose.name}
                        path={pose.group || ""}
                        typeLabel="Pose"
                        id={pose.id}
                        onNameChange={(name) => updatePoseName(pose.id, name)}
                        onPathChange={(group) => updatePoseGroup(pose.id, group)}
                    />
                    <RiggingPropertyRow
                        label="Current Value"
                        defaultLabel="Pose"
                        onScrubStart={captureStartValues}
                        onScrub={(_, totalDelta) => {
                            // Blend based on delta (assuming 100px = 100% blend)
                            const newAmount = Math.max(
                                0,
                                Math.min(1, blendAmount + totalDelta / 100),
                            );
                            handleBlend(newAmount);
                        }}
                        renderMainInput={() => (
                            <div className="flex items-center gap-2 flex-1 group/row">
                                <Slider
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={blendAmount}
                                    className="flex-1"
                                    onChange={(val) => handleBlend(val as number)}
                                />
                                <div className="w-12 flex-shrink-0">
                                    <Input
                                        size="sm"
                                        type="text"
                                        value={(blendAmount * 100).toFixed(0) + "%"}
                                        className="bg-slate-950/80 border-slate-800/80 text-right font-mono text-slate-400"
                                        readOnly
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-slate-400 hover:text-white"
                                    title="Play Pose (100%)"
                                    onClick={() => {
                                        if (blendAmount === 0) forceCaptureValues();
                                        applyPose(pose.id);
                                        setBlendAmount(1);
                                    }}
                                >
                                    <Play size={12} fill="currentColor" />
                                </Button>
                            </div>
                        )}
                    />
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2 px-1">
                        DRIVING {Object.keys(pose.values).length} VARIABLES
                    </div>

                    <div className="flex flex-col gap-6 overflow-y-auto custom-scrollbar flex-1 min-h-[100px] pr-1">
                        {groupedVariables.map((group) => (
                            <div key={group.label} className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 px-1 py-1 border-b border-white/5">
                                    <Box size={10} className="text-slate-500" />
                                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                                        {group.label}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1.5 px-0.5">
                                    {group.items.map((item, idx) => {
                                        if (item.type === "scalar") {
                                            const varId = item.varId;
                                            const poseVal = item.poseVal;
                                            const mInput = managedStandardInputs.find(
                                                (m) => m.input.id === varId,
                                            );
                                            const inputDef = mInput?.input;
                                            const rawLabel = inputDef?.label || varId;
                                            const label = cleanLabel(rawLabel, group.label);
                                            const min = inputDef?.range?.min ?? -1;
                                            const max = inputDef?.range?.max ?? 1;
                                            const liveVal = inputValues[varId] ?? 0;
                                            const isDifferent = Math.abs(liveVal - poseVal) > 0.001;

                                            return (
                                                <RiggingPropertyRow
                                                    key={varId}
                                                    label={label}
                                                    defaultLabel="Pose"
                                                    hasDifferentDefault={isDifferent}
                                                    onResetToDefault={() =>
                                                        handleInputValueChange(varId, poseVal)
                                                    }
                                                    onSaveToDefault={() =>
                                                        updatePoseValue(
                                                            pose.id,
                                                            varId,
                                                            inputValues[varId] ?? 0,
                                                        )
                                                    }
                                                    onScrubStart={() => {
                                                        scrubValuesRef.current[varId] =
                                                            inputValues[varId] ?? 0;
                                                    }}
                                                    onScrub={(delta, totalDelta) => {
                                                        const step = 0.01;
                                                        const startVal = scrubValuesRef.current[varId] ?? 0;
                                                        handleInputValueChange(
                                                            varId,
                                                            startVal + totalDelta * step,
                                                        );
                                                    }}
                                                    renderMainInput={() => (
                                                        <div className="flex items-center gap-2 flex-1 group/row">
                                                            <Slider
                                                                min={min}
                                                                max={max}
                                                                step={0.01}
                                                                value={liveVal}
                                                                className="flex-1"
                                                                onChange={(val) =>
                                                                    handleInputValueChange(
                                                                        varId,
                                                                        val as number,
                                                                    )
                                                                }
                                                            />
                                                            <div className="w-12 flex-shrink-0">
                                                                <NumberField
                                                                    size="sm"
                                                                    value={liveVal} // Assuming liveVal is number, need check
                                                                    className={cn(
                                                                        "w-full bg-slate-950/80 border-slate-800/80 text-right font-mono",
                                                                        isDifferent
                                                                            ? "text-blue-400 font-bold"
                                                                            : "text-slate-400",
                                                                    )}
                                                                    onChange={(val) => handleInputValueChange(varId, val)}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                    renderDefaultInput={() => (
                                                        <div className="flex items-center gap-2 flex-1 group/row">
                                                            <ScrubbableLabel
                                                                onScrub={(delta, totalDelta) => {
                                                                    const step = 0.01;
                                                                    const startVal =
                                                                        scrubValuesRef.current[varId] ?? 0;
                                                                    const newVal = startVal + totalDelta * step;
                                                                    updatePoseValue(pose.id, varId, newVal);
                                                                    handleInputValueChange(varId, newVal);
                                                                }}
                                                                onScrubStart={() => {
                                                                    scrubValuesRef.current[varId] = poseVal;
                                                                }}
                                                                className="h-full flex items-center bg-slate-950/40 rounded border border-slate-800/50 px-1 py-0.5 min-w-[60px]"
                                                            >
                                                                <Input
                                                                    size="sm"
                                                                    type="text"
                                                                    value={poseVal.toFixed(2)}
                                                                    className="border-none text-right font-mono text-[10px] text-slate-400 cursor-ew-resize bg-transparent h-auto p-0 shadow-none focus-within:ring-0"
                                                                    onChange={(e) => {
                                                                        const v = parseFloat(e.target.value);
                                                                        if (!isNaN(v)) {
                                                                            updatePoseValue(pose.id, varId, v);
                                                                            handleInputValueChange(varId, v);
                                                                        }
                                                                    }}
                                                                />
                                                            </ScrubbableLabel>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 w-6 p-0 text-slate-600 hover:text-red-400 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                                                title="Remove from Pose"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    removePoseInput(pose.id, varId);
                                                                }}
                                                            >
                                                                <Trash2 size={12} />
                                                            </Button>
                                                        </div>
                                                    )}
                                                />
                                            );
                                        } else if (item.type === "color") {
                                            const r = item.components.find((c) => c.channel === "r");
                                            const g = item.components.find((c) => c.channel === "g");
                                            const b = item.components.find((c) => c.channel === "b");
                                            const isDifferent = item.components.some(
                                                (c) =>
                                                    Math.abs((inputValues[c.varId] ?? 0) - c.poseVal) >
                                                    0.001,
                                            );

                                            const handleBulkChange = (
                                                isPose: boolean,
                                                newR: number,
                                                newG: number,
                                                newB: number,
                                            ) => {
                                                if (isPose) {
                                                    if (r) {
                                                        updatePoseValue(pose.id, r.varId, newR);
                                                        handleInputValueChange(r.varId, newR);
                                                    }
                                                    if (g) {
                                                        updatePoseValue(pose.id, g.varId, newG);
                                                        handleInputValueChange(g.varId, newG);
                                                    }
                                                    if (b) {
                                                        updatePoseValue(pose.id, b.varId, newB);
                                                        handleInputValueChange(b.varId, newB);
                                                    }
                                                } else {
                                                    if (r) handleInputValueChange(r.varId, newR);
                                                    if (g) handleInputValueChange(g.varId, newG);
                                                    if (b) handleInputValueChange(b.varId, newB);
                                                }
                                            };

                                            const renderColorInputs = (isPoseValue: boolean) => {
                                                const curR = isPoseValue
                                                    ? (r?.poseVal ?? 0)
                                                    : (inputValues[r?.varId ?? ""] ?? 0);
                                                const curG = isPoseValue
                                                    ? (g?.poseVal ?? 0)
                                                    : (inputValues[g?.varId ?? ""] ?? 0);
                                                const curB = isPoseValue
                                                    ? (b?.poseVal ?? 0)
                                                    : (inputValues[b?.varId ?? ""] ?? 0);
                                                const hex = rgbToHex(curR, curG, curB);

                                                return (
                                                    <div className="flex items-center gap-2 flex-1 group/row">
                                                        <Popover className="relative flex items-center">
                                                            <PopoverButton
                                                                className="w-8 h-4 rounded border border-slate-700 shadow-sm transition-transform hover:scale-105"
                                                                style={{ backgroundColor: hex }}
                                                            />
                                                            <PopoverPanel
                                                                anchor="bottom end"
                                                                className="flex flex-col gap-2 p-2 bg-slate-900 border border-slate-800 rounded-lg shadow-xl z-[100] mt-1"
                                                            >
                                                                <HexColorPicker
                                                                    color={hex}
                                                                    onChange={(h) => {
                                                                        const rgb = hexToRgb(h);
                                                                        if (rgb)
                                                                            handleBulkChange(
                                                                                isPoseValue,
                                                                                rgb.r,
                                                                                rgb.g,
                                                                                rgb.b,
                                                                            );
                                                                    }}
                                                                />
                                                            </PopoverPanel>
                                                        </Popover>
                                                        <div className="flex gap-1 flex-1 min-w-0">
                                                            {[
                                                                { c: r, ch: "R" as const },
                                                                { c: g, ch: "G" as const },
                                                                { c: b, ch: "B" as const },
                                                            ].map(({ c, ch }) => (
                                                                <div
                                                                    key={ch}
                                                                    className="flex-1 flex items-center bg-slate-950/40 rounded border border-slate-800/50 px-1 py-0.5"
                                                                >
                                                                    <ScrubbableLabel
                                                                        label={ch}
                                                                        onScrub={(delta, totalDelta) => {
                                                                            if (c?.varId) {
                                                                                const step = 0.01;
                                                                                const startVal =
                                                                                    scrubValuesRef.current[c.varId] ?? 0;
                                                                                const nextVal =
                                                                                    startVal + totalDelta * step;
                                                                                if (isPoseValue) {
                                                                                    updatePoseValue(
                                                                                        pose.id,
                                                                                        c.varId,
                                                                                        nextVal,
                                                                                    );
                                                                                    handleInputValueChange(
                                                                                        c.varId,
                                                                                        nextVal,
                                                                                    );
                                                                                } else
                                                                                    handleInputValueChange(
                                                                                        c.varId,
                                                                                        nextVal,
                                                                                    );
                                                                            }
                                                                        }}
                                                                        onScrubStart={() => {
                                                                            if (c?.varId) {
                                                                                const baseline = isPoseValue
                                                                                    ? c.poseVal
                                                                                    : (inputValues[c.varId] ?? 0);
                                                                                scrubValuesRef.current[c.varId] =
                                                                                    baseline;
                                                                            }
                                                                        }}
                                                                        className={cn(
                                                                            "text-[9px] font-bold mr-1",
                                                                            ch === "R"
                                                                                ? "text-red-500"
                                                                                : ch === "G"
                                                                                    ? "text-green-500"
                                                                                    : "text-blue-500",
                                                                        )}
                                                                    />
                                                                    <Input
                                                                        size="sm"
                                                                        type="text"
                                                                        value={(isPoseValue
                                                                            ? (c?.poseVal ?? 0)
                                                                            : (inputValues[c?.varId ?? ""] ?? 0)
                                                                        ).toFixed(2)}
                                                                        className="border-none text-right font-mono text-[9px] text-slate-300 bg-transparent h-auto p-0 shadow-none focus-within:ring-0"
                                                                        onChange={(e) => {
                                                                            const v = parseFloat(e.target.value);
                                                                            if (!isNaN(v) && c) {
                                                                                if (isPoseValue) {
                                                                                    updatePoseValue(pose.id, c.varId, v);
                                                                                    handleInputValueChange(c.varId, v);
                                                                                } else
                                                                                    handleInputValueChange(c.varId, v);
                                                                            }
                                                                        }}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {isPoseValue && (
                                                            <div className="flex gap-0.5 ml-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 w-6 p-0 text-slate-600 hover:text-red-400 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                                                    onClick={() =>
                                                                        item.components.forEach((c) =>
                                                                            removePoseInput(pose.id, c.varId),
                                                                        )
                                                                    }
                                                                    title="Remove all channels from Pose"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            };

                                            return (
                                                <RiggingPropertyRow
                                                    key={`color - ${item.featureId} -${idx} `}
                                                    label={item.label}
                                                    defaultLabel="Pose"
                                                    hasDifferentDefault={isDifferent}
                                                    onResetToDefault={() =>
                                                        item.components.forEach((c) =>
                                                            handleInputValueChange(c.varId, c.poseVal),
                                                        )
                                                    }
                                                    onSaveToDefault={() =>
                                                        item.components.forEach((c) =>
                                                            updatePoseValue(
                                                                pose.id,
                                                                c.varId,
                                                                inputValues[c.varId] ?? 0,
                                                            ),
                                                        )
                                                    }
                                                    renderMainInput={() => renderColorInputs(false)}
                                                    renderDefaultInput={() => renderColorInputs(true)}
                                                />
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <Button
                        variant="secondary"
                        size="sm"
                        className="w-full mt-2 gap-2 border-slate-800 bg-slate-800/40 hover:bg-slate-800/60"
                        onClick={() => setShowSelector(true)}
                    >
                        <Plus size={14} /> Add Variable
                    </Button>
                    <Modal
                        open={showSelector}
                        onClose={() => setShowSelector(false)}
                        title="Select Variable"
                        maxWidth="md"
                    >
                        <VariableSelector
                            onSelect={handleAddVariable}
                            onCancel={() => setShowSelector(false)}
                        />
                    </Modal>
                </div>
            );
        }
    }

    // 3. Rig Mode
    if (selectedRigId) {
        const rigInput = managedStandardInputs.find(
            (m) => m.input.id === selectedRigId,
        );
        if (rigInput) {
            const input = rigInput.input;
            const value = inputValues[input.id] ?? input.defaultValue ?? 0;
            const dependents = (() => {
                const list: { name: string; targetId: string }[] = [];
                Object.entries(bindings).forEach(([targetId, binding]) => {
                    const isDriven =
                        binding.inputId === selectedRigId ||
                        (binding.slots &&
                            binding.slots.some((s) => s.inputId === selectedRigId));
                    if (isDriven) {
                        let label = targetId;
                        for (const obj of objects) {
                            for (const feat of obj.features) {
                                for (const comp of feat.components) {
                                    if (comp.targetId === targetId) {
                                        label = `${obj.name} · ${feat.label} ${feat.components.length > 1 ? comp.label : ""} `;
                                        break;
                                    }
                                }
                            }
                        }
                        list.push({ name: label, targetId });
                    }
                });
                return list;
            })();

            const handleAddRigDrivenVariable = (selection: VariableSelection) => {
                setShowSelector(false);
                if (selection.type === "property") {
                    const obj = objects.find((o) => o.id === selection.objectId);
                    const feat = obj?.features.find((f) => f.id === selection.featureId);
                    if (feat && feat.components.length > 0) {
                        // Check all components
                        feat.components.forEach((comp) => {
                            const targetId = comp.targetId;
                            if (targetId) {
                                handleBindingInputChange(targetId, selectedRigId);
                            }
                        });
                    }
                }
            };

            return (
                <div className="p-2 flex flex-col gap-4 min-h-0 flex-1">
                    <InspectorHeader
                        name={input.label || input.id}
                        path={input.path || ""}
                        typeLabel="Rig"
                        id={input.id}
                        onNameChange={(name) =>
                            handleUpdateStandardInput(input.id, { label: name })
                        }
                        onPathChange={(path) =>
                            handleUpdateStandardInput(input.id, { path })
                        }
                    />
                    <RiggingPropertyRow
                        label="Current Value"
                        onScrubStart={() => {
                            scrubValuesRef.current[input.id] = value;
                        }}
                        onScrub={(_, totalDelta) => {
                            const step = (input.range.max - input.range.min) / 100;
                            const startVal = scrubValuesRef.current[input.id] ?? 0;
                            handleInputValueChange(input.id, startVal + totalDelta * step);
                        }}
                        renderMainInput={() => (
                            <div className="flex items-center gap-2 flex-1">
                                <Slider
                                    min={input.range.min ?? -1}
                                    max={input.range.max ?? 1}
                                    step={0.01}
                                    value={value}
                                    className="flex-1"
                                    onChange={(val) =>
                                        handleInputValueChange(input.id, val as number)
                                    }
                                />
                                <div className="w-12 flex-shrink-0">
                                    <NumberField
                                        size="sm"
                                        value={value}
                                        className="bg-slate-950/50 border-slate-800/50 text-right font-mono text-xs text-slate-300"
                                        onChange={(val) => handleInputValueChange(input.id, val)}
                                    />
                                </div>
                            </div>
                        )}
                    />
                    <div className="flex flex-col gap-2 flex-1 min-h-0">
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-2">
                            <Sliders size={12} />
                            Driving {dependents.length} properties
                        </div>
                        {dependents.length === 0 ? (
                            <div className="text-xs text-slate-500 italic px-2">
                                Not driving any scene properties
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar bg-slate-900/40 rounded p-1 border border-slate-800/50 flex-1">
                                {dependents.map((d) => (
                                    <div
                                        key={d.targetId}
                                        className="text-xs text-slate-300 p-1.5 hover:bg-slate-800/50 rounded flex items-center gap-2 group"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                                        <span className="flex-1 truncate">{d.name}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"
                                            onClick={() => handleResetBinding(d.targetId)}
                                            title="Remove binding"
                                        >
                                            <Trash2 size={10} />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <Button
                            variant="secondary"
                            size="sm"
                            className="w-full mt-2 gap-2 border-slate-800 bg-slate-800/40 hover:bg-slate-800/60 shrink-0"
                            onClick={() => setShowSelector(true)}
                        >
                            <Plus size={14} /> Add Driven Variable
                        </Button>
                        <Modal
                            open={showSelector}
                            onClose={() => setShowSelector(false)}
                            title="Select Property to Drive"
                            maxWidth="md"
                        >
                            <VariableSelector
                                onSelect={handleAddRigDrivenVariable}
                                onCancel={() => setShowSelector(false)}
                                defaultTab="scene"
                            />
                        </Modal>
                    </div>
                </div>
            );
        }
    }

    // Default: Empty State
    return (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs gap-3 border border-dashed border-slate-800/50 rounded-xl bg-slate-900/20 m-1">
            <p className="font-medium text-slate-400">
                Select an item to inspect details
            </p>
        </div>
    );
}
