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
  [key: string]: unknown;
}

export interface VizijBundleAnimationTrack {
  channel: string;
  keyframes: VizijBundleAnimationKeyframe[];
  interpolation?: "step" | "linear" | "cubic" | string;
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

export interface VizijBundleExtension {
  version: VizijBundleVersion;
  exportedAt?: string;
  graphs?: VizijBundleGraphEntry[];
  poses?: VizijBundlePoseSection | null;
  animations?: VizijBundleAnimationEntry[];
  metadata?: Record<string, unknown>;
}

export type VizijBundleCompatibilitySeverity = "info" | "warning" | "error";

export type VizijBundleCompatibilityDiagnosticCode =
  | "bundle-selected"
  | "bundle-candidate-ignored"
  | "unsupported-bundle-version"
  | "unsupported-bundle-variant"
  | "invalid-bundle-candidate"
  | "no-supported-bundle-candidate";

export interface VizijBundleCompatibilitySource {
  scope: "object" | "parser-node" | "parser-scene";
  index: number;
  alias: string;
  entryIndex: number;
}

export interface VizijBundleCompatibilityDiagnostic {
  code: VizijBundleCompatibilityDiagnosticCode;
  severity: VizijBundleCompatibilitySeverity;
  source: VizijBundleCompatibilitySource;
  message: string;
}

export interface VizijBundleCompatibilitySelection {
  source: VizijBundleCompatibilitySource;
}

export interface VizijBundleExtractionResult {
  bundle: VizijBundleExtension | null;
  selection: VizijBundleCompatibilitySelection | null;
  diagnostics: VizijBundleCompatibilityDiagnostic[];
}
