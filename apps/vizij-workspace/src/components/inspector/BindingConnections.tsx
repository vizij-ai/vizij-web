import React, { useMemo } from "react";
import { SceneObjectNode } from "../../scene/sceneGraph";
import { useBindingAuthoring, useSelectionStore } from "../../state/RigControllerProvider";
import { usePoseRig } from "../../state/PoseRigProvider";
import { usePoseRigStore } from "../../poseRig/store";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { Button } from "../ui";
import { Link as LinkIcon, Box, Sparkles } from "lucide-react";

interface BindingConnectionsProps {
    node: SceneObjectNode;
}

export function BindingConnections({ node }: BindingConnectionsProps) {
    const bindings = useBindingAuthoring((state) => state.bindings);
    const standardInputsById = useBindingAuthoring((state) => state.standardInputsById);
    const handleSelectRig = useBindingAuthoring((state) => state.handleSelectRig);

    const { selectPose } = usePoseRig();
    const poses = usePoseRigStore((state) => state.poses);
    const neutralInputs = usePoseRigStore((state) => state.neutralInputs);

    const { handleClearSelection } = useSelectionStore();

    const connections = useMemo(() => {
        const rigDrivers = new Map<string, { id: string; label: string; features: string[] }>();
        const poseDrivers = new Map<string, { id: string; label: string; features: string[] }>();

        // 1. Find direct Rig drivers
        node.features.forEach(feature => {
            feature.components.forEach(comp => {
                const targetId = comp.targetId;
                if (targetId && bindings[targetId]) {
                    bindings[targetId].slots.forEach(slot => {
                        const inputId = slot.inputId;
                        if (inputId) {
                            const input = standardInputsById.get(inputId);
                            const label = input?.label || input?.path || inputId;

                            if (!rigDrivers.has(inputId)) {
                                rigDrivers.set(inputId, { id: inputId, label, features: [] });
                            }

                            const entry = rigDrivers.get(inputId)!;
                            const featureName = feature.label || feature.key;
                            if (!entry.features.includes(featureName)) {
                                entry.features.push(featureName);
                            }
                        }
                    });
                }
            });
        });

        // 2. Find Poses that drive these Rigs
        const drivenRigIds = Array.from(rigDrivers.keys());
        if (drivenRigIds.length > 0) {
            poses.forEach(pose => {
                const drivenFeatures = new Set<string>();
                let isDriving = false;

                drivenRigIds.forEach(rigId => {
                    const poseValue = pose.values[rigId];
                    const neutralValue = neutralInputs[rigId] ?? 0;

                    // If pose has a non-neutral value for this rig, it's a driver
                    if (poseValue !== undefined && poseValue !== neutralValue) {
                        isDriving = true;
                        rigDrivers.get(rigId)?.features.forEach(f => drivenFeatures.add(f));
                    }
                });

                if (isDriving) {
                    poseDrivers.set(pose.id, {
                        id: pose.id,
                        label: pose.name,
                        features: Array.from(drivenFeatures)
                    });
                }
            });
        }

        return {
            rigs: Array.from(rigDrivers.values()),
            poses: Array.from(poseDrivers.values())
        };
    }, [node, bindings, standardInputsById, poses, neutralInputs]);

    if (connections.rigs.length === 0 && connections.poses.length === 0) return null;

    return (
        <div className="flex flex-col gap-3 p-2 mt-2 border-t border-slate-800/50">
            <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                <LinkIcon size={10} />
                Connected To
            </label>

            <div className="flex flex-col gap-1.5">
                {/* Poses First as they are higher level */}
                {connections.poses.length > 0 && (
                    <div className="flex flex-col gap-1">
                        <span className="text-[9px] text-slate-600 font-medium px-1">POSES</span>
                        {connections.poses.map(pose => (
                            <Button
                                key={pose.id}
                                variant="secondary"
                                size="sm"
                                className="h-auto py-1 text-[10px] px-2 bg-purple-900/10 hover:bg-purple-600/20 hover:text-purple-300 border-purple-500/20 hover:border-purple-500/40 transition-colors justify-start"
                                onClick={() => {
                                    selectPose(pose.id);
                                    handleClearSelection();
                                }}
                            >
                                <div className="flex flex-col items-start gap-0.5">
                                    <div className="flex items-center gap-1.5 font-semibold">
                                        <Sparkles size={10} className="text-purple-400" />
                                        {pose.label}
                                    </div>
                                    <span className="text-[9px] opacity-50 truncate max-w-[160px]">
                                        drives: {pose.features.slice(0, 3).join(", ")}{pose.features.length > 3 ? "..." : ""}
                                    </span>
                                </div>
                            </Button>
                        ))}
                    </div>
                )}

                {/* Rigs */}
                {connections.rigs.length > 0 && (
                    <div className="flex flex-col gap-1">
                        <span className="text-[9px] text-slate-600 font-medium px-1">RIGS</span>
                        {connections.rigs.map(rig => (
                            <Button
                                key={rig.id}
                                variant="secondary"
                                size="sm"
                                className="h-auto py-1 text-[10px] px-2 bg-slate-800/30 hover:bg-blue-600/20 hover:text-blue-300 border-slate-700/50 hover:border-blue-500/30 transition-colors justify-start"
                                onClick={() => {
                                    handleSelectRig(rig.id);
                                    handleClearSelection();
                                }}
                            >
                                <div className="flex flex-col items-start gap-0.5">
                                    <div className="flex items-center gap-1.5 font-semibold">
                                        <Box size={10} className="text-blue-400" />
                                        {rig.label}
                                    </div>
                                    <span className="text-[9px] opacity-50 truncate max-w-[160px]">
                                        drives: {rig.features.join(", ")}
                                    </span>
                                </div>
                            </Button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
