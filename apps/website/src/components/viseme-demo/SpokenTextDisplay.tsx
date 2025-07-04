import { VisemeData } from "../../services/pollyApi";

interface SpokenTextDisplayProps {
  spokenSentences: VisemeData["sentences"];
  spokenWords: VisemeData["words"];
  spokenVisemes: VisemeData["visemes"];
  currentSpokenVisemeIndex: number;
  spokenAudio: string;
  onPlay: () => void;
}

export const SpokenTextDisplay = ({
  spokenSentences,
  spokenWords,
  spokenVisemes,
  currentSpokenVisemeIndex,
  spokenAudio,
  onPlay,
}: SpokenTextDisplayProps) => {
  return (
    <div className="m-4">
      <div className="m-1">
        {spokenSentences.map((sent, ind) => (
          <div key={ind} className="inline-block p-2 ">
            {sent.value}
          </div>
        ))}
      </div>
      <div className="m-1">
        {spokenWords.map((word, ind) => (
          <div key={ind} className="inline-block p-2 ">
            {word.value}
          </div>
        ))}
      </div>
      <div className="m-1">
        {spokenVisemes.map((vis, ind) => (
          <div
            key={ind}
            className={
              "inline-block p-2 " + (currentSpokenVisemeIndex === ind ? " text-semio-blue" : "")
            }
          >
            {vis.value}
          </div>
        ))}
      </div>
      {spokenAudio !== "" && (
        <div className="m-2">
          <audio className="inline-block" controls src={spokenAudio} onPlay={onPlay} />
        </div>
      )}
    </div>
  );
};
