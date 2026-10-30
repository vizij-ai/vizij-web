import {
  AnimationClip,
  NumberKeyframeTrack,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  type KeyframeTrack,
} from "three";

/** A glTF-animatable node property, under three.js's property name. */
export type ExportAnimationProperty =
  "position" | "quaternion" | "scale" | "morphTargetInfluences";

/** One node property's keys, to export as a glTF animation channel. */
export interface ExportAnimationTrack {
  /**
   * The property-binding path: `<node>.<property>`, or
   * `<node>.morphTargetInfluences[<morph target name>]`.
   */
  name: string;
  property: ExportAnimationProperty;
  /** The name of the node the track drives. */
  elementName: string;
  /** Key times, in seconds, ascending. */
  times: number[];
  /** Flattened key values, `times.length * stride` of them. */
  values: number[];
  /** Values per key: 3 for a position or scale, 4 for a quaternion, 1 for a morph weight. */
  stride: number;
}

export interface ExportAnimationIssue {
  trackName: string;
  reason: "node-not-found" | "morph-target-not-found" | "bad-stride";
  detail?: string;
}

/**
 * What a track binds against: the export root and its descendants, found by
 * name. The graph `buildSceneGraph` returns is one.
 */
export interface ExportAnimationRoot {
  name: string;
  traverse: (callback: (child: ExportAnimationRoot) => void) => void;
  morphTargetDictionary?: Record<string, number>;
}

export interface ExportAnimationResult {
  /** For `exportScene({ animations })`; `null` when no track binds. */
  animation: AnimationClip | null;
  /** The tracks left out, each with why. */
  issues: ExportAnimationIssue[];
}

function findByName(
  root: ExportAnimationRoot,
  name: string,
): ExportAnimationRoot | null {
  let found: ExportAnimationRoot | null = null;
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
 * An animation for `exportScene`, from baked tracks, each checked against the
 * tree it will be exported with.
 *
 * The exporter drops a whole animation when one track fails to bind, and
 * throws when a morph target name is missing from the mesh's
 * `morphTargetDictionary`. So each track is bound here first, by node name
 * (`exportScene` clones a root that is not a `Scene`, which keeps names and
 * changes uuids), and a track that would not bind is left out and reported.
 */
export function createExportAnimation(options: {
  name: string;
  /** In seconds. */
  duration: number;
  tracks: ReadonlyArray<ExportAnimationTrack>;
  /** The tree the animation will be exported with. */
  root: ExportAnimationRoot;
}): ExportAnimationResult {
  const { name, duration, tracks, root } = options;
  const issues: ExportAnimationIssue[] = [];
  const built: KeyframeTrack[] = [];

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
    return { animation: null, issues };
  }
  return { animation: new AnimationClip(name, duration, built), issues };
}
