export type MainFaceLoadingStage =
  | "idle"
  | "asset-load"
  | "face-visible"
  | "controls-ready";

export interface MainFaceLoadingPolicy {
  stage: MainFaceLoadingStage;
  interactionEnabled: boolean;
  label: string;
  detail: string;
}

interface ResolveMainFaceLoadingPolicyOptions {
  rootId: string | null;
  isAssetLoading: boolean;
  hasRuntimeInputBridge: boolean;
}

export function resolveMainFaceLoadingPolicy({
  rootId,
  isAssetLoading,
  hasRuntimeInputBridge,
}: ResolveMainFaceLoadingPolicyOptions): MainFaceLoadingPolicy {
  if (isAssetLoading) {
    return {
      stage: "asset-load",
      interactionEnabled: false,
      label: "Loading face asset",
      detail: "Preparing world and graph payloads.",
    };
  }

  if (!rootId) {
    return {
      stage: "idle",
      interactionEnabled: false,
      label: "No face loaded",
      detail: "Import a face to begin authoring.",
    };
  }

  if (!hasRuntimeInputBridge) {
    return {
      stage: "face-visible",
      interactionEnabled: false,
      label: "Face visible, preparing controls",
      detail: "Graph registration and input bridge are still settling.",
    };
  }

  return {
    stage: "controls-ready",
    interactionEnabled: true,
    label: "Controls ready",
    detail: "Authoring panels are fully interactive.",
  };
}
