import type { VisemeData } from "@vizij/config";

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
      voice: voice,
      text: text,
    }),
  }).then((res) => res.json());

  const audioPromise = fetch(`${apiBase}/tts/get-audio`, {
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
