import { useMemo, useState } from "react";
import { Plus, Folder, Zap, Activity, Play, ChevronRight, ChevronDown } from "lucide-react";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { usePoseRig } from "../../state/PoseRigProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { cn } from "../../utils/cn";
import type { PoseDefinition } from "../../poseRig/types";
import type { ManagedStandardInput } from "../../types/standardInputs";

// ----------------------------------------------------------------------------
// Types & Helper Functions
// ----------------------------------------------------------------------------

type NodeType = "folder" | "pose" | "rig";

interface TreeNode {
    id: string;
    label: string;
    type: NodeType;
    children: Map<string, TreeNode>;
    showChildren: boolean; // Default expansion state
    data?: PoseDefinition | ManagedStandardInput;
}

function getOrCreateChild(parent: TreeNode, key: string, label: string): TreeNode {
    if (!parent.children.has(key)) {
        parent.children.set(key, {
            id: `${parent.id}/${key}`,
            label,
            type: "folder",
            children: new Map(),
            showChildren: true,
        });
    }
    return parent.children.get(key)!;
}

// ----------------------------------------------------------------------------
// Components
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Components
// ----------------------------------------------------------------------------

interface TreeRowProps {
    node: TreeNode;
    depth: number;
    expanded: Set<string>;
    onToggle: (id: string) => void;
    onAction?: (node: TreeNode, action: string) => void;
    onSelect?: (node: TreeNode) => void;
    selection?: { type: "pose" | "rig"; id: string } | null;
}

function TreeRow({ node, depth, expanded, onToggle, onAction, onSelect, selection }: TreeRowProps) {
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children.size > 0;

    // Check selection
    const isSelected = selection &&
        ((node.type === "pose" && selection.type === "pose" && (node.data as PoseDefinition)?.id === selection.id) ||
            (node.type === "rig" && selection.type === "rig" && (node.data as ManagedStandardInput)?.input?.id === selection.id));

    // Determine Icon
    let Icon = Folder;
    if (node.type === "pose") Icon = Activity;
    else if (node.type === "rig") Icon = Zap;

    return (
        <div className="flex flex-col select-none">
            <div
                className={cn(
                    "group flex items-center gap-1.5 rounded-sm px-1 min-h-[22px] transition-all cursor-pointer",
                    isSelected ? "bg-slate-700 text-slate-100" : "hover:bg-slate-800/40 text-slate-400 hover:text-slate-200"
                )}
                style={{ paddingLeft: `${depth * 12 + 4}px` }}
                onClick={(e) => {
                    e.stopPropagation();
                    if (hasChildren) {
                        onToggle(node.id);
                    } else {
                        onSelect?.(node);
                    }
                }}
            >
                {/* Expander Arrow */}
                <span
                    className={cn(
                        "flex h-3 w-3 shrink-0 items-center justify-center transition-transform duration-200",
                        !hasChildren && "opacity-0",
                        isExpanded && "rotate-90"
                    )}
                    onClick={(e) => {
                        // Allow toggling folder even if selecting it (though folders aren't selectable here)
                        e.stopPropagation();
                        onToggle(node.id);
                    }}
                >
                    <ChevronRight size={10} strokeWidth={2.5} />
                </span>

                {/* Type Icon */}
                <span className={cn(
                    "flex items-center justify-center opacity-70",
                    node.type === "pose" && "text-purple-400",
                    node.type === "rig" && "text-yellow-400"
                )}>
                    <Icon size={12} strokeWidth={2} />
                </span>

                {/* Label */}
                <span className="text-[11px] font-medium truncate flex-1 min-w-0">
                    {node.label}
                </span>

                {/* Actions (Hover) */}
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                    {node.type === "pose" && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 hover:text-green-400"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAction?.(node, "play");
                            }}
                            title="Apply Pose"
                        >
                            <Play size={10} fill="currentColor" />
                        </Button>
                    )}

                    {node.type === "rig" && node.data && (
                        <span className="text-[9px] font-mono bg-slate-950/50 px-1 rounded text-slate-500">
                            Rig
                        </span>
                    )}
                </div>
            </div>

            {/* Children */}
            {hasChildren && isExpanded && (
                <div className="flex flex-col">
                    {Array.from(node.children.values())
                        .sort((a, b) => {
                            // Folders first
                            if (a.type === "folder" && b.type !== "folder") return -1;
                            if (a.type !== "folder" && b.type === "folder") return 1;
                            return a.label.localeCompare(b.label);
                        })
                        .map((child) => (
                            <TreeRow
                                key={child.id}
                                node={child}
                                depth={depth + 1}
                                expanded={expanded}
                                onToggle={onToggle}
                                onAction={onAction}
                                onSelect={onSelect}
                                selection={selection}
                            />
                        ))}
                </div>
            )}
        </div>
    );
}

