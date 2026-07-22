import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BindingMap, InputBindingMap } from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import type { PoseRigConfigFile } from "../poseRig/types";
import type { AnimationClipIR } from "../types/animationClipIr";
import type { VizijPipelineMetadataV1 } from "../utils/graphImport";
import { stableStringify } from "../utils/hash";

interface AuthoredMotionGraphDirtyEntry {
  id: string;
  label: string;
  spec: { nodes: unknown[]; edges: unknown[] };
}

export interface GlbExportDirtySnapshotOptions {
  faceId: string | null;
  includeVizijBundle: boolean;
  includeImportedAnimations: boolean;
  animatables: Record<string, AnimatableValue>;
  animatableComponents: AnimatableComponent[];
  featureLabelOverrides: Record<string, string>;
  standardInputs: StandardRigInput[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  pipelineMetadataV1: VizijPipelineMetadataV1 | null;
  poseGraphSpec: GraphSpec | null;
  poseGraphFileName: string;
  poseConfigDraft: PoseRigConfigFile | null;
  poseIrDraft: unknown | null | undefined;
  blendMode: "average" | "additive";
  crossGroupBlendMode: "average" | "additive";
  authoredAnimationClips: AnimationClipIR[];
  authoredMotionGraphs: AuthoredMotionGraphDirtyEntry[];
}

export function buildGlbExportDirtySnapshot(
  options: GlbExportDirtySnapshotOptions,
): Record<string, unknown> {
  const baseSnapshot: Record<string, unknown> = {
    faceId: options.faceId?.trim() || null,
    animatables: options.animatables,
    animatableComponents: options.animatableComponents,
    featureLabelOverrides: options.featureLabelOverrides,
  };

  if (!options.includeVizijBundle) {
    return {
      ...baseSnapshot,
      includeVizijBundle: false,
    };
  }

  return {
    ...baseSnapshot,
    includeVizijBundle: true,
    includeImportedAnimations: options.includeImportedAnimations,
    standardInputs: options.standardInputs,
    bindings: options.bindings,
    inputBindings: options.inputBindings,
    pipelineMetadataV1: options.pipelineMetadataV1,
    poseRig: {
      poseGraphSpec: options.poseGraphSpec,
      poseGraphFileName: options.poseGraphFileName.trim() || null,
      poseConfigDraft: options.poseConfigDraft,
      poseIrDraft: options.poseIrDraft ?? null,
      blendMode: options.blendMode,
      crossGroupBlendMode: options.crossGroupBlendMode,
    },
    authoredAnimationClips: options.authoredAnimationClips,
    authoredMotionGraphs: options.authoredMotionGraphs,
  };
}

interface UseExportDirtyStateOptions {
  sessionKey: string | null;
  ready: boolean;
  snapshot: unknown;
}

export function useExportDirtyState({
  sessionKey,
  ready,
  snapshot,
}: UseExportDirtyStateOptions) {
  const normalizedSessionKey = sessionKey ?? "__no-export-session__";
  const currentSignature = useMemo(() => stableStringify(snapshot), [snapshot]);
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(
    null,
  );
  const initializedSessionKeyRef = useRef<string | null>(null);
  const previousSessionKeyRef = useRef(normalizedSessionKey);

  useEffect(() => {
    if (previousSessionKeyRef.current === normalizedSessionKey) {
      return;
    }
    previousSessionKeyRef.current = normalizedSessionKey;
    initializedSessionKeyRef.current = null;
    setLastSavedSignature(null);
  }, [normalizedSessionKey]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (initializedSessionKeyRef.current === normalizedSessionKey) {
      return;
    }
    initializedSessionKeyRef.current = normalizedSessionKey;
    setLastSavedSignature(currentSignature);
  }, [currentSignature, normalizedSessionKey, ready]);

  const markSaved = useCallback(() => {
    if (!ready) {
      return;
    }
    initializedSessionKeyRef.current = normalizedSessionKey;
    setLastSavedSignature(currentSignature);
  }, [currentSignature, normalizedSessionKey, ready]);

  const isDirty =
    ready &&
    lastSavedSignature !== null &&
    lastSavedSignature !== currentSignature;

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  return {
    isDirty,
    markSaved,
  } as const;
}
