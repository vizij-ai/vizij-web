import { apiURL } from "@vizij/config";

export interface VisemeData {
  sentences: {
    time: number;
    type: "sentence";
    start: number;
    end: number;
    value: string;
  }[];
  words: {
    time: number;
    type: "word";
    start: number;
    end: number;
    value: string;
  }[];
  visemes: { time: number; type: "viseme"; value: string }[];
}

export const fetchVisemeData = async (
  text: string,
  voice: string,
): Promise<{ visemeData: VisemeData; audioBlob: Blob }> => {
  const visemesPromise = fetch(`${apiURL}/tts/get-visemes`, {
    method: "POST",
    mode: "cors",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voice: voice,
      text: text,
    }),
  }).then((res) => res.json());

  const audioPromise = fetch(`${apiURL}/tts/get-audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voice: voice,
      text: text,
    }),
  }).then((res) => res.blob());

  const [visemeData, audioBlob] = await Promise.all([
    visemesPromise,
    audioPromise,
  ]);

  return { visemeData, audioBlob };
};
