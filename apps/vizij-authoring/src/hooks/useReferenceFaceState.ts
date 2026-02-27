import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import type { VizijBundleExtension } from "@vizij/render";
import { extractReferenceCatalog } from "../referenceFace/referenceCatalog";
import type {
  ReferenceCatalog,
  ReferenceCatalogPipelineLink,
} from "../referenceFace/types";
import {
  extractBindingsFromBundle,
  getInputIdsWithBindings,
} from "../utils/standardInputBindings";
import type { ReferenceFaceState } from "../state/ReferenceFaceContext";

const VALUE_EPSILON = 1e-6;
const EMPTY_REFERENCE_CATALOG: ReferenceCatalog = {
  inputs: [],
  inputsById: new Map(),
  inputsByPath: new Map(),
  pipelineLinks: [],
  poses: [],
  posesById: new Map(),
};
const EMPTY_REFERENCE_LINKS: ReferenceCatalogPipelineLink[] = [];

function areNumbersClose(a: number, b: number): boolean {
  return Math.abs(a - b) < VALUE_EPSILON;
}

function areStandardRigInputsEqual(
  left: StandardRigInput,
  right: StandardRigInput,
): boolean {
  return (
    left.id === right.id &&
    left.path === right.path &&
    left.label === right.label &&
    left.group === right.group &&
    areNumbersClose(left.defaultValue, right.defaultValue) &&
    areNumbersClose(left.range.min, right.range.min) &&
    areNumbersClose(left.range.max, right.range.max)
  );
}

function areStandardInputListsEqual(
  left: StandardRigInput[],
  right: StandardRigInput[],
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftInput = left[index];
    const rightInput = right[index];
    if (
      !leftInput ||
      !rightInput ||
      !areStandardRigInputsEqual(leftInput, rightInput)
    ) {
      return false;
    }
  }
  return true;
}

function areStandardInputMapsEqual(
  left: Map<string, StandardRigInput>,
  right: Map<string, StandardRigInput>,
): boolean {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const [inputId, leftInput] of left) {
    const rightInput = right.get(inputId);
    if (!rightInput || !areStandardRigInputsEqual(leftInput, rightInput)) {
      return false;
    }
  }
  return true;
}

function areSetsEqual<T>(left: Set<T>, right: Set<T>): boolean {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function areInputValueMapsEqual(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  if (left === right) {
    return true;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) {
      return false;
    }
    if (!areNumbersClose(left[key] ?? 0, right[key] ?? 0)) {
      return false;
    }
  }
  return true;
}

function areReferenceCatalogsEqual(
  left: ReferenceCatalog,
  right: ReferenceCatalog,
): boolean {
  if (left === right) {
    return true;
  }
  if (
    left.inputs.length !== right.inputs.length ||
    left.pipelineLinks.length !== right.pipelineLinks.length ||
    left.poses.length !== right.poses.length
  ) {
    return false;
  }
  for (let index = 0; index < left.inputs.length; index += 1) {
    const leftInput = left.inputs[index];
    const rightInput = right.inputs[index];
    if (
      !leftInput ||
      !rightInput ||
      leftInput.id !== rightInput.id ||
      leftInput.path !== rightInput.path ||
      leftInput.label !== rightInput.label ||
      !areNumbersClose(leftInput.defaultValue, rightInput.defaultValue) ||
      !areNumbersClose(leftInput.range.min, rightInput.range.min) ||
      !areNumbersClose(leftInput.range.max, rightInput.range.max) ||
      leftInput.parents.length !== rightInput.parents.length ||
      leftInput.children.length !== rightInput.children.length
    ) {
      return false;
    }
  }
  for (let index = 0; index < left.pipelineLinks.length; index += 1) {
    const leftLink = left.pipelineLinks[index];
    const rightLink = right.pipelineLinks[index];
    if (
      !leftLink ||
      !rightLink ||
      leftLink.linkId !== rightLink.linkId ||
      leftLink.parentInputId !== rightLink.parentInputId ||
      leftLink.childInputId !== rightLink.childInputId ||
      !areNumbersClose(leftLink.scale, rightLink.scale) ||
      !areNumbersClose(leftLink.offset, rightLink.offset) ||
      leftLink.enabled !== rightLink.enabled
    ) {
      return false;
    }
  }
  for (let index = 0; index < left.poses.length; index += 1) {
    const leftPose = left.poses[index];
    const rightPose = right.poses[index];
    if (
      !leftPose ||
      !rightPose ||
      leftPose.id !== rightPose.id ||
      leftPose.name !== rightPose.name ||
      leftPose.targets.length !== rightPose.targets.length
    ) {
      return false;
    }
    for (
      let targetIndex = 0;
      targetIndex < leftPose.targets.length;
      targetIndex += 1
    ) {
      const leftTarget = leftPose.targets[targetIndex];
      const rightTarget = rightPose.targets[targetIndex];
      if (
        !leftTarget ||
        !rightTarget ||
        leftTarget.inputId !== rightTarget.inputId ||
        !areNumbersClose(leftTarget.value, rightTarget.value)
      ) {
        return false;
      }
    }
  }
  return true;
}

