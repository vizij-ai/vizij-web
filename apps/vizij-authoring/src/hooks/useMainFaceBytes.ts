import { useEffect, useState } from "react";
import {
  buildSceneGraph,
  exportScene,
  useVizijStore,
  type VizijBundleExtension,
} from "@vizij/render";

/**
 * The main face as the view loads it: the document's world under `rootId`,
 * built headless (`buildSceneGraph`) and encoded as GLB bytes with `bundle`.
 *
 * The bytes are re-made whenever the world, its animatables or the bundle
 * change; until the new bytes exist the previous ones stand, so the view keeps
 * drawing the face. `null` while there is no face to show — no `rootId`, a
 * root the world does not hold, or `enabled` false — and while the first
 * bytes of a root are being made.
 */
export function useMainFaceBytes(
  rootId: string | null,
  bundle: VizijBundleExtension | null,
  enabled: boolean,
): Uint8Array | null {
  const world = useVizijStore((state) => state.world);
  const animatables = useVizijStore((state) => state.animatables);
  const [made, setMade] = useState<{
    rootId: string;
    bytes: Uint8Array;
  } | null>(null);

  const shown = enabled && rootId !== null && world[rootId] !== undefined;

  useEffect(() => {
    if (!shown || rootId === null) {
      setMade(null);
      return;
    }
    let current = true;
    void (async () => {
      try {
        const glb = await exportScene(
          buildSceneGraph(world, animatables, rootId),
          { bundle },
        );
        if (current) {
          setMade({ rootId, bytes: new Uint8Array(glb) });
        }
      } catch (error) {
        console.error("[vizij-authoring] the main face did not encode", error);
      }
    })();
    return () => {
      current = false;
    };
  }, [animatables, bundle, rootId, shown, world]);

  return shown && made?.rootId === rootId ? made.bytes : null;
}