interface VariablesPanelProps {
    selectedRigId?: string | null;
    onSelectRig?: (id: string | null) => void;
}

export function VariablesPanel({ selectedRigId, onSelectRig }: VariablesPanelProps) {
    const { poses, applyPose, selectPose, selectedPoseId } = usePoseRig();
    const { managedStandardInputs } = useBindingAuthoring((state) => state);

    // State for tree expansion
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(["root"]));

    // Build Tree
    const rootNode = useMemo(() => {
        const root: TreeNode = {
            id: "root",
            label: "Variables",
            type: "folder",
            children: new Map(),
            showChildren: true,
        };

        // 1. Process Poses
        poses.forEach((pose) => {
            const groupParts = pose.group ? pose.group.split("/").filter(Boolean) : [];
            let current = root;

            // Traverse/Create groups
            for (const part of groupParts) {
                current = getOrCreateChild(current, part, part);
            }

            // Add Pose Node
            const poseKey = `pose_${pose.id}`;
            current.children.set(poseKey, {
                id: `${current.id}/${poseKey}`,
                label: pose.name,
                type: "pose",
                children: new Map(),
                showChildren: false,
                data: pose,
            });
        });

        // 2. Process Custom Rigs
        const customRigs = managedStandardInputs.filter(m => m.source === "custom");
        customRigs.forEach((managed) => {
            const input = managed.input;
            const pathParts = input.path ? input.path.split("/").filter(Boolean) : [];

            let current = root;
            for (const part of pathParts) {
                current = getOrCreateChild(current, part, part);
            }

            const rigKey = `rig_${input.id}`;
            current.children.set(rigKey, {
                id: `${current.id}/${rigKey}`,
                label: input.label || input.id,
                type: "rig",
                children: new Map(),
                showChildren: false,
                data: managed,
            });
        });

        return root;
    }, [poses, managedStandardInputs]);


    const handleToggle = (id: string) => {
        const newExpanded = new Set(expandedIds);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedIds(newExpanded);
    };

    const handleAction = (node: TreeNode, action: string) => {
        if (node.type === "pose" && action === "play") {
            const poseData = node.data as PoseDefinition;
            applyPose(poseData.id);
        }
    };

    const handleSelect = (node: TreeNode) => {
        if (node.type === "pose") {
            const poseData = node.data as PoseDefinition;
            selectPose(poseData.id);
            // When selecting logic, we might also want to clear rig selection?
            onSelectRig?.(null);
        } else if (node.type === "rig") {
            const rigData = node.data as ManagedStandardInput;
            onSelectRig?.(rigData.input.id);
        }
    };

    // Calculate total count
    const totalCount = poses.length + managedStandardInputs.filter(m => m.source === "custom").length;

    const actions = (
        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-slate-200">
            <Plus className="h-4 w-4" />
        </Button>
    );

    const activeSelection = useMemo(() => {
        if (selectedPoseId) return { type: "pose" as const, id: selectedPoseId };
        if (selectedRigId) return { type: "rig" as const, id: selectedRigId };
        return null;
    }, [selectedPoseId, selectedRigId]);

    return (
        <Panel
            title="Variables"
            className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
            actions={actions}
            badge={`${totalCount}`}
        >
            <div className="flex flex-col h-full gap-0.5 p-1 overflow-y-auto custom-scrollbar">
                {rootNode.children.size === 0 ? (
                    <div className="flex flex-col items-center justify-center h-24 text-slate-500 text-xs gap-2 border border-dashed border-slate-800/50 rounded-xl bg-slate-900/20 m-1">
                        <span>No variables defined</span>
                    </div>
                ) : (
                    Array.from(rootNode.children.values())
                        .sort((a, b) => {
                            if (a.type === "folder" && b.type !== "folder") return -1;
                            if (a.type !== "folder" && b.type === "folder") return 1;
                            return a.label.localeCompare(b.label);
                        })
                        .map(child => (
                            <TreeRow
                                key={child.id}
                                node={child}
                                depth={0}
                                expanded={expandedIds}
                                onToggle={handleToggle}
                                onAction={handleAction}
                                onSelect={handleSelect}
                                selection={activeSelection}
                            />
                        ))
                )}
            </div>
        </Panel>
    );
}
