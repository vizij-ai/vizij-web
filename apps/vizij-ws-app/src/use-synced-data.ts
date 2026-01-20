import { listen } from "@tauri-apps/api/event";
import { useVizijStore } from "vizij";
import { useShallow } from "zustand/shallow";
import { useEffect } from "react";

// Inline the getLookup function to avoid @semio/utils dependency
function getLookup(namespace: string, id: string): string {
  return `${namespace}.${id}`;
}

type RawValue = number | string | boolean | number[] | string[] | boolean[];

export function useSyncedData(nameToIdMap: Record<string, string>) {
  const updateValues = useVizijStore(useShallow((state) => state.updateValues));

  useEffect(() => {
    // Listen for update-values events from the WebSocket server
    const unlistenUpdates = listen<Record<string, number>>(
      "update-values",
      (event) => {
        const updates = new Map<string, RawValue>();

        Object.entries(event.payload).forEach(([name, value]) => {
          if (value !== undefined) {
            const id = nameToIdMap[name];
            if (id) {
              const lookup = getLookup("default", id);
              updates.set(lookup, value);
            }
          }
        });

        if (updates.size > 0) {
          updateValues(updates);
        }
      }
    );

    // Listen for reset events
    const unlistenReset = listen("reset", () => {
      console.log("Reset event received");
      // For now, just log - you can implement actual reset logic here
      // This could clear all values to defaults or reload the model
    });

    return () => {
      unlistenUpdates.then((f) => f());
      unlistenReset.then((f) => f());
    };
  }, [nameToIdMap, updateValues]);
}
