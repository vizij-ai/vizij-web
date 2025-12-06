export const DEMO_VISEME_SEQUENCE = [
  { code: "ai", duration: 140 },
  { code: "oh", duration: 180 },
  { code: "ee", duration: 120 },
  { code: "uh", duration: 160 },
  { code: "oh", duration: 130 },
  { code: "m", duration: 110 },
  { code: "w", duration: 150 },
] as const;

export type SpeechStatus = "idle" | "preparing" | "speaking";

export const SPEECH_STATUS_COPY: Record<
  SpeechStatus,
  { label: string; overlay: string }
> = {
  idle: {
    label: "Idle – ready for your script.",
    overlay: "Tap generate to stream Polly visemes.",
  },
  preparing: {
    label: "Preparing – pairing Amazon Polly output.",
    overlay: "Syncing visemes and audio…",
  },
  speaking: {
    label: "Speaking – animating visemes and emotion.",
    overlay: "Playing viseme timeline in realtime.",
  },
};
