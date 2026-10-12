import type { VisemeId } from "./phoneme-core";

/**
 * The face standard's viseme shape for one of the aligner's Polly-style
 * viseme ids — the table the device's text-to-speech uses for Polly's codes,
 * so a viseme reads the same whether `say` or this app produces it.
 */
const STANDARD_SHAPE: Record<VisemeId, string> = {
  sil: "sil",
  p: "PP",
  f: "FF",
  T: "TH",
  t: "DD",
  k: "kk",
  S: "CH",
  s: "SS",
  l: "nn",
  r: "RR",
  a: "aa",
  e: "E",
  E: "E",
  i: "ih",
  "@": "ih",
  o: "oh",
  O: "oh",
  u: "ou",
};

export function standardShape(viseme: VisemeId): string {
  return STANDARD_SHAPE[viseme] ?? "sil";
}
