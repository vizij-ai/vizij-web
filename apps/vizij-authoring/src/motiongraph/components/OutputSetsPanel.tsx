import { useEffect, useMemo, useState } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { SetTreeRow, type SetTreeNode } from "./SetTreeRow";

// ─── Path helpers ─────────────────────────────────────────────────────

/** Strip the "rig/{rigId}/" prefix from a raw spec path if present. */
function stripRigPrefix(path: string): string {
  const m = path.match(/^rig\/[^/]+\//);
  return m ? path.slice(m[0].length) : path;
}

/** Extract the namespace base (first segment after rig prefix) from a path. */
function getBase(path: string): string {
  const stripped = stripRigPrefix(path);
  const slash = stripped.indexOf("/");
  return slash > 0 ? stripped.slice(0, slash) : stripped;
}

// ─── Tree data structure ─────────────────────────────────────────────

function buildTree(paths: string[], base: string): SetTreeNode[] {
  const root = new Map<
    string,
    { node: SetTreeNode; childMap: Map<string, any> }
  >();

  function getOrCreate(
    level: Map<string, { node: SetTreeNode; childMap: Map<string, any> }>,
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
    // Strip "rig/{rigId}/" prefix and the selected base (e.g. "standard/")
    // so the user sees just the meaningful hierarchy.
    let displayPath = stripRigPrefix(rawPath);
    const basePrefix = base + "/";
    if (displayPath.startsWith(basePrefix))
      displayPath = displayPath.slice(basePrefix.length);

    const parts = displayPath.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let level = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      // Leaf nodes use the full raw path; intermediate nodes use display segments.
      const nodePath = isLast ? rawPath : parts.slice(0, i + 1).join("/");
      const entry = getOrCreate(level, parts[i], nodePath, isLast);
      level = entry.childMap;
    }
  }

  // Convert Maps to sorted arrays
  function flatten(
    level: Map<string, { node: SetTreeNode; childMap: Map<string, any> }>,
  ): SetTreeNode[] {
    return Array.from(level.values())
      .map(({ node, childMap }) => {
        node.children = flatten(childMap);
        return node;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return flatten(root);
}

// ─── Panel ───────────────────────────────────────────────────────────

interface OutputSetsPanelProps {
  paths: string[];
}

export default function OutputSetsPanel({ paths }: OutputSetsPanelProps) {
  const enabled = useEditorStore((s) => s.enabledOutputs);
  const toggleOutput = useEditorStore((s) => s.toggleOutput);

  // Discover available namespace bases from paths.
  const bases = useMemo(() => {
    const set = new Set<string>();
    for (const p of paths) set.add(getBase(p));
    return Array.from(set).sort();
  }, [paths]);

  const [selectedBase, setSelectedBase] = useState<string>("");

  // Auto-select "standard" if available, otherwise first base.
  useEffect(() => {
    if (bases.length === 0) {
      setSelectedBase("");
      return;
    }
    if (!bases.includes(selectedBase)) {
      setSelectedBase(bases.includes("standard") ? "standard" : bases[0]);
    }
  }, [bases, selectedBase]);

  // Filter paths to only those matching the selected base.
  const filteredPaths = useMemo(
    () => paths.filter((p) => getBase(p) === selectedBase),
    [paths, selectedBase],
  );

  const handleBaseChange = (newBase: string) => {
    setSelectedBase(newBase);
  };

  const tree = useMemo(
    () => buildTree(filteredPaths, selectedBase),
    [filteredPaths, selectedBase],
  );

  if (paths.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-3 py-2 border-b border-neutral-700">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Outputs
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-neutral-500 text-center">
            Load a GLB to see available output sets
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with base selector */}
      <div className="px-3 py-2 border-b border-neutral-700">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Outputs
          </h3>
          <span className="text-[10px] text-neutral-600">
            {enabled.size}/{paths.length}
          </span>
        </div>
        <select
          value={selectedBase}
          onChange={(e) => handleBaseChange(e.target.value)}
          className="w-full px-2 py-1 text-xs rounded bg-neutral-800 border border-neutral-700 text-neutral-300 focus:outline-none focus:border-blue-500"
        >
          {bases.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {tree.map((node) => (
          <SetTreeRow
            key={node.path}
            node={node}
            depth={0}
            enabled={enabled}
            accent="emerald"
            onToggle={toggleOutput}
          />
        ))}
      </div>
    </div>
  );
}
