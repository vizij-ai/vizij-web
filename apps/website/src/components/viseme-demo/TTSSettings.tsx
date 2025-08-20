import { useRef } from "react";
import { PollyVoices } from "../../config/tts";

interface TTSSettingsProps {
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  onSpeak: (text: string) => void;
  message?: string;
}

export const TTSSettings = ({ selectedVoice, onVoiceChange, onSpeak, message }: TTSSettingsProps ) => {
  const textToSpeakInputRef = useRef<HTMLInputElement>(null);

  const handleSpeak = () => {
    if (textToSpeakInputRef.current) {
      onSpeak(textToSpeakInputRef.current.value);
    }
  };

  if (message === undefined)
    message = "Or say something instead!";


  return (
    <div className="pt-2 mt-2">
      <div>{message}</div>
      <span>Speak as:</span>
      <select
        className="bg-white text-black p-2 mx-2"
        value={selectedVoice}
        onChange={(e) => onVoiceChange(e.target.value)}
      >
        {PollyVoices.map((pv) => (
          <option key={pv} value={pv}>
            {pv}
          </option>
        ))}
      </select>
      <label>And say:</label>
      <input
        type="text"
        className="bg-white text-black p-2 m-2"
        ref={textToSpeakInputRef}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleSpeak();
          }
        }}
      />
      <button
        className="p-2 m-2 border border-white cursor-pointer rounded-md hover:bg-gray-800"
        onClick={handleSpeak}
      >
        Speak!
      </button>
    </div>
  );
};
