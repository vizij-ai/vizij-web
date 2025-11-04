import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";
import type { PoseDefinition } from "../types";

interface PoseListProps {
  poses: PoseDefinition[];
  selectedPoseId: string | null;
  isNeutralSelected: boolean;
  disabled?: boolean;
  onSelectNeutral: () => void;
  onApplyPose: (poseId: string) => void;
  onCreatePose: (name?: string) => void;
  onPoseNameChange: (poseId: string, name: string) => void;
  onDuplicatePose: (poseId: string) => void;
  onDeletePose: (poseId: string) => void;
}

export function PoseList({
  poses,
  selectedPoseId,
  isNeutralSelected,
  disabled,
  onSelectNeutral,
  onApplyPose,
  onCreatePose,
  onPoseNameChange,
  onDuplicatePose,
  onDeletePose,
}: PoseListProps) {
  const [newPoseName, setNewPoseName] = useState("");

  const sorted = poses.slice().sort((a, b) => {
    const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? "");
    const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? "");
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return a.name.localeCompare(b.name);
    }
    return bTime - aTime;
  });

  const handleCreatePose = useCallback(() => {
    if (disabled) {
      return;
    }
    onCreatePose(newPoseName);
    setNewPoseName("");
  }, [disabled, newPoseName, onCreatePose]);

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, poseId: string | null) => {
      if (disabled || !poseId) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onApplyPose(poseId);
      }
    },
    [disabled, onApplyPose],
  );

  const listHint =
    sorted.length === 0
      ? "Capture or add a pose to begin building the library."
      : null;

  return (
    <section className="pose-rig-panel pose-rig-panel--list">
      <header className="pose-rig-panel__header">
        <div>
          <h3 className="pose-rig-panel__title">Pose Library</h3>
          <p className="pose-rig-panel__subtitle">
            Capture, duplicate, and curate saved poses.
          </p>
        </div>
        <div className="pose-rig-panel__actions pose-rig-panel__actions--new-pose">
          <input
            type="text"
            className="input pose-rig-list__new-name"
            placeholder="New pose name"
            value={newPoseName}
            disabled={disabled}
            onChange={(event) => setNewPoseName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleCreatePose();
              }
            }}
          />
          <button
            type="button"
            className="button primary"
            onClick={handleCreatePose}
            disabled={disabled}
          >
            Add Pose
          </button>
        </div>
      </header>
      <div className="pose-rig-list">
        <button
          type="button"
          className={
            isNeutralSelected
              ? "pose-rig-list__item pose-rig-list__item--active"
              : "pose-rig-list__item"
          }
          onClick={onSelectNeutral}
          disabled={disabled}
        >
          <div className="pose-rig-list__label">
            <span className="pose-rig-list__name">Neutral Pose</span>
            <span className="pose-rig-list__meta">Baseline rig</span>
          </div>
        </button>
        {sorted.map((pose) => {
          const isSelected = selectedPoseId === pose.id;
          const updatedLabel = new Date(pose.updatedAt).toLocaleString();
          return (
            <div
              key={pose.id}
              className={
                isSelected
                  ? "pose-rig-list__row pose-rig-list__row--active"
                  : "pose-rig-list__row"
              }
            >
              <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                className={
                  isSelected
                    ? "pose-rig-list__item pose-rig-list__item--active"
                    : "pose-rig-list__item"
                }
                onClick={() => {
                  if (disabled) {
                    return;
                  }
                  onApplyPose(pose.id);
                }}
                onKeyDown={(event) => handleRowKeyDown(event, pose.id)}
              >
                <div className="pose-rig-list__label">
                  {isSelected ? (
                    <input
                      type="text"
                      className="input pose-rig-list__name-input"
                      value={pose.name}
                      disabled={disabled}
                      onChange={(event) =>
                        onPoseNameChange(pose.id, event.target.value)
                      }
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    />
                  ) : (
                    <span className="pose-rig-list__name">{pose.name}</span>
                  )}
                  <span className="pose-rig-list__meta">{updatedLabel}</span>
                </div>
              </div>
              <div className="pose-rig-list__controls">
                <button
                  type="button"
                  className="button subtle"
                  onClick={() => onDuplicatePose(pose.id)}
                  disabled={disabled}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="button danger"
                  onClick={() => onDeletePose(pose.id)}
                  disabled={disabled}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
        {listHint && <p className="pose-rig-empty">{listHint}</p>}
      </div>
    </section>
  );
}
