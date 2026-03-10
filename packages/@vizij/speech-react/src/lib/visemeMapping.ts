const FACE_VISEME_SEGMENTS = [
  "pose_pzzzfnvy",
  "p",
  "t",
  "t_2",
  "s",
  "f",
  "k",
  "i",
  "r",
  "u",
  "a",
  "e",
  "e_2",
  "o",
  "o_2",
] as const;

export type FaceVisemeSegment = (typeof FACE_VISEME_SEGMENTS)[number];

const FACE_VISEME_LABELS: Record<FaceVisemeSegment, string> = {
  pose_pzzzfnvy: "@",
  p: "p",
  t: "t",
  t_2: "th",
  s: "s",
  f: "f",
  k: "k",
  i: "i",
  r: "r",
  u: "oo",
  a: "a",
  e: "e",
  e_2: "eh",
  o: "oa",
  o_2: "oi",
};

export type PollyVisemeCode =
  | "sil"
  | "p"
  | "t"
  | "T"
  | "s"
  | "S"
  | "f"
  | "k"
  | "a"
  | "@"
  | "e"
  | "E"
  | "i"
  | "o"
  | "O"
  | "u"
  | "r"
  | "l";

type PollyMapping = {
  segment: FaceVisemeSegment | null;
  isSilence?: boolean;
};

const POLLY_TO_FACE_SEGMENT: Record<PollyVisemeCode, PollyMapping> = {
  sil: { segment: null, isSilence: true },
  p: { segment: "p" },
  t: { segment: "t" },
  T: { segment: "t_2" },
  s: { segment: "s" },
  S: { segment: "s" },
  f: { segment: "f" },
  k: { segment: "k" },
  a: { segment: "a" },
  "@": { segment: "pose_pzzzfnvy" },
  e: { segment: "e_2" },
  E: { segment: "e" },
  i: { segment: "i" },
  o: { segment: "o" },
  O: { segment: "o_2" },
  u: { segment: "u" },
  r: { segment: "r" },
  l: { segment: "r" },
};

export type ResolvedFaceViseme = {
  segment: FaceVisemeSegment | null;
  label: string;
  isSilence: boolean;
  sourceCode: string;
};

const reportedUnknown = new Set<string>();

export function mapPollyViseme(
  value: string | undefined | null,
): ResolvedFaceViseme | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const mapping = POLLY_TO_FACE_SEGMENT[trimmed as PollyVisemeCode];
  if (!mapping) {
    if (!reportedUnknown.has(trimmed)) {
      console.warn(
        `[voice] Unmapped Polly viseme code: ${trimmed}. Falling back to neutral.`,
      );
      reportedUnknown.add(trimmed);
    }
    return {
      segment: null,
      label: trimmed,
      isSilence: false,
      sourceCode: trimmed,
    };
  }
  const { segment, isSilence = false } = mapping;
  const label =
    segment != null
      ? (FACE_VISEME_LABELS[segment] ?? segment)
      : isSilence
        ? "rest"
        : trimmed;
  return {
    segment,
    label,
    isSilence,
    sourceCode: trimmed,
  };
}

export const FACE_VISEME_SEGMENT_LIST = FACE_VISEME_SEGMENTS;