function isReferenceCatalogEmpty(catalog: ReferenceCatalog): boolean {
  return (
    catalog.inputs.length === 0 &&
    catalog.pipelineLinks.length === 0 &&
    catalog.poses.length === 0
  );
}

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
  const [bundle, setBundle] = useState<VizijBundleExtension | null>(null);
  const [referenceCatalog, setReferenceCatalog] = useState<ReferenceCatalog>(
    EMPTY_REFERENCE_CATALOG,
  );
  const [inputValues, setInputValues] = useState<Record<string, number>>({});

  const animateValueRef = useRef<
    ((path: string, value: number) => void) | undefined
  >(undefined);

  // Reset binding info when file is cleared
  useEffect(() => {
    if (!file) {
      setIsLoading((previous) => (previous ? false : previous));
      setIsLoaded((previous) => (previous ? false : previous));
      setStandardInputs((previous) => (previous.length > 0 ? [] : previous));
      setStandardInputsById((previous) =>
        previous.size > 0 ? new Map() : previous,
      );
      setInputIdsWithBindings((previous) =>
        previous.size > 0 ? new Set() : previous,
      );
      setBundle((previous) => (previous ? null : previous));
      setReferenceCatalog((previous) =>
        isReferenceCatalogEmpty(previous) ? previous : EMPTY_REFERENCE_CATALOG,
      );
      setInputValues((previous) =>
        Object.keys(previous).length > 0 ? {} : previous,
      );
      animateValueRef.current = undefined;
    }
  }, [file]);

  const onBundleReady = useCallback((bundle: VizijBundleExtension | null) => {
    if (!bundle) {
      setBundle((previous) => (previous ? null : previous));
      setInputIdsWithBindings((previous) =>
        previous.size > 0 ? new Set() : previous,
      );
      setReferenceCatalog((previous) =>
        isReferenceCatalogEmpty(previous) ? previous : EMPTY_REFERENCE_CATALOG,
      );
      return;
    }
    const bindingInfo = extractBindingsFromBundle(bundle);
    const idsWithBindings = getInputIdsWithBindings(bindingInfo);
    const catalog = extractReferenceCatalog(bundle);
    setBundle((previous) => (previous === bundle ? previous : bundle));
    setInputIdsWithBindings((previous) =>
      areSetsEqual(previous, idsWithBindings) ? previous : idsWithBindings,
    );
    setReferenceCatalog((previous) =>
      areReferenceCatalogsEqual(previous, catalog) ? previous : catalog,
    );
  }, []);

  const onStandardInputsReady = useCallback(
    (inputs: StandardRigInput[], byId: Map<string, StandardRigInput>) => {
      setStandardInputs((previous) =>
        areStandardInputListsEqual(previous, inputs) ? previous : inputs,
      );
      setStandardInputsById((previous) =>
        areStandardInputMapsEqual(previous, byId) ? previous : byId,
      );
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
              Math.abs(previousValue - resolvedValue) > VALUE_EPSILON)
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
          Math.abs(current - value) < VALUE_EPSILON
        ) {
          return prev;
        }
        return { ...prev, [inputId]: value };
      });
      animateValueRef.current?.(input.path, value);
    },
    [standardInputsById],
  );

  const handleInputPathValueChange = useCallback(
    (inputPath: string, value: number) => {
      const normalizedPath = normalizeStandardRigInputPath(inputPath);
      if (!normalizedPath || normalizedPath === "/custom/input") {
        console.warn(
          `[useReferenceFaceState] Invalid reference face input path: ${inputPath}`,
        );
        return;
      }

      const runtimeInput = standardInputs.find(
        (input) => normalizeStandardRigInputPath(input.path) === normalizedPath,
      );

      if (runtimeInput) {
        setInputValues((prev) => {
          const current = prev[runtimeInput.id];
          if (
            typeof current === "number" &&
            Number.isFinite(current) &&
            Math.abs(current - value) < VALUE_EPSILON
          ) {
            return prev;
          }
          return { ...prev, [runtimeInput.id]: value };
        });
      }

      animateValueRef.current?.(normalizedPath, value);
    },
    [standardInputs],
  );

  const handleResetAllInputValues = useCallback(() => {
    const resetValues: Record<string, number> = {};
    for (const input of standardInputs) {
      resetValues[input.id] = input.defaultValue;
      animateValueRef.current?.(input.path, input.defaultValue);
    }
    setInputValues((previous) =>
      areInputValueMapsEqual(previous, resetValues) ? previous : resetValues,
    );
  }, [standardInputs]);

  const onStandardInputChange = useCallback(
    (inputId: string, value: number) => {
      setInputValues((prev) => {
        const current = prev[inputId];
        if (
          typeof current === "number" &&
          Number.isFinite(current) &&
          Math.abs(current - value) < VALUE_EPSILON
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

  const referenceCatalogLinksByInputId = useMemo(() => {
    const grouped = new Map<
      string,
      Map<string, ReferenceCatalogPipelineLink>
    >();
    const collect = (
      inputId: string,
      links: ReferenceCatalogPipelineLink[],
    ) => {
      const byId =
        grouped.get(inputId) ?? new Map<string, ReferenceCatalogPipelineLink>();
      links.forEach((link) => {
        byId.set(link.linkId, link);
      });
      grouped.set(inputId, byId);
    };
    referenceCatalog.pipelineLinks.forEach((link) => {
      collect(link.childInputId, [link]);
      collect(link.parentInputId, [link]);
    });
    const flattened = new Map<string, ReferenceCatalogPipelineLink[]>();
    grouped.forEach((byLinkId, inputId) => {
      flattened.set(
        inputId,
        Array.from(byLinkId.values()).sort((a, b) =>
          a.linkId.localeCompare(b.linkId),
        ),
      );
    });
    return flattened;
  }, [referenceCatalog]);

  const getReferenceCatalogInput = useCallback(
    (inputId: string) => referenceCatalog.inputsById.get(inputId) ?? null,
    [referenceCatalog],
  );

  const getReferenceCatalogPose = useCallback(
    (poseId: string) => referenceCatalog.posesById.get(poseId) ?? null,
    [referenceCatalog],
  );

  const getReferenceCatalogLinksForInput = useCallback(
    (inputId: string) =>
      referenceCatalogLinksByInputId.get(inputId) ?? EMPTY_REFERENCE_LINKS,
    [referenceCatalogLinksByInputId],
  );

  return useMemo(
    () => ({
      file,
      setFile,
      isLoading,
      isLoaded,
      standardInputs,
      standardInputsById,
      inputIdsWithBindings,
      bundle,
      referenceCatalog,
      getReferenceCatalogInput,
      getReferenceCatalogPose,
      getReferenceCatalogLinksForInput,
      inputValues,
      handleInputValueChange,
      handleInputPathValueChange,
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
      bundle,
      referenceCatalog,
      getReferenceCatalogInput,
      getReferenceCatalogPose,
      getReferenceCatalogLinksForInput,
      inputValues,
      handleInputValueChange,
      handleInputPathValueChange,
      handleResetAllInputValues,
      onStandardInputsReady,
      onLoadingStateChange,
      onAnimateValueReady,
      onStandardInputChange,
      onBundleReady,
    ],
  );
}
