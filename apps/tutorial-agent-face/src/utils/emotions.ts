/** Free-form emotion words the agent may use, by the face standard's
 * expression they read as. */
const EMOTION_SYNONYMS: Record<string, string> = {
  smile: "happy",
  grin: "happy",
  joy: "happy",
  joyful: "happy",
  delighted: "happy",
  laugh: "happy",
  chuckle: "happy",
  hype: "excited",
  pumped: "excited",
  thrilled: "excited",
  wow: "amazed",
  surprise: "surprised",
  shock: "surprised",
  astonished: "amazed",
  frown: "sad",
  gloomy: "sad",
  upset: "sad",
  mad: "angry",
  rage: "furious",
  calm: "neutral",
  relaxed: "neutral",
  chill: "neutral",
  serene: "neutral",
  blank: "neutral",
  disgust: "disgusted",
  grossed_out: "disgusted",
  yuck: "disgusted",
  fear: "scared",
  afraid: "scared",
  nervous: "scared",
  shy: "embarrassed",
  worried: "concerned",
  sympathy: "concerned",
  sympathetic: "concerned",
  sleepy: "sleepy",
};

export function slugifyEmotion(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * The expression of `names` — the face standard's — that `raw` asks for: the
 * name itself, the expression a synonym reads as, or the first name that
 * starts with it. `null` when none matches.
 */
export function resolveExpression(
  raw: string,
  names: readonly string[],
): string | null {
  const slug = slugifyEmotion(raw);
  if (!slug) return null;
  const wanted = EMOTION_SYNONYMS[slug] ?? slug;
  if (names.includes(wanted)) return wanted;
  return (
    names.find((name) => name.startsWith(wanted) || wanted.startsWith(name)) ??
    null
  );
}
