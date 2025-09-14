export type Expression =
  | "neutral"
  | "smile"
  | "frown"
  | "surprise"
  | "anger"
  | "disgust";

export const expressionMapper: {
  [key in Expression]: {
    x: number;
    y: number;
    morph: number;
  };
} = {
  neutral: { x: 1, y: 1, morph: 0 },
  smile: { x: 1.2, y: 1.1, morph: -5 },
  frown: { x: 0.8, y: 0.9, morph: 5 },
  surprise: { x: 1.2, y: 10, morph: 0.1 },
  anger: { x: 3, y: 10, morph: 1 },
  disgust: { x: 0.7, y: 8, morph: 0.8 },
};
