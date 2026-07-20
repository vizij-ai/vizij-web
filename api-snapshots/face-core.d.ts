/**
 * The Face Package schema — the `VIZIJ_bundle` payload embedded in a face
 * GLB (graphs, expressions/poses, animation clips, speech config, metadata).
 *
 * Moved verbatim from `@vizij/render/src/types/vizij-bundle.ts` per
 * docs/redesign/06-track-2-implementation.md §3.4(a): the schema is L1
 * vocabulary, so it lives in face-core and render imports it back. Pure type
 * declarations — no runtime code, no dependencies.
 */
type VizijBundleVersion = 1;
type VizijBundleGraphKind = "rig" | "pose" | "pose-driver" | "animation-bridge" | "low-level" | string;
type VizijPoseId = string;
type VizijAnimationId = string;
type VizijGraphId = string;
interface VizijBundleGraphMetadata {
    hash?: string;
    source?: string;
    kind?: VizijBundleGraphKind;
    exportedAt?: string;
    [key: string]: unknown;
}
interface VizijBundleGraphEntry {
    id: VizijGraphId;
    kind: VizijBundleGraphKind;
    spec: Record<string, unknown>;
    label?: string;
    metadata?: VizijBundleGraphMetadata;
    ir?: Record<string, unknown> | null;
}
interface VizijPoseDefinition {
    id: VizijPoseId;
    name?: string;
    description?: string;
    group?: string | null;
    values: Record<string, number | undefined>;
}
interface VizijPoseRigConfig {
    version: number;
    faceId?: string | null;
    title?: string;
    description?: string;
    neutralInputs: Record<string, number>;
    poses: VizijPoseDefinition[];
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}
interface VizijBundlePoseSection {
    config: VizijPoseRigConfig;
    metadata?: {
        hash?: string;
        exportedAt?: string;
        [key: string]: unknown;
    };
}
interface VizijBundleAnimationKeyframe {
    time: number;
    value: number;
    easing?: "linear" | "easeIn" | "easeOut" | "easeInOut" | string;
    inTangent?: number | null;
    outTangent?: number | null;
    [key: string]: unknown;
}
interface VizijBundleAnimationTrack {
    channel: string;
    keyframes: VizijBundleAnimationKeyframe[];
    interpolation?: "step" | "linear" | "cubic" | string;
    [key: string]: unknown;
}
interface VizijBundleAnimationClip {
    id: VizijAnimationId;
    name?: string;
    duration?: number;
    tracks: VizijBundleAnimationTrack[];
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}
interface VizijBundleAnimationEntry {
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
interface VizijSpeechConfig {
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
interface VizijBundleExtension {
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

/**
 * @vizij/face-core — headless, framework-agnostic face runtime (L1).
 *
 * Placeholder package: reserves the name, the release line, and the API
 * surface snapshot slot. The `FaceRuntime` controller extracted from
 * `@vizij/runtime-react` lands here — see
 * `docs/redesign/06-track-2-implementation.md` §3 for the plan.
 */
declare const FACE_CORE_PLACEHOLDER = true;

export { FACE_CORE_PLACEHOLDER, type VizijAnimationId, type VizijBundleAnimationClip, type VizijBundleAnimationEntry, type VizijBundleAnimationKeyframe, type VizijBundleAnimationTrack, type VizijBundleExtension, type VizijBundleGraphEntry, type VizijBundleGraphKind, type VizijBundleGraphMetadata, type VizijBundlePoseSection, type VizijBundleVersion, type VizijGraphId, type VizijPoseDefinition, type VizijPoseId, type VizijPoseRigConfig, type VizijSpeechConfig };
