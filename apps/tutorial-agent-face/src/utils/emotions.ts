import type { PoseHotkeyBinding } from "../hooks/usePoseHotkeys";

export const EMOTION_NEEDLES = [
  "emotion",
  "mood",
  "affect",
  "feel",
  "happy",
  "sad",
  "angry",
  "calm",
];

const EMOTION_SYNONYMS: Record<string, string> = {
  smile: "happy",
  grin: "happy",
  joy: "happy",
  joyful: "happy",
  delighted: "happy",
  laugh: "happy",
  chuckle: "happy",
  hype: "excited",
  excited: "excited",
  pumped: "excited",
  thrilled: "excited",
  wow: "surprised",
  surprised: "surprised",
  shock: "surprised",
  amazed: "surprised",
  astonished: "surprised",
  sad: "sad",
  frown: "sad",
  gloomy: "sad",
  upset: "sad",
  disappointed: "sad",
  angry: "angry",
  mad: "angry",
  furious: "angry",
  annoyed: "angry",
  rage: "angry",
  calm: "calm",
  relaxed: "calm",
  chill: "calm",
  serene: "calm",
  neutral: "neutral",
  blank: "neutral",
  bored: "neutral",
  disgust: "disgust",
  grossed_out: "disgust",
  yuck: "disgust",
  fear: "afraid",
  afraid: "afraid",
  scared: "afraid",
  nervous: "afraid",
  shy: "afraid",
};

export function slugifyEmotion(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function canonicalEmotionName(raw: string): string {
  const slug = slugifyEmotion(raw);
  return EMOTION_SYNONYMS[slug] ?? slug;
}

export function isEmotionBinding(binding: PoseHotkeyBinding): boolean {
  const target = [binding.pose.group, binding.pose.name, binding.pose.id]
    .filter(Boolean)
    .map((value) => value?.toLowerCase() ?? "")
    .join(" ");
  return EMOTION_NEEDLES.some((needle) => target.includes(needle));
}

export function scoreEmotionBinding(
  binding: PoseHotkeyBinding,
  targetSlug: string,
): number {
  if (!targetSlug) return 0;
  const pieces = [
    slugifyEmotion(binding.pose.name ?? ""),
    slugifyEmotion(binding.pose.id ?? ""),
    slugifyEmotion(binding.pose.group ?? ""),
    slugifyEmotion(binding.relativePath),
  ];

  let best = 0;
  for (const piece of pieces) {
    if (!piece) continue;
    if (piece === targetSlug) {
      best = Math.max(best, 6);
    } else if (piece.startsWith(targetSlug) || targetSlug.startsWith(piece)) {
      best = Math.max(best, 4);
    } else if (piece.includes(targetSlug) || targetSlug.includes(piece)) {
      best = Math.max(best, 3);
    }
  }

  return best;
}
