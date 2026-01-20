import { listen } from "@tauri-apps/api/event";
import { useVizijRuntime } from "@vizij/runtime-react";
import { useEffect } from "react";

/**
 * Hook to sync WebSocket updates with the Vizij runtime.
 *
 * Listens for "update-values" events from the Tauri WebSocket server
 * and applies them as orchestrator inputs.
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
  const { setInput, ready } = useVizijRuntime();

  useEffect(() => {
    if (!ready) return;

    // Listen for update-values events from the WebSocket server
    const unlistenUpdates = listen<Record<string, number>>(
      "update-values",
      (event) => {
        Object.entries(event.payload).forEach(([path, value]) => {
          if (value !== undefined) {
            setInput(path, value);
          }
        });
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
  }, [setInput, ready]);
}
