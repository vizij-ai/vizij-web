import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useBindingAuthoring, useGraphRuntime } from "./RigControllerProvider";
import {
  createPoseRigStore,
  PoseRigStoreProvider,
  type PoseRigStore,
} from "../poseRig/store";
import {
  usePoseRigAuthoring,
  type UsePoseRigAuthoringResult,
} from "../poseRig/usePoseRigAuthoring";

function filterRecordByIds<T extends Record<string, number>>(
  record: T,
  allowed: Set<string>,
): T {
  const next: Record<string, number> = {};
  Object.entries(record).forEach(([key, value]) => {
    if (allowed.has(key)) {
      next[key] = value;
    }
  });
  return next as T;
}

interface PoseRigProviderProps {
  rootId: string | null;
  children: ReactNode;
}

const PoseRigContext = createContext<UsePoseRigAuthoringResult | null>(null);

export function usePoseRig() {
  const ctx = useContext(PoseRigContext);
  if (!ctx) {
    throw new Error("usePoseRig must be used within PoseRigProvider");
  }
  return ctx;
}

function PoseRigController({
  rootId,
  children,
}: {
  rootId: string | null;
  children: ReactNode;
}) {
  const faceId = useGraphRuntime((state) => state.faceId);
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const hiddenInputIds = useBindingAuthoring((state) => state.hiddenDriverIds);
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const applyStandardInputBatch = useBindingAuthoring(
    (state) => state.applyStandardInputBatch,
  );

  const poseRig = usePoseRigAuthoring({
    faceId,
    rootId,
    standardInputs,
    inputValues,
    hiddenInputIds,
    onInputValueChange: handleInputValueChange,
    applyInputBatch: applyStandardInputBatch,
  });

  return (
    <PoseRigContext.Provider value={poseRig}>
      {children}
    </PoseRigContext.Provider>
  );
}

export function PoseRigProvider({ rootId, children }: PoseRigProviderProps) {
  const storeRef = useRef<PoseRigStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createPoseRigStore();
  }
  const poseRigStore = storeRef.current;

  // Sync effects to keep store up to date with binding store
  const faceId = useGraphRuntime((state) => state.faceId);
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const hiddenInputIds = useBindingAuthoring((state) => state.hiddenDriverIds);
  const standardInputSchema = useBindingAuthoring(
    (state) => state.standardInputSchema,
  );

  useEffect(() => {
    poseRigStore.setState({ faceId });
  }, [poseRigStore, faceId]);

  useEffect(() => {
    const hiddenSet = new Set(hiddenInputIds);
    const visibleInputs = standardInputs.filter(
      (input) => !hiddenSet.has(input.id),
    );
    const filteredCurrent = filterRecordByIds(
      inputValues,
      new Set(visibleInputs.map((input) => input.id)),
    );
    poseRigStore.setState((_state) => {
      const isReady = Boolean(rootId && visibleInputs.length > 0);
      return {
        currentValues: filteredCurrent,
        standardInputs: visibleInputs,
        hiddenInputIds: Array.from(hiddenSet),
        standardInputSchema,
        isReady,
      };
    });
  }, [
    hiddenInputIds,
    inputValues,
    poseRigStore,
    rootId,
    standardInputSchema,
    standardInputs,
  ]);

  useEffect(() => {
    if (standardInputs.length > 0) {
      const allowed = new Set(standardInputs.map((input) => input.id));
      poseRigStore.setState((state) => {
        const nextNeutral = Object.keys(state.neutralInputs).length
          ? filterRecordByIds(state.neutralInputs, allowed)
          : (() => {
              const neutral: Record<string, number> = {};
              standardInputs.forEach((input) => {
                neutral[input.id] = input.defaultValue ?? 0;
              });
              return neutral;
            })();
        const nextCurrent = filterRecordByIds(state.currentValues, allowed);
        return {
          neutralInputs: nextNeutral,
          currentValues: nextCurrent,
        };
      });
    }
  }, [poseRigStore, standardInputs]);

  return (
    <PoseRigStoreProvider store={poseRigStore}>
      <PoseRigController rootId={rootId}>{children}</PoseRigController>
    </PoseRigStoreProvider>
  );
}
