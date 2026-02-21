import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";
import type { VizijBundleExtension } from "@vizij/render";
import {
  extractBindingsFromBundle,
  getInputIdsWithBindings,
} from "../utils/standardInputBindings";
import {
  humanizePoseGroupName,
  normalizePoseGroupPath,
  sanitizePoseGroupId,
} from "../poseRig/groupMembership";
import type {
  ReferenceFacePose,
  ReferenceFacePoseGroup,
  ReferenceFaceState,
} from "../state/ReferenceFaceContext";

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function normalizeReferencePoseGroupPath(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return normalizePoseGroupPath(value) ?? undefined;
}

function extractReferencePoseSnapshot(bundle: VizijBundleExtension | null): {
  poses: ReferenceFacePose[];
  poseGroups: ReferenceFacePoseGroup[];
} {
  const rawConfig = bundle?.poses?.config;
  if (!rawConfig || typeof rawConfig !== "object") {
    return { poses: [], poseGroups: [] };
  }

  const configObject = rawConfig as Record<string, unknown>;
  const rawGroups = Array.isArray(configObject.poseGroups)
    ? (configObject.poseGroups as unknown[])
    : [];
  const rawPoses = Array.isArray(configObject.poses)
    ? (configObject.poses as unknown[])
    : [];

  const poseGroups: ReferenceFacePoseGroup[] = [];
  const groupPathSet = new Set<string>();
  const groupPathById = new Map<string, string>();

  rawGroups.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const group = entry as Record<string, unknown>;
    const normalizedPath =
      normalizeReferencePoseGroupPath(group.path) ||
      normalizeReferencePoseGroupPath(group.name) ||
      normalizeReferencePoseGroupPath(group.id);
    if (!normalizedPath || groupPathSet.has(normalizedPath)) {
      return;
    }
    groupPathSet.add(normalizedPath);
    const id = sanitizePoseGroupId(
      typeof group.id === "string" ? group.id : null,
      normalizedPath,
    );
    const name =
      typeof group.name === "string" && group.name.trim().length > 0
        ? group.name.trim()
        : humanizePoseGroupName(normalizedPath);
    const blendMode =
      group.blendMode === "average" || group.blendMode === "additive"
        ? group.blendMode
        : undefined;
    poseGroups.push({
      id: id || `reference-group-${index + 1}`,
      path: normalizedPath,
      name,
      blendMode,
    });
    groupPathById.set(id, normalizedPath);
  });

  const poses: ReferenceFacePose[] = rawPoses.map((entry, index) => {
    const pose = entry && typeof entry === "object" ? entry : {};
    const poseObject = pose as Record<string, unknown>;
    const values: Record<string, number> = {};

    if (poseObject.values && typeof poseObject.values === "object") {
      Object.entries(poseObject.values as Record<string, unknown>).forEach(
        ([key, value]) => {
          const numericValue = coerceFiniteNumber(value);
          if (numericValue === null) {
            return;
          }
          values[key] = numericValue;
        },
      );
    }

    const rawGroupIds = Array.isArray(poseObject.groupIds)
      ? (poseObject.groupIds as unknown[])
      : [];
    const resolvedGroupIds = rawGroupIds
      .map((groupId) => (typeof groupId === "string" ? groupId.trim() : ""))
      .filter((groupId) => groupId.length > 0);
    const primaryGroupId =
      typeof poseObject.groupId === "string" && poseObject.groupId.trim().length
        ? poseObject.groupId.trim()
        : (resolvedGroupIds[0] ?? null);
    const explicitGroupPath = normalizeReferencePoseGroupPath(poseObject.group);
    const groupFromId = primaryGroupId
      ? (groupPathById.get(primaryGroupId) ??
        normalizeReferencePoseGroupPath(primaryGroupId))
      : undefined;
    const primaryGroupPath = explicitGroupPath ?? groupFromId ?? null;

    if (primaryGroupPath && !groupPathSet.has(primaryGroupPath)) {
      groupPathSet.add(primaryGroupPath);
      poseGroups.push({
        id: sanitizePoseGroupId(primaryGroupPath, primaryGroupPath),
        path: primaryGroupPath,
        name: humanizePoseGroupName(primaryGroupPath),
      });
    }

    const id =
      typeof poseObject.id === "string" && poseObject.id.trim().length > 0
        ? poseObject.id.trim()
        : `reference-pose-${index + 1}`;
    const name =
      typeof poseObject.name === "string" && poseObject.name.trim().length > 0
        ? poseObject.name.trim()
        : id;
    const description =
      typeof poseObject.description === "string"
        ? poseObject.description
        : undefined;

    return {
      id,
      name,
      description,
      group: primaryGroupPath,
      groupId: primaryGroupId,
      groupIds: resolvedGroupIds.length > 0 ? resolvedGroupIds : undefined,
      values,
    };
  });

  return { poses, poseGroups };
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
  const [inputValues, setInputValues] = useState<Record<string, number>>({});
  const [referencePoses, setReferencePoses] = useState<ReferenceFacePose[]>([]);
  const [referencePoseGroups, setReferencePoseGroups] = useState<
    ReferenceFacePoseGroup[]
  >([]);

  const animateValueRef = useRef<
    ((path: string, value: number) => void) | undefined
  >(undefined);

  // Reset binding info when file is cleared
  useEffect(() => {
    if (!file) {
      setInputIdsWithBindings(new Set());
      setReferencePoses([]);
      setReferencePoseGroups([]);
    }
  }, [file]);

  const onBundleReady = useCallback((bundle: VizijBundleExtension | null) => {
    if (!bundle) {
      setInputIdsWithBindings(new Set());
      setReferencePoses([]);
      setReferencePoseGroups([]);
      return;
    }
    const bindingInfo = extractBindingsFromBundle(bundle);
    const idsWithBindings = getInputIdsWithBindings(bindingInfo);
    setInputIdsWithBindings(idsWithBindings);
    const snapshot = extractReferencePoseSnapshot(bundle);
    setReferencePoses(snapshot.poses);
    setReferencePoseGroups(snapshot.poseGroups);
  }, []);

  const onStandardInputsReady = useCallback(
    (inputs: StandardRigInput[], byId: Map<string, StandardRigInput>) => {
      setStandardInputs(inputs);
      setStandardInputsById(byId);
      const initialValues: Record<string, number> = {};
      for (const input of inputs) {
        initialValues[input.id] = input.defaultValue;
      }
      setInputValues(initialValues);
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
      referencePoses,
      referencePoseGroups,
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
      referencePoses,
      referencePoseGroups,
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
