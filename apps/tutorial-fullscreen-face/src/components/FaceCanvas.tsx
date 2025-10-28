import { useEffect, useState } from "react";
import { Vizij, loadGLTF, useVizijStore, type World } from "@vizij/render";
import type { Group as VizijGroup } from "@vizij/render";

import { faceAssetUrl } from "../assets";

const FACE_NAMESPACE = "fullscreen-face";

function findRootId(world: World): string | null {
  return (
    Object.values(world).find(
      (entry): entry is VizijGroup =>
        entry?.type === "group" && Boolean(entry.rootBounds),
    )?.id ?? null
  );
}

export function FaceCanvas() {
  const addWorldElements = useVizijStore((state) => state.addWorldElements);
  const [rootId, setRootId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      console.log("[fullscreen-face] FaceCanvas: starting GLB load", faceAssetUrl);
      try {
        const [world, animatables] = await loadGLTF(
          faceAssetUrl,
          [FACE_NAMESPACE],
          true,
        );

        if (cancelled) {
          return;
        }

        const root = findRootId(world);
        if (!root) {
          throw new Error("Unable to locate the Vizij root node in the GLB.");
        }

        addWorldElements(world, animatables, true);
        setRootId(root);
        console.log("[fullscreen-face] FaceCanvas: GLB loaded", { root });
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Unknown GLB load failure.";
        setError(message);
        console.error("[fullscreen-face] FaceCanvas: failed to load GLB", err);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [addWorldElements]);

  if (error) {
    return <div className="status error">Failed to load face: {error}</div>;
  }

  if (!rootId) {
    return <div className="status">Loading face…</div>;
  }

  return (
    <Vizij
      rootId={rootId}
      namespace={FACE_NAMESPACE}
      className="face-canvas"
    />
  );
}

export { FACE_NAMESPACE };
