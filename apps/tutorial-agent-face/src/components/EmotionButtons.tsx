import { useShowExpression } from "../hooks/useExpressions";

/** The expressions the debug panel offers, those of the face standard's that
 * read clearly on a face. */
const FEATURED = ["happy", "sad", "surprised", "angry", "concerned", "sleepy"];

const PEAK = 0.7;
const ATTACK_SECONDS = 0.25;
const RELEASE_SECONDS = 1.2;

export function EmotionButtons({
  ready,
  expressions,
}: {
  ready: boolean;
  expressions: string[];
}) {
  const { show } = useShowExpression();
  const offered = FEATURED.filter((name) => expressions.includes(name));

  if (!ready || offered.length === 0) {
    return null;
  }

  return (
    <div className="emotion-buttons">
      <p className="label">Emotions</p>
      <div className="emotion-grid">
        {offered.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() =>
              void show(name, {
                peak: PEAK,
                attackSeconds: ATTACK_SECONDS,
                releaseSeconds: RELEASE_SECONDS,
              })
            }
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
