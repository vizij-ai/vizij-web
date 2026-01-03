import type { VisemeData } from "../types/polly";
import { requireApiBase } from "./apiBase";

const normalizeBase = (base: string): string => base.trim().replace(/\/$/, "");

export const fetchVisemeData = async (
  text: string,
  voice: string,
  base = requireApiBase(),
): Promise<{ visemeData: VisemeData; audioBlob: Blob }> => {
  const apiBase = normalizeBase(base);

  const visemesPromise = fetch(`${apiBase}/tts/get-visemes`, {
    method: "POST",
    mode: "cors",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voice,
      text,
    }),
  }).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to fetch visemes: ${res.status}`);
    }
    return res.json();
  });

  const audioPromise = fetch(`${apiBase}/tts/get-audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voice,
      text,
    }),
  }).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to fetch audio: ${res.status}`);
    }
    return res.blob();
  });

  const [visemeData, audioBlob] = await Promise.all([
    visemesPromise,
    audioPromise,
  ]);

  return { visemeData, audioBlob };
};
