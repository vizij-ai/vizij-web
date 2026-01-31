import React from "react";
import { SceneObjectNode } from "../../scene/sceneGraph";
import { RiggingTransformSection } from "./RiggingTransformSection";
import { BindingConnections } from "./BindingConnections";
import { RiggingMorphTargetsSection } from "./RiggingMorphTargetsSection";
import { RiggingMaterialSection } from "./RiggingMaterialSection";
import { Panel } from "../ui";
import { ObjectHeader } from "./ObjectHeader";
import { useBindingAuthoring } from "../../state/RigControllerProvider";

interface RiggingInspectorProps {
    node: SceneObjectNode;
}

export function RiggingInspector({ node }: RiggingInspectorProps) {
    const { handleRenameShape } = useBindingAuthoring((state) => state);

    return (
        <Panel className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0">
            <div className="flex flex-col gap-3 p-1">
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
