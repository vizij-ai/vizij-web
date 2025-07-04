export type Viseme =
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

export const visemeMapper: {
  [key in Viseme]: {
    x: number;
    y: number;
    morph: number;
  };
} = {
  sil: { x: 1, y: 1, morph: 0 },
  p: { x: 0.82, y: 0.37, morph: 0.2 },
  t: { x: 1, y: 2.77, morph: 0.35 },
  T: { x: 1, y: 2.77, morph: 0.35 },
  s: { x: 1.6, y: 2.2, morph: 0.2 },
  S: { x: 1.6, y: 2.2, morph: 0.2 },
  f: { x: 0.7, y: 3.18, morph: 0.9 },
  k: { x: 1.2, y: 2.9, morph: 0.2 },
  l: { x: 0.79, y: 3.7, morph: 0.35 },
  r: { x: 0.85, y: 2.9, morph: 0.61 },
  a: { x: 1.18, y: 5.14, morph: 0.5 },
  "@": { x: 0.95, y: 3.3, morph: 0.61 },
  e: { x: 1, y: 5, morph: 0.37 },
  E: { x: 1, y: 5, morph: 0.37 },
  i: { x: 1.7, y: 3.89, morph: 0.44 },
  o: { x: 0.9, y: 6, morph: 0.5 },
  O: { x: 0.9, y: 6, morph: 0.5 },
  u: { x: 0.56, y: 4.15, morph: 0.5 },
};
