import { useCallback, useMemo, useState } from "react";
import { SidebarSection } from "../common/SidebarSection";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { useHierarchyTreeState } from "../scene-composer/useHierarchyTreeState";
import type { StandardRigInput } from "@vizij/utils";
import { normalizeStandardRigInputPath } from "@vizij/utils";
import { Button } from "../ui";

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

const TREE_MAX_HEIGHT = 800;

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

  // Handle removing channels from main face that don't exist in reference namespace
  const handleRemoveUnmatched = useCallback(
    (namespaceName: string) => {
      const mainNamespaceNode = mainInputTree.get(namespaceName);
      const refNamespaceNode = refInputTree.get(namespaceName);

      if (!mainNamespaceNode) return;

      // Collect all inputs from the main namespace
      const mainInputs = collectInputsUnderNode(mainNamespaceNode);

      // Build a set of normalized paths from reference namespace (if it exists)
      const refInputs = refNamespaceNode
        ? collectInputsUnderNode(refNamespaceNode)
        : [];
      const refPaths = buildNormalizedPathSet(refInputs);

      // Remove main face inputs that don't exist in reference
      for (const mainInput of mainInputs) {
        const normalizedPath = normalizeStandardRigInputPath(mainInput.path);
        if (!refPaths.has(normalizedPath)) {
          // Remove this input from main face
          handleDeleteCustomStandardInput(mainInput.id);
          handleDisableStandardInput(mainInput.id);
        }
      }
    },
    [
      mainInputTree,
      refInputTree,
      handleDeleteCustomStandardInput,
      handleDisableStandardInput,
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
      // Apply filter: show only nodes missing in ref face (only in dual-tree mode)
      if (
        bothFacesLoaded &&
        mainFilterMissingInRef &&
        !nodeIsMissingInRef(node)
      )
        return null;

      const hasChildren = node.children.size > 0;
      const expanded = isExpanded(node.id);

      // For display, strip the namespace prefix from the label
      // e.g., "Vizij Mouth Morph Corner Puller" -> "Mouth Morph Corner Puller"
      let displayName = node.input?.label || formatSegmentName(node.name);
      if (node.input?.label && node.depth > 0) {
        // Get the namespace name from the path (first segment of node.id)
        const namespaceSegment = node.id.split("/")[0];
        const formattedNamespace = formatSegmentName(namespaceSegment);
        // Strip namespace prefix from label if present
        if (displayName.startsWith(formattedNamespace + " ")) {
          displayName = displayName.slice(formattedNamespace.length + 1);
        }
      }

      const isSelected = selectedNodeId === node.id;

      // Sort children: groups first (non-leaf), then leaves
      const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
        if (a.isLeaf !== b.isLeaf) {
          return a.isLeaf ? 1 : -1; // Non-leaves first
        }
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
        <div key={node.id} className="hierarchy-tree__item">
          <div
            className="hierarchy-tree__row"
            data-selected={isSelected ? "true" : undefined}
            style={{ paddingLeft: `${depth * 0.9}rem` }}
          >
            <button
              type="button"
              className="hierarchy-tree__toggle"
              aria-label={expanded ? "Collapse children" : "Expand children"}
              disabled={!hasChildren}
              onClick={() => toggleNode(node.id)}
            >
              {hasChildren ? (expanded ? "▾" : "▸") : " "}
            </button>
            <button
              type="button"
              className="hierarchy-tree__label hierarchy-tree__label--dense"
              onClick={() => setSelectedNodeId(node.id)}
            >
              <span className="hierarchy-tree__name">{displayName}</span>
              <span className="hierarchy-tree__meta-group">
                <span className="hierarchy-tree__meta">{levelLabel}</span>
              </span>
            </button>
          </div>
          {hasChildren && expanded && (
            <div className="hierarchy-tree__children">
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
      // Apply filter: show only nodes missing in main face
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
        if (a.isLeaf !== b.isLeaf) {
          return a.isLeaf ? 1 : -1;
        }
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
        <div key={node.id} className="hierarchy-tree__item">
          <div
            className="hierarchy-tree__row hierarchy-tree__row--readonly"
            style={{ paddingLeft: `${depth * 0.9}rem` }}
          >
            <button
              type="button"
              className="hierarchy-tree__toggle"
              aria-label={expanded ? "Collapse children" : "Expand children"}
              disabled={!hasChildren}
              onClick={() => toggleRefNode(node.id)}
            >
              {hasChildren ? (expanded ? "▾" : "▸") : " "}
            </button>
            <span className="hierarchy-tree__label hierarchy-tree__label--dense hierarchy-tree__label--readonly">
              <span className="hierarchy-tree__name">{displayName}</span>
              <span className="hierarchy-tree__meta-group">
                <span className="hierarchy-tree__meta">{levelLabel}</span>
              </span>
            </span>
          </div>
          {hasChildren && expanded && (
            <div className="hierarchy-tree__children">
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
    <div
      className="workbench-panel__scroll"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SidebarSection
        title="Standard Channels"
        description="View and edit the standard input channel hierarchy."
      >
        {!anyFaceLoaded ? (
          <p className="sidebar__placeholder-text">
            Load a face to view its standard channels.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
            }}
          >
            {/* Toolbar with search */}
            <div className="scene-hierarchy__toolbar">
              <input
                type="search"
                className="scene-hierarchy__search"
                placeholder="Search channels"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search.trim().length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="scene-hierarchy__clear"
                  onClick={() => setSearch("")}
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Dual-tree view when both faces are loaded */}
            {bothFacesLoaded ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minHeight: 0,
                  gap: "0.75rem",
                }}
              >
                {/* Reference face section */}
                <div
                  style={{
                    flex: "0 0 auto",
                    padding: "0.5rem",
                    background: "var(--color-slate-850)",
                    borderRadius: "0.25rem",
                    border: "1px solid var(--color-slate-700)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--color-slate-300)",
                      }}
                    >
                      Reference Face
                    </span>
                    <span
                      style={{
                        fontSize: "0.65rem",
                        color: "var(--color-slate-500)",
                      }}
                    >
                      (read-only)
                    </span>
                    <div style={{ marginLeft: "auto" }}>
                      <Button
                        variant={refFilterMissingInMain ? "primary" : "ghost"}
                        size="sm"
                        onClick={() =>
                          setRefFilterMissingInMain(!refFilterMissingInMain)
                        }
                        title="Show only channels not in main face"
                        style={{
                          fontSize: "0.65rem",
                          padding: "0.15rem 0.4rem",
                        }}
                      >
                        {refFilterMissingInMain ? "Show All" : "Missing Only"}
                      </Button>
                    </div>
                  </div>
                  <div
                    className="scene-hierarchy__tree"
                    style={{
                      maxHeight: "180px",
                      overflowY: "auto",
                      opacity: 0.9,
                    }}
                  >
                    {sortedRefRootNodes.length === 0 ? (
                      <p
                        className="sidebar__placeholder-text"
                        style={{ fontSize: "0.75rem" }}
                      >
                        No standard channels in reference face.
                      </p>
                    ) : (
                      sortedRefRootNodes.map((node) => renderRefNode(node, 0))
                    )}
                  </div>
                </div>

                {/* Namespace action buttons */}
                {allNamespaces.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      padding: "0.5rem",
                      background: "var(--color-slate-800)",
                      borderRadius: "0.25rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--color-slate-400)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Per-namespace actions:
                    </span>
                    {allNamespaces.map((ns) => {
                      const refHasNs = refInputTree.has(ns);
                      const mainHasNs = mainInputTree.has(ns);
                      return (
                        <div
                          key={ns}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 500,
                              minWidth: "80px",
                              color: "var(--color-slate-300)",
                            }}
                          >
                            {formatSegmentName(ns)}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleAdoptFromRef(ns)}
                            disabled={!refHasNs}
                            title={
                              refHasNs
                                ? `Copy all channels from "${ns}" in reference to main face`
                                : "Namespace not in reference"
                            }
                          >
                            Adopt
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleRemoveUnmatched(ns)}
                            disabled={!mainHasNs || !refHasNs}
                            title={
                              mainHasNs && refHasNs
                                ? `Remove channels in "${ns}" that don't exist in reference`
                                : "Namespace not in both faces"
                            }
                          >
                            Remove Unmatched
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Main face section */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    padding: "0.5rem",
                    background: "var(--color-slate-850)",
                    borderRadius: "0.25rem",
                    border: "1px solid var(--color-slate-600)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--color-slate-300)",
                      }}
                    >
                      Main Face
                    </span>
                    <span
                      style={{
                        fontSize: "0.65rem",
                        color: "var(--color-slate-500)",
                      }}
                    >
                      (editable)
                    </span>
                    <div style={{ marginLeft: "auto" }}>
                      <Button
                        variant={mainFilterMissingInRef ? "primary" : "ghost"}
                        size="sm"
                        onClick={() =>
                          setMainFilterMissingInRef(!mainFilterMissingInRef)
                        }
                        title="Show only channels not in reference face"
                        style={{
                          fontSize: "0.65rem",
                          padding: "0.15rem 0.4rem",
                        }}
                      >
                        {mainFilterMissingInRef ? "Show All" : "Missing Only"}
                      </Button>
                    </div>
                  </div>

                  {/* Add Namespace controls for main face */}
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <input
                      type="text"
                      className="sidebar__input sidebar__input--sm"
                      style={{ flex: 1 }}
                      placeholder="Namespace name..."
                      value={!selectedNode ? newNodeName : ""}
                      onChange={(e) => {
                        if (!selectedNode) {
                          setNewNodeName(e.target.value.toLowerCase());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !selectedNode &&
                          newNodeName &&
                          !newNodeNameError
                        ) {
                          handleAddNode();
                        }
                      }}
                      disabled={!!selectedNode}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
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

                  <div
                    className="scene-hierarchy__tree"
                    style={{
                      maxHeight: `${TREE_MAX_HEIGHT / 2}px`,
                      flex: 1,
                      minHeight: 120,
                      overflowY: "auto",
                    }}
                    onClick={handleTreeBackgroundClick}
                  >
                    {mainFaceStandardInputs.length === 0 ? (
                      <p className="sidebar__placeholder-text">
                        No standard channels in main face. Use "Adopt" above to
                        copy from reference.
                      </p>
                    ) : (
                      sortedRootNodes.map((node) => renderNode(node, 0))
                    )}
                  </div>

                  {/* Editing controls inside main face section */}
                  {selectedNode && (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        paddingTop: "0.5rem",
                        borderTop: "1px solid var(--color-slate-700)",
                      }}
                    >
                      <p
                        className="sidebar__path-display"
                        style={{ margin: "0 0 0.5rem 0", fontSize: "0.7rem" }}
                      >
                        <code>/standard/{selectedNode.id}</code>
                      </p>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          alignItems: "center",
                          marginBottom: "0.5rem",
                        }}
                      >
                        {isRenaming ? (
                          <>
                            <input
                              type="text"
                              className="sidebar__input sidebar__input--sm"
                              style={{ flex: 1 }}
                              value={renameValue}
                              onChange={(e) =>
                                setRenameValue(e.target.value.toLowerCase())
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !renameError)
                                  handleConfirmRename();
                                else if (e.key === "Escape")
                                  handleCancelRename();
                              }}
                              autoFocus
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleConfirmRename}
                              disabled={!!renameError}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCancelRename}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleStartRename}
                            >
                              Rename
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={handleRemoveNode}
                            >
                              Remove
                            </Button>
                          </>
                        )}
                      </div>
                      {isRenaming && renameError && (
                        <p className="sidebar__error-text">{renameError}</p>
                      )}

                      {selectedInput && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.25rem",
                            marginBottom: "0.5rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "center",
                            }}
                          >
                            <label
                              style={{
                                fontSize: "0.7rem",
                                color: "var(--color-slate-400)",
                                width: "2rem",
                              }}
                            >
                              Label
                            </label>
                            <input
                              type="text"
                              className="sidebar__input sidebar__input--sm"
                              style={{ flex: 1 }}
                              value={selectedInput.label}
                              onChange={(e) =>
                                handleUpdateLabel(e.target.value)
                              }
                            />
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: "0.25rem",
                              alignItems: "center",
                            }}
                          >
                            <label
                              style={{
                                fontSize: "0.7rem",
                                color: "var(--color-slate-400)",
                              }}
                            >
                              Def
                            </label>
                            <input
                              type="number"
                              className="sidebar__input sidebar__input--sm"
                              value={selectedInput.defaultValue}
                              step="0.01"
                              style={{ width: "3rem" }}
                              onChange={(e) =>
                                handleUpdateDefaultValue(
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                            />
                            <label
                              style={{
                                fontSize: "0.7rem",
                                color: "var(--color-slate-400)",
                              }}
                            >
                              Min
                            </label>
                            <input
                              type="number"
                              className="sidebar__input sidebar__input--sm"
                              value={selectedInput.range.min}
                              step="0.1"
                              style={{ width: "3rem" }}
                              onChange={(e) =>
                                handleUpdateRangeMin(
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                            />
                            <label
                              style={{
                                fontSize: "0.7rem",
                                color: "var(--color-slate-400)",
                              }}
                            >
                              Max
                            </label>
                            <input
                              type="number"
                              className="sidebar__input sidebar__input--sm"
                              value={selectedInput.range.max}
                              step="0.1"
                              style={{ width: "3rem" }}
                              onChange={(e) =>
                                handleUpdateRangeMax(
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                            />
                          </div>
                        </div>
                      )}

                      {addButtonLabel && addButtonLabel !== "Add Namespace" && (
                        <div
                          style={{
                            display: "flex",
                            gap: "0.5rem",
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="text"
                            className="sidebar__input sidebar__input--sm"
                            style={{ flex: 1 }}
                            placeholder={`${addButtonLabel.replace("Add ", "")} name...`}
                            value={newNodeName}
                            onChange={(e) =>
                              setNewNodeName(e.target.value.toLowerCase())
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !newNodeNameError)
                                handleAddNode();
                            }}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleAddNode}
                            disabled={!newNodeName.trim() || !!newNodeNameError}
                          >
                            {addButtonLabel}
                          </Button>
                        </div>
                      )}
                      {newNodeName && newNodeNameError && (
                        <p className="sidebar__error-text">
                          {newNodeNameError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Single-tree view when only one face is loaded */
              <>
                {/* Add Namespace - visible in single-tree mode */}
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <input
                    type="text"
                    className="sidebar__input sidebar__input--sm"
                    style={{ flex: 1 }}
                    placeholder="Namespace name..."
                    value={!selectedNode ? newNodeName : ""}
                    onChange={(e) => {
                      if (!selectedNode) {
                        setNewNodeName(e.target.value.toLowerCase());
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !selectedNode &&
                        newNodeName &&
                        !newNodeNameError
                      ) {
                        handleAddNode();
                      }
                    }}
                    disabled={!!selectedNode}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
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
                  {!selectedNode && combinedInputs.length > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleRerootAll}
                      disabled={!newNodeName.trim() || !!newNodeNameError}
                      title="Move all existing channels under this namespace"
                    >
                      Reroot All
                    </Button>
                  )}
                </div>

                <div
                  className="scene-hierarchy__tree"
                  style={{
                    maxHeight: `${TREE_MAX_HEIGHT}px`,
                    flex: 1,
                    minHeight: 200,
                    overflowY: "auto",
                  }}
                  onClick={handleTreeBackgroundClick}
                >
                  {combinedInputs.length === 0 ? (
                    <p className="sidebar__placeholder-text">
                      No standard channels. Add a namespace above to get
                      started.
                    </p>
                  ) : (
                    sortedRootNodes.map((node) => renderNode(node, 0))
                  )}
                </div>
              </>
            )}

            {/* Bottom section - editing controls for single-tree mode only */}
            {!bothFacesLoaded && (
              <div style={{ flexShrink: 0, marginTop: "0.75rem" }}>
                {/* Selected node path and actions */}
                {selectedNode && (
                  <div style={{ marginBottom: "0.5rem" }}>
                    <p
                      className="sidebar__path-display"
                      style={{ margin: "0 0 0.5rem 0", fontSize: "0.75rem" }}
                    >
                      <code>/standard/{selectedNode.id}</code>
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      {isRenaming ? (
                        <>
                          <input
                            type="text"
                            className="sidebar__input sidebar__input--sm"
                            style={{ flex: 1 }}
                            value={renameValue}
                            onChange={(e) =>
                              setRenameValue(e.target.value.toLowerCase())
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !renameError) {
                                handleConfirmRename();
                              } else if (e.key === "Escape") {
                                handleCancelRename();
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleConfirmRename}
                            disabled={!!renameError}
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelRename}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleStartRename}
                          >
                            Rename
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={handleRemoveNode}
                          >
                            Remove
                          </Button>
                        </>
                      )}
                    </div>
                    {isRenaming && renameError && (
                      <p className="sidebar__error-text">{renameError}</p>
                    )}
                  </div>
                )}

                {/* Input properties editor (only for leaf nodes with actual inputs) */}
                {selectedInput && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-slate-400)",
                          width: "2.5rem",
                        }}
                      >
                        Label
                      </label>
                      <input
                        type="text"
                        className="sidebar__input sidebar__input--sm"
                        style={{ flex: 1 }}
                        value={selectedInput.label}
                        onChange={(e) => handleUpdateLabel(e.target.value)}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-slate-400)",
                        }}
                      >
                        Default
                      </label>
                      <input
                        type="number"
                        className="sidebar__input sidebar__input--sm"
                        value={selectedInput.defaultValue}
                        step="0.01"
                        style={{ width: "3.5rem" }}
                        onChange={(e) =>
                          handleUpdateDefaultValue(
                            parseFloat(e.target.value) || 0,
                          )
                        }
                      />
                      <label
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-slate-400)",
                        }}
                      >
                        Min
                      </label>
                      <input
                        type="number"
                        className="sidebar__input sidebar__input--sm"
                        value={selectedInput.range.min}
                        step="0.1"
                        style={{ width: "3.5rem" }}
                        onChange={(e) =>
                          handleUpdateRangeMin(parseFloat(e.target.value) || 0)
                        }
                      />
                      <label
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-slate-400)",
                        }}
                      >
                        Max
                      </label>
                      <input
                        type="number"
                        className="sidebar__input sidebar__input--sm"
                        value={selectedInput.range.max}
                        step="0.1"
                        style={{ width: "3.5rem" }}
                        onChange={(e) =>
                          handleUpdateRangeMax(parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Add Channel, Track, or Attribute (only when namespace, channel, or track is selected) */}
                {selectedNode &&
                  addButtonLabel &&
                  addButtonLabel !== "Add Namespace" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      <input
                        type="text"
                        className="sidebar__input sidebar__input--sm"
                        placeholder={`${addButtonLabel.replace("Add ", "")} name...`}
                        value={newNodeName}
                        onChange={(e) =>
                          setNewNodeName(e.target.value.toLowerCase())
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !newNodeNameError) {
                            handleAddNode();
                          }
                        }}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleAddNode}
                        disabled={!newNodeName.trim() || !!newNodeNameError}
                      >
                        {addButtonLabel}
                      </Button>
                    </div>
                  )}
                {selectedNode && newNodeName && newNodeNameError && (
                  <p className="sidebar__error-text">{newNodeNameError}</p>
                )}
              </div>
            )}
          </div>
        )}
      </SidebarSection>
    </div>
  );
}
