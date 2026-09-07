import { useMemo, type ReactNode } from "react";
import {
  Activity,
  Copy,
  Folder,
  Play,
  Plus,
  RotateCcw,
  Sliders,
  Trash2,
  Zap,
} from "lucide-react";
import { TreeRow } from "../ui";
import { Button } from "../ui/Button";
import { ControlRow } from "../editor/molecules/ControlRow";
import { RowCheckbox } from "../editor/atoms/RowCheckbox";
import { buildRigInputPath } from "../../poseRig/utils";
import { cn } from "../../utils/cn";
import type { InputCatalogRow } from "./inputCatalog";
import {
  collectFolderReferencePoseSelectionIds,
  collectFolderReferenceRigSelectionIds,
  collectFolderRigDeletionSummary,
  collectNodeFaceOwnership,
  resolveFaceOwnershipScope,
  MAIN_FACE_SCOPE_ICON_CLASS,
  NO_FACE_SCOPE_ICON_CLASS,
  REFERENCE_FACE_SCOPE_ICON_CLASS,
  type FaceOwnershipScope,
  type PoseGroupNodeData,
  type PoseNodeData,
  type RigNodeData,
  type TreeNode,
} from "./variablesTreeModel";

function OwnershipScopeIcon({
  Icon,
  scope,
  size = 12,
  strokeWidth = 2,
  className,
}: {
  Icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  scope: FaceOwnershipScope;
  size?: number;
  strokeWidth?: number;
  className?: string;
}): ReactNode {
  if (scope === "shared") {
    return (
      <span className={cn("inline-flex items-center gap-0.5", className)}>
        <Icon
          size={size}
          strokeWidth={strokeWidth}
          className={MAIN_FACE_SCOPE_ICON_CLASS}
        />
        <Icon
          size={size}
          strokeWidth={strokeWidth}
          className={REFERENCE_FACE_SCOPE_ICON_CLASS}
        />
      </span>
    );
  }
  const iconClass =
    scope === "main"
      ? MAIN_FACE_SCOPE_ICON_CLASS
      : scope === "reference"
        ? REFERENCE_FACE_SCOPE_ICON_CLASS
        : NO_FACE_SCOPE_ICON_CLASS;
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={cn(iconClass, className)}
    />
  );
}

export interface TreeRowWrapperProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onAction?: (node: TreeNode, action: string) => void;
  onSelect?: (node: TreeNode) => void;
  onInputValueChange?: (inputId: string, value: number) => void;
  selection?: {
    type: "pose" | "rig" | "pose-group" | "input";
    id: string;
  } | null;
  selectedReferenceRigIds?: ReadonlySet<string>;
  selectedReferencePoseIds?: ReadonlySet<string>;
  onToggleReferenceRigSelection?: (inputId: string) => void;
  onToggleReferencePoseSelection?: (poseId: string) => void;
  onSetReferenceRigSelection?: (
    inputIds: readonly string[],
    selected: boolean,
  ) => void;
  onSetReferencePoseSelection?: (
    poseIds: readonly string[],
    selected: boolean,
  ) => void;
  timelineInputLockActive?: boolean;
  timelineLockedInputIds?: ReadonlySet<string>;
  motionGraphContext?: {
    active: boolean;
    runtimeFaceSegment: string;
    eligibleInputPaths: ReadonlySet<string>;
    eligibleOutputPaths: ReadonlySet<string>;
    enabledInputPaths: ReadonlySet<string>;
    enabledOutputPaths: ReadonlySet<string>;
    onToggleInputPath: (path: string) => void;
    onToggleOutputPath: (path: string) => void;
  };
  animationTrackContext?: {
    active: boolean;
    trackedInputIds: ReadonlySet<string>;
    onAddTrack: (row: InputCatalogRow) => void;
    onRemoveTrack: (inputId: string) => void;
  };
  poseTargetContext?: {
    active: boolean;
    selectedPoseId: string | null;
    targetedInputIds: ReadonlySet<string>;
    onSetTarget: (row: InputCatalogRow) => void;
  };
  searchQuery: string;
}

