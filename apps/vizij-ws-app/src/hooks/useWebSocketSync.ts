import { useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useVizijRuntime } from "@vizij/runtime-react";

type NodeInfo = {
  path: string;
  kind?: "input" | "output";
  min?: number;
  max?: number;
  default_value?: number;
};

/**
 * Hook that syncs WebSocket updates to the runtime.
 * Uses the same pattern as useMouseGaze from vizij-showcase:
 *   const fullPath = `rig/${faceId}/${path}`;
 *   setInput(fullPath, { float: value });
 *
 * No step() call needed - driveOrchestrator={true} handles evaluation.
 */
export function useWebSocketSync() {
  const { ready, setInput, inputConstraints, namespace, faceId: runtimeFaceId } =
    useVizijRuntime();

  // Get faceId like useMouseGaze does
  const faceId = (runtimeFaceId ?? "face").toLowerCase();

  const nodesSyncedRef = useRef(false);
  const lastLoggedPathsRef = useRef(false);

  // Log available paths once when ready
  useEffect(() => {
    if (!ready || lastLoggedPathsRef.current) return;
    lastLoggedPathsRef.current = true;

    const constraintKeys = Object.keys(inputConstraints);
    console.log("[vizij-ws] Runtime ready!");
    console.log("[vizij-ws] Namespace:", namespace);
    console.log("[vizij-ws] Face ID:", faceId);
    console.log("[vizij-ws] Total input constraints:", constraintKeys.length);

    // Show sample paths to help debug path format
    const samples = constraintKeys.slice(0, 10);
    console.log("[vizij-ws] Sample constraint paths:", samples);

    // Show path patterns
    const patterns = new Set<string>();
    constraintKeys.forEach((path) => {
      const parts = path.split("/");
      if (parts.length >= 3) {
        patterns.add(parts.slice(0, 3).join("/") + "/...");
      } else if (parts.length >= 2) {
        patterns.add(parts.slice(0, 2).join("/") + "/...");
      }
    });
    console.log("[vizij-ws] Path patterns:", Array.from(patterns).slice(0, 10));
  }, [ready, inputConstraints, namespace, faceId]);

  // Set a rig input value - same pattern as useMouseGaze
  const setRigValue = useCallback(
    (path: string, value: number) => {
      if (!ready) {
        console.warn("[vizij-ws] Runtime not ready, skipping setInput");
        return;
      }

      // Build full path like useMouseGaze: rig/${faceId}/${path}
      const fullPath = `rig/${faceId}/${path}`;
      console.log("[vizij-ws] setInput:", fullPath, "=", value);
      setInput(fullPath, { float: value });
      // No step() needed - driveOrchestrator handles the animation loop
    },
    [ready, setInput, faceId]
  );

  // Sync nodes to backend
  useEffect(() => {
    if (!ready || nodesSyncedRef.current) return;

    const constraintKeys = Object.keys(inputConstraints);
    if (constraintKeys.length === 0) return;

    const nodes: NodeInfo[] = constraintKeys.map((path) => {
      const constraint = inputConstraints[path];
      return {
        path,
        kind: "input" as const,
        min: constraint?.min,
        max: constraint?.max,
        default_value: constraint?.defaultValue,
      };
    });

    invoke("set_nodes", { nodes })
      .then(() => {
        console.log(`[vizij-ws] Synced ${nodes.length} nodes to backend`);
        nodesSyncedRef.current = true;
      })
      .catch((err) => {
        console.error("[vizij-ws] Failed to sync nodes:", err);
      });
  }, [ready, inputConstraints]);

  // Listen for WebSocket updates
  useEffect(() => {
    if (!ready) {
      console.log("[vizij-ws] Waiting for runtime to be ready...");
      return;
    }

    console.log("[vizij-ws] Setting up WebSocket listeners");
    console.log("[vizij-ws] Will use path format: rig/" + faceId + "/<path>");

    const unlistenUpdates = listen<Record<string, number>>(
      "update-values",
      (event) => {
        console.log("[vizij-ws] Received update:", event.payload);

        Object.entries(event.payload).forEach(([path, value]) => {
          if (value === undefined) return;

          // Clean up the incoming path - remove leading slashes
          const cleanPath = path.replace(/^\/+/, "").trim();

          // Use setRigValue which builds: rig/${faceId}/${cleanPath}
          setRigValue(cleanPath, value);
        });
      }
    );

    const unlistenReset = listen("reset", () => {
      console.log("[vizij-ws] Reset event received");
      // Reset common paths to 0
      const commonPaths = [
        "standard/left_eye/pos/x",
        "standard/left_eye/pos/y",
        "standard/right_eye/pos/x",
        "standard/right_eye/pos/y",
      ];
      commonPaths.forEach((path) => setRigValue(path, 0));
    });

    return () => {
      unlistenUpdates.then((f) => f());
      unlistenReset.then((f) => f());
    };
  }, [ready, faceId, setRigValue]);

  return {
    ready,
    setRigValue,
    inputConstraints,
    namespace,
    faceId,
  };
}
