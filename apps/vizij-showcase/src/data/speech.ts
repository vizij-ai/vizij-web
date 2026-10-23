export type SpeechStatus = "idle" | "preparing" | "speaking";

export const SPEECH_STATUS_COPY: Record<
  SpeechStatus,
  { label: string; overlay: string }
> = {
  idle: {
    label: "Idle – ready for your script.",
    overlay: "Tap “Say it” to hear the face speak.",
  },
  preparing: {
    label: "Preparing – synthesising the line.",
    overlay: "Synthesising the line…",
  },
  speaking: {
    label: "Speaking – the visemes move the lips.",
    overlay: "Speaking.",
  },
};
