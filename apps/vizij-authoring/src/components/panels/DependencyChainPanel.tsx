import React, { useMemo } from "react";
import ReactFlow, {
    Background,
    Controls,
    Edge,
    Node,
    Position,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { useBindingAuthoringStore } from "../../state/bindingAuthoringStore";
import { usePoseRigStore } from "../../poseRig/store";

export function DependencyChainPanel({
    onNodeClick
}: {
    onNodeClick?: (id: string) => void;
}) {
    const inputsById = useBindingAuthoringStore((state) => state.standardInputsById);
    const pipelineConfig = useBindingAuthoringStore((state) => state.pipelineConfigByInputId);
    const inputBindings = useBindingAuthoringStore((state) => state.inputBindings);
    const inputValues = useBindingAuthoringStore((state) => state.inputValues);

    // Grab poses to show them as drivers
    const poses = usePoseRigStore((state) => state.poses);

    const [layoutDir, setLayoutDir] = React.useState<"LR" | "TB">("LR");
    const [hideUnconnected, setHideUnconnected] = React.useState(false);
    const [focusSelected, setFocusSelected] = React.useState(false);
    const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);

    const { nodes, edges } = useMemo(() => {
        let newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        const inputList = Array.from(inputsById.values());

        // 1. Add Input Nodes & Edges from Slots
        inputList.forEach((input) => {
            const val = inputValues[input.id] ?? input.defaultValue ?? 0;

            // Look up if this input is a pose weight
            const isPoseWeight = input.path?.includes("/poses/") && input.path?.endsWith(".weight");
            const poseIdMatch = isPoseWeight ? input.path?.match(/\/poses\/([^/]+)\.weight/) : null;
            const poseId = poseIdMatch ? poseIdMatch[1] : null;

            // If it's a pose, let's grab the pose definition so we can name it better
            const poseDef = poseId ? poses.find(p => p.id === poseId || input.path?.includes(p.id)) : null;

            const sourcePosition = layoutDir === "LR" ? Position.Right : Position.Bottom;
            const targetPosition = layoutDir === "LR" ? Position.Left : Position.Top;

            let label = `${input.label || input.id}\nval: ${val.toFixed(2)}`;
            let background = "#1e1e1e";
            let border = "1px solid #444";

            if (isPoseWeight) {
                background = "#1e3a2a"; // Green pose theme
                border = "1px solid #10b981";
                label = `[Pose] ${poseDef?.name || poseId || input.label}\nweight: ${val.toFixed(2)}`;
            }

            newNodes.push({
                id: input.id,
                position: { x: 0, y: 0 },
                sourcePosition,
                targetPosition,
                data: { label },
                type: "default",
                style: {
                    background,
                    color: "#eee",
                    border,
                    borderRadius: "8px",
                    padding: "10px",
                    fontSize: "12px",
                    textAlign: "center" as const,
                    cursor: "pointer",
                }
            });

            // Standard input binding edges (what drives THIS node)
            const binding = inputBindings[input.id] as Record<string, any> | undefined;
            const slots = binding?.slots;
            if (Array.isArray(slots)) {
                slots.forEach((slot: any) => {
                    if (slot && slot.inputId && slot.inputId !== "self" && slot.inputId !== "") {
                        if (inputsById.has(slot.inputId)) {
                            newEdges.push({
                                id: `${slot.inputId}->${input.id}`,
                                source: slot.inputId,
                                target: input.id,
                                animated: true,
                                style: { stroke: "#888", strokeWidth: 2 },
                            });
                        }
                    }
                });
            }
        });

        // 2. Add Pose Groups and connect them to their Poses
        const groupsAdded = new Set<string>();

        const sourcePosition = layoutDir === "LR" ? Position.Right : Position.Bottom;
        const targetPosition = layoutDir === "LR" ? Position.Left : Position.Top;

        poses.forEach((pose) => {
            // Find the actual weight input node for this pose
            const poseWeightInput = inputList.find(i => i.path?.includes(`/poses/`) && i.path?.includes(pose.id) && i.path?.endsWith(".weight"));
            const poseNodeId = poseWeightInput ? poseWeightInput.id : null;

            // Connect pose to its driven targets
            if (poseNodeId && pose.values) {
                Object.keys(pose.values).forEach((targetInputId) => {
                    if (inputsById.has(targetInputId)) {
                        newEdges.push({
                            id: `${poseNodeId}->${targetInputId}`,
                            source: poseNodeId,
                            target: targetInputId,
                            animated: true,
                            style: { stroke: "#10b981", strokeWidth: 2, strokeDasharray: "4 4" },
                        });
                    }
                });
            }

            // Add group node and edge (if there is a valid pose to point it to)
            if (poseNodeId) {
                const groupId = pose.group || "Ungrouped";
                const groupNodeId = `group:${groupId}`;
                if (!groupsAdded.has(groupId)) {
                    groupsAdded.add(groupId);
                    newNodes.push({
                        id: groupNodeId,
                        position: { x: 0, y: 0 },
                        sourcePosition,
                        targetPosition,
                        data: { label: `[Group]\n${groupId}` },
                        type: "default",
                        style: {
                            background: "#3a2a1e",
                            color: "#eee",
                            border: "1px solid #f59e0b",
                            borderRadius: "8px",
                            padding: "10px",
                            fontSize: "12px",
                            textAlign: "center" as const,
                            cursor: "pointer",
                        }
                    });
                }
                newEdges.push({
                    id: `${groupNodeId}->${poseNodeId}`,
                    source: groupNodeId,
                    target: poseNodeId,
                    animated: false,
                    style: { stroke: "#f59e0b", strokeWidth: 2 },
                });
            }
        });

        // 3. Filter graph

        let finalNodes = newNodes;
        let finalEdges = newEdges;

        if (focusSelected && selectedNodeId) {
            const reachable = new Set<string>();
            reachable.add(selectedNodeId);

            const forward = new Map<string, string[]>();
            const backward = new Map<string, string[]>();

            finalEdges.forEach(e => {
                if (!forward.has(e.source)) forward.set(e.source, []);
                forward.get(e.source)!.push(e.target);

                if (!backward.has(e.target)) backward.set(e.target, []);
                backward.get(e.target)!.push(e.source);
            });

            // Gather descendants (forward)
            let queue = [selectedNodeId];
            while (queue.length > 0) {
                const cur = queue.pop()!;
                const targets = forward.get(cur) || [];
                for (const t of targets) {
                    if (!reachable.has(t)) {
                        reachable.add(t);
                        queue.push(t);
                    }
                }
            }

            // Gather ancestors (backward)
            queue = [selectedNodeId];
            while (queue.length > 0) {
                const cur = queue.pop()!;
                const sources = backward.get(cur) || [];
                for (const s of sources) {
                    if (!reachable.has(s)) {
                        reachable.add(s);
                        queue.push(s);
                    }
                }
            }

            finalNodes = finalNodes.filter(n => reachable.has(n.id));
            finalEdges = finalEdges.filter(e => reachable.has(e.source) && reachable.has(e.target));
        }

        if (hideUnconnected) {
            const connectedNodeIds = new Set<string>();
            finalEdges.forEach(edge => {
                connectedNodeIds.add(edge.source);
                connectedNodeIds.add(edge.target);
            });
            finalNodes = finalNodes.filter(node => connectedNodeIds.has(node.id));
        }

        // 4. Layout with Dagre
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        dagreGraph.setGraph({ rankdir: layoutDir, nodesep: 50, ranksep: 200 });

        finalNodes.forEach((node) => {
            dagreGraph.setNode(node.id, { width: 150, height: 60 });
        });

        finalEdges.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        // 5. Align Leaf Nodes (Nodes with out-edges = 0) to the maximum rank
        const layoutedNodesCoords = finalNodes.map((node) => {
            return { id: node.id, ...dagreGraph.node(node.id) };
        });

        // Determine min/max ranks based on layoutDir ('x' for LR, 'y' for TB)
        const rankAxis = layoutDir === "LR" ? "x" : "y";
        let maxRankVal = -Infinity;

        layoutedNodesCoords.forEach(n => {
            if (n[rankAxis] > maxRankVal) {
                maxRankVal = n[rankAxis];
            }
        });

        // Adjust positions
        const layoutedNodes = finalNodes.map((node) => {
            const n = dagreGraph.node(node.id);
            const outEdges = dagreGraph.outEdges(node.id);

            // If it's a leaf node, push it to the max rank level
            let finalAxisValue = n[rankAxis];
            if (outEdges && outEdges.length === 0) {
                finalAxisValue = maxRankVal;
            }

            node.position = {
                x: (layoutDir === "LR" ? finalAxisValue : n.x) - 75,
                y: (layoutDir === "TB" ? finalAxisValue : n.y) - 30,
            };
            return node;
        });

        return { nodes: layoutedNodes, edges: finalEdges };
    }, [inputsById, pipelineConfig, inputBindings, inputValues, layoutDir, hideUnconnected, poses, focusSelected, selectedNodeId]);

    const handleNodeClick = React.useCallback((event: React.MouseEvent, node: Node) => {
        setSelectedNodeId(node.id);
        if (onNodeClick) {
            onNodeClick(node.id);
        }
    }, [onNodeClick]);

    const handlePaneClick = React.useCallback(() => {
        setSelectedNodeId(null);
        if (onNodeClick) {
            onNodeClick("");
        }
    }, [onNodeClick]);

    return (
        <div className="w-full h-full flex flex-col relative text-text-primary">
            <div className="shrink-0 p-2 border-b border-border-default bg-bg-panel flex items-center justify-between">
                <h2 className="text-sm font-semibold">Dependency Chain</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setFocusSelected(prev => !prev)}
                        className={`text-xs px-2 py-1 rounded transition-colors ${focusSelected ? "bg-accent-default text-white" : "bg-bg-subtle text-text-muted hover:bg-bg-hover hover:text-text-primary"}`}
                    >
                        {focusSelected ? "Unfocus Selected" : "Focus Selected"}
                    </button>
                    <button
                        onClick={() => setHideUnconnected(prev => !prev)}
                        className={`text-xs px-2 py-1 rounded transition-colors ${hideUnconnected ? "bg-accent-default text-white" : "bg-bg-subtle text-text-muted hover:bg-bg-hover hover:text-text-primary"}`}
                    >
                        {hideUnconnected ? "Show Unconnected" : "Hide Unconnected"}
                    </button>
                    <button
                        onClick={() => setLayoutDir(prev => prev === "LR" ? "TB" : "LR")}
                        className="text-xs px-2 py-1 rounded bg-bg-subtle text-text-muted hover:bg-bg-hover transition-colors flex items-center gap-1"
                    >
                        <span>Layout: {layoutDir === "LR" ? "Horizontal" : "Vertical"}</span>
                    </button>
                </div>
            </div>
            <div className="flex-1 min-h-0 bg-bg-app">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    fitView
                    onNodeClick={handleNodeClick}
                    onPaneClick={handlePaneClick}
                    nodesDraggable={true}
                    nodesConnectable={false}
                    elementsSelectable={true}
                >
                    <Background color="#444" gap={16} />
                    <Controls />
                </ReactFlow>
            </div>
        </div>
    );
}
