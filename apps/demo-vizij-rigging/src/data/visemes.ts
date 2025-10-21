export type VisemeId =
  | "sil"
  | "p"
  | "t"
  | "T"
  | "s"
  | "S"
  | "f"
  | "k"
  | "l"
  | "r"
  | "a"
  | "@"
  | "e"
  | "E"
  | "i"
  | "o"
  | "O"
  | "u";

export interface VisemeDefinition {
  id: VisemeId;
  label: string;
  xScale: number;
  yScale: number;
  morph: number;
}

export const VISEME_DEFINITIONS: VisemeDefinition[] = [
  { id: "sil", label: "sil", xScale: 1, yScale: 1, morph: 0 },
  { id: "p", label: "p", xScale: 0.82, yScale: 0.37, morph: 0.2 },
  { id: "t", label: "t", xScale: 1, yScale: 2.77, morph: 0.35 },
  { id: "T", label: "T", xScale: 1, yScale: 2.77, morph: 0.35 },
  { id: "s", label: "s", xScale: 1.6, yScale: 2.2, morph: 0.2 },
  { id: "S", label: "S", xScale: 1.6, yScale: 2.2, morph: 0.2 },
  { id: "f", label: "f", xScale: 0.7, yScale: 3.18, morph: 0.9 },
  { id: "k", label: "k", xScale: 1.2, yScale: 2.9, morph: 0.2 },
  { id: "l", label: "l", xScale: 0.79, yScale: 3.7, morph: 0.35 },
  { id: "r", label: "r", xScale: 0.85, yScale: 2.9, morph: 0.61 },
  { id: "a", label: "a", xScale: 1.18, yScale: 5.14, morph: 0.5 },
  { id: "@", label: "@", xScale: 0.95, yScale: 3.3, morph: 0.61 },
  { id: "e", label: "e", xScale: 1, yScale: 5, morph: 0.37 },
  { id: "E", label: "E", xScale: 1, yScale: 5, morph: 0.37 },
  { id: "i", label: "i", xScale: 1.7, yScale: 3.89, morph: 0.44 },
  { id: "o", label: "o", xScale: 0.9, yScale: 6, morph: 0.5 },
  { id: "O", label: "O", xScale: 0.9, yScale: 6, morph: 0.5 },
  { id: "u", label: "u", xScale: 0.56, yScale: 4.15, morph: 0.5 },
];
