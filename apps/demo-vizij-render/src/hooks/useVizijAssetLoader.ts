import { useCallback, useState } from "react";
import type { AnimatableValue } from "@vizij/utils";
import type { World } from "@vizij/render";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import { findRootId } from "../utils/world";

type VizijLoader = () => Promise<[World, Record<string, AnimatableValue>]>;

export function useVizijAssetLoader() {
  const addWorldElements = useVizijStore((state) => state.addWorldElements);
  const setStoreState = useVizijStoreSetter();

  const [rootId, setRootId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [assetUrl, setAssetUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVizij = useCallback(
    async (loader: VizijLoader, label: string) => {
      setIsLoading(true);
      setError(null);
      setRootId(null);
      try {
        const [worldData, anims] = await loader();
        const nextRootId = findRootId(worldData);
        if (!nextRootId) {
          throw new Error("Unable to find a Vizij root in the provided asset.");
        }

        setStoreState({
          values: new Map(),
          elementSelection: [],
        });
        addWorldElements(worldData, anims, true);
        setRootId(nextRootId);
        setSourceName(label);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        console.error("demo-vizij-render: failed to load Vizij", err);
      } finally {
        setIsLoading(false);
      }
    },
    [addWorldElements, setStoreState],
  );

  const loadFromFile = useCallback(
    async (file: File, loader: VizijLoader) => {
      await loadVizij(loader, file.name);
    },
    [loadVizij],
  );

  const loadFromUrl = useCallback(
    async (url: string, loader: VizijLoader) => {
      await loadVizij(loader, url);
    },
    [loadVizij],
  );

  const clearError = useCallback(() => setError(null), []);

  const reset = useCallback(() => {
    setRootId(null);
    setSourceName(null);
    setAssetUrl("");
    setError(null);
  }, []);

  return {
    rootId,
    sourceName,
    assetUrl,
    setAssetUrl,
    isLoading,
    error,
    clearError,
    reset,
    loadVizij,
    loadFromFile,
    loadFromUrl,
  };
}
