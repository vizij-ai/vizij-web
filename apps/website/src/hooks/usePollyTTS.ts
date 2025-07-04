import { useState } from "react";
import { fetchVisemeData, VisemeData } from "../services/pollyApi";

export const usePollyTTS = () => {
  const [spokenSentences, setSpokenSentences] = useState<VisemeData["sentences"]>([]);
  const [spokenWords, setSpokenWords] = useState<VisemeData["words"]>([]);
  const [spokenVisemes, setSpokenVisemes] = useState<VisemeData["visemes"]>([]);
  const [spokenAudio, setSpokenAudio] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getTTSData = async (text: string, voice: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { visemeData, audioBlob } = await fetchVisemeData(text, voice);
      setSpokenSentences(visemeData.sentences);
      setSpokenWords(visemeData.words);
      setSpokenVisemes(visemeData.visemes);
      const audioSrc = URL.createObjectURL(audioBlob);
      setSpokenAudio(audioSrc);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    spokenSentences,
    spokenWords,
    spokenVisemes,
    spokenAudio,
    isLoading,
    error,
    getTTSData,
    setSpokenAudio,
    setSpokenSentences,
    setSpokenWords,
    setSpokenVisemes,
  };
};
