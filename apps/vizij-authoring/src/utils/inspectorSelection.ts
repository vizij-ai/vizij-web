import type {
  BlendStageInspectorSelection,
  PoseGroupInspectorSelection,
} from "../types/poseGroupInspector";

export type ActiveInspectorTarget =
  | { kind: "scene"; id: string }
  | { kind: "rig"; id: string }
  | { kind: "pose"; id: string }
  | { kind: "material"; id: string }
  | { kind: "pose-group"; groupId: string | null; groupPath: string }
  | { kind: "blend-stage"; id: string }
  | { kind: "animation-target"; targetId: string }
  | { kind: "animation-track"; targetId: string; trackId: string }
  | { kind: "program-target"; targetId: string }
  | { kind: "motiongraph-node"; targetId: string; nodeId: string };

export interface ActiveInspectorSelectionState {
  selectedSceneId: string | null;
  selectedRigId: string | null;
  selectedPoseId: string | null;
  selectedMaterialId: string | null;
  selectedPoseGroup: PoseGroupInspectorSelection | null;
  selectedBlendStage: BlendStageInspectorSelection | null;
  selectedAnimationTargetId: string | null;
  selectedAnimationTrackId: string | null;
  selectedProgramTargetId: string | null;
  selectedMotionGraphNodeId: string | null;
}

export function areActiveInspectorTargetsEqual(
  left: ActiveInspectorTarget | null,
  right: ActiveInspectorTarget | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  switch (left.kind) {
    case "scene":
      return right.kind === "scene" && left.id === right.id;
    case "rig":
      return right.kind === "rig" && left.id === right.id;
    case "pose":
      return right.kind === "pose" && left.id === right.id;
    case "material":
      return right.kind === "material" && left.id === right.id;
    case "pose-group":
      return (
        right.kind === "pose-group" &&
        left.groupId === right.groupId &&
        left.groupPath === right.groupPath
      );
    case "blend-stage":
      return right.kind === "blend-stage" && left.id === right.id;
    case "animation-target":
      return (
        right.kind === "animation-target" && left.targetId === right.targetId
      );
    case "animation-track":
      return (
        right.kind === "animation-track" &&
        left.targetId === right.targetId &&
        left.trackId === right.trackId
      );
    case "program-target":
      return (
        right.kind === "program-target" && left.targetId === right.targetId
      );
    case "motiongraph-node":
      return (
        right.kind === "motiongraph-node" &&
        left.targetId === right.targetId &&
        left.nodeId === right.nodeId
      );
  }
}

export function synchronizeActiveInspectorTarget(
  target: ActiveInspectorTarget | null,
  state: ActiveInspectorSelectionState,
): ActiveInspectorTarget | null {
  if (!target) {
    return null;
  }
  switch (target.kind) {
    case "scene":
      return state.selectedSceneId
        ? { kind: "scene", id: state.selectedSceneId }
        : null;
    case "rig":
      return state.selectedRigId
        ? { kind: "rig", id: state.selectedRigId }
        : null;
    case "pose":
      return state.selectedPoseId
        ? { kind: "pose", id: state.selectedPoseId }
        : null;
    case "material":
      return state.selectedMaterialId
        ? { kind: "material", id: state.selectedMaterialId }
        : null;
    case "pose-group":
      return state.selectedPoseGroup
        ? {
            kind: "pose-group",
            groupId: state.selectedPoseGroup.groupId,
            groupPath: state.selectedPoseGroup.groupPath,
          }
        : null;
    case "blend-stage":
      return state.selectedBlendStage
        ? { kind: "blend-stage", id: state.selectedBlendStage.id }
        : null;
    case "animation-target":
      return state.selectedAnimationTargetId
        ? {
            kind: "animation-target",
            targetId: state.selectedAnimationTargetId,
          }
        : null;
    case "animation-track":
      if (state.selectedAnimationTrackId) {
        return {
          kind: "animation-track",
          targetId: state.selectedAnimationTargetId ?? target.targetId,
          trackId: state.selectedAnimationTrackId,
        };
      }
      return state.selectedAnimationTargetId
        ? {
            kind: "animation-target",
            targetId: state.selectedAnimationTargetId,
          }
        : null;
    case "program-target":
      return state.selectedProgramTargetId
        ? { kind: "program-target", targetId: state.selectedProgramTargetId }
        : null;
    case "motiongraph-node":
      if (state.selectedMotionGraphNodeId) {
        return {
          kind: "motiongraph-node",
          targetId: state.selectedProgramTargetId ?? target.targetId,
          nodeId: state.selectedMotionGraphNodeId,
        };
      }
      return state.selectedProgramTargetId
        ? { kind: "program-target", targetId: state.selectedProgramTargetId }
        : null;
  }
}
