import type { PoseDefinition } from "../types";

interface PoseListProps {
  poses: PoseDefinition[];
  selectedPoseId: string | null;
  isNeutralSelected: boolean;
  disabled?: boolean;
  onSelectNeutral: () => void;
  onSelectPose: (poseId: string) => void;
  onCreatePose: () => void;
  onDuplicatePose: (poseId: string) => void;
  onDeletePose: (poseId: string) => void;
}

export function PoseList({
  poses,
  selectedPoseId,
  isNeutralSelected,
  disabled,
  onSelectNeutral,
  onSelectPose,
  onCreatePose,
  onDuplicatePose,
  onDeletePose,
}: PoseListProps) {
  const sorted = poses.slice().sort((a, b) => {
    const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? "");
    const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? "");
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return a.name.localeCompare(b.name);
    }
    return bTime - aTime;
  });

  return (
    <section className="pose-rig-panel pose-rig-panel--list">
      <header className="pose-rig-panel__header">
        <div>
          <h3 className="pose-rig-panel__title">Pose Library</h3>
          <p className="pose-rig-panel__subtitle">
            Capture, duplicate, and curate saved poses.
          </p>
        </div>
        <div className="pose-rig-panel__actions">
          <button
            type="button"
            className="button primary"
            onClick={onCreatePose}
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
              <button
                type="button"
                className="pose-rig-list__item"
                onClick={() => onSelectPose(pose.id)}
                disabled={disabled}
              >
                <div className="pose-rig-list__label">
                  <span className="pose-rig-list__name">{pose.name}</span>
                  <span className="pose-rig-list__meta">{updatedLabel}</span>
                </div>
              </button>
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
        {sorted.length === 0 && (
          <p className="pose-rig-empty">
            Capture or add a pose to begin building the library.
          </p>
        )}
      </div>
    </section>
  );
}
