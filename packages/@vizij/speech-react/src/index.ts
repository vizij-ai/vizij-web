// Hooks
export {
  useSpeechRecognition,
  type UseSpeechRecognitionOptions,
  type UseSpeechRecognitionReturn,
} from "./hooks/useSpeechRecognition";
export {
  useConversation,
  type UseConversationOptions,
  type UseConversationReturn,
  type ChatMessage,
} from "./hooks/useConversation";
export {
  useSpeechPlayback,
  type UseSpeechPlaybackOptions,
  type UseSpeechPlaybackReturn,
  type SpeechStatus,
} from "./hooks/useSpeechPlayback";

// Services
export { fetchVisemeData } from "./services/pollyApi";
export {
  getDeepgramApiKey,
  hasEnvDeepgramApiKey,
  setDeepgramApiKey,
  clearDeepgramApiKey,
} from "./services/deepgramConfig";
export {
  getOpenaiApiKey,
  hasEnvOpenaiApiKey,
  setOpenaiApiKey,
  clearOpenaiApiKey,
} from "./services/openaiConfig";

// Lib
export {
  mapPollyViseme,
  FACE_VISEME_SEGMENT_LIST,
  type FaceVisemeSegment,
  type PollyVisemeCode,
  type ResolvedFaceViseme,
} from "./lib/visemeMapping";
export {
  buildRigInputPath,
  buildPoseWeightInputPathSegment,
  resolvePoseMembership,
  POSE_WEIGHT_INPUT_PATH_PREFIX,
} from "./lib/poseUtils";

// Data
export { POLLY_VOICES, type PollyVoice } from "./data/pollyVoices";

// Types
export type {
  SpeechMark,
  SpeechMarkType,
  VisemeData,
} from "./types/polly";
