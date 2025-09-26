import type { VisemeData } from "@vizij/config";

interface SpokenTextDisplayProps {
  spokenSentences: VisemeData["sentences"];
  spokenWords: VisemeData["words"];
  spokenVisemes: VisemeData["visemes"];
  currentSpokenVisemeIndex: number;
  spokenAudio: string;
  onPlay: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (tSec: number) => void;
  onSeeked?: (tSec: number) => void;
  onAudioRef?: (el: HTMLAudioElement | null) => void;
  playControlOnly?: boolean; // If true, only show the audio play control without text
}

export const SpokenTextDisplay = ({
  spokenSentences,
  spokenWords,
  spokenVisemes,
  currentSpokenVisemeIndex,
  spokenAudio,
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  onSeeked,
  onAudioRef,
  playControlOnly,
}: SpokenTextDisplayProps) => {
  return (
    <div className="m-4">
      {!playControlOnly && (
        <>
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
                  "inline-block p-2 " +
                  (currentSpokenVisemeIndex === ind ? " text-semio-blue" : "")
                }
              >
                {vis.value}
              </div>
            ))}
          </div>
        </>
      )}
      {spokenAudio !== "" && (
        <div className="m-2">
          <audio
            className="inline-block"
            controls
            src={spokenAudio}
            ref={(el) => onAudioRef?.(el)}
            onPlay={onPlay}
            onPause={onPause}
            onEnded={onEnded}
            onTimeUpdate={(e) =>
              onTimeUpdate?.((e.target as HTMLAudioElement).currentTime)
            }
            onSeeked={(e) =>
              onSeeked?.((e.target as HTMLAudioElement).currentTime)
            }
          />
        </div>
      )}
    </div>
  );
};
