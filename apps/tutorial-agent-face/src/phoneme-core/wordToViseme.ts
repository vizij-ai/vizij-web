import { wordToPhonemes } from "./g2p_en";
import { PHONEMES, PHONEME_TO_VISEME } from "./phonemes";
import type { Phoneme, VisemeId } from "./phonemes";

export { wordToPhonemes, PHONEMES };

export function phonemesToVisemes(phonemes: Phoneme[]): VisemeId[] {
  const visemes: VisemeId[] = [];
  for (const ph of phonemes) {
    const v = PHONEME_TO_VISEME[ph];
    if (v && visemes[visemes.length - 1] !== v) {
      visemes.push(v);
    }
  }
  return visemes;
}

export function wordToVisemes(word: string): VisemeId[] {
  const phonemes = wordToPhonemes(word);
  return phonemesToVisemes(phonemes);
}
