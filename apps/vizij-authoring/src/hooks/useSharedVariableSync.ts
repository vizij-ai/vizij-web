import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";

export type SharedVariableSyncPolicy =
  | "off"
  | "bidirectional"
  | "main-to-reference"
  | "reference-to-main";

type SharedVariableSource = "main" | "reference";

export interface SharedVariableLink {
  path: string;
  mainInputId: string;
  referenceInputId: string;
  mainValue: number;
  referenceValue: number;
  delta: number;
  inSync: boolean;
}

export interface SharedVariableConflict {
  path: string;
  mainInputId: string;
  referenceInputId: string;
  firstSource: SharedVariableSource;
  firstValue: number;
  secondSource: SharedVariableSource;
  secondValue: number;
  detectedAt: number;
}

interface SharedVariableSyncPair {
  path: string;
  mainInput: StandardRigInput;
  referenceInput: StandardRigInput;
}

interface UseSharedVariableSyncArgs {
  mainInputsById: Map<string, StandardRigInput>;
  mainInputValues: Record<string, number>;
  referenceInputs: StandardRigInput[];
  referenceInputValues: Record<string, number>;
  onMainInputValueChange: (inputId: string, value: number) => void;
  onReferenceInputValueChange: (inputId: string, value: number) => void;
  initialPolicy?: SharedVariableSyncPolicy;
  onSyncPassMetrics?: (metrics: SharedVariableSyncPassMetrics) => void;
}

export interface UseSharedVariableSyncResult {
  policy: SharedVariableSyncPolicy;
  setPolicy: (policy: SharedVariableSyncPolicy) => void;
  links: SharedVariableLink[];
  linksByPath: Map<string, SharedVariableLink>;
  linksByMainInputId: Map<string, SharedVariableLink>;
  linksByReferenceInputId: Map<string, SharedVariableLink>;
  outOfSyncCount: number;
  conflicts: SharedVariableConflict[];
  conflictsByPath: Map<string, SharedVariableConflict>;
  resolveConflict: (
    path: string,
    winner: "main" | "reference",
  ) => SharedVariableConflict | null;
  dismissConflict: (path: string) => void;
}

export interface SharedVariableSyncPassMetrics {
  pairCount: number;
  passCount: number;
  pairEvaluations: number;
}

const EPSILON = 1e-6;
const CONFLICT_WINDOW_MS = 1_250;

function isDifferent(a: number, b: number): boolean {
  return Math.abs(a - b) > EPSILON;
}

