import {
  AnimationClip,
  NumberKeyframeTrack,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";
import type { BakedTrackSpec } from "./bakeClip";

// `three`'s classes resolve as namespaces under this TS config, so instance
// types have to be derived rather than referenced directly.
type ThreeAnimationClip = InstanceType<typeof AnimationClip>;
type ThreeKeyframeTrack = InstanceType<typeof NumberKeyframeTrack>;
export type ThreeObject3DLike = {
  name: string;
  traverse: (callback: (child: ThreeObject3DLike) => void) => void;
  morphTargetDictionary?: Record<string, number>;
};

export interface ThreeClipValidationIssue {
  trackName: string;
  reason: "node-not-found" | "morph-target-not-found" | "bad-stride";
  detail?: string;
}

export interface ThreeClipBuildResult {
  clip: ThreeAnimationClip | null;
  /** Tracks omitted because they would not bind; never silently dropped. */
  issues: ThreeClipValidationIssue[];
}

function findByName(
  root: ThreeObject3DLike,
  name: string,
): ThreeObject3DLike | null {
  let found: ThreeObject3DLike | null = null;
  root.traverse((child) => {
    if (!found && child.name === name) {
      found = child;
    }
  });
  return found;
}

function parseMorphTargetName(trackName: string): string | null {
  const match = /\.morphTargetInfluences\[(.+)\]$/.exec(trackName);
  return match ? match[1]! : null;
}

/**
 * Builds a `THREE.AnimationClip` from baked track specs, validating every
 * binding first.
 *
 * `GLTFExporter` discards an entire clip when a single track fails to bind
 * (`processAnimation` warns and returns null), and throws outright when a
 * morph target name is missing from `morphTargetDictionary`. So bindings are
 * checked against the export root here and unbindable tracks are reported and
 * excluded, rather than handed over to fail as a whole.
 *
 * Tracks bind by **name**: `exportScene` clones the root when it is not a
 * `Scene`, which changes uuids and preserves names.
 */
export function toThreeAnimationClip(options: {
  name: string;
  duration: number;
  tracks: ReadonlyArray<BakedTrackSpec>;
  /** The object tree the clip will be exported against. */
  root: ThreeObject3DLike;
}): ThreeClipBuildResult {
  const { name, duration, tracks, root } = options;
  const issues: ThreeClipValidationIssue[] = [];
  const built: ThreeKeyframeTrack[] = [];

  for (const spec of tracks) {
    const node = findByName(root, spec.elementName);
    if (!node) {
      issues.push({
        trackName: spec.name,
        reason: "node-not-found",
        detail: spec.elementName,
      });
      continue;
    }

    if (spec.values.length !== spec.times.length * spec.stride) {
      issues.push({
        trackName: spec.name,
        reason: "bad-stride",
        detail: `${spec.values.length} values for ${spec.times.length} times at stride ${spec.stride}`,
      });
      continue;
    }

    if (spec.property === "morphTargetInfluences") {
      const morphName = parseMorphTargetName(spec.name);
      const dictionary = node.morphTargetDictionary;
      if (!morphName || !dictionary || !(morphName in dictionary)) {
        issues.push({
          trackName: spec.name,
          reason: "morph-target-not-found",
          detail: morphName ?? undefined,
        });
        continue;
      }
      built.push(new NumberKeyframeTrack(spec.name, spec.times, spec.values));
      continue;
    }

    if (spec.property === "quaternion") {
      built.push(
        new QuaternionKeyframeTrack(spec.name, spec.times, spec.values),
      );
      continue;
    }

    built.push(new VectorKeyframeTrack(spec.name, spec.times, spec.values));
  }

  if (built.length === 0) {
    return { clip: null, issues };
  }
  return { clip: new AnimationClip(name, duration, built), issues };
}
