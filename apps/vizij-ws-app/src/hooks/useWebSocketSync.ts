import { useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  type AroraValue,
  type AroraType,
  type NodeInfo,
  extractNumericValue,
  f64,
} from "@vizij/arora-types";

/**
 * Hook that syncs WebSocket updates to the runtime.
 * Uses the same pattern as useMouseGaze from vizij-showcase:
 *   const fullPath = `rig/${faceId}/${path}`;
 *   setInput(fullPath, { float: value });
 *
 * Maintains local input values state (like vizij-authoring's bindingAuthoringStore)
 * to track values we've set, since the orchestrator consumes inputs during evaluation.
 *
 * No step() call needed - driveOrchestrator={true} handles evaluation.
 */
export function useWebSocketSync() {
  const {
    ready,
    setInput,
    inputConstraints,
    namespace,
    faceId: runtimeFaceId,
  } = useVizijRuntime();

  // Get faceId like useMouseGaze does
  const faceId = (runtimeFaceId ?? "face").toLowerCase();

  const nodesSyncedRef = useRef(false);
  const lastLoggedPathsRef = useRef(false);

  // Local input values state - tracks values we've set
  // Keyed by the short path (e.g., "standard/vizij/mouth/morph/jaw_open")
  const inputValuesRef = useRef<Record<string, number>>({});
  const inputValuesInitializedRef = useRef(false);

  // Initialize input values from defaults when constraints are loaded
  useEffect(() => {
    if (!ready || inputValuesInitializedRef.current) return;

    const constraintKeys = Object.keys(inputConstraints);
    if (constraintKeys.length === 0) return;

    // Initialize local state with default values (like vizij-authoring does)
    const defaults: Record<string, number> = {};
    constraintKeys.forEach((path) => {
      const constraint = inputConstraints[path];
      if (constraint?.defaultValue !== undefined) {
        defaults[path] = constraint.defaultValue;
      }
    });
    inputValuesRef.current = defaults;
    inputValuesInitializedRef.current = true;

    console.log(
      "[vizij-ws] Initialized",
      Object.keys(defaults).length,
      "input values from defaults",
    );
  }, [ready, inputConstraints]);

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

  // Get a rig input value from local state
  // We track values locally because the orchestrator consumes inputs during evaluation
  const getRigValue = useCallback(
    (path: string): number | undefined => {
      if (!ready) return undefined;

      // Check local state first (values we've set via WebSocket)
      const localValue = inputValuesRef.current[path];
      if (localValue !== undefined) {
        return localValue;
      }

      // Fall back to default value from constraints
      const constraint = inputConstraints[path];
      if (constraint?.defaultValue !== undefined) {
        return constraint.defaultValue;
      }

      return undefined;
    },
    [ready, inputConstraints],
  );

  // Set a rig input value - same pattern as useMouseGaze
  // Updates both local state AND the runtime (like vizij-authoring's handleInputValueChange)
  const setRigValue = useCallback(
    (path: string, value: number) => {
      if (!ready) {
        console.warn("[vizij-ws] Runtime not ready, skipping setInput");
        return;
      }

      // Update local state (source of truth for GetSlotValues)
      inputValuesRef.current[path] = value;

      // Build full path like useMouseGaze: rig/${faceId}/${path}
      const fullPath = `rig/${faceId}/${path}`;
      console.log("[vizij-ws] setInput:", fullPath, "=", value);
      setInput(fullPath, { float: value });

      // No step() needed - driveOrchestrator handles the animation loop
    },
    [ready, setInput, faceId],
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
        value_type: "f64" as AroraType, // Current nodes are all f64
        min: constraint?.min,
        max: constraint?.max,
        default_value:
          constraint?.defaultValue != null
            ? f64(constraint.defaultValue)
            : undefined,
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

    // Listen for arora-types Value updates from the WebSocket server
    const unlistenUpdates = listen<Record<string, AroraValue>>(
      "update-values",
      (event) => {
        console.log("[vizij-ws] Received update:", event.payload);

        Object.entries(event.payload).forEach(([path, aroraValue]) => {
          if (aroraValue === undefined) return;

          // Extract numeric value from the arora Value
          const numValue = extractNumericValue(aroraValue);
          if (numValue === null) {
            console.warn(
              `[vizij-ws] Non-numeric value for path ${path}:`,
              aroraValue,
            );
            return;
          }

          // Clean up the incoming path - remove leading slashes
          const cleanPath = path.replace(/^\/+/, "").trim();

          // Use setRigValue which builds: rig/${faceId}/${cleanPath}
          setRigValue(cleanPath, numValue);
        });
      },
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

    // Listen for GetSlotValues requests from the WebSocket server
    const unlistenGetSlots = listen<string[]>(
      "get-slot-values-request",
      async (event) => {
        const requestedSlots = event.payload;
        console.log(
          "[vizij-ws] GetSlotValues request for",
          requestedSlots.length,
          "slots:",
          requestedSlots,
        );

        // Build response with current values from local state
        const values: Record<string, AroraValue> = {};
        for (const slot of requestedSlots) {
          const currentValue = getRigValue(slot);
          console.log("[vizij-ws] getRigValue for", slot, "=", currentValue);
          if (currentValue !== undefined) {
            values[slot] = f64(currentValue);
          }
        }

        console.log("[vizij-ws] Responding with", Object.keys(values).length, "values");

        // Send response back to Rust
        try {
          await invoke("respond_slot_values", { values });
        } catch (err) {
          console.error("[vizij-ws] Failed to respond with slot values:", err);
        }
      },
    );

    return () => {
      unlistenUpdates.then((f) => f());
      unlistenReset.then((f) => f());
      unlistenGetSlots.then((f) => f());
    };
  }, [ready, faceId, setRigValue, getRigValue]);

  return {
    ready,
    setRigValue,
    getRigValue,
    inputConstraints,
    namespace,
    faceId,
  };
}
