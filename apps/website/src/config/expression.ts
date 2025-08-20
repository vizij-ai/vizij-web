export type Expression = "neutral" | "smile" | "frown" | "surprise" | "anger" | "disgust";

export const expressionMapper: {
  [key in Expression]: {
    x: number;
    y: number;
    morph: number;
  };
} = {
  neutral: { x: 1, y: 1, morph: 0 },
  smile: { x: 1.2, y: 1.1, morph: 0.3 },
  frown: { x: 0.8, y: 0.9, morph: 0.5 },
  surprise: { x: 1.5, y: 1.5, morph: 0.4 },
  anger: { x: 0.9, y: 0.8, morph: 0.6 },
  disgust: { x: 0.7, y: 0.7, morph: 0.2 },
};
