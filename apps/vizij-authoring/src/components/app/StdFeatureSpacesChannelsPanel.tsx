import { type JSX, useCallback, useMemo, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";
import { normalizeStandardRigInputPath } from "@vizij/utils";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { useHierarchyTreeState } from "../scene-composer/useHierarchyTreeState";
import { Button, Panel, Chip, Input } from "../ui";
import { cn } from "../../utils/cn";

/**
 * Represents a node in the standard input tree hierarchy.
 */
interface TreeNode {
  /** Unique path-based ID for this node (e.g., "face/left_eye", "face/left_eye/pos") */
  id: string;
  /** Display name for this node (the last segment of the path) */
  name: string;
  /** Child nodes */
  children: Map<string, TreeNode>;
  /** If this is a leaf node, the associated StandardRigInput */
  input?: StandardRigInput;
  /** Whether this node represents an actual input (leaf) or just a grouping */
  isLeaf: boolean;
  /** Depth level: 0 = namespace, 1 = channel, 2 = track, 3 = attribute */
  depth: number;
}

type NodeLevel = "namespace" | "channel" | "track" | "attribute";

/**
 * Builds a hierarchical tree from an array of standard inputs.
 * Paths like "/standard/face/left_eye/pos/x" become:
 * - face (namespace, depth 0)
 *   - left_eye (channel, depth 1)
 *     - pos (track, depth 2)
 *       - x (attribute, depth 3)
 */
function buildInputTree(inputs: StandardRigInput[]): Map<string, TreeNode> {
  const root = new Map<string, TreeNode>();

  for (const input of inputs) {
    // Extract the path after /standard/
    const match = input.path.match(/\/standard\/(.+)$/);
    if (!match) continue;

    const pathAfterStandard = match[1];
    const segments = pathAfterStandard.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    let currentLevel = root;
    let currentPath = "";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      if (!currentLevel.has(segment)) {
        currentLevel.set(segment, {
          id: currentPath,
          name: segment,
          children: new Map(),
          isLeaf: false,
          depth: i,
        });
      }

      const node = currentLevel.get(segment)!;

      if (isLast) {
        node.input = input;
        node.isLeaf = true;
      }

      currentLevel = node.children;
    }
  }

  return root;
}

/**
 * Collects all node IDs from the tree for state management.
 */
