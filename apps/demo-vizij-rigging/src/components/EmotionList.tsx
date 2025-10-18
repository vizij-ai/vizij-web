import type { EmotionDefinition } from "../rigging/types";

interface EmotionListProps {
  emotions: EmotionDefinition[];
  selectedEmotionId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function EmotionList({
  emotions,
  selectedEmotionId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
}: EmotionListProps) {
  return (
    <div className="panel emotion-list-panel">
      <div className="panel-header">
        <h2>3 · Emotion Rig</h2>
        <button type="button" className="button primary" onClick={onAdd}>
          Add Emotion
        </button>
      </div>
      <div className="panel-body emotion-list-body">
        {emotions.length === 0 ? (
          <p className="panel-placeholder">
            Capture a pose to create your first emotion channel.
          </p>
        ) : (
          <ul className="emotion-list">
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
        )}
      </div>
    </div>
  );
}
