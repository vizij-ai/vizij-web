import { useCallback } from "react";
import type { VizijBundleExtension } from "@vizij/render";
import { compileIrGraph, type IrGraph } from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { BundleGraphAuditEntry } from "../utils/bundleAudit";
import { cloneSerializable } from "../utils/serialization";

export type BundleUpdater =
  | VizijBundleExtension
  | null
  | ((previous: VizijBundleExtension | null) => VizijBundleExtension | null);

interface UseBundleGraphMaintenanceOptions {
  loadedBundle: VizijBundleExtension | null;
  bundleAudit: BundleGraphAuditEntry[] | null;
  updateBundle: (updater: BundleUpdater) => void;
  alertDialog: (message: string) => Promise<void> | void;
  promptDialog: (
    message: string,
    defaultValue?: string,
  ) => Promise<string | null>;
}

export function useBundleGraphMaintenance({
  loadedBundle,
  bundleAudit,
  updateBundle,
  alertDialog,
  promptDialog,
}: UseBundleGraphMaintenanceOptions) {
  const handleOverwriteBundleGraph = useCallback(
    async (graphId: string) => {
      if (!bundleAudit) {
        await alertDialog(
          "Unable to find audit data. Run the bundle audit again and retry.",
        );
        return;
      }
      const target = bundleAudit.find((entry) => entry.id === graphId);
      if (!target) {
        await alertDialog(
          "Unable to find audit entry for the selected graph. Run the audit again and retry.",
        );
        return;
      }
      if (!target.compiledSpec) {
        await alertDialog(
          "This graph did not produce a compiled IR spec, so it cannot be overwritten automatically.",
        );
        return;
      }
      updateBundle((previous) => {
        if (!previous?.graphs?.length) {
          return previous;
        }
        const graphs = previous.graphs.map((graph) => {
          if (graph.id !== graphId) {
            return graph;
          }
          return {
            ...graph,
            spec: cloneSerializable(target.compiledSpec as GraphSpec) as Record<
              string,
              unknown
            >,
            metadata: {
              ...(graph.metadata ?? {}),
              reconciledAt: new Date().toISOString(),
            },
          };
        });
        return {
          ...previous,
          graphs,
        };
      });
    },
    [alertDialog, bundleAudit, updateBundle],
  );

  const handleRenameBundleOutput = useCallback(
    async (graphId: string, nodeId: string, currentPath: string | null) => {
      const targetGraph = loadedBundle?.graphs?.find(
        (graph) => graph.id === graphId,
      );
      if (!targetGraph) {
        await alertDialog("Unable to locate the selected graph in the bundle.");
        return;
      }
      if (!targetGraph.ir) {
        await alertDialog("This graph has no IR payload to edit.");
        return;
      }
      const nextPath = await promptDialog(
        "Enter the new output path for this node (e.g., rig/face/eyes/blink)",
        currentPath ?? "",
      );
      if (nextPath === null) {
        return;
      }
      const trimmed = nextPath.trim();
      if (!trimmed) {
        await alertDialog("Output path cannot be empty.");
        return;
      }
      const nextIr = cloneSerializable(targetGraph.ir) as unknown as IrGraph;
      const targetNode = nextIr.nodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        await alertDialog(
          "Unable to find the output node inside the IR graph.",
        );
        return;
      }
      targetNode.params = { ...(targetNode.params ?? {}), path: trimmed };
      const compiled = compileIrGraph(nextIr, { preferLegacySpec: false });
      updateBundle((previous) => {
        if (!previous?.graphs?.length) {
          return previous;
        }
        const graphs = previous.graphs.map((graph) => {
          if (graph.id !== graphId) {
            return graph;
          }
          return {
            ...graph,
            spec: cloneSerializable(compiled.spec) as Record<string, unknown>,
            ir: cloneSerializable(nextIr) as unknown as Record<string, unknown>,
          };
        });
        return {
          ...previous,
          graphs,
        };
      });
    },
    [alertDialog, loadedBundle, promptDialog, updateBundle],
  );

  return {
    handleOverwriteBundleGraph,
    handleRenameBundleOutput,
  };
}