function collectNodeIds(nodes: Map<string, TreeNode>): string[] {
  const ids: string[] = [];

  function traverse(map: Map<string, TreeNode>) {
    for (const node of map.values()) {
      ids.push(node.id);
      if (node.children.size > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);
  return ids;
}

/**
 * Finds a node by its ID in the tree.
 */
function findNodeById(
  nodes: Map<string, TreeNode>,
  id: string,
): TreeNode | null {
  for (const node of nodes.values()) {
    if (node.id === id) return node;
    if (node.children.size > 0) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Collects all input IDs under a node (including nested children).
 */
function collectInputIdsUnderNode(node: TreeNode): string[] {
  const ids: string[] = [];

  if (node.input) {
    ids.push(node.input.id);
  }

  for (const child of node.children.values()) {
    ids.push(...collectInputIdsUnderNode(child));
  }

  return ids;
}

/**
 * Collects all inputs under a node (including nested children).
 */
function collectInputsUnderNode(node: TreeNode): StandardRigInput[] {
  const inputs: StandardRigInput[] = [];

  if (node.input) {
    inputs.push(node.input);
  }

  for (const child of node.children.values()) {
    inputs.push(...collectInputsUnderNode(child));
  }

  return inputs;
}

/**
 * Builds a set of normalized paths from inputs.
 */
function buildNormalizedPathSet(inputs: StandardRigInput[]): Set<string> {
  const paths = new Set<string>();
  for (const input of inputs) {
    paths.add(normalizeStandardRigInputPath(input.path));
  }
  return paths;
}

/**
 * Formats a segment name for display (e.g., "left_eye" -> "Left Eye").
 */
function formatSegmentName(segment: string): string {
  return segment
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Validates a node name for use in paths.
 * Returns null if valid, or an error message if invalid.
 */
function validateNodeName(name: string): string | null {
  if (!name.trim()) {
    return "Name cannot be empty";
  }
  // Only allow lowercase letters, numbers, and underscores
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return "Use lowercase letters, numbers, underscores. Must start with letter.";
  }
  return null;
}

/**
 * Checks if a name already exists at a given level.
 */
function nameExistsAtLevel(existingNames: Set<string>, name: string): boolean {
  return existingNames.has(name.toLowerCase());
}

export function StdFeatureSpacesChannelsPanel() {
  const [search, setSearch] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [newNodeName, setNewNodeName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [refFilterMissingInMain, setRefFilterMissingInMain] = useState(false);
  const [mainFilterMissingInRef, setMainFilterMissingInRef] = useState(false);

  // Get standard inputs from main face (use managedStandardInputs to access disabled state)
  const mainFaceManagedInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const mainFaceAnimatableComponents = useBindingAuthoring(
    (state) => state.animatableComponents,
  );
  const mainFaceIsLoaded = mainFaceAnimatableComponents.length > 0;

  // Filter out disabled inputs from main face
  const mainFaceStandardInputs = useMemo(
    () =>
      mainFaceManagedInputs
        .filter((entry) => !entry.disabled)
        .map((entry) => entry.input),
    [mainFaceManagedInputs],
  );

  // Get handlers for managing standard inputs
  const handleCreateCustomStandardInput = useBindingAuthoring(
    (state) => state.handleCreateCustomStandardInput,
  );
  const handleDeleteCustomStandardInput = useBindingAuthoring(
    (state) => state.handleDeleteCustomStandardInput,
  );
  const handleUpdateStandardInput = useBindingAuthoring(
    (state) => state.handleUpdateStandardInput,
  );
  const handleDisableStandardInput = useBindingAuthoring(
    (state) => state.handleDisableStandardInput,
  );

  // Get standard inputs from reference face
  const referenceFace = useReferenceFace();

  // Filter reference face inputs to only /standard/ paths
  const refFaceStandardInputs = useMemo(() => {
    return referenceFace.standardInputs.filter((input) =>
      input.path.includes("/standard/"),
    );
  }, [referenceFace.standardInputs]);

  // Check if both faces are loaded (dual-tree mode)
  const bothFacesLoaded = mainFaceIsLoaded && referenceFace.isLoaded;

  // Build separate trees for each face
  const refInputTree = useMemo(
    () => buildInputTree(refFaceStandardInputs),
    [refFaceStandardInputs],
  );

  const mainInputTree = useMemo(
    () => buildInputTree(mainFaceStandardInputs),
    [mainFaceStandardInputs],
  );

  // Combined inputs (for single-tree mode when only main face is loaded)
  const combinedInputs = useMemo(() => {
    if (bothFacesLoaded) {
      // In dual-tree mode, main tree only shows main face inputs
      return mainFaceStandardInputs;
    }
    // Single face mode - show whatever is loaded
    const byId = new Map<string, StandardRigInput>();
    const isStandardInput = (input: StandardRigInput) =>
      input.path.includes("/standard/");

    // Add reference face inputs first
    for (const input of referenceFace.standardInputs) {
      if (isStandardInput(input)) {
        byId.set(input.id, input);
      }
    }

    // Overlay main face inputs (takes precedence)
    for (const input of mainFaceStandardInputs) {
      if (isStandardInput(input)) {
        byId.set(input.id, input);
      }
    }

    return Array.from(byId.values());
  }, [referenceFace.standardInputs, mainFaceStandardInputs, bothFacesLoaded]);

  // Build the tree structure (for main/combined tree)
  const inputTree = useMemo(
    () => (bothFacesLoaded ? mainInputTree : buildInputTree(combinedInputs)),
    [bothFacesLoaded, mainInputTree, combinedInputs],
  );

  // Get all node IDs for tree state management (main tree)
  const nodeIds = useMemo(() => collectNodeIds(inputTree), [inputTree]);

  // Get all node IDs for reference tree state management
  const refNodeIds = useMemo(
    () => collectNodeIds(refInputTree),
    [refInputTree],
  );

  // Tree expand/collapse state (main tree)
  const { isExpanded, toggleNode, setExpanded } = useHierarchyTreeState(
    "std-face-channels",
    nodeIds,
  );

  // Tree expand/collapse state (reference tree)
  const { isExpanded: isRefExpanded, toggleNode: toggleRefNode } =
    useHierarchyTreeState("std-face-channels-ref", refNodeIds);

  // Get the selected node
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return findNodeById(inputTree, selectedNodeId);
  }, [inputTree, selectedNodeId]);

  // Get the selected input (only for leaf nodes)
  const selectedInput = selectedNode?.input ?? null;

  // Determine the level of the selected node and what can be added
  const selectedLevel: NodeLevel | null = useMemo(() => {
    if (!selectedNode) return null;
    if (selectedNode.depth === 0) return "namespace";
    if (selectedNode.depth === 1) return "channel";
    if (selectedNode.depth === 2) return "track";
    return "attribute";
  }, [selectedNode]);

  // Get existing names at the level where we'd add a new node
  const existingNamesAtAddLevel = useMemo(() => {
    const names = new Set<string>();

    if (!selectedNode) {
      // Adding at root level - get all namespace names
      for (const node of inputTree.values()) {
        names.add(node.name.toLowerCase());
      }
    } else {
      // Adding as child of selected node
      for (const child of selectedNode.children.values()) {
        names.add(child.name.toLowerCase());
      }
    }

    return names;
  }, [inputTree, selectedNode]);

  // Get existing names at the same level as selected node (for rename validation)
  const existingNamesAtSelectedLevel = useMemo(() => {
    const names = new Set<string>();
    if (!selectedNode) return names;

    // Find the parent and get sibling names
    const segments = selectedNode.id.split("/");
    if (segments.length === 1) {
      // Root level - get all namespace names except current
      for (const node of inputTree.values()) {
        if (node.name !== selectedNode.name) {
          names.add(node.name.toLowerCase());
        }
      }
    } else {
      // Find parent node
      const parentPath = segments.slice(0, -1).join("/");
      const parentNode = findNodeById(inputTree, parentPath);
      if (parentNode) {
        for (const child of parentNode.children.values()) {
          if (child.name !== selectedNode.name) {
            names.add(child.name.toLowerCase());
          }
        }
      }
    }

    return names;
  }, [inputTree, selectedNode]);

  // Validation for new node name
  const newNodeNameError = useMemo(() => {
    const validationError = validateNodeName(newNodeName);
    if (validationError) return validationError;
    if (nameExistsAtLevel(existingNamesAtAddLevel, newNodeName)) {
      return "Name already exists";
    }
    return null;
  }, [newNodeName, existingNamesAtAddLevel]);

  // Validation for rename
  const renameError = useMemo(() => {
    if (!isRenaming || !selectedNode) return null;
    if (renameValue === selectedNode.name) return null; // No change
    const validationError = validateNodeName(renameValue);
    if (validationError) return validationError;
    if (nameExistsAtLevel(existingNamesAtSelectedLevel, renameValue)) {
      return "Name already exists";
    }
    return null;
  }, [isRenaming, renameValue, selectedNode, existingNamesAtSelectedLevel]);

  // Determine what type of node can be added
  const addButtonLabel = useMemo(() => {
    if (!selectedNode) return "Add Namespace";
    if (selectedLevel === "namespace") return "Add Channel";
    if (selectedLevel === "channel") return "Add Track";
    if (selectedLevel === "track") return "Add Attribute";
    return null; // Can't add under attributes
  }, [selectedNode, selectedLevel]);

  // Filter nodes based on search
  const matchesSearch = useCallback(
    (node: TreeNode): boolean => {
      if (!search.trim()) return true;
      const searchLower = search.toLowerCase();

      // Check if this node matches
      if (node.name.toLowerCase().includes(searchLower)) return true;
      if (node.input?.label?.toLowerCase().includes(searchLower)) return true;

      // Check if any children match
      for (const child of node.children.values()) {
        if (matchesSearch(child)) return true;
      }

      return false;
    },
    [search],
  );

  // Handle adding a new node
  const handleAddNode = useCallback(() => {
    if (!newNodeName.trim() || newNodeNameError) return;

    let newPath: string;
    if (!selectedNode) {
      // Adding at root level (namespace) - create with default channel/track/attribute
      newPath = `/standard/${newNodeName}/default/default/value`;
    } else if (selectedLevel === "namespace") {
      // Adding channel under namespace
      const namespaceName = selectedNode.name;
      newPath = `/standard/${namespaceName}/${newNodeName}/default/value`;
    } else if (selectedLevel === "channel") {
      // Adding track under channel
      const segments = selectedNode.id.split("/");
      const namespaceName = segments[0];
      const channelName = segments[1];
      newPath = `/standard/${namespaceName}/${channelName}/${newNodeName}/value`;
    } else if (selectedLevel === "track") {
      // Adding attribute under track
      const segments = selectedNode.id.split("/");
      const namespaceName = segments[0];
      const channelName = segments[1];
      const trackName = segments[2];
      newPath = `/standard/${namespaceName}/${channelName}/${trackName}/${newNodeName}`;
    } else {
      return; // Can't add under attributes
    }

    const newInput = handleCreateCustomStandardInput(newPath);
    if (newInput) {
      // Expand the parent to show the new node
      if (selectedNode) {
        setExpanded(selectedNode.id, true);
      }
      setNewNodeName("");
    }
  }, [
    newNodeName,
    newNodeNameError,
    selectedNode,
    selectedLevel,
    handleCreateCustomStandardInput,
    setExpanded,
  ]);

  // Handle rerooting all existing channels under a new namespace
  const handleRerootAll = useCallback(() => {
    if (!newNodeName.trim() || newNodeNameError) return;
    if (combinedInputs.length === 0) return;

    const namespaceName = newNodeName.trim().toLowerCase();

    // Update each input's path to include the new namespace
    for (const input of combinedInputs) {
      // Extract path after /standard/
      const match = input.path.match(/^\/standard\/(.+)$/);
      if (!match) continue;

      const pathAfterStandard = match[1];
      // Insert namespace as the first segment
      const newPath = `/standard/${namespaceName}/${pathAfterStandard}`;

      // Update the label to include the namespace prefix
      const formattedNamespace = formatSegmentName(namespaceName);
      const currentLabel = input.label || "";
      const newLabel = currentLabel.startsWith(formattedNamespace + " ")
        ? currentLabel // Already has namespace prefix
        : `${formattedNamespace} ${currentLabel}`;

      handleUpdateStandardInput(input.id, {
        path: newPath,
        label: newLabel,
      });
    }

    setNewNodeName("");
  }, [
    newNodeName,
    newNodeNameError,
    combinedInputs,
    handleUpdateStandardInput,
  ]);

  // Handle removing the selected node
  const handleRemoveNode = useCallback(() => {
    if (!selectedNode) return;

    // Collect all input IDs under this node
    const inputIds = collectInputIdsUnderNode(selectedNode);

    // Delete/disable each input
    // handleDeleteCustomStandardInput only works for custom inputs
    // handleDisableStandardInput works for auto/preset inputs
    for (const inputId of inputIds) {
      handleDeleteCustomStandardInput(inputId);
      handleDisableStandardInput(inputId);
    }

    setSelectedNodeId(null);
  }, [
    selectedNode,
    handleDeleteCustomStandardInput,
    handleDisableStandardInput,
  ]);

  // Handle starting rename
  const handleStartRename = useCallback(() => {
    if (!selectedNode) return;
    setRenameValue(selectedNode.name);
    setIsRenaming(true);
  }, [selectedNode]);

  // Handle canceling rename
  const handleCancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue("");
  }, []);

  // Handle confirming rename
  const handleConfirmRename = useCallback(() => {
    if (!selectedNode || renameError || renameValue === selectedNode.name) {
      handleCancelRename();
      return;
    }

    // Collect all inputs under this node and update their paths
    const inputIds = collectInputIdsUnderNode(selectedNode);

    for (const inputId of inputIds) {
      const input = combinedInputs.find((i) => i.id === inputId);
      if (!input) continue;

      // Replace the old segment with the new one in the path
      // Handle both middle segments (with trailing slash) and end segments (without)
      const oldSegment = selectedNode.name;
      let newPath = input.path;
      if (input.path.includes(`/${oldSegment}/`)) {
        // Middle segment: /xxx/segment/xxx
        newPath = input.path.replace(`/${oldSegment}/`, `/${renameValue}/`);
      } else if (input.path.endsWith(`/${oldSegment}`)) {
        // End segment: /xxx/segment
        newPath = input.path.replace(
          new RegExp(`/${oldSegment}$`),
          `/${renameValue}`,
        );
      }

      // Also update the label if it contains the old name
      const oldLabel = input.label || "";
      const newLabel = oldLabel.includes(formatSegmentName(oldSegment))
        ? oldLabel.replace(
            formatSegmentName(oldSegment),
            formatSegmentName(renameValue),
          )
        : undefined;

      handleUpdateStandardInput(inputId, {
        path: newPath,
        ...(newLabel && { label: newLabel }),
      });
    }

    setIsRenaming(false);
    setRenameValue("");
  }, [
    selectedNode,
    renameError,
    renameValue,
    combinedInputs,
    handleUpdateStandardInput,
    handleCancelRename,
  ]);

  // Handle clearing selection when clicking empty area in tree
  const handleTreeBackgroundClick = useCallback((e: React.MouseEvent) => {
    // Only clear if clicking directly on the tree container, not on a node
    if (e.target === e.currentTarget) {
      setSelectedNodeId(null);
      setIsRenaming(false);
    }
  }, []);

  // Handle adopting all channels from a reference namespace to main face
  const handleAdoptFromRef = useCallback(
    (namespaceName: string) => {
      const refNamespaceNode = refInputTree.get(namespaceName);
      if (!refNamespaceNode) return;

      // Collect all inputs from the reference namespace
      const refInputs = collectInputsUnderNode(refNamespaceNode);

      // Build a set of normalized paths that already exist in main face
      const mainPaths = buildNormalizedPathSet(mainFaceStandardInputs);

      // Create inputs that don't exist in main face
      for (const refInput of refInputs) {
        const normalizedPath = normalizeStandardRigInputPath(refInput.path);
        if (!mainPaths.has(normalizedPath)) {
          // Create this input in main face
          const newInput = handleCreateCustomStandardInput(refInput.path);
          if (newInput) {
            // Update the input with properties from reference
            handleUpdateStandardInput(newInput.id, {
              label: refInput.label,
              defaultValue: refInput.defaultValue,
              range: refInput.range,
            });
          }
        }
      }
    },
    [
      refInputTree,
      mainFaceStandardInputs,
      handleCreateCustomStandardInput,
      handleUpdateStandardInput,
    ],
  );

  // Handlers for editing input properties
  const handleUpdateLabel = useCallback(
    (newLabel: string) => {
      if (!selectedInput) return;
      handleUpdateStandardInput(selectedInput.id, { label: newLabel });
    },
    [selectedInput, handleUpdateStandardInput],
  );

  const handleUpdateDefaultValue = useCallback(
    (newDefault: number) => {
      if (!selectedInput) return;
      handleUpdateStandardInput(selectedInput.id, { defaultValue: newDefault });
    },
    [selectedInput, handleUpdateStandardInput],
  );

  const handleUpdateRangeMin = useCallback(
    (newMin: number) => {
      if (!selectedInput) return;
      handleUpdateStandardInput(selectedInput.id, {
        range: { ...selectedInput.range, min: newMin },
      });
    },
    [selectedInput, handleUpdateStandardInput],
  );

  const handleUpdateRangeMax = useCallback(
    (newMax: number) => {
      if (!selectedInput) return;
      handleUpdateStandardInput(selectedInput.id, {
        range: { ...selectedInput.range, max: newMax },
      });
    },
    [selectedInput, handleUpdateStandardInput],
  );

  // Build sets of normalized paths for filtering
  const mainFacePathSet = useMemo(
    () => buildNormalizedPathSet(mainFaceStandardInputs),
    [mainFaceStandardInputs],
  );

  const refFacePathSet = useMemo(
    () => buildNormalizedPathSet(refFaceStandardInputs),
    [refFaceStandardInputs],
  );

  // Check if a node (or any of its children) is missing from the other face
  const nodeIsMissingInMain = useCallback(
    (node: TreeNode): boolean => {
      if (node.input) {
        const normalizedPath = normalizeStandardRigInputPath(node.input.path);
        return !mainFacePathSet.has(normalizedPath);
      }
      // For non-leaf nodes, check if any child is missing
      for (const child of node.children.values()) {
        if (nodeIsMissingInMain(child)) return true;
      }
      return false;
    },
    [mainFacePathSet],
  );

  const nodeIsMissingInRef = useCallback(
    (node: TreeNode): boolean => {
      if (node.input) {
        const normalizedPath = normalizeStandardRigInputPath(node.input.path);
        return !refFacePathSet.has(normalizedPath);
      }
      // For non-leaf nodes, check if any child is missing
      for (const child of node.children.values()) {
        if (nodeIsMissingInRef(child)) return true;
      }
      return false;
    },
    [refFacePathSet],
  );

  // Render a tree node recursively
  const renderNode = useCallback(
    (node: TreeNode, depth: number): JSX.Element | null => {
      if (!matchesSearch(node)) return null;
      if (
        bothFacesLoaded &&
        mainFilterMissingInRef &&
        !nodeIsMissingInRef(node)
      )
        return null;

      const hasChildren = node.children.size > 0;
      const expanded = isExpanded(node.id);

      let displayName = node.input?.label || formatSegmentName(node.name);
      if (node.input?.label && node.depth > 0) {
        const namespaceSegment = node.id.split("/")[0];
        const formattedNamespace = formatSegmentName(namespaceSegment);
        if (displayName.startsWith(formattedNamespace + " ")) {
          displayName = displayName.slice(formattedNamespace.length + 1);
        }
      }

      const isSelected = selectedNodeId === node.id;

      const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
        if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1;
        return a.name.localeCompare(b.name);
      });

      const levelLabel =
        node.depth === 0
          ? "ns"
          : node.depth === 1
            ? "channel"
            : node.depth === 2
              ? "track"
              : "attr";

      return (
        <div key={node.id} className="flex flex-col">
          <div
            className={cn(
              "group flex items-center gap-1.5 rounded px-1 min-h-[26px] transition-all cursor-default select-none",
              isSelected
                ? "bg-accent-subtle text-accent shadow-[inset_0_0_0_1px_var(--color-accent-subtle)]"
                : "text-text-muted hover:bg-bg-secondary/40 hover:text-text-secondary",
            )}
            style={{ marginLeft: `${depth * 12}px` }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedNodeId(node.id);
              setIsRenaming(false);
            }}
          >
            <button
              type="button"
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-bg-secondary-hover transition-transform duration-200 text-text-muted hover:text-text-secondary",
                !hasChildren && "opacity-0 pointer-events-none",
                expanded && "rotate-90",
              )}
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.id);
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span
                className={cn(
                  "text-[11px] font-medium truncate",
                  isSelected && "text-accent",
                )}
              >
                {displayName}
              </span>

              <span className="flex items-center gap-1.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[9px] font-bold uppercase tracking-tighter bg-bg-secondary px-1 rounded text-text-muted">
                  {levelLabel}
                </span>
                {node.isLeaf && (
                  <div
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      (node.input as any)?.disabled
                        ? "bg-bg-secondary"
                        : "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]",
                    )}
                  />
                )}
              </span>
            </div>
          </div>
          {hasChildren && expanded && (
            <div className="flex flex-col">
              {sortedChildren.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    },
    [
      isExpanded,
      matchesSearch,
      selectedNodeId,
      toggleNode,
      bothFacesLoaded,
      mainFilterMissingInRef,
      nodeIsMissingInRef,
    ],
  );

  const anyFaceLoaded = mainFaceIsLoaded || referenceFace.isLoaded;

  // Sort root nodes: groups first, then leaves
  const sortedRootNodes = useMemo(() => {
    return Array.from(inputTree.values()).sort((a, b) => {
      if (a.isLeaf !== b.isLeaf) {
        return a.isLeaf ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [inputTree]);

  // Sort reference tree root nodes
  const sortedRefRootNodes = useMemo(() => {
    return Array.from(refInputTree.values()).sort((a, b) => {
      if (a.isLeaf !== b.isLeaf) {
        return a.isLeaf ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [refInputTree]);

  // Render a read-only tree node for reference face
  const renderRefNode = useCallback(
    (node: TreeNode, depth: number): JSX.Element | null => {
      if (!matchesSearch(node)) return null;
      if (refFilterMissingInMain && !nodeIsMissingInMain(node)) return null;

      const hasChildren = node.children.size > 0;
      const expanded = isRefExpanded(node.id);

      let displayName = node.input?.label || formatSegmentName(node.name);
      if (node.input?.label && node.depth > 0) {
        const namespaceSegment = node.id.split("/")[0];
        const formattedNamespace = formatSegmentName(namespaceSegment);
        if (displayName.startsWith(formattedNamespace + " ")) {
          displayName = displayName.slice(formattedNamespace.length + 1);
        }
      }

      const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
        if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1;
        return a.name.localeCompare(b.name);
      });

      const levelLabel =
        node.depth === 0
          ? "ns"
          : node.depth === 1
            ? "channel"
            : node.depth === 2
              ? "track"
              : "attr";

      return (
        <div key={node.id} className="flex flex-col opacity-80">
          <div
            className="group flex items-center gap-1.5 rounded px-1 min-h-[26px] transition-all cursor-default select-none text-text-muted hover:bg-bg-secondary/40 hover:text-text-secondary"
            style={{ marginLeft: `${depth * 12}px` }}
          >
            <button
              type="button"
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-bg-secondary-hover transition-transform duration-200",
                !hasChildren && "opacity-0 pointer-events-none",
                expanded && "rotate-90",
              )}
              onClick={() => toggleRefNode(node.id)}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-[11px] font-medium truncate italic">
                {displayName}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-tighter bg-bg-secondary/50 px-1 rounded text-text-muted ml-auto opacity-0 group-hover:opacity-100">
                {levelLabel}
              </span>
            </div>
          </div>
          {hasChildren && expanded && (
            <div className="flex flex-col">
              {sortedChildren.map((child) => renderRefNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    },
    [
      isRefExpanded,
      matchesSearch,
      toggleRefNode,
      refFilterMissingInMain,
      nodeIsMissingInMain,
    ],
  );

  // Get all namespace names from both trees for action buttons
  const allNamespaces = useMemo(() => {
    const namespaces = new Set<string>();
    for (const node of refInputTree.keys()) {
      namespaces.add(node);
    }
    for (const node of mainInputTree.keys()) {
      namespaces.add(node);
    }
    return Array.from(namespaces).sort();
  }, [refInputTree, mainInputTree]);

  return (
    <Panel
      title="Standard Channels"
      description="View and edit the standard input channel hierarchy."
      className="flex flex-col h-full overflow-hidden"
    >
      {!anyFaceLoaded ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-muted text-xs italic">
          Load a face to view its standard channels.
        </div>
      ) : (
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Toolbar with search */}
          <div className="flex items-center gap-2 px-1">
            <div className="relative flex-1">
              <svg
                className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
                width="12"
                height="12"
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
              <input
                type="search"
                className="w-full h-8 rounded-md bg-bg-input border border-border-default pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 transition-all"
                placeholder="Search channels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {bothFacesLoaded && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-[10px]"
                onClick={() => {
                  setRefFilterMissingInMain(!refFilterMissingInMain);
                  setMainFilterMissingInRef(!mainFilterMissingInRef);
                }}
                title="Toggle mismatch filter"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn(
                    (refFilterMissingInMain || mainFilterMissingInRef) &&
                      "text-accent",
                  )}
                >
                  <path d="M11 21H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h5l2 3h9a2 2 0 0 1 2 2v2" />
                  <line x1="18" y1="21" x2="18" y2="15" />
                  <line x1="21" y1="18" x2="15" y2="18" />
                </svg>
              </Button>
            )}
          </div>

          {bothFacesLoaded ? (
            <div className="flex flex-col gap-6">
              {/* Dual Tree View */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Main Face
                  </span>
                  {mainFilterMissingInRef && (
                    <Chip tone="warning" className="h-4 text-[9px] px-1">
                      Filtered
                    </Chip>
                  )}
                </div>
                <div className="rounded-lg border border-border-default/60 bg-bg-secondary/30 p-1.5 min-h-[150px]">
                  {mainFaceStandardInputs.length === 0 ? (
                    <p className="text-[11px] text-text-muted italic text-center py-4">
                      No channels found.
                    </p>
                  ) : (
                    sortedRootNodes.map((node) => renderNode(node, 0))
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Reference Face
                  </span>
                  <div className="flex items-center gap-2">
                    {refFilterMissingInMain && (
                      <Chip tone="warning" className="h-4 text-[9px] px-1">
                        Filtered
                      </Chip>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-5 px-1.5 text-[9px]"
                      disabled={allNamespaces.length === 0}
                      onClick={() => {
                        const ns = allNamespaces[0];
                        if (ns) handleAdoptFromRef(ns);
                      }}
                    >
                      Adopt All
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-border-default/60 bg-bg-secondary/20 p-1.5 min-h-[150px]">
                  {refFaceStandardInputs.length === 0 ? (
                    <p className="text-[11px] text-text-muted italic text-center py-4">
                      No reference channels.
                    </p>
                  ) : (
                    sortedRefRootNodes.map((node) => renderRefNode(node, 0))
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Single Tree View */
            <div className="flex flex-col gap-4 flex-1 min-h-0">
              <div className="flex flex-col gap-3 p-3 rounded-lg bg-bg-secondary/20 border border-border-default/40">
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1 h-7 text-[11px] bg-bg-input border-border-default"
                    placeholder="Namespace name..."
                    value={!selectedNode ? newNodeName : ""}
                    onChange={(e) => {
                      if (!selectedNode) {
                        setNewNodeName(e.target.value.toLowerCase());
                      }
                    }}
                    disabled={!!selectedNode}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 px-3 text-[11px]"
                    onClick={() => {
                      if (selectedNode) {
                        setSelectedNodeId(null);
                      } else {
                        handleAddNode();
                      }
                    }}
                    disabled={
                      !selectedNode &&
                      (!newNodeName.trim() || !!newNodeNameError)
                    }
                  >
                    {selectedNode ? "Deselect" : "Add"}
                  </Button>
                </div>
                {!selectedNode && combinedInputs.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-[10px] w-full"
                    onClick={handleRerootAll}
                    disabled={!newNodeName.trim() || !!newNodeNameError}
                  >
                    Reroot All Channels
                  </Button>
                )}
                {newNodeName && newNodeNameError && !selectedNode && (
                  <p className="text-[10px] text-red-400 italic">
                    {newNodeNameError}
                  </p>
                )}
              </div>

              <div
                className="flex-1 rounded border border-border-default/60 bg-bg-secondary/30 p-1.5 min-h-[200px]"
                onClick={handleTreeBackgroundClick}
              >
                {combinedInputs.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-text-muted text-[11px] italic">
                    No channels. Add a namespace above to begin.
                  </div>
                ) : (
                  sortedRootNodes.map((node) => renderNode(node, 0))
                )}
              </div>
            </div>
          )}

          {/* Selection Editor */}
          {!bothFacesLoaded && selectedNode && (
            <div className="flex flex-col gap-4 p-3 rounded-lg bg-bg-secondary/40 border border-border-default/60 mt-auto">
              <div className="flex items-center justify-between">
                <code className="text-[10px] text-accent bg-accent/20 px-1.5 py-0.5 rounded">
                  /standard/{selectedNode.id}
                </code>
                <div className="flex gap-1.5">
                  {!isRenaming && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={handleStartRename}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={handleRemoveNode}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {isRenaming && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      className="flex-1 h-7 text-[11px] bg-bg-input border-border-default"
                      value={renameValue}
                      onChange={(e) =>
                        setRenameValue(e.target.value.toLowerCase())
                      }
                      autoFocus
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 px-3 text-[11px]"
                      onClick={handleConfirmRename}
                      disabled={!!renameError}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={handleCancelRename}
                    >
                      Cancel
                    </Button>
                  </div>
                  {renameError && (
                    <p className="text-[10px] text-red-400 italic">
                      {renameError}
                    </p>
                  )}
                </div>
              )}

              {selectedInput && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border-default/50">
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase text-text-muted">
                      Label
                    </label>
                    <Input
                      className="h-7 text-[11px] bg-bg-input border-border-default"
                      value={selectedInput.label}
                      onChange={(e) => handleUpdateLabel(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase text-text-muted">
                      Default
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-7 text-[11px] bg-bg-input border-border-default"
                      value={selectedInput.defaultValue}
                      onChange={(e) =>
                        handleUpdateDefaultValue(
                          parseFloat(e.target.value) || 0,
                        )
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase text-text-muted">
                      Range
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Min"
                        className="h-7 text-[11px] bg-bg-input border-border-default flex-1"
                        value={selectedInput.range.min}
                        onChange={(e) =>
                          handleUpdateRangeMin(parseFloat(e.target.value) || 0)
                        }
                      />
                      <span className="text-text-muted">→</span>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Max"
                        className="h-7 text-[11px] bg-bg-input border-border-default flex-1"
                        value={selectedInput.range.max}
                        onChange={(e) =>
                          handleUpdateRangeMax(parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedNode &&
                addButtonLabel &&
                addButtonLabel !== "Add Namespace" && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-border-default/50">
                    <label className="text-[10px] font-bold uppercase text-text-muted">
                      {addButtonLabel}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        className="flex-1 h-7 text-[11px] bg-bg-input border-border-default"
                        placeholder={`${addButtonLabel.replace("Add ", "")} name...`}
                        value={newNodeName}
                        onChange={(e) =>
                          setNewNodeName(e.target.value.toLowerCase())
                        }
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-3 text-[11px]"
                        onClick={handleAddNode}
                        disabled={!newNodeName.trim() || !!newNodeNameError}
                      >
                        Add
                      </Button>
                    </div>
                    {newNodeName && newNodeNameError && (
                      <p className="text-[10px] text-red-400 italic">
                        {newNodeNameError}
                      </p>
                    )}
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
