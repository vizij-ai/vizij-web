import { useContext, useEffect, useRef, useState } from "react";
import { VizijContext, loadGLTF, type Group, type World } from "@vizij/render";
import type { RawValue } from "@vizij/utils";

import type { FaceConfig } from "../data/faces";

interface LoaderState {
  loading: boolean;
  ready: boolean;
  error?: string;
  rootId?: string;
}

const INITIAL_STATE: LoaderState = {
  loading: false,
  ready: false,
  error: undefined,
  rootId: undefined,
};

function findRootId(world: World): string | undefined {
  const rootEntry = Object.values(world).find(
    (entry) => entry.type === "group" && entry.rootBounds,
  ) as Group | undefined;
  return rootEntry?.id;
}

function stripNamespaceValues(
  namespace: string,
  values: Map<string, RawValue | undefined>,
): Map<string, RawValue | undefined> {
  if (!values.size) {
    return new Map();
  }
  const next = new Map(values);
  for (const key of Array.from(next.keys())) {
    if (key.startsWith(`${namespace}:`)) {
      next.delete(key);
    }
  }
  return next;
}

export function useFaceLoader(
  face: FaceConfig | undefined,
  namespace = "default",
) {
  const store = useContext(VizijContext);
  const [state, setState] = useState<LoaderState>(INITIAL_STATE);
  const requestIdRef = useRef(0);

  if (!store) {
    throw new Error(
      "useFaceLoader must be used inside a VizijContext provider",
    );
  }

  useEffect(() => {
    let cancelled = false;
    const requestId = ++requestIdRef.current;

    if (!face) {
      setState(INITIAL_STATE);
      return () => {
        cancelled = true;
      };
    }

    setState({
      loading: true,
      ready: false,
      error: undefined,
      rootId: undefined,
    });

    const load = async () => {
      try {
        const [world, animatables] = await loadGLTF(
          face.asset,
          [namespace],
          face.aggressiveImport ?? true,
          face.bounds,
        );

        if (cancelled || requestId !== requestIdRef.current) {
          return;
        }

        const rootId = findRootId(world);
        if (!rootId) {
          throw new Error("Unable to determine Vizij root for face asset");
        }

        const { addWorldElements, setValue } = store.getState();

        addWorldElements(world, animatables, true);

        store.setState((prev) => ({
          values: stripNamespaceValues(namespace, prev.values),
          elementSelection: prev.elementSelection.filter(
            (selection) => selection.namespace !== namespace,
          ),
        }));

        if (face.initialValues?.length) {
          for (const initial of face.initialValues) {
            const match = Object.values(animatables).find(
              (anim) => anim.name === initial.name,
            );
            if (match) {
              setValue(match.id, namespace, initial.value);
            }
          }
        }

        setState({ loading: false, ready: true, error: undefined, rootId });
      } catch (err) {
        if (cancelled || requestId !== requestIdRef.current) {
          return;
        }
        console.error("useFaceLoader", err);
        setState({
          loading: false,
          ready: false,
          error: err instanceof Error ? err.message : String(err),
          rootId: undefined,
        });
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [face, namespace, store]);

  return state;
}
