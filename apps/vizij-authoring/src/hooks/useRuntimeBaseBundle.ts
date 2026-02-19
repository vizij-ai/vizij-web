import { useMemo } from "react";
import { buildRuntimeBaseBundle } from "../utils/runtimeBundle";

type RuntimeBaseBundleOptions = Parameters<typeof buildRuntimeBaseBundle>[0];

export function useRuntimeBaseBundle(options: RuntimeBaseBundleOptions) {
  const { namespace, world, animatables, loadedBundle } = options;

  return useMemo(
    () =>
      buildRuntimeBaseBundle({
        namespace,
        world,
        animatables,
        loadedBundle,
      }),
    [namespace, world, animatables, loadedBundle],
  );
}
