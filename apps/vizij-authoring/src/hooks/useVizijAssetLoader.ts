import { useCallback, useState } from "react";
import type { LoadedVizijAsset, VizijBundleExtension } from "@vizij/render";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import { findRootId } from "../utils/world";

type VizijLoader = () => Promise<LoadedVizijAsset>;

export function useVizijAssetLoader() {
  const addWorldElements = useVizijStore((state) => state.addWorldElements);
  const setStoreState = useVizijStoreSetter();

  const [rootId, setRootId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [assetUrl, setAssetUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<VizijBundleExtension | null>(null);

  const loadVizij = useCallback(
    async (loader: VizijLoader, label: string) => {
      setIsLoading(true);
      setError(null);
      setRootId(null);
      try {
        const {
          world: worldData,
          animatables,
          bundle: loadedBundle,
        } = await loader();
        const nextRootId = findRootId(worldData);
        if (!nextRootId) {
          throw new Error("Unable to find a Vizij root in the provided asset.");
        }

        setStoreState({
          values: new Map(),
          elementSelection: [],
        });
        addWorldElements(worldData, animatables, true);
        setRootId(nextRootId);
        setSourceName(label);
        setBundle(loadedBundle ?? null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        console.error("demo-vizij-render: failed to load Vizij", err);
        setBundle(null);
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
    setBundle(null);
  }, []);

  const updateBundle = useCallback(
    (
      updater:
        | VizijBundleExtension
        | null
        | ((
            previous: VizijBundleExtension | null,
          ) => VizijBundleExtension | null),
    ) => {
      if (typeof updater === "function") {
        setBundle((previous) =>
          (
            updater as (
              value: VizijBundleExtension | null,
            ) => VizijBundleExtension | null
          )(previous),
        );
      } else {
        setBundle(updater);
      }
    },
    [],
  );

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
    bundle,
    updateBundle,
  };
}
