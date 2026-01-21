import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useVizijRuntime } from "@vizij/runtime-react";
import { useEffect, useRef } from "react";

type NodeInfo = {
  path: string;
  kind?: "input" | "output";
  min?: number;
  max?: number;
  default_value?: number;
};

/** Normalize path by collapsing multiple slashes and stripping namespace prefix */
function normalizePath(path: string, namespace?: string): string {
  let normalized = path.replace(/\/+/g, "/");
  // Strip namespace prefix if present
  if (namespace) {
    const prefixWithSlash = `${namespace}/`;
    if (normalized.startsWith(prefixWithSlash)) {
      normalized = normalized.slice(prefixWithSlash.length);
    } else if (normalized === namespace) {
      normalized = "";
    }
  }
  return normalized;
}

/**
 * Hook to sync WebSocket updates with the Vizij runtime.
 *
 * Listens for "update-values" events from the Tauri WebSocket server
 * and applies them as orchestrator inputs.
 *
 * Also syncs available nodes (inputs and outputs) to the backend for list_nodes queries.
 *
 * WebSocket message format:
 * {
 *   "type": "update",
 *   "values": {
 *     "input/path": 0.5,
 *     "another/input": 1.0
 *   }
 * }
 */
export function useSyncedData() {
  const { setInput, step, ready, inputConstraints, outputPaths, namespace } =
    useVizijRuntime();
  const nodesSynced = useRef(false);
  const lastNamespace = useRef<string | null>(null);

  // Reset sync state when namespace changes (new model loaded)
  useEffect(() => {
    if (namespace !== lastNamespace.current) {
      lastNamespace.current = namespace;
      nodesSynced.current = false;
    }
  }, [namespace]);

  // Sync nodes (inputs and outputs) to backend when ready
  useEffect(() => {
    if (!ready || nodesSynced.current) return;

    const nodes: NodeInfo[] = [
      // Add inputs with their constraints
      ...Object.entries(inputConstraints).map(([path, constraints]) => ({
        path: normalizePath(path, namespace),
        kind: "input" as const,
        min: constraints.min,
        max: constraints.max,
        default_value: constraints.defaultValue,
      })),
      // Add outputs (no constraints, just paths)
      ...outputPaths.map((path) => ({
        path: normalizePath(path, namespace),
        kind: "output" as const,
      })),
    ];

    if (nodes.length > 0) {
      invoke("set_nodes", { nodes })
        .then(() => {
          console.log(
            `[vizij-ws] Synced ${nodes.length} nodes to backend (${Object.keys(inputConstraints).length} inputs, ${outputPaths.length} outputs)`
          );
          nodesSynced.current = true;
        })
        .catch((err) => {
          console.error("[vizij-ws] Failed to sync nodes:", err);
        });
    }
  }, [ready, inputConstraints, outputPaths]);

  useEffect(() => {
    if (!ready) return;

    // Listen for update-values events from the WebSocket server
    const unlistenUpdates = listen<Record<string, number>>(
      "update-values",
      (event) => {
        Object.entries(event.payload).forEach(([path, value]) => {
          if (value !== undefined) {
            // Prepend namespace to path if not already present
            const fullPath = path.startsWith(`${namespace}/`)
              ? path
              : `${namespace}/${path}`;
            console.log(`[vizij-ws] setInput("${fullPath}", { float: ${value} })`);
            setInput(fullPath, { float: value });
          }
        });
        // Force immediate evaluation after staging all inputs
        step(1 / 60, { forceRuntime: true });
      }
    );

    // Listen for reset events
    const unlistenReset = listen("reset", () => {
      console.log("Reset event received");
      // TODO: Implement reset logic if needed
      // Could reset all inputs to their default values
    });

    return () => {
      unlistenUpdates.then((f) => f());
      unlistenReset.then((f) => f());
    };
  }, [setInput, step, ready, namespace]);
}
