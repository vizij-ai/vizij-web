import type { Phoneme } from "./phonemes";

type Rule = {
  pattern: RegExp;
  phonemes: Phoneme[];
};

// Order matters: apply longer/more specific digraphs first.
const DIGRAPH_RULES: Rule[] = [
  { pattern: /^(ch)/, phonemes: ["ch"] },
  { pattern: /^(sh)/, phonemes: ["sh"] },
  { pattern: /^(zh)/, phonemes: ["zh"] },
  { pattern: /^(ph)/, phonemes: ["f"] },
  { pattern: /^(th)/, phonemes: ["th"] },
  { pattern: /^(qu)/, phonemes: ["k", "w"] },
  { pattern: /^(ng)/, phonemes: ["ng"] },
  { pattern: /^(oi|oy)/, phonemes: ["oy"] },
  { pattern: /^(ou|ow)/, phonemes: ["aw"] },
  { pattern: /^(au|aw)/, phonemes: ["aw"] },
  { pattern: /^(ee|ea)/, phonemes: ["i"] },
  { pattern: /^(ai|ay)/, phonemes: ["ey"] },
  { pattern: /^(ei|ey)/, phonemes: ["ey"] },
];

function mapVowel(ch: string, isStressed: boolean, _atEnd: boolean): Phoneme[] {
  switch (ch) {
    case "a":
      return isStressed ? ["ah"] : ["ax"];
    case "e":
      return isStressed ? ["eh"] : ["ax"];
    case "i":
      return isStressed ? ["ih"] : ["i"];
    case "o":
      return isStressed ? ["ow"] : ["ao"];
    case "u":
      return isStressed ? ["uw"] : ["uh"];
    case "y":
      return isStressed ? ["i"] : ["ih"];
    default:
      return ["ax"];
  }
}

function mapConsonant(ch: string): Phoneme[] {
  switch (ch) {
    case "b":
      return ["b"];
    case "c":
      return ["k"];
    case "d":
      return ["d"];
    case "f":
      return ["f"];
    case "g":
      return ["g"];
    case "h":
      return ["h"];
    case "j":
      return ["jh"];
    case "k":
      return ["k"];
    case "l":
      return ["l"];
    case "m":
      return ["m"];
    case "n":
      return ["n"];
    case "p":
      return ["p"];
    case "q":
      return ["k"];
    case "r":
      return ["r"];
    case "s":
      return ["s"];
    case "t":
      return ["t"];
    case "v":
      return ["v"];
    case "w":
      return ["w"];
    case "x":
      return ["k", "s"];
    case "z":
      return ["z"];
    default:
      return [];
  }
}

// Simplified grapheme->phoneme for English, returning our richer phoneme set.
export function wordToPhonemes(word: string): Phoneme[] {
  const lower = word.toLowerCase().replace(/[^a-z]/g, "");
  const phones: Phoneme[] = [];

  let i = 0;
  while (i < lower.length) {
    const slice = lower.slice(i);
    let matched = false;

    for (const rule of DIGRAPH_RULES) {
      const m = slice.match(rule.pattern);
      if (m) {
        phones.push(...rule.phonemes);
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const ch = lower[i];

    if ("aeiouy".includes(ch)) {
      const next = lower[i + 1] ?? "";
      const isStressed = i === 0 || !"aeiouy".includes(next);
      const atEnd = i === lower.length - 1;
      phones.push(...mapVowel(ch, isStressed, atEnd));
    } else {
      phones.push(...mapConsonant(ch));
    }

    i += 1;
  }

  const compressed: Phoneme[] = [];
  for (const p of phones) {
    if (compressed[compressed.length - 1] !== p) compressed.push(p);
  }

  return compressed;
}
