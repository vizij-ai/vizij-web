import type { StandardRigInput } from "@vizij/utils";
import type {
  VizijBundleAnimationEntry,
  VizijBundleGraphEntry,
} from "../types";
import type { AnimationClipIR } from "../types/animationClipIr";
import {
  bundleAnimationEntryToClipIr,
  type BundleAnimationToClipOptions,
} from "./animationClipCompiler";
import { specToEditorState } from "./motionGraphEditor";
import type {
  MotionGraphEditorEdge,
  MotionGraphEditorNode,
} from "./motionGraphSpec";

export const BUNDLE_ANIMATION_TARGET_PREFIX = "bundle-animation:";
export const BUNDLE_PROCEDURAL_TARGET_PREFIX = "bundle-procedural:";

export interface ImportedBundleTargetOption {
  value: string;
  label: string;
}

export interface ImportedBundleProgramSnapshot {
  nodes: MotionGraphEditorNode[];
  edges: MotionGraphEditorEdge[];
  enabledOutputs: string[];
  enabledInputs: string[];
  customInputPaths: string[];
}

export function bundleTargetValue(
  prefix: string,
  bundleSessionKey: string,
  index: number,
): string {
  return `${prefix}${bundleSessionKey}:${index}`;
}

function parseBundleTargetIndex(
  targetId: string,
  prefix: string,
): number | null {
  if (!targetId.startsWith(prefix)) {
    return null;
  }
  const raw = targetId.slice(prefix.length);
  const rawIndex = raw.split(":").pop() ?? raw;
  const index = Number.parseInt(rawIndex, 10);
  return Number.isFinite(index) && index >= 0 ? index : null;
}

export function isImportedBundleAnimationTargetId(targetId: string): boolean {
  return targetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX);
}

export function isImportedBundleProgramTargetId(targetId: string): boolean {
  return targetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX);
}

export function parseImportedBundleAnimationTargetIndex(
  targetId: string,
): number | null {
  return parseBundleTargetIndex(targetId, BUNDLE_ANIMATION_TARGET_PREFIX);
}

export function parseImportedBundleProgramTargetIndex(
  targetId: string,
): number | null {
  return parseBundleTargetIndex(targetId, BUNDLE_PROCEDURAL_TARGET_PREFIX);
}

export function filterImportedBundleProgramEntries(
  entries: readonly VizijBundleGraphEntry[] | null | undefined,
): VizijBundleGraphEntry[] {
  return (entries ?? []).filter(
    (entry) => entry.kind?.toLowerCase?.() === "motiongraph",
  );
}

export interface BuildImportedBundleAnimationTargetsOptions {
  bundleSessionKey: string;
  entries: readonly VizijBundleAnimationEntry[] | null | undefined;
  nameOverrides?: Readonly<Record<string, string | undefined>>;
  hiddenTargetIds?: Readonly<Record<string, boolean | undefined>>;
}

export function buildImportedBundleAnimationTargets({
  bundleSessionKey,
  entries,
  nameOverrides = {},
  hiddenTargetIds = {},
}: BuildImportedBundleAnimationTargetsOptions): ImportedBundleTargetOption[] {
  return (entries ?? [])
    .map((entry, index) => {
      const targetValue = bundleTargetValue(
        BUNDLE_ANIMATION_TARGET_PREFIX,
        bundleSessionKey,
        index,
      );
      const clipName =
        typeof entry.clip?.name === "string" ? entry.clip.name.trim() : "";
      const fallbackName =
        entry.id?.trim() || `Imported Animation ${index + 1}`;
      const baseLabel = clipName || fallbackName;
      return {
        value: targetValue,
        label: nameOverrides[targetValue] ?? baseLabel,
      };
    })
    .filter((option) => !hiddenTargetIds[option.value]);
}

export interface BuildImportedBundleProgramTargetsOptions {
  bundleSessionKey: string;
  entries: readonly VizijBundleGraphEntry[] | null | undefined;
  nameOverrides?: Readonly<Record<string, string | undefined>>;
  hiddenTargetIds?: Readonly<Record<string, boolean | undefined>>;
}

export function buildImportedBundleProgramTargets({
  bundleSessionKey,
  entries,
  nameOverrides = {},
  hiddenTargetIds = {},
}: BuildImportedBundleProgramTargetsOptions): ImportedBundleTargetOption[] {
  return (entries ?? [])
    .map((entry, index) => {
      const targetValue = bundleTargetValue(
        BUNDLE_PROCEDURAL_TARGET_PREFIX,
        bundleSessionKey,
        index,
      );
      const metadataLabel =
        typeof entry.label === "string" ? entry.label.trim() : "";
      const metadataId = typeof entry.id === "string" ? entry.id.trim() : "";
      const baseLabel =
        metadataLabel || metadataId || `Imported Program ${index + 1}`;
      return {
        value: targetValue,
        label: nameOverrides[targetValue] ?? baseLabel,
      };
    })
    .filter((option) => !hiddenTargetIds[option.value]);
}

