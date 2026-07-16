import { useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useVizijRuntime } from "@vizij/runtime-react";
import { valueAsNumber } from "@vizij/value-json";
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
 * No step() call needed - driveRuntime={true} handles evaluation.
 */
export function useWebSocketSync() {
  const {
    ready,
    setInput,
    inputConstraints,
    namespace,
    faceId: runtimeFaceId,
    // The runtime's engine-store snapshot (most current after graph evaluation).
    getValueSnapshot: getPathSnapshot,
  } = useVizijRuntime();

  // Get faceId like useMouseGaze does
  const faceId = (runtimeFaceId ?? "face").toLowerCase();

  const nodesSyncedRef = useRef(false);
  const lastLoggedPathsRef = useRef(false);
  const constraintsFingerprintRef = useRef("");

  // Local input values state - tracks values we've set
  // Keyed by the short path (e.g., "standard/vizij/mouth/morph/jaw_open")
  const inputValuesRef = useRef<Record<string, number>>({});

  const normalizeSlotPath = useCallback(
    (path: string): string => {
      const removedSlashes = path.replace(/^\/+/, "").replace(/\/+/g, "/");
      if (!namespace) return removedSlashes;
      return removedSlashes.startsWith(`${namespace}/`)
        ? removedSlashes.slice(namespace.length + 1)
        : removedSlashes;
    },
    [namespace],
  );

  // Initialize input values from defaults when constraints are loaded
  useEffect(() => {
    if (!ready) return;

    const constraintKeys = Object.keys(inputConstraints);
    if (constraintKeys.length === 0) {
      inputValuesRef.current = {};
      constraintsFingerprintRef.current = "";
      return;
    }

    const normalizedConstraintEntries = constraintKeys.map((path) => ({
      path: normalizeSlotPath(path),
      constraint: inputConstraints[path],
    }));

    const fingerprint = normalizedConstraintEntries
      .slice()
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(({ path, constraint }) => {
        if (!constraint || constraint.defaultValue == null) return path;
        return `${path}:${constraint.defaultValue}`;
      })
      .join("|");

    if (constraintsFingerprintRef.current === fingerprint) return;

    // Initialize local state with default values (like vizij-authoring does)
    const defaults: Record<string, number> = {};
    normalizedConstraintEntries.forEach(({ path, constraint }) => {
      if (constraint?.defaultValue !== undefined) {
        defaults[path] = constraint.defaultValue;
      }
    });
    inputValuesRef.current = defaults;
    constraintsFingerprintRef.current = fingerprint;

    console.log(
      "[vizij-standalone] Initialized",
      Object.keys(defaults).length,
      "input values from defaults",
    );
  }, [ready, inputConstraints, normalizeSlotPath]);

  // Log available paths once when ready
  useEffect(() => {
    if (!ready || lastLoggedPathsRef.current) return;
    lastLoggedPathsRef.current = true;

    const constraintKeys = Object.keys(inputConstraints);
    console.log("[vizij-standalone] Runtime ready!");
    console.log("[vizij-standalone] Namespace:", namespace);
    console.log("[vizij-standalone] Face ID:", faceId);
    console.log(
      "[vizij-standalone] Total input constraints:",
      constraintKeys.length,
    );

    // Show sample paths to help debug path format
    const samples = constraintKeys.slice(0, 10);
    console.log("[vizij-standalone] Sample constraint paths:", samples);

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
    console.log(
      "[vizij-standalone] Path patterns:",
      Array.from(patterns).slice(0, 10),
    );
  }, [ready, inputConstraints, namespace, faceId]);

  // Get a rig input value - tries orchestrator cache first, then local state
  // The orchestrator caches values when setInput is called and after graph evaluation
  const getRigValue = useCallback(
    (path: string): number | undefined => {
      if (!ready) return undefined;

      // Normalize path: remove leading slashes, empty segments, and namespace prefix if present
      const normalizedPath = normalizeSlotPath(path);

      // Build the namespaced path that the orchestrator uses
      // Format: namespace/rig/faceId/path (e.g., "vizij-standalone/rig/quori_latest/standard/vizij/mouth/morph/jaw_open")
      const fullPath = `rig/${faceId}/${normalizedPath}`;
      const namespacedPath = `${namespace}/${fullPath}`;

      // Try orchestrator cache first (most current after graph evaluation)
      const cachedValue = getPathSnapshot(namespacedPath);
      if (cachedValue !== undefined) {
        const numValue = valueAsNumber(cachedValue);
        if (numValue !== undefined) {
          return numValue;
        }
      }

      // Fall back to local state (values we've set via WebSocket)
      const localValue = inputValuesRef.current[normalizedPath];
      if (localValue !== undefined) {
        return localValue;
      }

      // Fall back to default value from constraints
      const constraint =
        inputConstraints[normalizedPath] ??
        (namespace
          ? inputConstraints[`${namespace}/${normalizedPath}`]
          : undefined);
      if (constraint?.defaultValue !== undefined) {
        return constraint.defaultValue;
      }

      return undefined;
    },
    [
      ready,
      inputConstraints,
      faceId,
      namespace,
      getPathSnapshot,
      normalizeSlotPath,
    ],
  );

  // Set a rig input value - same pattern as useMouseGaze
  // Updates both local state AND the runtime (like vizij-authoring's handleInputValueChange)
  const setRigValue = useCallback(
    (path: string, value: number) => {
      if (!ready) {
        console.warn("[vizij-standalone] Runtime not ready, skipping setInput");
        return;
      }

      const normalizedPath = normalizeSlotPath(path);

      // Update local state (source of truth for GetSlotValues)
      inputValuesRef.current[normalizedPath] = value;

      // Build full path like useMouseGaze: rig/${faceId}/${path}
      const fullPath = `rig/${faceId}/${normalizedPath}`;
      console.log("[vizij-standalone] setInput:", fullPath, "=", value);
      setInput(fullPath, { float: value });

      // No step() needed - driveRuntime handles the animation loop
    },
    [ready, setInput, faceId, normalizeSlotPath],
  );

  // Sync nodes to backend
  useEffect(() => {
    if (!ready || nodesSyncedRef.current) return;

    const constraintKeys = Object.keys(inputConstraints);
    if (constraintKeys.length === 0) return;

    // Register each input under its canonical store key. The constraint map
    // holds ~4 aliases per input (raw, namespaced, and slash-prefixed variants);
    // normalizeSlotPath collapses them to one clean key, so the seeded catalog
    // matches what pushValues publishes and carries no empty chunks.
    const seenPaths = new Set<string>();
    const nodes: NodeInfo[] = [];
    for (const path of constraintKeys) {
      const cleanPath = normalizeSlotPath(path);
      if (seenPaths.has(cleanPath)) continue;
      seenPaths.add(cleanPath);
      const constraint = inputConstraints[path];
      nodes.push({
        path: cleanPath,
        kind: "input" as const,
        value_type: "f64" as AroraType, // Current nodes are all f64
        min: constraint?.min,
        max: constraint?.max,
        default_value:
          constraint?.defaultValue != null
            ? f64(constraint.defaultValue)
            : undefined,
      });
    }

    invoke("set_slots", { slots: nodes })
      .then(() => {
        console.log(
          `[vizij-standalone] Synced ${nodes.length} slots to backend`,
        );
        nodesSyncedRef.current = true;
      })
      .catch((err) => {
        console.error("[vizij-standalone] Failed to sync slots:", err);
      });
  }, [ready, inputConstraints, normalizeSlotPath]);

  // Listen for WebSocket updates
  useEffect(() => {
    if (!ready) {
      console.log("[vizij-standalone] Waiting for runtime to be ready...");
      return;
    }

    console.log("[vizij-standalone] Setting up WebSocket listeners");
    console.log(
      "[vizij-standalone] Will use path format: rig/" + faceId + "/<path>",
    );

    // Listen for arora-types Value updates from the WebSocket server
    const unlistenUpdates = listen<Record<string, AroraValue>>(
      "update-values",
      (event) => {
        console.log("[vizij-standalone] Received update:", event.payload);

        Object.entries(event.payload).forEach(([path, aroraValue]) => {
          if (aroraValue === undefined) return;

          // Extract numeric value from the arora Value
          const numValue = extractNumericValue(aroraValue);
          if (numValue === null) {
            console.warn(
              `[vizij-standalone] Non-numeric value for path ${path}:`,
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
      console.log("[vizij-standalone] Reset event received");
      // Reset all slots to their default values
      Object.entries(inputConstraints).forEach(([path, constraint]) => {
        const defaultValue = constraint?.defaultValue ?? 0;
        setRigValue(path, defaultValue);
      });
      // Also clear local state and reinitialize from defaults
      const defaults: Record<string, number> = {};
      Object.entries(inputConstraints).forEach(([path, constraint]) => {
        const normalizedPath = normalizeSlotPath(path);
        if (constraint?.defaultValue !== undefined) {
          defaults[normalizedPath] = constraint.defaultValue;
        }
      });
      inputValuesRef.current = defaults;
      console.log(
        `[vizij-standalone] Reset ${Object.keys(inputConstraints).length} slots to defaults`,
      );
    });

    return () => {
      unlistenUpdates.then((f) => f());
      unlistenReset.then((f) => f());
    };
  }, [ready, faceId, setRigValue, getRigValue, inputConstraints]);

  // Continuously mirror the webview's live values into the native store.
  //
  // Replaces the old 5s one-shot `get-slot-values-request`/`respond_slot_values`
  // pull. The `publish_values` command writes these into the shared
  // SimpleDataStore, which fans each real change out to every attached bridge
  // (WS `values_changed`, ROS2 publish, Studio live-data). The store is
  // change-only, so re-pushing the full snapshot every tick is cheap.
  useEffect(() => {
    if (!ready) return;

    const constraintKeys = Object.keys(inputConstraints);
    if (constraintKeys.length === 0) return;

    const pushValues = () => {
      const values: Record<string, AroraValue> = {};
      for (const path of constraintKeys) {
        const currentValue = getRigValue(path);
        if (currentValue !== undefined) {
          // Publish under the canonical store key, not the raw constraint-map
          // alias. Rig input paths are stored with a leading slash (e.g.
          // "/rblid/translation/z") and the map also holds namespaced variants;
          // publishing those verbatim yields empty Zenoh chunks once the bridge
          // prepends "state/{uid}/" ("state/<uid>//rblid/..."). normalizeSlotPath
          // strips the leading slash, collapses "//", and drops the namespace,
          // which also collapses the ~4 aliases of each input to one key.
          values[normalizeSlotPath(path)] = f64(currentValue);
        }
      }
      if (Object.keys(values).length > 0) {
        invoke("publish_values", { values }).catch((err) => {
          console.error("[vizij-standalone] Failed to publish values:", err);
        });
      }
    };

    // Push once immediately, then on a 10Hz interval for live data.
    pushValues();
    const interval = window.setInterval(pushValues, 100);
    return () => window.clearInterval(interval);
  }, [ready, inputConstraints, getRigValue, normalizeSlotPath]);

  return {
    ready,
    setRigValue,
    getRigValue,
    inputConstraints,
    namespace,
    faceId,
  };
}
