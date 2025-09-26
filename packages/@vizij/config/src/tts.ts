export const PollyVoices: string[] = [
  "Danielle",
  "Gregory",
  "Ivy",
  "Joanna",
  "Kendra",
  "Kimberly",
  "Salli",
  "Joey",
  "Justin",
  "Kevin",
  "Matthew",
  "Ruth",
  "Stephen",
];

export type VisemeData = {
  sentences: Array<{
    time: number;
    type: "sentence";
    start: number;
    end: number;
    value: string;
  }>;
  words: Array<{
    time: number;
    type: "word";
    start: number;
    end: number;
    value: string;
  }>;
  visemes: Array<{ time: number; type: "viseme"; value: string }>;
};
