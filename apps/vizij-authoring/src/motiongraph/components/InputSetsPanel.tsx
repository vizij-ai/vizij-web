import { useEffect, useMemo, useState } from "react";
import { useEditorStore } from "../store/useEditorStore";

// ─── Path helpers ─────────────────────────────────────────────────────

/** Extract the root namespace (first segment) from a path. */
function getBase(path: string): string {
  const slash = path.indexOf("/");
  return slash > 0 ? path.slice(0, slash) : path;
}

// ─── Tree data structure ─────────────────────────────────────────────

interface TreeNode {
  name: string;
  /** Full path from root (used as the toggle key). */
  path: string;
  children: TreeNode[];
  /** True if this node is a leaf (an actual input path). */
  isLeaf: boolean;
}

function buildTree(paths: string[], base: string): TreeNode[] {
  const root = new Map<
    string,
    { node: TreeNode; childMap: Map<string, any> }
  >();

  function getOrCreate(
    level: Map<string, { node: TreeNode; childMap: Map<string, any> }>,
    name: string,
    path: string,
    isLeaf: boolean,
  ) {
    if (!level.has(name)) {
      level.set(name, {
        node: { name, path, children: [], isLeaf },
        childMap: new Map(),
      });
    }
    const entry = level.get(name)!;
    if (isLeaf) entry.node.isLeaf = true;
    return entry;
  }

  for (const rawPath of paths) {
    // Strip the selected base prefix so the user sees the sub-hierarchy.
    const basePrefix = base + "/";
    const displayPath = rawPath.startsWith(basePrefix)
      ? rawPath.slice(basePrefix.length)
      : rawPath;

    const parts = displayPath.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let level = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const nodePath = isLast ? rawPath : parts.slice(0, i + 1).join("/");
      const entry = getOrCreate(level, parts[i], nodePath, isLast);
      level = entry.childMap;
    }
  }

  function flatten(
    level: Map<string, { node: TreeNode; childMap: Map<string, any> }>,
  ): TreeNode[] {
    return Array.from(level.values())
      .map(({ node, childMap }) => {
        node.children = flatten(childMap);
        return node;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return flatten(root);
}

// ─── Tree row ────────────────────────────────────────────────────────

function TreeRow({
  node,
  depth,
  enabled,
  onToggle,
  onRemove,
}: {
  node: TreeNode;
  depth: number;
  enabled: Set<string>;
  onToggle: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  const isLeaf = node.isLeaf;
  const hasChildren = node.children.length > 0;
  const isActive = isLeaf && enabled.has(node.path);

  return (
    <>
      <div className="flex items-center group">
        <button
          onClick={() => {
            if (isLeaf) {
              onToggle(node.path);
            }
          }}
          disabled={!isLeaf}
          className={`flex-1 text-left py-1 px-2 transition-colors ${
            isActive
              ? "bg-sky-600/20 text-sky-300"
              : "bg-neutral-800/40 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 disabled:cursor-default disabled:hover:bg-neutral-800/40 disabled:hover:text-neutral-500"
          }`}
        >
          <span
            className="flex items-center gap-1.5"
            style={{ paddingLeft: depth * 12 }}
          >
            <span
              className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 border transition-colors ${
                isActive
                  ? "bg-sky-500 border-sky-400"
                  : "border-neutral-600 bg-transparent"
              }`}
            />
            <span
              className={`text-xs truncate ${hasChildren ? "font-medium" : ""}`}
            >
              {node.name}
            </span>
          </span>
        </button>
        {node.isLeaf && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(node.path);
            }}
            className="px-1.5 text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
            title="Remove input"
          >
            ×
          </button>
        )}
      </div>

      {node.children.map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          enabled={enabled}
          onToggle={onToggle}
          onRemove={onRemove}
        />
      ))}
    </>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────

export default function InputSetsPanel() {
  const enabled = useEditorStore((s) => s.enabledInputs);
  const customPaths = useEditorStore((s) => s.customInputPaths);
  const toggleInput = useEditorStore((s) => s.toggleInput);
  const addCustomInputPath = useEditorStore((s) => s.addCustomInputPath);
  const removeCustomInputPath = useEditorStore((s) => s.removeCustomInputPath);

  // User-created namespace roots (may be empty, i.e. have no paths yet).
  const [customRoots, setCustomRoots] = useState<string[]>([]);

  // Merge user-created roots with those discovered from existing paths.
  const bases = useMemo(() => {
    const set = new Set<string>(customRoots);
    for (const p of customPaths) set.add(getBase(p));
    return Array.from(set).sort();
  }, [customPaths, customRoots]);

  const [selectedBase, setSelectedBase] = useState<string>("");
  const [addingRoot, setAddingRoot] = useState(false);
  const [newRootName, setNewRootName] = useState("");
  const [newInputPath, setNewInputPath] = useState("");
  const [inputError, setInputError] = useState("");

  // Auto-select first base, or empty.
  useEffect(() => {
    if (bases.length === 0) {
      setSelectedBase("");
      return;
    }
    if (!bases.includes(selectedBase)) {
      setSelectedBase(bases[0]);
    }
  }, [bases, selectedBase]);

  // Filter paths to the selected base.
  const filteredPaths = useMemo(
    () => customPaths.filter((p) => getBase(p) === selectedBase),
    [customPaths, selectedBase],
  );

  const tree = useMemo(
    () => buildTree(filteredPaths, selectedBase),
    [filteredPaths, selectedBase],
  );

  // ─── New Root handlers ──────────────────────────────────────────

  const handleConfirmNewRoot = () => {
    const name = newRootName.trim().replace(/\//g, "");
    if (!name) return;
    setCustomRoots((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setSelectedBase(name);
    setAddingRoot(false);
    setNewRootName("");
  };

  const handleCancelNewRoot = () => {
    setAddingRoot(false);
    setNewRootName("");
  };

  // ─── Add Input handlers ─────────────────────────────────────────

  const handleAddInput = () => {
    setInputError("");
    const base = selectedBase.trim();
    if (!base) {
      setInputError("Create a namespace first");
      return;
    }
    const segments = newInputPath.trim();
    if (!segments) {
      setInputError("Path cannot be empty");
      return;
    }
    if (/\s/.test(segments)) {
      setInputError("Path cannot contain spaces");
      return;
    }
    if (segments.startsWith("/") || segments.endsWith("/")) {
      setInputError("Remove leading/trailing slashes");
      return;
    }
    const fullPath = `${base}/${segments}`;
    if (customPaths.includes(fullPath)) {
      setInputError("This path already exists");
      return;
    }
    addCustomInputPath(fullPath);
    setNewInputPath("");
  };

  const handleRemove = (path: string) => {
    removeCustomInputPath(path);
  };

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div
      data-testid="motiongraph-input-sets-panel"
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-neutral-700">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Inputs
          </h3>
          <span className="text-[10px] text-neutral-600">
            {enabled.size}/{customPaths.length}
          </span>
        </div>

        {/* Namespace selector */}
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">
          Namespace
        </div>
        <select
          data-testid="motiongraph-namespace-select"
          value={selectedBase}
          onChange={(e) => setSelectedBase(e.target.value)}
          className="w-full px-2 py-1 text-xs rounded bg-neutral-800 border border-neutral-700 text-neutral-300 focus:outline-none focus:border-sky-500 mb-1.5"
          disabled={bases.length === 0}
        >
          {bases.length === 0 && <option value="">No namespaces yet</option>}
          {bases.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        {/* New Namespace */}
        {addingRoot ? (
          <div className="flex items-center gap-1">
            <input
              data-testid="motiongraph-new-namespace-input"
              autoFocus
              value={newRootName}
              onChange={(e) => setNewRootName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmNewRoot();
                if (e.key === "Escape") handleCancelNewRoot();
              }}
              placeholder="namespace name"
              className="flex-1 px-2 py-1 text-xs rounded bg-neutral-800 border border-neutral-700 text-neutral-300 focus:outline-none focus:border-sky-500"
            />
            <button
              data-testid="motiongraph-new-namespace-confirm"
              onClick={handleConfirmNewRoot}
              className="px-1.5 py-1 text-xs text-sky-400 hover:text-sky-300"
            >
              OK
            </button>
            <button
              data-testid="motiongraph-new-namespace-cancel"
              onClick={handleCancelNewRoot}
              className="px-1.5 py-1 text-xs text-neutral-500 hover:text-neutral-300"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            data-testid="motiongraph-new-namespace-trigger"
            onClick={() => setAddingRoot(true)}
            className="w-full px-2 py-1 text-xs rounded border border-dashed border-neutral-700 text-neutral-500 hover:text-sky-400 hover:border-sky-700 transition-colors"
          >
            + New Namespace
          </button>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {filteredPaths.length === 0 ? (
          <div className="flex items-center justify-center p-4">
            <p className="text-xs text-neutral-500 text-center">
              {bases.length === 0
                ? "Create a namespace, then add inputs"
                : "Add inputs using the form below"}
            </p>
          </div>
        ) : (
          tree.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={0}
              enabled={enabled}
              onToggle={toggleInput}
              onRemove={handleRemove}
            />
          ))
        )}
      </div>

      {/* Add New Input */}
      <div className="px-3 py-2 border-t border-neutral-700">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1.5">
          Add New Input
        </div>
        <div className="flex items-center gap-1">
          <input
            data-testid="motiongraph-new-input-path"
            value={newInputPath}
            onChange={(e) => {
              setNewInputPath(e.target.value);
              setInputError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddInput();
            }}
            placeholder="path/segments"
            className="flex-1 px-2 py-1 text-xs rounded bg-neutral-800 border border-neutral-700 text-neutral-300 focus:outline-none focus:border-sky-500"
          />
          <button
            data-testid="motiongraph-add-input"
            onClick={handleAddInput}
            className="px-2 py-1 text-xs rounded bg-sky-700 text-sky-100 hover:bg-sky-600 transition-colors"
          >
            Add
          </button>
        </div>
        {selectedBase && newInputPath && !inputError && (
          <div className="mt-1 text-[10px] text-neutral-600 truncate">
            {selectedBase}/{newInputPath.trim()}
          </div>
        )}
        {inputError && (
          <div className="mt-1 text-[10px] text-red-400">{inputError}</div>
        )}
      </div>
    </div>
  );
}
