import React from "react";
import { Box, Folder } from "lucide-react";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { Panel } from "../ui";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { RiggingTransformSection } from "./RiggingTransformSection";
import { BindingConnections } from "./BindingConnections";
import { RiggingMorphTargetsSection } from "./RiggingMorphTargetsSection";
import { RiggingMaterialSection } from "./RiggingMaterialSection";

interface RiggingInspectorProps {
    node: SceneObjectNode;
}

interface ObjectHeaderProps {
    name: string;
    typeLabel: string;
    id: string;
    onNameChange: (name: string) => void;
}

function ObjectHeader({ name, typeLabel, id, onNameChange }: ObjectHeaderProps) {
    const isShape = typeLabel.toLowerCase() === 'shape';
    const Icon = isShape ? Box : Folder;
    const label = isShape ? "Shape" : "Group";

    return (
        <div className="flex flex-col gap-0.5 mb-1 px-1">
            <div className="flex items-center gap-1.5">
                {/* Type Badge / Icon */}
                <div
                    className="flex items-center justify-center w-5 h-5 bg-blue-500/10 text-blue-400 rounded-sm select-none shrink-0 border border-blue-500/20"
                    title={label}
                >
                    <Icon size={12} strokeWidth={2.5} />
                </div>

                {/* Name Input */}
                <div className="relative flex-1 group">
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        className="w-full bg-transparent border border-transparent hover:border-slate-700 focus:border-blue-500/50 rounded px-1 py-0 text-xs font-semibold text-slate-200 focus:outline-none focus:bg-slate-900/50 transition-all placeholder-slate-600"
                        placeholder="Node Name"
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-30 pointer-events-none">
                        <span className="text-[8px] text-slate-400">✎</span>
                    </div>
                </div>
            </div>

            {/* ID */}
            <div className="pl-[26px]">
                <div className="text-[9px] text-slate-600 font-mono select-all truncate hover:text-slate-500 transition-colors cursor-text" title={`ID: ${id}`}>
                    {id}
                </div>
            </div>
        </div>
    );
}

export function RiggingInspector({ node }: RiggingInspectorProps) {
    const { handleRenameShape } = useBindingAuthoring((state) => state);

    return (
        <Panel
            title="Inspector"
            description="View and edit selected object properties."
            className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
        >

            <div className="flex flex-col gap-1 p-1">
                <ObjectHeader
                    name={node.name || node.id}
                    typeLabel={node.type}
                    id={node.id}
                    onNameChange={(name) => handleRenameShape(node.id, name)}
                />

                {/* New Compact Rigging Sections */}
                <RiggingTransformSection node={node} />

                <RiggingMorphTargetsSection node={node} />
                <RiggingMaterialSection node={node} />

                <BindingConnections node={node} />

            </div>
        </Panel>
    );
}
