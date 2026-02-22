import { useCallback } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";

export interface RuntimeInputDispatchPayload {
  rawPath: string;
  resolvedPath: string;
  value: number;
}

export interface RuntimeInputDispatcherOptions {
  resolvePath?: (path: string) => string;
  onDispatched?: (payload: RuntimeInputDispatchPayload) => void;
}

export function useRuntimeInputDispatcher(
  options: RuntimeInputDispatcherOptions = {},
) {
  const { resolvePath, onDispatched } = options;
  const { setInput } = useVizijRuntime();

  return useCallback(
    (path: string, value: number) => {
      const resolvedPath = resolvePath ? resolvePath(path) : path;
      setInput(resolvedPath, { float: value });
      onDispatched?.({
        rawPath: path,
        resolvedPath,
        value,
      });
    },
    [onDispatched, resolvePath, setInput],
  );
}
