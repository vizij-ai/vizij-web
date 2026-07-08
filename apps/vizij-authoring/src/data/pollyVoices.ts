export const POLLY_VOICES = [
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
] as const;

export type PollyVoice = (typeof POLLY_VOICES)[number];
