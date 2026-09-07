import type { StandardRigInput } from "@vizij/utils";
import type { PoseDefinition } from "../../poseRig/types";
import type { ReferencePoseDefinition } from "../../referenceFace/types";
import type { InputCatalogRow } from "./inputCatalog";

// ----------------------------------------------------------------------------
// Tree node model shared by VariablesPanel (which builds the trees) and
// TreeRowWrapper (which renders them).
// ----------------------------------------------------------------------------

export type NodeType = "folder" | "pose" | "rig" | "input";
export type RigNodeSource =
  | "auto"
  | "preset"
  | "custom"
  | "reference"
  | "shared";
export type FaceOwnershipScope = "main" | "reference" | "shared" | "none";

export interface FaceOwnershipSummary {
  hasMain: boolean;
  hasReference: boolean;
}

export interface RigNodeData {
  input: StandardRigInput;
  source: RigNodeSource;
  disabled?: boolean;
  normalizedPath?: string;
  linkedMainInputId?: string | null;
  linkedReferenceInputId?: string | null;
}

export interface PoseGroupNodeData {
  kind: "pose-group";
  groupPath: string;
}

export interface PoseNodeData {
  source: "main" | "reference" | "shared";
  pose: PoseDefinition | ReferencePoseDefinition;
  linkedReferencePoseId?: string | null;
}

export type TreeNodeData =
  | PoseNodeData
  | RigNodeData
  | PoseGroupNodeData
  | InputCatalogRow;

export interface TreeNode {
  id: string;
  label: string;
  type: NodeType;
  children: Map<string, TreeNode>;
  showChildren: boolean; // Default expansion state
  data?: TreeNodeData;
}

export const MAIN_FACE_SCOPE_ICON_CLASS = "text-yellow-300";
export const REFERENCE_FACE_SCOPE_ICON_CLASS = "text-violet-300";
export const NO_FACE_SCOPE_ICON_CLASS = "text-text-muted";

export function createFaceOwnershipSummary(
  hasMain = false,
  hasReference = false,
): FaceOwnershipSummary {
  return { hasMain, hasReference };
}

export function mergeFaceOwnershipSummary(
  left: FaceOwnershipSummary,
  right: FaceOwnershipSummary,
): FaceOwnershipSummary {
  return {
    hasMain: left.hasMain || right.hasMain,
    hasReference: left.hasReference || right.hasReference,
  };
}

export function resolveFaceOwnershipScope(
  summary: FaceOwnershipSummary,
): FaceOwnershipScope {
  if (summary.hasMain && summary.hasReference) {
    return "shared";
  }
  if (summary.hasReference) {
    return "reference";
  }
  if (summary.hasMain) {
    return "main";
  }
  return "none";
}

export function resolveRigSourceOwnership(
  source: RigNodeSource,
): FaceOwnershipSummary {
  if (source === "reference") {
    return createFaceOwnershipSummary(false, true);
  }
  if (source === "shared") {
    return createFaceOwnershipSummary(true, true);
  }
  return createFaceOwnershipSummary(true, false);
}

export function resolvePoseSourceOwnership(
  source: PoseNodeData["source"],
): FaceOwnershipSummary {
  if (source === "reference") {
    return createFaceOwnershipSummary(false, true);
  }
  if (source === "shared") {
    return createFaceOwnershipSummary(true, true);
  }
  return createFaceOwnershipSummary(true, false);
}

export function collectFolderRigDeletionSummary(node: TreeNode): {
  totalRigCount: number;
  deletableRigInputIds: string[];
  undeletableRigCount: number;
} {
  const deletableRigInputIds = new Set<string>();
  let totalRigCount = 0;
  const visit = (candidate: TreeNode) => {
    if (candidate.type === "rig") {
      totalRigCount += 1;
      const rigData = candidate.data as RigNodeData | undefined;
      if (rigData?.source === "custom" && !rigData.disabled) {
        deletableRigInputIds.add(rigData.input.id);
      }
      return;
    }
    candidate.children.forEach((child) => visit(child));
  };
  visit(node);
  return {
    totalRigCount,
    deletableRigInputIds: Array.from(deletableRigInputIds),
    undeletableRigCount: totalRigCount - deletableRigInputIds.size,
  };
}

export function collectFolderReferenceRigSelectionIds(
  node: TreeNode,
): string[] {
  const ids = new Set<string>();
  const visit = (candidate: TreeNode) => {
    if (candidate.type === "rig") {
      const rigData = candidate.data as RigNodeData | undefined;
      if (!rigData) {
        return;
      }
      if (rigData.source === "reference") {
        ids.add(rigData.input.id);
        return;
      }
      const linkedReferenceInputId = rigData.linkedReferenceInputId?.trim();
      if (rigData.source === "shared" && linkedReferenceInputId) {
        ids.add(linkedReferenceInputId);
      }
      return;
    }
    candidate.children.forEach((child) => visit(child));
  };
  visit(node);
  return Array.from(ids);
}

export function collectFolderReferencePoseSelectionIds(
  node: TreeNode,
): string[] {
  const ids = new Set<string>();
  const visit = (candidate: TreeNode) => {
    if (candidate.type === "pose") {
      const poseData = candidate.data as PoseNodeData | undefined;
      if (poseData?.source === "reference" && poseData.pose.id) {
        ids.add(poseData.pose.id);
        return;
      }
      if (
        poseData?.source === "shared" &&
        poseData.linkedReferencePoseId?.trim()
      ) {
        ids.add(poseData.linkedReferencePoseId.trim());
      }
      return;
    }
    candidate.children.forEach((child) => visit(child));
  };
  visit(node);
  return Array.from(ids);
}

export function collectNodeFaceOwnership(node: TreeNode): FaceOwnershipSummary {
  if (node.type === "rig") {
    const rigData = node.data as RigNodeData | undefined;
    if (!rigData) {
      return createFaceOwnershipSummary();
    }
    return resolveRigSourceOwnership(rigData.source);
  }
  if (node.type === "pose") {
    const poseData = node.data as PoseNodeData | undefined;
    if (!poseData) {
      return createFaceOwnershipSummary();
    }
    return resolvePoseSourceOwnership(poseData.source);
  }
  let summary = createFaceOwnershipSummary();
  node.children.forEach((child) => {
    summary = mergeFaceOwnershipSummary(
      summary,
      collectNodeFaceOwnership(child),
    );
  });
  return summary;
}
