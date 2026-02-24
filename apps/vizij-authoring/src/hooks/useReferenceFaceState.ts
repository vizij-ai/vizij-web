import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";
import type { VizijBundleExtension } from "@vizij/render";
import {
  extractBindingsFromBundle,
  getInputIdsWithBindings,
} from "../utils/standardInputBindings";
import type { ReferenceFaceState } from "../state/ReferenceFaceContext";

export function useReferenceFaceState(
  onStandardInputChangeProp?: (inputId: string, value: number) => void,
): ReferenceFaceState {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [standardInputs, setStandardInputs] = useState<StandardRigInput[]>([]);
  const [standardInputsById, setStandardInputsById] = useState<
    Map<string, StandardRigInput>
  >(new Map());
  const [inputIdsWithBindings, setInputIdsWithBindings] = useState<Set<string>>(
    new Set(),
  );
  const [inputValues, setInputValues] = useState<Record<string, number>>({});

  const animateValueRef = useRef<
    ((path: string, value: number) => void) | undefined
  >(undefined);

  // Reset binding info when file is cleared
  useEffect(() => {
    if (!file) {
      setInputIdsWithBindings(new Set());
    }
  }, [file]);

  const onBundleReady = useCallback((bundle: VizijBundleExtension | null) => {
    if (!bundle) {
      setInputIdsWithBindings(new Set());
      return;
    }
    const bindingInfo = extractBindingsFromBundle(bundle);
    const idsWithBindings = getInputIdsWithBindings(bindingInfo);
    setInputIdsWithBindings(idsWithBindings);
  }, []);

  const onStandardInputsReady = useCallback(
    (inputs: StandardRigInput[], byId: Map<string, StandardRigInput>) => {
      setStandardInputs(inputs);
      setStandardInputsById(byId);
      setInputValues((previous) => {
        const nextValues: Record<string, number> = {};
        let changed = false;
        for (const input of inputs) {
          const previousValue = previous[input.id];
          const resolvedValue =
            typeof previousValue === "number" && Number.isFinite(previousValue)
              ? previousValue
              : input.defaultValue;
          nextValues[input.id] = resolvedValue;
          if (
            !changed &&
            (!Object.prototype.hasOwnProperty.call(previous, input.id) ||
              Math.abs(previousValue - resolvedValue) > 1e-6)
          ) {
            changed = true;
          }
        }
        if (!changed) {
          const previousKeys = Object.keys(previous);
          if (previousKeys.length !== inputs.length) {
            changed = true;
          } else if (
            previousKeys.some(
              (inputId) =>
                !Object.prototype.hasOwnProperty.call(nextValues, inputId),
            )
          ) {
            changed = true;
          }
        }
        return changed ? nextValues : previous;
      });
    },
    [],
  );

  const onLoadingStateChange = useCallback(
    (loading: boolean, loaded: boolean) => {
      setIsLoading(loading);
      setIsLoaded(loaded);
    },
    [],
  );

  const onAnimateValueReady = useCallback(
    (animateFn: ((path: string, value: number) => void) | undefined) => {
      animateValueRef.current = animateFn;
    },
    [],
  );

  const handleInputValueChange = useCallback(
    (inputId: string, value: number) => {
      const input = standardInputsById.get(inputId);
      if (!input) {
        console.warn(
          `[useReferenceFaceState] Unknown reference face input ID: ${inputId}`,
        );
        return;
      }
      setInputValues((prev) => {
        const current = prev[inputId];
        if (
          typeof current === "number" &&
          Number.isFinite(current) &&
          Math.abs(current - value) < 1e-6
        ) {
          return prev;
        }
        return { ...prev, [inputId]: value };
      });
      animateValueRef.current?.(input.path, value);
    },
    [standardInputsById],
  );

  const handleResetAllInputValues = useCallback(() => {
    const resetValues: Record<string, number> = {};
    for (const input of standardInputs) {
      resetValues[input.id] = input.defaultValue;
      animateValueRef.current?.(input.path, input.defaultValue);
    }
    setInputValues(resetValues);
  }, [standardInputs]);

  const onStandardInputChange = useCallback(
    (inputId: string, value: number) => {
      setInputValues((prev) => {
        const current = prev[inputId];
        if (
          typeof current === "number" &&
          Number.isFinite(current) &&
          Math.abs(current - value) < 1e-6
        ) {
          return prev;
        }
        return { ...prev, [inputId]: value };
      });
      // Propagate runtime-originated reference input edits when a bridge is configured.
      if (onStandardInputChangeProp) {
        onStandardInputChangeProp(inputId, value);
      }
    },
    [onStandardInputChangeProp],
  );

  return useMemo(
    () => ({
      file,
      setFile,
      isLoading,
      isLoaded,
      isPlaying: false, // Default
      standardInputs,
      standardInputsById,
      inputIdsWithBindings,
      inputValues,
      handleInputValueChange,
      handleResetAllInputValues,
      onStandardInputsReady,
      onLoadingStateChange,
      onAnimateValueReady,
      onStandardInputChange,
      onBundleReady,
    }),
    [
      file,
      isLoading,
      isLoaded,
      standardInputs,
      standardInputsById,
      inputIdsWithBindings,
      inputValues,
      handleInputValueChange,
      handleResetAllInputValues,
      onStandardInputsReady,
      onLoadingStateChange,
      onAnimateValueReady,
      onStandardInputChange,
      onBundleReady,
    ],
  );
}
