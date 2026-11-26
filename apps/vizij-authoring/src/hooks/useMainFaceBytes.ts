import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildSceneGraph,
  exportScene,
  useVizijStore,
  vizijHandle,
  type VizijBundleExtension,
} from "@vizij/render";
import type { Runtime } from "@vizij/runtime";
import {
  changedValues,
  featureValue,
  splitWorld,
  type InPlaceEdit,
  type InPlaceValues,
} from "../scene/worldStructure";

/** The performance measure each making of the main face's bytes records:
 * the world built and exported as a GLB. */
export const MAIN_FACE_EXPORT_MEASURE = "vizij-authoring:main-face-export";

/** The performance mark each newly loaded main face records: its
 * `Runtime` handed to the page, before its scene is drawn. */
export const MAIN_FACE_LOADED_MARK = "vizij-authoring:main-face-loaded";

/** The main face as the view loads it, and the values it shows in place. */
export interface MainFace {
  /** The GLB the view loads: the world under the root, with the bundle. */
  bytes: Uint8Array;
  /** The in-place values `bytes` carry. */
  carried: InPlaceValues;
  /** The world's in-place values now. */
  values: InPlaceValues;
}

/**
 * The main face: the document's world under `rootId`, built headless
 * (`buildSceneGraph`) and encoded as GLB bytes with `bundle`.
 *
 * The bytes are re-made when the world's structure (`splitWorld`) or the
 * bundle change; a value edit leaves them as they are and shows in place
 * (`useMainFaceValues`). Until new bytes exist the previous ones stand, so
 * the view keeps drawing the face. `null` while there is no face to show —
 * no `rootId`, a root the world does not hold, or `enabled` false — and
 * while the first bytes of a root are being made.
 */
export function useMainFaceBytes(
  rootId: string | null,
  bundle: VizijBundleExtension | null,
  enabled: boolean,
): MainFace | null {
  const world = useVizijStore((state) => state.world);
  const animatables = useVizijStore((state) => state.animatables);
  const [made, setMade] = useState<{
    rootId: string;
    bytes: Uint8Array;
    carried: InPlaceValues;
  } | null>(null);

  const shown = enabled && rootId !== null && world[rootId] !== undefined;
  const split = useMemo(
    () =>
      shown && rootId !== null ? splitWorld(world, animatables, rootId) : null,
    [animatables, rootId, shown, world],
  );
  // The bytes are made from the latest world of their structure.
  const latest = useRef({ world, animatables, split });
  latest.current = { world, animatables, split };
  const structure = split?.structure ?? null;

  useEffect(() => {
    if (structure === null || rootId === null) {
      setMade(null);
      return;
    }
    const source = latest.current;
    let current = true;
    void (async () => {
      try {
        const start = performance.now();
        const glb = await exportScene(
          buildSceneGraph(source.world, source.animatables, rootId),
          { bundle },
        );
        performance.measure(MAIN_FACE_EXPORT_MEASURE, { start });
        if (current && source.split) {
          setMade({
            rootId,
            bytes: new Uint8Array(glb),
            carried: source.split.values,
          });
        }
      } catch (error) {
        console.error("[vizij-authoring] the main face did not encode", error);
      }
    })();
    return () => {
      current = false;
    };
  }, [bundle, rootId, structure]);

  return useMemo(
    () =>
      split && made?.rootId === rootId
        ? { bytes: made.bytes, carried: made.carried, values: split.values }
        : null,
    [made, rootId, split],
  );
}

/**
 * Show the world's in-place values on the face `runtime` runs: each value
 * that differs from what the face shows is written to the face's element
 * with the App's `setValue`. A newly loaded `runtime` shows what its bytes
 * carry, so a value edited while it loaded is set on it once it exists.
 */
export function useMainFaceValues(
  vizijId: string,
  runtime: Runtime | null,
  face: MainFace | null,
): void {
  const shown = useRef<{ runtime: Runtime; values: InPlaceValues } | null>(
    null,
  );
  useEffect(() => {
    if (!runtime || !face) return;
    const previous =
      shown.current?.runtime === runtime ? shown.current.values : null;
    if (previous === null) performance.mark(MAIN_FACE_LOADED_MARK);
    const from = previous ?? face.carried;
    const edits = changedValues(from, face.values);
    shown.current = { runtime, values: face.values };
    if (edits.length === 0) return;
    // A face's runtime exists only once the page's App has loaded it, so the
    // handle has resolved; the writes keep their order.
    void vizijHandle().then((app) => {
      for (const edit of edits) {
        const value = featureValue(edit.value);
        try {
          if (value === null) throw new Error(notAFeatureValue(edit));
          app.setValue(vizijId, edit.elementId, value, edit.feature);
        } catch (error) {
          console.error(
            `[vizij-authoring] ${edit.feature} of ${edit.elementId} did not apply in place`,
            error,
          );
        }
      }
    });
  }, [face, runtime, vizijId]);
}

function notAFeatureValue(edit: InPlaceEdit): string {
  return `${JSON.stringify(edit.value)} is neither a number nor three`;
}