function safeValue(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function shouldMirrorFromMain(policy: SharedVariableSyncPolicy): boolean {
  return policy === "bidirectional" || policy === "main-to-reference";
}

function shouldMirrorFromReference(policy: SharedVariableSyncPolicy): boolean {
  return policy === "bidirectional" || policy === "reference-to-main";
}

export function useSharedVariableSync({
  mainInputsById,
  mainInputValues,
  referenceInputs,
  referenceInputValues,
  onMainInputValueChange,
  onReferenceInputValueChange,
  initialPolicy = "bidirectional",
  onSyncPassMetrics,
}: UseSharedVariableSyncArgs): UseSharedVariableSyncResult {
  const [policy, setPolicy] = useState<SharedVariableSyncPolicy>(initialPolicy);
  const [conflictsByPathState, setConflictsByPathState] = useState<
    Record<string, SharedVariableConflict>
  >({});

  const sharedPairsByPath = useMemo(() => {
    const mainByPath = new Map<string, StandardRigInput>();
    mainInputsById.forEach((input) => {
      if (!input.path?.trim()) {
        return;
      }
      mainByPath.set(normalizeStandardRigInputPath(input.path), input);
    });

    const pairs = new Map<string, SharedVariableSyncPair>();
    referenceInputs.forEach((referenceInput) => {
      if (!referenceInput.path?.trim()) {
        return;
      }
      const path = normalizeStandardRigInputPath(referenceInput.path);
      const mainInput = mainByPath.get(path);
      if (!mainInput) {
        return;
      }
      pairs.set(path, {
        path,
        mainInput,
        referenceInput,
      });
    });
    return pairs;
  }, [mainInputsById, referenceInputs]);

  const links = useMemo(() => {
    const nextLinks: SharedVariableLink[] = [];
    sharedPairsByPath.forEach(({ path, mainInput, referenceInput }) => {
      const mainValue = safeValue(
        mainInputValues[mainInput.id],
        mainInput.defaultValue,
      );
      const referenceValue = safeValue(
        referenceInputValues[referenceInput.id],
        referenceInput.defaultValue,
      );
      const delta = referenceValue - mainValue;
      nextLinks.push({
        path,
        mainInputId: mainInput.id,
        referenceInputId: referenceInput.id,
        mainValue,
        referenceValue,
        delta,
        inSync: !isDifferent(mainValue, referenceValue),
      });
    });
    nextLinks.sort((a, b) => a.path.localeCompare(b.path));
    return nextLinks;
  }, [mainInputValues, referenceInputValues, sharedPairsByPath]);

  const linksByPath = useMemo(() => {
    return new Map(links.map((link) => [link.path, link]));
  }, [links]);

  const linksByMainInputId = useMemo(() => {
    return new Map(links.map((link) => [link.mainInputId, link]));
  }, [links]);

  const linksByReferenceInputId = useMemo(() => {
    return new Map(links.map((link) => [link.referenceInputId, link]));
  }, [links]);

  const outOfSyncCount = useMemo(() => {
    return links.reduce((count, link) => count + (link.inSync ? 0 : 1), 0);
  }, [links]);

  const suppressMainChangeRef = useRef(new Map<string, number>());
  const suppressReferenceChangeRef = useRef(new Map<string, number>());
  const previousMainByPathRef = useRef<Record<string, number>>({});
  const previousReferenceByPathRef = useRef<Record<string, number>>({});
  const lastWriteRef = useRef<
    Record<
      string,
      {
        source: SharedVariableSource;
        value: number;
        at: number;
      }
    >
  >({});

  const shouldSuppress = (
    suppressions: Map<string, number>,
    path: string,
    value: number,
  ): boolean => {
    const expectedValue = suppressions.get(path);
    if (expectedValue === undefined) {
      return false;
    }
    suppressions.delete(path);
    return !isDifferent(expectedValue, value);
  };

  const registerChange = useCallback(
    (source: SharedVariableSource, path: string, nextValue: number) => {
      const now = Date.now();
      const previous = lastWriteRef.current[path];
      if (
        previous &&
        previous.source !== source &&
        now - previous.at <= CONFLICT_WINDOW_MS &&
        isDifferent(previous.value, nextValue)
      ) {
        const pair = sharedPairsByPath.get(path);
        if (pair) {
          const conflict: SharedVariableConflict = {
            path,
            mainInputId: pair.mainInput.id,
            referenceInputId: pair.referenceInput.id,
            firstSource: previous.source,
            firstValue: previous.value,
            secondSource: source,
            secondValue: nextValue,
            detectedAt: now,
          };
          setConflictsByPathState((current) => ({
            ...current,
            [path]: conflict,
          }));
        }
      }
      lastWriteRef.current[path] = {
        source,
        value: nextValue,
        at: now,
      };
    },
    [sharedPairsByPath],
  );

  useEffect(() => {
    const activePaths = new Set(sharedPairsByPath.keys());
    setConflictsByPathState((current) => {
      const next: Record<string, SharedVariableConflict> = {};
      Object.entries(current).forEach(([path, conflict]) => {
        if (activePaths.has(path)) {
          next[path] = conflict;
        }
      });
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      if (
        currentKeys.length === nextKeys.length &&
        currentKeys.every((key) => current[key] === next[key])
      ) {
        return current;
      }
      return next;
    });
  }, [sharedPairsByPath]);

  useEffect(() => {
    const conflictPathsToClear: string[] = [];
    let pairEvaluations = 0;

    sharedPairsByPath.forEach(({ path, mainInput, referenceInput }) => {
      pairEvaluations += 1;
      const mainValue = safeValue(
        mainInputValues[mainInput.id],
        mainInput.defaultValue,
      );
      const referenceValue = safeValue(
        referenceInputValues[referenceInput.id],
        referenceInput.defaultValue,
      );
      if (!isDifferent(mainValue, referenceValue)) {
        conflictPathsToClear.push(path);
      }

      const previousMainValue = previousMainByPathRef.current[path];
      if (previousMainValue === undefined) {
        previousMainByPathRef.current[path] = mainValue;
      } else if (isDifferent(previousMainValue, mainValue)) {
        previousMainByPathRef.current[path] = mainValue;
        if (!shouldSuppress(suppressMainChangeRef.current, path, mainValue)) {
          registerChange("main", path, mainValue);
          if (
            shouldMirrorFromMain(policy) &&
            isDifferent(referenceValue, mainValue)
          ) {
            suppressReferenceChangeRef.current.set(path, mainValue);
            onReferenceInputValueChange(referenceInput.id, mainValue);
          }
        }
      }

      const previousReferenceValue = previousReferenceByPathRef.current[path];
      if (previousReferenceValue === undefined) {
        previousReferenceByPathRef.current[path] = referenceValue;
      } else if (isDifferent(previousReferenceValue, referenceValue)) {
        previousReferenceByPathRef.current[path] = referenceValue;
        if (
          !shouldSuppress(
            suppressReferenceChangeRef.current,
            path,
            referenceValue,
          )
        ) {
          registerChange("reference", path, referenceValue);
          if (
            shouldMirrorFromReference(policy) &&
            isDifferent(mainValue, referenceValue)
          ) {
            suppressMainChangeRef.current.set(path, referenceValue);
            onMainInputValueChange(mainInput.id, referenceValue);
          }
        }
      }
    });

    onSyncPassMetrics?.({
      pairCount: sharedPairsByPath.size,
      passCount: 1,
      pairEvaluations,
    });

    if (conflictPathsToClear.length === 0) {
      return;
    }
    setConflictsByPathState((current) => {
      let changed = false;
      const next = { ...current };
      conflictPathsToClear.forEach((path) => {
        if (!next[path]) {
          return;
        }
        delete next[path];
        changed = true;
      });
      return changed ? next : current;
    });
  }, [
    mainInputValues,
    onMainInputValueChange,
    onReferenceInputValueChange,
    onSyncPassMetrics,
    policy,
    referenceInputValues,
    registerChange,
    sharedPairsByPath,
  ]);

  const resolveConflict = useCallback(
    (
      path: string,
      winner: "main" | "reference",
    ): SharedVariableConflict | null => {
      const conflict = conflictsByPathState[path];
      if (!conflict) {
        return null;
      }
      const pair = sharedPairsByPath.get(path);
      if (!pair) {
        return null;
      }
      const winnerValue =
        winner === "main"
          ? safeValue(
              mainInputValues[pair.mainInput.id],
              pair.mainInput.defaultValue,
            )
          : safeValue(
              referenceInputValues[pair.referenceInput.id],
              pair.referenceInput.defaultValue,
            );

      if (winner === "main") {
        suppressReferenceChangeRef.current.set(path, winnerValue);
        onReferenceInputValueChange(pair.referenceInput.id, winnerValue);
      } else {
        suppressMainChangeRef.current.set(path, winnerValue);
        onMainInputValueChange(pair.mainInput.id, winnerValue);
      }
      lastWriteRef.current[path] = {
        source: winner,
        value: winnerValue,
        at: Date.now(),
      };
      setConflictsByPathState((current) => {
        const next = { ...current };
        delete next[path];
        return next;
      });
      return conflict;
    },
    [
      conflictsByPathState,
      mainInputValues,
      onMainInputValueChange,
      onReferenceInputValueChange,
      referenceInputValues,
      sharedPairsByPath,
    ],
  );

  const dismissConflict = useCallback((path: string) => {
    setConflictsByPathState((current) => {
      if (!current[path]) {
        return current;
      }
      const next = { ...current };
      delete next[path];
      return next;
    });
  }, []);

  const conflicts = useMemo(() => {
    return Object.values(conflictsByPathState).sort(
      (a, b) => b.detectedAt - a.detectedAt,
    );
  }, [conflictsByPathState]);

  const conflictsByPath = useMemo(() => {
    return new Map(
      Object.entries(conflictsByPathState).map(([path, conflict]) => [
        path,
        conflict,
      ]),
    );
  }, [conflictsByPathState]);

  return {
    policy,
    setPolicy,
    links,
    linksByPath,
    linksByMainInputId,
    linksByReferenceInputId,
    outOfSyncCount,
    conflicts,
    conflictsByPath,
    resolveConflict,
    dismissConflict,
  };
}
