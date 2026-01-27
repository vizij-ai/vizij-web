import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadGLTFFromBlob,
  useVizijStore,
  useVizijStoreSetter,
} from "@vizij/render";
import type { Group, World } from "@vizij/render";
import type { GlbAsset } from "../state/types";

const INITIAL_STATUS = {
  loading: false,
  ready: false,
  error: null as string | null,
  rootId: null as string | null,
};

function findRoot(world: World): string | null {
  const entry = Object.values(world).find(
    (candidate): candidate is Group =>
      candidate?.type === "group" && Boolean(candidate?.rootBounds),
  );
  return entry?.id ?? null;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return await response.blob();
}

export function useGlbLoader(asset: GlbAsset | null, namespace: string) {
  const addWorldElements = useVizijStore((state) => state.addWorldElements);
  const storeSetter = useVizijStoreSetter();
  const [status, setStatus] = useState(INITIAL_STATUS);
  const requestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++requestRef.current;

    if (!asset) {
      setStatus(INITIAL_STATUS);
      return () => {
        cancelled = true;
      };
    }

    setStatus({ loading: true, ready: false, error: null, rootId: null });

    const run = async () => {
      try {
        const blob = await dataUrlToBlob(asset.dataUrl);
        const [world, animatables] = await loadGLTFFromBlob(blob, [namespace]);

        if (cancelled || requestId !== requestRef.current) {
          return;
        }

        const rootId = findRoot(world);
        if (!rootId) {
          throw new Error("Unable to determine Vizij root for face asset");
        }

        addWorldElements(world, animatables, true);

        storeSetter((prev) => {
          const nextValues = new Map(prev.values);
          for (const key of Array.from(nextValues.keys())) {
            if (key.startsWith(`${namespace}:`)) {
              nextValues.delete(key);
            }
          }
          return {
            ...prev,
            values: nextValues,
            elementSelection: prev.elementSelection.filter(
              (entry) => entry.namespace !== namespace,
            ),
          };
        });

        setStatus({ loading: false, ready: true, error: null, rootId });
      } catch (err) {
        if (cancelled || requestId !== requestRef.current) {
          return;
        }
        console.error("demo-animating-faces: failed to load GLB", err);
        setStatus({
          loading: false,
          ready: false,
          error: err instanceof Error ? err.message : String(err),
          rootId: null,
        });
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [asset, namespace, addWorldElements, storeSetter]);

  return useMemo(
    () => ({
      loading: status.loading,
      ready: status.ready,
      error: status.error,
      rootId: status.rootId,
    }),
    [status],
  );
}
