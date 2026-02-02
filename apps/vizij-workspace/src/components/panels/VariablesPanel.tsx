import { useMemo, useState, useEffect } from "react";
import { Plus, Folder, Zap, Activity, Play, ChevronRight } from "lucide-react";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
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

function getOrCreateChild(
    parent: TreeNode,
    key: string,
    label: string,
): TreeNode {
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

function simplifyNode(node: TreeNode): TreeNode {
    const newChildren = new Map<string, TreeNode>();
    for (const [key, child] of node.children) {
        newChildren.set(key, simplifyNode(child));
    }

    const newNode = { ...node, children: newChildren };

    if (newNode.type === "folder" && newNode.children.size === 1) {
        const child = newNode.children.values().next().value!;
        if (child.type === "folder") {
            return {
                ...child,
                label: `${newNode.label} / ${child.label}`,
            };
        }
    }

    return newNode;
}

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
    searchQuery: string;
}

function TreeRow({
    node,
    depth,
    expanded,
    onToggle,
    onAction,
    onSelect,
    selection,
    searchQuery,
}: TreeRowProps) {
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children.size > 0;

    // Check selection
    const isSelected =
        selection &&
        ((node.type === "pose" &&
            selection.type === "pose" &&
            (node.data as PoseDefinition)?.id === selection.id) ||
            (node.type === "rig" &&
                selection.type === "rig" &&
                (node.data as ManagedStandardInput)?.input?.id === selection.id));

    // Determine Icon
    let Icon = Folder;
    if (node.type === "pose") Icon = Activity;
    else if (node.type === "rig") Icon = Zap;

    const matchesQuery =
        searchQuery.trim().length > 0 &&
        node.label.toLowerCase().includes(searchQuery.toLowerCase());

    return (
        <div className="flex flex-col select-none">
            <div
                className={cn(
                    "group flex items-center gap-1.5 rounded-sm px-1 min-h-[22px] transition-all cursor-pointer",
                    isSelected
                        ? "bg-slate-700 text-slate-100"
                        : "hover:bg-slate-800/40 text-slate-400 hover:text-slate-200",
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
                        isExpanded && "rotate-90",
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
                <span
                    className={cn(
                        "flex items-center justify-center opacity-70",
                        node.type === "pose" && "text-purple-400",
                        node.type === "rig" && "text-yellow-400",
                    )}
                >
                    <Icon size={12} strokeWidth={2} />
                </span>

                {/* Label */}
                <span
                    className={cn(
                        "text-[11px] font-medium truncate flex-1 min-w-0",
                        matchesQuery &&
                        "text-yellow-400 underline decoration-yellow-400/50 underline-offset-2",
                    )}
                >
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
                                searchQuery={searchQuery}
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
    onSelectPose?: (id: string) => void;
}

export function VariablesPanel({
    selectedRigId,
    onSelectRig,
    onSelectPose,
}: VariablesPanelProps) {
    const { poses, applyPose, selectPose, selectedPoseId } = usePoseRig();
    const { managedStandardInputs } = useBindingAuthoring((state) => state);
    const referenceFace = useReferenceFace();

    // State for search
    const [search, setSearch] = useState("");

    // State for tree expansion
    const [expandedIds, setExpandedIds] = useState<Set<string>>(
        new Set(["root"]),
    );

    // Build Tree
    const rootNode = useMemo(() => {
        const root: TreeNode = {
            id: "root",
            label: "Variables",
            type: "folder",
            children: new Map(),
            showChildren: true,
        };

        const hasReferenceFace = !!referenceFace.file;

        // Helper to get the target root for main face items
        let targetRoot = root;
        if (hasReferenceFace) {
            const mainFaceRoot: TreeNode = {
                id: "main_face",
                label: "Main Face",
                type: "folder",
                children: new Map(),
                showChildren: true,
            };
            root.children.set("main_face", mainFaceRoot);
            targetRoot = mainFaceRoot;
        }

        // 1. Process Poses (Main Face)
        poses.forEach((pose) => {
            const groupParts = pose.group
                ? pose.group.split("/").filter(Boolean)
                : [];
            let current = targetRoot;

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

        // 2. Process Custom Rigs (Main Face)
        const customRigs = managedStandardInputs.filter(
            (m) => m.source === "custom",
        );
        customRigs.forEach((managed) => {
            const input = managed.input;
            const pathParts = input.path ? input.path.split("/").filter(Boolean) : [];

            let current = targetRoot;
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

        // --- Reference Face ---
        if (hasReferenceFace) {
            const refFaceRoot: TreeNode = {
                id: "ref_face",
                label: "Reference Face",
                type: "folder",
                children: new Map(),
                showChildren: true,
            };
            root.children.set("ref_face", refFaceRoot);

            if (referenceFace.isLoaded) {
                // Add standard inputs from Reference Face
                referenceFace.standardInputs.forEach((input) => {
                    const pathParts = input.path
                        ? input.path.split("/").filter(Boolean)
                        : [];
                    let current = refFaceRoot;
                    for (const part of pathParts) {
                        current = getOrCreateChild(current, part, part);
                    }

                    const key = `ref_${input.id}`;
                    current.children.set(key, {
                        id: `${current.id}/${key}`,
                        label: input.label || input.id,
                        type: "rig",
                        children: new Map(),
                        showChildren: false,
                        data: { input, source: "reference" } as any,
                    });
                });
            } else {
                refFaceRoot.children.set("placeholder", {
                    id: "ref_placeholder",
                    label: referenceFace.isLoading ? "Loading..." : "Waiting for file...",
                    type: "folder",
                    children: new Map(),
                    showChildren: false,
                });
            }
        }

        // Simplify tree structure (combine intermediate folders)
        const simplifiedChildren = new Map<string, TreeNode>();
        for (const [key, child] of root.children) {
            simplifiedChildren.set(key, simplifyNode(child));
        }
        root.children = simplifiedChildren;

        return root;
    }, [
        poses,
        managedStandardInputs,
        referenceFace.standardInputs,
        referenceFace.isLoaded,
        referenceFace.isLoading,
        referenceFace.file,
    ]);

    // Filter tree based on search
    const visibleRoot = useMemo(() => {
        if (!search.trim()) return rootNode;

        const query = search.trim().toLowerCase();

        const visit = (node: TreeNode): TreeNode | null => {
            const label = node.label.toLowerCase();
            const nodeMatches = label.includes(query);

            const filteredChildren = new Map<string, TreeNode>();
            let hasMatchingChild = false;

            for (const [key, child] of node.children) {
                const filteredChild = visit(child);
                if (filteredChild) {
                    filteredChildren.set(key, filteredChild);
                    hasMatchingChild = true;
                }
            }

            if (nodeMatches || hasMatchingChild) {
                // If it's a folder, we need to clone it to update children map.
                // We also want to ensure it's expanded if it has matching children.
                return {
                    ...node,
                    children: filteredChildren,
                    // When searching, we generally want to see the results, so effectively treated as expanded
                    // But tree expansion state is managed separately.
                };
            }

            return null;
        };

        // Filter children of root
        const filteredRootChildren = new Map<string, TreeNode>();
        for (const [key, child] of rootNode.children) {
            const filteredChild = visit(child);
            if (filteredChild) {
                filteredRootChildren.set(key, filteredChild);
            }
        }

        return {
            ...rootNode,
            children: filteredRootChildren,
        };
    }, [rootNode, search]);

    // Auto-expand folders when searching
    useEffect(() => {
        if (!search.trim()) return;

        const idsToExpand = new Set<string>();
        const visit = (node: TreeNode) => {
            // Expand everything in the filtered tree
            idsToExpand.add(node.id);
            for (const child of node.children.values()) {
                visit(child);
            }
        };
        for (const child of visibleRoot.children.values()) {
            visit(child);
        }
        setExpandedIds((prev) => {
            const next = new Set(prev);
            idsToExpand.forEach((id) => next.add(id));
            return next;
        });
    }, [visibleRoot, search]);

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
            if (onSelectPose) {
                onSelectPose(poseData.id);
            } else {
                selectPose(poseData.id);
            }
            applyPose(poseData.id); // Auto-play on selection
            // When selecting logic, we might also want to clear rig selection?
            onSelectRig?.(null);
        } else if (node.type === "rig") {
            const rigData = node.data as ManagedStandardInput;
            onSelectRig?.(rigData.input.id);
        }
    };

    // Calculate total count
    const totalCount =
        poses.length +
        managedStandardInputs.filter((m) => m.source === "custom").length;

    const actions = (
        <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-500 hover:text-slate-200"
        >
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
            description="Manage poses and rig variables."
            className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
            actions={actions}
            badge={`${totalCount}`}
        >
            <div className="flex flex-col h-full gap-0.5 p-1">
                {/* Search Input */}
                <div className="flex items-center gap-2 px-1 mb-1">
                    <div className="relative flex-1 group h-7">
                        <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-500 transition-colors">
                            <svg
                                className="w-3.5 h-3.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <circle cx="11" cy="11" r="8" />
                                <path d="m21 21-4.3-4.3" />
                            </svg>
                        </div>
                        <input
                            type="search"
                            className="w-full h-full rounded bg-slate-900/50 border border-slate-800 hover:border-slate-700 focus:border-blue-500/50 pl-7 pr-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-all font-medium"
                            placeholder="Filter..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {visibleRoot.children.size === 0 ? (
                        <div className="flex flex-col items-center justify-center h-24 text-slate-500 text-xs gap-2 border border-dashed border-slate-800/50 rounded-xl bg-slate-900/20 m-1">
                            {search.trim().length > 0 ? (
                                <>
                                    <span className="font-medium text-slate-400">No results</span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSearch("")}
                                        className="h-6 text-[10px] text-blue-400 hover:text-blue-300"
                                    >
                                        Clear
                                    </Button>
                                </>
                            ) : (
                                <span>No variables defined</span>
                            )}
                        </div>
                    ) : (
                        Array.from(visibleRoot.children.values())
                            .sort((a, b) => {
                                if (a.type === "folder" && b.type !== "folder") return -1;
                                if (a.type !== "folder" && b.type === "folder") return 1;
                                return a.label.localeCompare(b.label);
                            })
                            .map((child) => (
                                <TreeRow
                                    key={child.id}
                                    node={child}
                                    depth={0}
                                    expanded={expandedIds}
                                    onToggle={handleToggle}
                                    onAction={handleAction}
                                    onSelect={handleSelect}
                                    selection={activeSelection}
                                    searchQuery={search}
                                />
                            ))
                    )}
                </div>
            </div>
        </Panel>
    );
}
