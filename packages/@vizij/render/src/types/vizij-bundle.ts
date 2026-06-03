export type VizijBundleVersion = 1;

export type VizijBundleGraphKind =
  | "rig"
  | "pose"
  | "pose-driver"
  | "animation-bridge"
  | "low-level"
  | string;

export type VizijPoseId = string;
export type VizijAnimationId = string;
export type VizijGraphId = string;

export interface VizijBundleGraphMetadata {
  hash?: string;
  source?: string;
  kind?: VizijBundleGraphKind;
  exportedAt?: string;
  [key: string]: unknown;
}

export interface VizijBundleGraphEntry {
  id: VizijGraphId;
  kind: VizijBundleGraphKind;
  spec: Record<string, unknown>;
  label?: string;
  metadata?: VizijBundleGraphMetadata;
  ir?: Record<string, unknown> | null;
}

export interface VizijPoseDefinition {
  id: VizijPoseId;
  name?: string;
  description?: string;
  group?: string | null;
  values: Record<string, number | undefined>;
}

export interface VizijPoseRigConfig {
  version: number;
  faceId?: string | null;
  title?: string;
  description?: string;
  neutralInputs: Record<string, number>;
  poses: VizijPoseDefinition[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VizijBundlePoseSection {
  config: VizijPoseRigConfig;
  metadata?: {
    hash?: string;
    exportedAt?: string;
    [key: string]: unknown;
  };
}

export interface VizijBundleAnimationKeyframe {
  time: number;
  value: number;
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut" | string;
  inTangent?: number | null;
  outTangent?: number | null;
  inHandle?: { x?: number; y?: number } | null;
  outHandle?: { x?: number; y?: number } | null;
  [key: string]: unknown;
}

export interface VizijBundleAnimationTrack {
  channel: string;
  keyframes: VizijBundleAnimationKeyframe[];
  interpolation?: "step" | "linear" | "cubic" | "spline" | string;
  [key: string]: unknown;
}

export interface VizijBundleAnimationClip {
  id: VizijAnimationId;
  name?: string;
  duration?: number;
  tracks: VizijBundleAnimationTrack[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VizijBundleAnimationEntry {
  id: VizijAnimationId;
  clip: VizijBundleAnimationClip;
  metadata?: {
    hash?: string;
    sampleRateHz?: number;
    rigGraphHash?: string;
    poseGraphHash?: string | null;
    bakedClipIndex?: number | null;
    tolerance?: number;
    exportedAt?: string;
    [key: string]: unknown;
  };
}

export interface VizijSpeechConfig {
  /** TTS voice name (e.g., "Ruth") */
  voice?: string;
  /** Speech mode */
  mode?: "echo" | "conversation";
  /** Agent name for LLM system prompt */
  agentName?: string;
  /** Custom system prompt (supports {{agent_name}} template) */
  systemPrompt?: string;
  /** Input path for avatar-speaking state (default: /speech/speaking) */
  speakingInputPath?: string;
  /** Input path for user-speaking state (default: /speech/user_speaking) */
  userSpeakingInputPath?: string;
  /** Input path for thinking state (default: /speech/thinking) */
  thinkingInputPath?: string;
  /** Pose group ID for viseme mapping */
  visemeGroupId?: string;
  /** Pose group ID for emotion mapping */
  emotionGroupId?: string;
  /** TTS API base URL */
  apiBaseUrl?: string;
  /** Auto-activate microphone when speech is ready (default: false) */
  autoActivateMic?: boolean;
}

export interface VizijBundleExtension {
  version: VizijBundleVersion;
  exportedAt?: string;
  graphs?: VizijBundleGraphEntry[];
  poses?: VizijBundlePoseSection | null;
  animations?: VizijBundleAnimationEntry[];
  /**
   * Bundle-level metadata. May include `speechConfig: VizijSpeechConfig`
   * for configuring the STT/LLM/TTS speech pipeline.
   */
  metadata?: Record<string, unknown>;
}
