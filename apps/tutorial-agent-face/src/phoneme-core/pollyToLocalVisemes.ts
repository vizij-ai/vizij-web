import { VISEMES, VisemeType } from "./constants";
import { PollyVisemeId } from "./pollyVisemes";

export const POLLY_VISEME_TO_LOCAL: Record<PollyVisemeId, VisemeType> = {
  p: VISEMES.PP,
  t: VISEMES.DD,
  T: VISEMES.DD,
  l: VISEMES.RR,
  r: VISEMES.RR,
  s: VISEMES.SS,
  S: VISEMES.SS,
  f: VISEMES.FF,
  k: VISEMES.AH,
  i: VISEMES.EE,
  e: VISEMES.OH,
  E: VISEMES.AH,
  a: VISEMES.AH,
  "@": VISEMES.OH,
  o: VISEMES.OH,
  O: VISEMES.OH,
  u: VISEMES.OO,
};
