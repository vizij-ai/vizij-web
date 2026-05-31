import { useCallback, useEffect, useRef, useState } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import type { VizijBundleExtension } from "@vizij/render";
import { buildGraphSpecForExport } from "@vizij/studio-support";
import { useEditorStore } from "../store/useEditorStore";

const MOTIONGRAPH_PREFIX = "motiongraph/";
const MOTIONGRAPH_GRAPH_ID = "motiongraph";
const MOTIONGRAPH_GRAPH_KIND = "motiongraph";

type GraphLikeNode = {
  id?: string;
  type?: string;
  params?: { path?: string };
};

/** Extract all node paths from a graph spec. */
function collectAllPaths(
  spec: Record<string, unknown> | null | undefined,
): string[] {
  if (!spec || typeof spec !== "object") return [];
  const nodes = (spec as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return [];
  const paths: string[] = [];
  for (const node of nodes as GraphLikeNode[]) {
    const path = node?.params?.path;
    if (typeof path === "string" && path.trim()) {
      paths.push(path.trim());
    }
  }
  return paths;
}

/** Check whether a path belongs to the /motiongraph/ namespace. */
function isMotionGraphPath(path: string): boolean {
  const normalized = path.replace(/^\//, "");
  return (
    normalized.startsWith(MOTIONGRAPH_PREFIX) ||
    normalized.includes(`/${MOTIONGRAPH_PREFIX}`)
  );
}

/** Check whether a bundle already contains a motiongraph graph entry. */
function bundleHasMotionGraph(
  bundle: VizijBundleExtension | null | undefined,
): boolean {
  if (!bundle?.graphs) return false;
  return bundle.graphs.some(
    (g) => g.kind === MOTIONGRAPH_GRAPH_KIND || g.id === MOTIONGRAPH_GRAPH_ID,
  );
}

/** Return a copy of the bundle with a motiongraph graph entry ensured. */
function ensureMotionGraphInBundle(
  bundle: VizijBundleExtension | null | undefined,
): VizijBundleExtension {
  const base: VizijBundleExtension = bundle
    ? structuredClone(bundle)
    : { version: 1, graphs: [] };

  if (!base.graphs) {
    base.graphs = [];
  }

  if (!bundleHasMotionGraph(base)) {
    base.graphs.push({
      id: MOTIONGRAPH_GRAPH_ID,
      kind: MOTIONGRAPH_GRAPH_KIND,
      label: "motiongraph",
      spec: { nodes: [], edges: [] },
      metadata: {
        exportedAt: new Date().toISOString(),
        source: "vizij-motiongraph",
      },
    });
  }

  base.exportedAt = new Date().toISOString();
  return base;
}

export type MotionGraphNamespaceInfo = {
  /** Whether the namespace check has run. */
  checked: boolean;
  /** Whether the namespace already existed in the GLB. */
  existedInGlb: boolean;
  /** Whether the namespace is now ready (either existed or was created). */
  ready: boolean;
  /** Paths found under /motiongraph/ in the graph spec. */
  paths: string[];
  /** Returns the current bundle with the motiongraph entry guaranteed. */
  getBundleForExport: () => VizijBundleExtension;
};

/**
 * Inspects the loaded GLB's graph spec for nodes under the /motiongraph/
 * namespace. If none are found, logs that the namespace was created (empty).
 * Also provides `getBundleForExport()` that returns a bundle with the
 * motiongraph graph entry ensured — ready to be passed to `exportScene()`.
 */
export function useMotionGraphNamespace(): MotionGraphNamespaceInfo {
  const runtime = useVizijRuntime();
  const hasRun = useRef(false);
  const [info, setInfo] = useState<
    Omit<MotionGraphNamespaceInfo, "getBundleForExport">
  >({
    checked: false,
    existedInGlb: false,
    ready: false,
    paths: [],
  });

  useEffect(() => {
    if (!runtime.ready || hasRun.current) return;
    hasRun.current = true;

    // ── 1. Inspect the bundle's graph specs ──────────────────────────
    const bundle = runtime.assetBundle.bundle;
    const bundleGraphs = bundle?.graphs ?? [];

    const allSpecPaths: string[] = [];
    for (const graph of bundleGraphs) {
      const spec = graph.spec as Record<string, unknown> | undefined;
      allSpecPaths.push(...collectAllPaths(spec));
    }

    // Also check the resolved rig asset spec
    const rigSpec = runtime.assetBundle.rig?.spec as
      | Record<string, unknown>
      | undefined;
    if (rigSpec) {
      allSpecPaths.push(...collectAllPaths(rigSpec));
    }

    const uniquePaths = [...new Set(allSpecPaths)];

    // ── 2. Filter for motiongraph paths ──────────────────────────────
    const mgPaths = uniquePaths.filter(isMotionGraphPath);

    // ── 3. Also check inputConstraints (runtime-resolved paths) ──────
    const mgConstraints = Object.keys(runtime.inputConstraints).filter(
      (key) => {
        const normalized = key.replace(/^\//, "");
        return (
          normalized.startsWith(MOTIONGRAPH_PREFIX) ||
          normalized.includes(`/${MOTIONGRAPH_PREFIX}`)
        );
      },
    );

    const allMgPaths = [...new Set([...mgPaths, ...mgConstraints])];

    // ── 4. Check bundle-level motiongraph graph entry ────────────────
    const hasBundleEntry = bundleHasMotionGraph(bundle);
    const existed = allMgPaths.length > 0 || hasBundleEntry;

    // ── 5. Log namespace status ──────────────────────────────────────

    if (existed) {
      console.log(
        `[motiongraph] /motiongraph/ namespace found`,
        hasBundleEntry
          ? "(bundle graph entry)"
          : `(${allMgPaths.length} path(s))`,
      );
    } else {
      console.log(
        "[motiongraph] /motiongraph/ namespace not found — creating empty.",
      );
    }

    setInfo({
      checked: true,
      existedInGlb: existed,
      ready: true,
      paths: allMgPaths,
    });
  }, [runtime.ready, runtime.assetBundle, runtime.inputConstraints]);

  const getBundleForExport = useCallback((): VizijBundleExtension => {
    const bundle = ensureMotionGraphInBundle(runtime.assetBundle.bundle);

    // Embed current editor graph spec into the motiongraph entry.
    const { nodes, edges } = useEditorStore.getState();
    const exportSpec = buildGraphSpecForExport(nodes, edges);

    if (exportSpec.nodes.length > 0 && bundle.graphs) {
      const mgEntry = bundle.graphs.find(
        (g) =>
          g.kind === MOTIONGRAPH_GRAPH_KIND || g.id === MOTIONGRAPH_GRAPH_ID,
      );
      if (mgEntry) {
        mgEntry.spec = exportSpec;
        mgEntry.metadata = {
          ...mgEntry.metadata,
          exportedAt: new Date().toISOString(),
          source: "vizij-motiongraph",
          nodeCount: exportSpec.nodes.length,
          edgeCount: exportSpec.edges.length,
        };
      }
    }

    return bundle;
  }, [runtime.assetBundle.bundle]);

  return { ...info, getBundleForExport };
}
