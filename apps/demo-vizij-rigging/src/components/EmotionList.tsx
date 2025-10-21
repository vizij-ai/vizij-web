import type { EmotionDefinition } from "../rigging/types";

interface EmotionListProps {
  emotions: EmotionDefinition[];
  selectedEmotionId: string | null;
  neutralSelected: boolean;
  onSelectNeutral: () => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onCreateVisemes: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function EmotionList({
  emotions,
  selectedEmotionId,
  neutralSelected,
  onSelectNeutral,
  onSelect,
  onAdd,
  onCreateVisemes,
  onDuplicate,
  onDelete,
}: EmotionListProps) {
  const hasEmotions = emotions.length > 0;

  return (
    <div className="panel emotion-list-panel">
      <div className="panel-header">
        <h2>3 · Pose Rig</h2>
        <div className="emotion-list__actions">
          <button
            type="button"
            className="button subtle"
            onClick={onCreateVisemes}
          >
            Create Viseme Poses
          </button>
          <button type="button" className="button primary" onClick={onAdd}>
            Add Pose
          </button>
        </div>
      </div>
      <div className="panel-body emotion-list-body">
        <ul className="emotion-list">
          <li
            key="neutral"
            className={neutralSelected ? "emotion-item active" : "emotion-item"}
          >
            <button
              type="button"
              className="emotion-select"
              onClick={onSelectNeutral}
            >
              <span className="emotion-name">Neutral Pose</span>
              <span className="emotion-updated">Base rig</span>
            </button>
          </li>
          {emotions.map((emotion) => {
            const isActive = selectedEmotionId === emotion.id;
            return (
              <li
                key={emotion.id}
                className={isActive ? "emotion-item active" : "emotion-item"}
              >
                <button
                  type="button"
                  className="emotion-select"
                  onClick={() => onSelect(emotion.id)}
                >
                  <span className="emotion-name">{emotion.name}</span>
                  <span className="emotion-updated">
                    {new Date(emotion.updatedAt).toLocaleString()}
                  </span>
                </button>
                <div className="emotion-actions">
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() => onDuplicate(emotion.id)}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="button danger"
                    onClick={() => onDelete(emotion.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {!hasEmotions && (
          <p className="panel-placeholder">
            Capture or add a pose to begin building the rig.
          </p>
        )}
      </div>
    </div>
  );
}
