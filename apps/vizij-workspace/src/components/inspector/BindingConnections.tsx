import React, { useMemo } from "react";
import { SceneObjectNode } from "../../scene/sceneGraph";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { Button } from "../ui";
import { ArrowRight, Link as LinkIcon, Link2 } from "lucide-react";

interface BindingConnectionsProps {
    node: SceneObjectNode;
}

export function BindingConnections({ node }: BindingConnectionsProps) {
    const { bindings, standardInputsById } = useBindingAuthoring((state) => state);
    const { selectObject } = useSceneComposer();

    const connections = useMemo(() => {
        const uniqueInputs = new Map<string, { id: string; label: string; features: string[] }>();

        node.features.forEach(feature => {
            feature.components.forEach(comp => {
                const targetId = comp.targetId;
                if (targetId && bindings[targetId]) {
                    bindings[targetId].slots.forEach(slot => {
                        const inputId = slot.inputId;
                        if (inputId && !uniqueInputs.has(inputId)) {
                            const input = standardInputsById.get(inputId);
                            const label = input?.label || input?.path || inputId;

                            // Initialize
                            if (!uniqueInputs.has(inputId)) {
                                uniqueInputs.set(inputId, { id: inputId, label, features: [] });
                            }

                            // Track features driven by this input
                            const entry = uniqueInputs.get(inputId)!;
                            const featureName = feature.label || feature.key;
                            if (!entry.features.includes(featureName)) {
                                entry.features.push(featureName);
                            }
                        }
                    });
                }
            });
        });
        return Array.from(uniqueInputs.values());
    }, [node, bindings, standardInputsById]);

    if (connections.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 p-2 mt-2 border-t border-slate-800/50">
            <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                <LinkIcon size={10} />
                Connected To
            </label>
            <div className="flex flex-wrap gap-1">
                {connections.map(conn => (
                    <Button
                        key={conn.id}
                        variant="secondary"
                        size="sm"
                        className="h-6 text-[10px] px-2 bg-slate-800/50 hover:bg-blue-600/20 hover:text-blue-300 border-slate-700 hover:border-blue-500/30 transition-colors"
                        title={`Drives: ${conn.features.join(", ")}`}
                        onClick={() => {
                            selectObject(conn.id);
                        }}
                    >
                        {conn.label}
                    </Button>
                ))}
            </div>
        </div>
    );
}