export function TreeRowWrapper({
  node,
  depth,
  expanded,
  onToggle,
  onAction,
  onSelect,
  onInputValueChange,
  selection,
  selectedReferenceRigIds,
  selectedReferencePoseIds,
  onToggleReferenceRigSelection,
  onToggleReferencePoseSelection,
  onSetReferenceRigSelection,
  onSetReferencePoseSelection,
  timelineInputLockActive,
  timelineLockedInputIds,
  motionGraphContext,
  animationTrackContext,
  poseTargetContext,
  searchQuery,
}: TreeRowWrapperProps) {
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.size > 0;
  const isPoseGroupFolder =
    node.type === "folder" &&
    (node.data as PoseGroupNodeData | undefined)?.kind === "pose-group";
  const poseNodeData =
    node.type === "pose" ? (node.data as PoseNodeData | undefined) : undefined;
  const rigNodeData =
    node.type === "rig" ? (node.data as RigNodeData | undefined) : undefined;
  const isReferencePoseNode = poseNodeData?.source === "reference";
  const isSharedPoseNode = poseNodeData?.source === "shared";
  const isReferenceRigNode = rigNodeData?.source === "reference";
  const isSharedRigNode = rigNodeData?.source === "shared";
  const referencePoseId = isReferencePoseNode
    ? (poseNodeData?.pose.id ?? null)
    : isSharedPoseNode
      ? (poseNodeData?.linkedReferencePoseId ?? null)
      : null;
  const referenceRigInputId = isReferenceRigNode ? rigNodeData?.input.id : null;
  const sharedRigReferenceInputId = isSharedRigNode
    ? (rigNodeData?.linkedReferenceInputId ?? null)
    : null;
  const bulkReferenceRigSelectionId =
    referenceRigInputId ?? sharedRigReferenceInputId;
  // `Boolean(...)` because both `has` calls are optional-chained and yield
  // `undefined` when the selection set is absent. That used to reach a native
  // `<input checked>`, where `undefined` silently makes the input UNCONTROLLED —
  // so it would toggle itself on click regardless of state. `RowCheckbox` takes a
  // definite boolean, which forced the latent case into the open.
  const isBulkSelected = Boolean(
    (referencePoseId
      ? selectedReferencePoseIds?.has(referencePoseId)
      : false) ||
      (bulkReferenceRigSelectionId
        ? selectedReferenceRigIds?.has(bulkReferenceRigSelectionId)
        : false),
  );

  // Check selection
  const isSelected =
    selection &&
    ((node.type === "pose" &&
      selection.type === "pose" &&
      poseNodeData?.pose.id === selection.id) ||
      (node.type === "rig" &&
        selection.type === "rig" &&
        (node.data as RigNodeData)?.input?.id === selection.id) ||
      (node.type === "input" &&
        selection.type === "input" &&
        (node.data as InputCatalogRow)?.inputId === selection.id) ||
      (isPoseGroupFolder &&
        selection.type === "pose-group" &&
        node.id === selection.id));
  const rowIsSelected = Boolean(isSelected || isBulkSelected);
  const nodeOwnershipScope = useMemo(
    () => resolveFaceOwnershipScope(collectNodeFaceOwnership(node)),
    [node],
  );
  const folderReferenceRigSelectionIds = useMemo(
    () =>
      node.type === "folder" ? collectFolderReferenceRigSelectionIds(node) : [],
    [node],
  );
  const folderReferencePoseSelectionIds = useMemo(
    () =>
      node.type === "folder"
        ? collectFolderReferencePoseSelectionIds(node)
        : [],
    [node],
  );
  const folderAllReferenceRigSelected =
    folderReferenceRigSelectionIds.length > 0 &&
    folderReferenceRigSelectionIds.every((id) =>
      selectedReferenceRigIds?.has(id),
    );
  const folderAllReferencePoseSelected =
    folderReferencePoseSelectionIds.length > 0 &&
    folderReferencePoseSelectionIds.every((id) =>
      selectedReferencePoseIds?.has(id),
    );
  const folderDeletionSummary =
    node.type === "folder" && !isPoseGroupFolder
      ? collectFolderRigDeletionSummary(node)
      : null;
  const folderDeleteCount = folderDeletionSummary?.deletableRigInputIds.length;
  const canDeleteFolderDrivers =
    node.type === "folder" &&
    node.id !== "root" &&
    Boolean(folderDeletionSummary) &&
    (folderDeleteCount ?? 0) > 0 &&
    (folderDeletionSummary?.undeletableRigCount ?? 0) === 0;

  // Determine Icon
  let Icon = Folder;
  if (node.type === "pose") Icon = Activity;
  else if (node.type === "rig") Icon = Zap;
  else if (node.type === "input") Icon = Sliders;

  if (node.type === "input") {
    const inputData = node.data as InputCatalogRow;
    const inputLocked =
      Boolean(timelineInputLockActive) &&
      Boolean(
        timelineLockedInputIds?.has(inputData.inputId) ||
          timelineLockedInputIds?.has(inputData.path),
      );
    const motionGraphPath = motionGraphContext
      ? buildRigInputPath(motionGraphContext.runtimeFaceSegment, inputData.path)
      : null;
    const canToggleMotionGraphInput =
      motionGraphContext && motionGraphContext.active && motionGraphPath
        ? motionGraphContext.eligibleInputPaths.has(motionGraphPath)
        : false;
    const canToggleMotionGraphOutput =
      motionGraphContext && motionGraphContext.active && motionGraphPath
        ? motionGraphContext.eligibleOutputPaths.has(motionGraphPath)
        : false;
    const motionGraphInputEnabled =
      motionGraphContext && motionGraphPath
        ? motionGraphContext.enabledInputPaths.has(motionGraphPath)
        : false;
    const motionGraphOutputEnabled =
      motionGraphContext && motionGraphPath
        ? motionGraphContext.enabledOutputPaths.has(motionGraphPath)
        : false;
    const canToggleAnimationTrack = inputData.editable && inputData.selectable;
    const animationTrackEnabled =
      canToggleAnimationTrack && animationTrackContext
        ? animationTrackContext.trackedInputIds.has(inputData.inputId)
        : false;
    const canSetPoseTarget =
      Boolean(poseTargetContext?.active) &&
      inputData.editable &&
      inputData.controlKind === "rig-input";
    const poseTargetEnabled =
      canSetPoseTarget && Boolean(poseTargetContext?.selectedPoseId);
    const poseTargetSaved =
      canSetPoseTarget &&
      Boolean(poseTargetContext?.targetedInputIds.has(inputData.inputId));
    return (
      <ControlRow
        row={inputData}
        depth={depth}
        selected={rowIsSelected}
        locked={inputLocked}
        selectable={inputData.selectable}
        onSelect={() => onSelect?.(node)}
        onValueChange={(inputId, value) => onInputValueChange?.(inputId, value)}
        lockedMessage="Animation playback is currently driving this input."
        actions={
          <div className="flex items-center gap-1">
            {motionGraphContext?.active && canToggleMotionGraphInput ? (
              <Button
                variant={motionGraphInputEnabled ? "ghost" : "secondary"}
                size="sm"
                className={cn(
                  "h-6 px-2 text-[10px] gap-1",
                  motionGraphInputEnabled
                    ? "text-cyan-200 hover:text-cyan-100"
                    : undefined,
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!motionGraphPath) {
                    return;
                  }
                  motionGraphContext.onToggleInputPath(motionGraphPath);
                }}
                title={
                  motionGraphInputEnabled
                    ? "Remove from procedural animation programming inputs"
                    : "Add as procedural animation programming input"
                }
                aria-label={
                  motionGraphInputEnabled ? "Remove PAP Input" : "Add PAP Input"
                }
              >
                {motionGraphInputEnabled ? "PAP In -" : "PAP In +"}
              </Button>
            ) : null}
            {motionGraphContext?.active && canToggleMotionGraphOutput ? (
              <Button
                variant={motionGraphOutputEnabled ? "ghost" : "secondary"}
                size="sm"
                className={cn(
                  "h-6 px-2 text-[10px] gap-1",
                  motionGraphOutputEnabled
                    ? "text-cyan-200 hover:text-cyan-100"
                    : undefined,
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!motionGraphPath) {
                    return;
                  }
                  motionGraphContext.onToggleOutputPath(motionGraphPath);
                }}
                title={
                  motionGraphOutputEnabled
                    ? "Remove from procedural animation programming outputs"
                    : "Add as procedural animation programming output"
                }
                aria-label={
                  motionGraphOutputEnabled
                    ? "Remove PAP Output"
                    : "Add PAP Output"
                }
              >
                {motionGraphOutputEnabled ? "PAP Out -" : "PAP Out +"}
              </Button>
            ) : null}
            {animationTrackContext?.active && canToggleAnimationTrack ? (
              <Button
                variant={animationTrackEnabled ? "ghost" : "secondary"}
                size="sm"
                className={cn(
                  "h-6 px-2 text-[10px] gap-1",
                  animationTrackEnabled
                    ? "text-emerald-200 hover:text-emerald-100"
                    : undefined,
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  if (animationTrackEnabled) {
                    animationTrackContext.onRemoveTrack(inputData.inputId);
                    return;
                  }
                  animationTrackContext.onAddTrack(inputData);
                }}
                title={
                  animationTrackEnabled
                    ? "Remove from animation tracks"
                    : "Add as animation track"
                }
                aria-label={
                  animationTrackEnabled
                    ? "Remove Animation Track"
                    : "Add Animation Track"
                }
              >
                {animationTrackEnabled ? "Track -" : "Track +"}
              </Button>
            ) : null}
            {canSetPoseTarget ? (
              <Button
                variant={poseTargetSaved ? "ghost" : "secondary"}
                size="sm"
                className={cn(
                  "h-6 px-2 text-[10px] gap-1",
                  poseTargetSaved
                    ? "text-amber-200 hover:text-amber-100"
                    : undefined,
                )}
                disabled={!poseTargetEnabled}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!poseTargetEnabled) {
                    return;
                  }
                  poseTargetContext?.onSetTarget(inputData);
                }}
                title={
                  poseTargetEnabled
                    ? poseTargetSaved
                      ? "Update the selected pose target from this current input value"
                      : "Save this current input value as a target on the selected pose"
                    : "Select a pose before saving input targets"
                }
                aria-label={
                  poseTargetSaved ? "Update Pose Target" : "Save Pose Target"
                }
              >
                {poseTargetSaved ? "Update Target" : "Save Target"}
              </Button>
            ) : null}
          </div>
        }
      />
    );
  }

  return (
    <TreeRow
      depth={depth}
      label={node.label}
      hasChildren={hasChildren}
      isExpanded={isExpanded}
      isSelected={rowIsSelected}
      onToggle={() => onToggle(node.id)}
      onSelect={!hasChildren ? () => onSelect?.(node) : undefined}
      highlightQuery={searchQuery}
      icon={<OwnershipScopeIcon Icon={Icon} scope={nodeOwnershipScope} />}
      actions={
        <>
          {node.type === "pose" && !isReferencePoseNode && (
            <>
              {referencePoseId ? (
                <RowCheckbox
                  checked={isBulkSelected}
                  onChange={() => {
                    if (!referencePoseId) {
                      return;
                    }
                    onToggleReferencePoseSelection?.(referencePoseId);
                  }}
                  title="Select pose for bulk copy"
                  className="text-cyan-200"
                >
                  Bulk
                </RowCheckbox>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "play");
                }}
                title="Apply Pose"
              >
                <Play size={10} fill="currentColor" />
              </Button>
              {animationTrackContext?.active ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 hover:text-accent text-emerald-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.(node, "key-pose");
                  }}
                  title="Add pose channels as animation tracks at current time"
                >
                  <Plus size={10} />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-sky-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "reset-pose");
                }}
                title="Reset this pose weight"
              >
                <RotateCcw size={10} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-purple-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "duplicate-pose");
                }}
                title="Duplicate this pose"
              >
                <Copy size={10} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-amber-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "delete-pose");
                }}
                title="Delete Pose"
              >
                <Trash2 size={10} />
              </Button>
            </>
          )}
          {node.type === "pose" && isReferencePoseNode && (
            <>
              <RowCheckbox
                checked={referencePoseId ? isBulkSelected : false}
                onChange={() => {
                  if (!referencePoseId) {
                    return;
                  }
                  onToggleReferencePoseSelection?.(referencePoseId);
                }}
                title="Select pose for bulk copy"
                className="text-cyan-200"
              >
                Bulk
              </RowCheckbox>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "play");
                }}
                title="Apply Pose"
              >
                <Play size={10} fill="currentColor" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-sky-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "reset-pose");
                }}
                title="Reset pose targets to defaults"
              >
                <RotateCcw size={10} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-cyan-300"
                data-testid="pose-copy-to-main"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "copy-pose-to-main");
                }}
                title="Copy pose to main face"
              >
                <Copy size={10} />
              </Button>
            </>
          )}

          {node.type === "rig" &&
            !(node.data as RigNodeData | undefined)?.disabled && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[9px] uppercase text-text-secondary hover:text-text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.(node, "set-min");
                  }}
                  title="Set current value to min"
                >
                  Min
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[9px] uppercase text-text-secondary hover:text-text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.(node, "set-default");
                  }}
                  title="Set current value to default"
                >
                  Def
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[9px] uppercase text-text-secondary hover:text-text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.(node, "set-max");
                  }}
                  title="Set current value to max"
                >
                  Max
                </Button>
              </>
            )}
          {node.type === "rig" &&
            ((node.data as RigNodeData | undefined)?.source === "reference" ||
              (node.data as RigNodeData | undefined)?.source === "shared") && (
              <>
                {(node.data as RigNodeData | undefined)?.source !==
                  undefined && (
                  <RowCheckbox
                    checked={
                      bulkReferenceRigSelectionId ? isBulkSelected : false
                    }
                    onChange={() => {
                      if (!bulkReferenceRigSelectionId) {
                        return;
                      }
                      onToggleReferenceRigSelection?.(
                        bulkReferenceRigSelectionId,
                      );
                    }}
                    title="Select driver for bulk copy"
                    className="text-cyan-200"
                  >
                    Bulk
                  </RowCheckbox>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 hover:text-accent"
                  data-testid="variable-copy-to-main"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.(node, "copy-to-main");
                  }}
                  title="Copy driver to main face"
                >
                  <Copy size={10} />
                </Button>
              </>
            )}
          {node.type === "rig" &&
            (node.data as RigNodeData | undefined)?.source !== "reference" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-purple-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "duplicate-variable");
                }}
                title="Duplicate driver"
              >
                <Copy size={10} />
              </Button>
            )}
          {node.type === "rig" &&
            (node.data as RigNodeData | undefined)?.source === "custom" &&
            !(node.data as RigNodeData | undefined)?.disabled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-amber-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "delete-variable");
                }}
                title="Delete driver"
              >
                <Trash2 size={10} />
              </Button>
            )}
          {node.type === "folder" &&
            folderReferenceRigSelectionIds.length > 0 && (
              <RowCheckbox
                checked={folderAllReferenceRigSelected}
                onChange={() => {
                  onSetReferenceRigSelection?.(
                    folderReferenceRigSelectionIds,
                    !folderAllReferenceRigSelected,
                  );
                }}
                title="Select all reference/shared drivers in this folder for bulk copy"
                className="text-cyan-200"
              >
                Bulk Drv
              </RowCheckbox>
            )}
          {node.type === "folder" &&
            folderReferencePoseSelectionIds.length > 0 && (
              <RowCheckbox
                checked={folderAllReferencePoseSelected}
                onChange={() => {
                  onSetReferencePoseSelection?.(
                    folderReferencePoseSelectionIds,
                    !folderAllReferencePoseSelected,
                  );
                }}
                title="Select all reference poses in this folder for bulk copy"
                className="text-cyan-200"
              >
                Bulk Pose
              </RowCheckbox>
            )}

          {canDeleteFolderDrivers ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 hover:text-accent text-amber-300"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(node, "delete-folder-drivers");
              }}
              title={`Delete folder drivers (${folderDeleteCount ?? 0})`}
            >
              <Trash2 size={10} />
            </Button>
          ) : null}
        </>
      }
    >
      {hasChildren && isExpanded && (
        <div className="flex flex-col">
          {Array.from(node.children.values())
            .sort((a, b) => {
              // Folders first
              if (a.type === "folder" && b.type !== "folder") return -1;
              if (a.type !== "folder" && b.type === "folder") return 1;
              return a.label.localeCompare(b.label);
            })
            .map((child) => (
              <TreeRowWrapper
                key={child.id}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onAction={onAction}
                onSelect={onSelect}
                onInputValueChange={onInputValueChange}
                selection={selection}
                selectedReferenceRigIds={selectedReferenceRigIds}
                selectedReferencePoseIds={selectedReferencePoseIds}
                onToggleReferenceRigSelection={onToggleReferenceRigSelection}
                onToggleReferencePoseSelection={onToggleReferencePoseSelection}
                onSetReferenceRigSelection={onSetReferenceRigSelection}
                onSetReferencePoseSelection={onSetReferencePoseSelection}
                timelineInputLockActive={timelineInputLockActive}
                timelineLockedInputIds={timelineLockedInputIds}
                motionGraphContext={motionGraphContext}
                animationTrackContext={animationTrackContext}
                poseTargetContext={poseTargetContext}
                searchQuery={searchQuery}
              />
            ))}
        </div>
      )}
    </TreeRow>
  );
}