export interface ResolveImportedBundleAnimationEntryOptions {
  targetId: string;
  entries: readonly VizijBundleAnimationEntry[] | null | undefined;
}

export function resolveImportedBundleAnimationEntry({
  targetId,
  entries,
}: ResolveImportedBundleAnimationEntryOptions): VizijBundleAnimationEntry | null {
  const index = parseImportedBundleAnimationTargetIndex(targetId);
  if (index === null) {
    return null;
  }
  return entries?.[index] ?? null;
}

export interface ResolveImportedBundleAnimationBaseClipOptions
  extends ResolveImportedBundleAnimationEntryOptions {
  standardInputsById?: ReadonlyMap<string, StandardRigInput>;
  nameOverrides?: Readonly<Record<string, string | undefined>>;
  durationOverrides?: Readonly<Record<string, number | undefined>>;
}

export function resolveImportedBundleAnimationBaseClip({
  targetId,
  entries,
  standardInputsById,
  nameOverrides = {},
  durationOverrides = {},
}: ResolveImportedBundleAnimationBaseClipOptions): AnimationClipIR | null {
  const entry = resolveImportedBundleAnimationEntry({ targetId, entries });
  if (!entry) {
    return null;
  }
  const clip = bundleAnimationEntryToClipIr(entry, {
    standardInputsById,
  } satisfies BundleAnimationToClipOptions);
  if (!clip) {
    return null;
  }
  const overriddenName = nameOverrides[targetId]?.trim();
  const overriddenDuration = durationOverrides[targetId];
  return {
    ...clip,
    name:
      overriddenName && overriddenName.length > 0 ? overriddenName : clip.name,
    duration:
      typeof overriddenDuration === "number" &&
      Number.isFinite(overriddenDuration)
        ? overriddenDuration
        : clip.duration,
  };
}

export interface ResolveImportedBundleAnimationClipOptions
  extends ResolveImportedBundleAnimationBaseClipOptions {
  clipOverrides?: Readonly<Record<string, AnimationClipIR | undefined>>;
}

export function resolveImportedBundleAnimationClip({
  targetId,
  entries,
  standardInputsById,
  nameOverrides = {},
  durationOverrides = {},
  clipOverrides = {},
}: ResolveImportedBundleAnimationClipOptions): AnimationClipIR | null {
  const baseClip = resolveImportedBundleAnimationBaseClip({
    targetId,
    entries,
    standardInputsById,
    nameOverrides,
    durationOverrides,
  });
  if (!baseClip) {
    return null;
  }
  const override = clipOverrides[targetId];
  const clip = override ? structuredClone(override) : baseClip;
  const overriddenName = nameOverrides[targetId]?.trim();
  const overriddenDuration = durationOverrides[targetId];
  return {
    ...clip,
    name:
      overriddenName && overriddenName.length > 0 ? overriddenName : clip.name,
    duration:
      typeof overriddenDuration === "number" &&
      Number.isFinite(overriddenDuration)
        ? overriddenDuration
        : clip.duration,
  };
}

export interface ResolveImportedBundleProgramEntryOptions {
  targetId: string;
  entries: readonly VizijBundleGraphEntry[] | null | undefined;
}

export function resolveImportedBundleProgramEntry({
  targetId,
  entries,
}: ResolveImportedBundleProgramEntryOptions): VizijBundleGraphEntry | null {
  const index = parseImportedBundleProgramTargetIndex(targetId);
  if (index === null) {
    return null;
  }
  return entries?.[index] ?? null;
}

export type ResolveImportedBundleProgramBaseSnapshotOptions =
  ResolveImportedBundleProgramEntryOptions;

export function resolveImportedBundleProgramBaseSnapshot({
  targetId,
  entries,
}: ResolveImportedBundleProgramBaseSnapshotOptions): ImportedBundleProgramSnapshot | null {
  const entry = resolveImportedBundleProgramEntry({ targetId, entries });
  if (!entry?.spec || typeof entry.spec !== "object") {
    return null;
  }
  const parsed = specToEditorState(entry.spec as Record<string, unknown>);
  return {
    nodes: parsed.nodes,
    edges: parsed.edges,
    enabledOutputs: Array.from(parsed.enabledOutputs),
    enabledInputs: Array.from(parsed.enabledInputs),
    customInputPaths: [...parsed.customInputPaths],
  };
}

export interface ResolveImportedBundleProgramSnapshotOptions
  extends ResolveImportedBundleProgramBaseSnapshotOptions {
  snapshotOverrides?: Readonly<
    Record<string, ImportedBundleProgramSnapshot | undefined>
  >;
}

export function resolveImportedBundleProgramSnapshot({
  targetId,
  entries,
  snapshotOverrides = {},
}: ResolveImportedBundleProgramSnapshotOptions): ImportedBundleProgramSnapshot | null {
  const override = snapshotOverrides[targetId];
  if (override) {
    return structuredClone(override);
  }
  return resolveImportedBundleProgramBaseSnapshot({ targetId, entries });
}
