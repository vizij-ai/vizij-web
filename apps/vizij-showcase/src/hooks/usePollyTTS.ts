import { useState } from "react";
import type { VisemeData } from "../types/polly";

import { fetchVisemeData } from "../services/pollyApi";

export const usePollyTTS = () => {
  const [spokenSentences, setSpokenSentences] = useState<
    VisemeData["sentences"]
  >([]);
  const [spokenWords, setSpokenWords] = useState<VisemeData["words"]>([]);
  const [spokenVisemes, setSpokenVisemes] = useState<VisemeData["visemes"]>([]);
  const [spokenAudio, setSpokenAudio] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getTTSData = async (
    text: string,
    voice: string,
  ): Promise<{ visemeData: VisemeData; audioSrc: string; audioBlob: Blob }> => {
    setIsLoading(true);
    setError(null);
    try {
      const { visemeData, audioBlob } = await fetchVisemeData(text, voice);
      setSpokenSentences(visemeData.sentences);
      setSpokenWords(visemeData.words);
      setSpokenVisemes(visemeData.visemes);
      const audioSrc = URL.createObjectURL(audioBlob);
      setSpokenAudio(audioSrc);
      return { visemeData, audioSrc, audioBlob };
    } catch (err) {
      setError(err as Error);
      throw err;
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
