export type SpeechMarkType = "sentence" | "word" | "viseme";

export type SpeechMark = {
  time: number;
  type: SpeechMarkType;
  value: string;
  start?: number;
  end?: number;
};

export type VisemeData = {
  sentences: SpeechMark[];
  words: SpeechMark[];
  visemes: SpeechMark[];
};
