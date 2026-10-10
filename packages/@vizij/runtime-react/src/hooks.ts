import { useContext, useEffect, useRef, useState } from "react";
import type { ValueJSON } from "@vizij/runtime";
import {
  VizijChangeContext,
  VizijRuntimeContext,
  type VizijChanges,
  type VizijRuntimeContextValue,
} from "./context";

/** The face of the nearest `VizijRuntimeProvider`; throws outside one. */
export function useVizijRuntime(): VizijRuntimeContextValue {
  const context = useContext(VizijRuntimeContext);
  if (!context) {
    throw new Error("useVizijRuntime must be used within VizijRuntimeProvider");
  }
  return context;
}

/** The face of the nearest `VizijRuntimeProvider`, or `null` outside one. */
export function useOptionalVizijRuntime(): VizijRuntimeContextValue | null {
  return useContext(VizijRuntimeContext);
}

/**
 * Call `listener` with each batch of store changes the provider drains: at
 * most once per animation frame, the first batch after a (re)load being the
 * whole store. For a consumer that must not re-render per change — a
 * sampler, a scrubber, a bridge to another system. The latest `listener` is
 * called; it need not be stable.
 */
export function useVizijChanges(
  listener: (changes: VizijChanges) => void,
): void {
  const source = useContext(VizijChangeContext);
  if (!source) {
    throw new Error("useVizijChanges must be used within VizijRuntimeProvider");
  }
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(
    () => source.subscribe((changes) => latest.current(changes)),
    [source],
  );
}

/**
 * The current values of `paths` in the face's store — `null` for an unset
 * key — re-rendering the component when one of them changes. Read from the
 * runtime when it (re)loads, then kept current from the provider's batches.
 */
export function useVizijValues(
  paths: string[],
): Record<string, ValueJSON | null> {
  const { runtime } = useVizijRuntime();
  const key = paths.join("\n");
  const [values, setValues] = useState<Record<string, ValueJSON | null>>(() =>
    read(runtime, paths),
  );

  useEffect(() => {
    setValues(read(runtime, key ? key.split("\n") : []));
  }, [runtime, key]);

  useVizijChanges((changes) => {
    const watched = key ? key.split("\n") : [];
    if (!watched.some((path) => path in changes)) return;
    setValues((previous) => {
      const next = { ...previous };
      for (const path of watched) {
        if (path in changes) next[path] = changes[path];
      }
      return next;
    });
  });

  return values;
}

function read(
  runtime: VizijRuntimeContextValue["runtime"],
  paths: string[],
): Record<string, ValueJSON | null> {
  if (paths.length === 0) return {};
  if (!runtime) return Object.fromEntries(paths.map((path) => [path, null]));
  return runtime.readValues(paths);
}
