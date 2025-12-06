import type { StandardRigInput } from "./standard-inputs";

export type RigDriverKind = "remap" | "pose";

export type RigDriverSourceType =
  | "standard-input"
  | "custom-input"
  | "pose-weight"
  | "graph-node"
  | "unassigned";

export interface RigDriverSource {
  type: RigDriverSourceType;
  id: string;
  label?: string;
  path?: string;
}

export type RigDriverTargetType =
  | "animatable"
  | "rig-input"
  | "graph-node"
  | "pose-channel";

export interface RigDriverTarget {
  type: RigDriverTargetType;
  /**
   * Identifier for the target. Can be an animatable id, rig input id, or graph node id.
   */
  id: string;
  /**
   * Optional fully qualified typed path (e.g., `rig/robot/standard/mouth/pos/x`).
   */
  path?: string;
  /**
   * Optional component identifier when targeting a vector animatable.
   */
  component?: string;
  /**
   * Human-readable label for UIs.
   */
  label?: string;
}

export interface CenteredRemapTransform {
  type: "centered-remap";
  inLow: number;
  inAnchor: number;
  inHigh: number;
  outLow: number;
  outAnchor: number;
  outHigh: number;
}

export interface LinearRemapTransform {
  type: "linear-remap";
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
}

export interface PoseDeltaTransform {
  type: "pose-delta";
  neutral: number;
  value: number;
  delta: number;
}

export type RigDriverTransform =
  | CenteredRemapTransform
  | LinearRemapTransform
  | PoseDeltaTransform;

export interface RigDriverOutput {
  target: RigDriverTarget;
  transform: RigDriverTransform;
}

export interface RigDriver {
  id: string;
  kind: RigDriverKind;
  source: RigDriverSource;
  outputs: RigDriverOutput[];
  /**
   * Optional metadata bag to preserve app-specific context while we migrate builders.
   */
  metadata?: Record<string, unknown>;
}

export interface RigDriverGraph {
  faceId: string | null;
  namespace?: string;
  drivers: RigDriver[];
  /**
   * Optional list of standard inputs involved in the graph. This helps consumers present context without re-querying.
   */
  standardInputs?: StandardRigInput[];
  /**
   * Additional metadata that callers may want to stash alongside the driver model.
   */
  metadata?: Record<string, unknown>;
}
