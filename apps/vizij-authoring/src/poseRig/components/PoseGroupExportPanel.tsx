import { useEffect, useMemo, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";
import { buildPoseGraphSpec } from "../graphBuilder";
import type { PoseDefinition, StandardInputId } from "../types";
import { buildPoseWeightPathMap, slugifyLabel } from "../utils";
import { alertDialog } from "../../utils/dialogs";
import { downloadBlob } from "../../utils/download";

interface PoseGroupExportPanelProps {
  poses: PoseDefinition[];
  faceId?: string | null;
  neutralInputs: Record<StandardInputId, number>;
  standardInputs: StandardRigInput[];
}

export function PoseGroupExportPanel({
  poses,
  faceId,
  neutralInputs,
  standardInputs,
}: PoseGroupExportPanelProps) {
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sortedPoses = useMemo(() => {
    return poses
      .slice()
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [poses]);

  const selectedPoses = useMemo(() => {
    if (selectedIds.size === 0) {
      return [];
    }
    return poses.filter((pose) => selectedIds.has(pose.id));
  }, [poses, selectedIds]);

  useEffect(() => {
    if (selectedIds.size === 0) {
      return;
    }
    const poseIdSet = new Set(poses.map((pose) => pose.id));
    let changed = false;
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (poseIdSet.has(id)) {
        next.add(id);
      } else {
        changed = true;
      }
    });
    if (changed) {
      setSelectedIds(next);
    }
  }, [poses, selectedIds]);

  const selectedCount = selectedIds.size;
  const poseCount = poses.length;
  const poseGroupSegment = useMemo(
    () => slugifyLabel(groupName, "pose_group"),
    [groupName],
  );
  const fileFaceSlug = useMemo(() => slugifyLabel(faceId, "face"), [faceId]);
  const faceSegmentLabel =
    faceId && faceId.trim().length > 0 ? faceId.trim() : "face";

  const previewPaths = useMemo(() => {
    if (!selectedPoses.length) {
      return [];
    }
    const pathMap = buildPoseWeightPathMap(selectedPoses, faceId ?? null, {
      baseSegment: poseGroupSegment,
    });
    return selectedPoses.slice(0, 3).map((pose) => ({
      id: pose.id,
      name: pose.name,
      path: pathMap.get(pose.id)?.absolutePath ?? "",
    }));
  }, [faceId, poseGroupSegment, selectedPoses]);

  const exportFileName = `${fileFaceSlug}-${poseGroupSegment}.pose.graph.json`;
  const canExport = selectedCount > 0 && groupName.trim().length > 0;

  const togglePoseSelection = (poseId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(poseId)) {
        next.delete(poseId);
      } else {
        next.add(poseId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!poseCount) {
      return;
    }
    setSelectedIds(new Set(poses.map((pose) => pose.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleExport = () => {
    if (!canExport) {
      alertDialog("Select at least one pose and enter a group name.");
      return;
    }
    if (!standardInputs.length) {
      alertDialog("Configure standard inputs before exporting a pose graph.");
      return;
    }
    const subset = poses.filter((pose) => selectedIds.has(pose.id));
    const { spec } = buildPoseGraphSpec({
      faceId: faceId ?? null,
      neutralInputs,
      poses: subset,
      standardInputs,
      poseGroupSegment,
    });
    const blob = new Blob([JSON.stringify(spec, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, exportFileName);
  };

  const disableControls = poseCount === 0;

  return (
    <section className="pose-rig-panel pose-group-export">
      <header className="pose-rig-panel__header">
        <div>
          <h3 className="pose-rig-panel__title">Pose Group Export</h3>
          <p className="pose-rig-panel__subtitle">
            Select any subset of poses, name the group, then export a graph with
            rig paths that include the group segment.
          </p>
        </div>
        <div className="pose-group-export__actions">
          <button
            type="button"
            className="button subtle"
            onClick={handleSelectAll}
            disabled={disableControls}
          >
            Select all
          </button>
          <button
            type="button"
            className="button subtle"
            onClick={handleClearSelection}
            disabled={disableControls || selectedCount === 0}
          >
            Clear
          </button>
        </div>
      </header>

      <label className="field-label" htmlFor="pose-group-name">
        Group name
      </label>
      <input
        id="pose-group-name"
        type="text"
        className="input"
        placeholder="e.g. emotions, vizemes"
        disabled={disableControls}
        value={groupName}
        onChange={(event) => setGroupName(event.target.value)}
      />
      <p className="pose-group-export__hint">
        Paths will follow{" "}
        <code>{`rig/${faceSegmentLabel}/${poseGroupSegment}/{pose}.weight`}</code>
      </p>

      <div className="pose-group-export__list">
        {sortedPoses.length === 0 ? (
          <p className="pose-group-export__empty">
            Capture or add a pose to enable group exports.
          </p>
        ) : (
          sortedPoses.map((pose) => {
            const checked = selectedIds.has(pose.id);
            return (
              <label key={pose.id} className="pose-group-export__item">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePoseSelection(pose.id)}
                />
                <span className="pose-group-export__item-name">
                  {pose.name}
                </span>
              </label>
            );
          })
        )}
      </div>

      <div className="pose-group-export__footer">
        <div className="pose-group-export__summary">
          <span>
            Selected {selectedCount} of {poseCount} poses
          </span>
          <span className="pose-group-export__filename">
            File: <code>{exportFileName}</code>
          </span>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={handleExport}
          disabled={!canExport}
        >
          Export Pose Graph
        </button>
      </div>

      {previewPaths.length > 0 ? (
        <div className="pose-group-export__preview">
          <span className="pose-group-export__preview-label">
            Sample paths ({previewPaths.length} of {selectedCount})
          </span>
          <ul>
            {previewPaths.map((preview) => (
              <li key={preview.id}>
                <strong>{preview.name}</strong> →{" "}
                <code>{preview.path || "rig/..."}</code>
              </li>
            ))}
            {selectedCount > previewPaths.length && (
              <li className="pose-group-export__preview-more">
                ...{selectedCount - previewPaths.length} additional poses
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
