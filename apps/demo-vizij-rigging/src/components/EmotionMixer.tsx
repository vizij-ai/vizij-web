import { ChangeEvent } from "react";
import type { EmotionDefinition, EmotionWeightMap } from "../rigging/types";

interface EmotionMixerProps {
  emotions: EmotionDefinition[];
  weights: EmotionWeightMap;
  onWeightChange: (emotionId: string, weight: number) => void;
  onResetWeights: () => void;
}

export function EmotionMixer({
  emotions,
  weights,
  onWeightChange,
  onResetWeights,
}: EmotionMixerProps) {
  const handleChange = (
    event: ChangeEvent<HTMLInputElement>,
    emotionId: string,
  ) => {
    const value = Number.parseFloat(event.target.value);
    onWeightChange(emotionId, Number.isFinite(value) ? value : 0);
  };

  return (
    <div className="panel emotion-mixer-panel">
      <div className="panel-header">
        <h2>Blend Preview</h2>
        <button
          type="button"
          className="button subtle"
          onClick={onResetWeights}
        >
          Reset weights
        </button>
      </div>
      <div className="panel-body emotion-mixer-body">
        {emotions.length === 0 ? (
          <p className="panel-placeholder">
            Add at least one emotion to start blending.
          </p>
        ) : (
          <ul className="mixer-list">
            {emotions.map((emotion) => {
              const weight = weights[emotion.id] ?? 0;
              return (
                <li key={emotion.id} className="mixer-row">
                  <div className="mixer-meta">
                    <span className="mixer-label">{emotion.name}</span>
                    <span className="mixer-value">
                      {(weight * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={weight}
                    onChange={(event) => handleChange(event, emotion.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
