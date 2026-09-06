import { Euler, Quaternion } from "three";
import type {
  AnimationClipIR,
  AnimationTrackIR,
} from "../types/animationClipIr";
import { sampleTrackAt, unionKeyTimes as unionTimes } from "./sampleTrack";
import type { BakeTargetElement, BakeTargetIndex } from "./bakeTargets";

/**
 * Baking an authored clip into native glTF animation channels.
 *
 * The output is a list of Three.js keyframe-track descriptions rather than
 * `THREE.KeyframeTrack` instances, so the whole transform stays pure and
 * testable; `toThreeAnimationClip` builds the real objects.
 *
 * Every `GLTFExporter` constraint documented in `docs/ANIMATION_INTEROP.md` is
 * enforced here rather than discovered at export time, because the exporter
 * fails loudly in some cases (a missing morph name throws) and silently in
 * others (one unbindable track discards the entire clip after a console
 * warning).
 */

/** glTF-animatable node properties, using Three's property names. */
export type BakedProperty =
  | "position"
  | "quaternion"
  | "scale"
  | "morphTargetInfluences";

export interface BakedTrackSpec {
  /** Three property-binding path, e.g. `L_Eye.scale`. */
  name: string;
  property: BakedProperty;
  /** Element the track drives, for reporting. */
  elementName: string;
  times: number[];
  /** Flattened values, length === times.length * stride. */
  values: number[];
  stride: number;
}

export type BakeSkipReason =
  | "material-channel"
  | "needs-graph-sampling"
  | "unknown-element"
  | "unknown-feature"
  | "detached"
  | "no-keyframes";

export interface BakeSkippedChannel {
  channel: string;
  reason: BakeSkipReason;
}

export type BakeLossy = "morph-cubic-to-linear" | "euler-to-quaternion";

export interface BakeReport {
  /** Channels that became glTF animation output. */
  bakedChannels: string[];
  /** Channels that could not, each with why. */
  skipped: BakeSkippedChannel[];
  /** Transforms applied that lose information. */
  lossy: BakeLossy[];
}

export interface BakeClipResult {
  tracks: BakedTrackSpec[];
  report: BakeReport;
}

/**
 * Material features are drivable in Vizij but have no glTF animation channel.
 * Listed explicitly so a new feature key is reported as `unknown-feature`
 * rather than silently assumed to be bakeable.
 */
const MATERIAL_FEATURES = new Set([
  "color",
  "opacity",
  "roughness",
  "metalness",
  "emissive",
  "emissiveintensity",
  "shininess",
  "specular",
]);

const TRANSFORM_FEATURES: Record<string, BakedProperty> = {
  translation: "position",
  rotation: "quaternion",
  scale: "scale",
};

const COMPONENT_INDEX: Record<string, number> = { x: 0, y: 1, z: 2 };

interface ParsedChannel {
  segment: string;
  feature: string;
  component: string;
}

function parsePropsRigChannel(channel: string): ParsedChannel | null {
  const parts = channel.replace(/^\/+/, "").split("/");
  if (parts.length !== 4 || parts[0] !== "propsrig") {
    return null;
  }
  return { segment: parts[1]!, feature: parts[2]!, component: parts[3]! };
}

interface ChannelGroup {
  element: BakeTargetElement;
  property: BakedProperty;
  /** Vector component index, or morph target index, → track. */
  byIndex: Map<number, AnimationTrackIR>;
  channels: string[];
}

/**
 * Groups a clip's per-component scalar tracks into glTF channels.
 *
 * Vizij tracks are scalar-per-track while glTF animates a whole vector per
 * key, so this is where the recombination happens — and where a channel is
 * rejected if its target cannot be resolved.
 */
function groupTracks(
  clip: AnimationClipIR,
  index: BakeTargetIndex,
  skipped: BakeSkippedChannel[],
): Map<string, ChannelGroup> {
  const groups = new Map<string, ChannelGroup>();

  for (const track of clip.tracks) {
    const channel = track.channel;
    if (track.detached) {
      skipped.push({ channel, reason: "detached" });
      continue;
    }
    if (track.keyframes.length === 0) {
      skipped.push({ channel, reason: "no-keyframes" });
      continue;
    }

    const parsed = parsePropsRigChannel(channel);
    if (!parsed) {
      // Abstract rig inputs and pose weights live above the node layer; they
      // only become node motion once the rig/pose graphs run.
      skipped.push({ channel, reason: "needs-graph-sampling" });
      continue;
    }

    const element = index.bySegment.get(parsed.segment);
    if (!element) {
      skipped.push({ channel, reason: "unknown-element" });
      continue;
    }

    const property = TRANSFORM_FEATURES[parsed.feature];
    if (property) {
      const componentIndex = COMPONENT_INDEX[parsed.component];
      if (componentIndex === undefined) {
        skipped.push({ channel, reason: "unknown-feature" });
        continue;
      }
      const key = `${parsed.segment}|${property}`;
      const group = groups.get(key) ?? {
        element,
        property,
        byIndex: new Map<number, AnimationTrackIR>(),
        channels: [],
      };
      group.byIndex.set(componentIndex, track);
      group.channels.push(channel);
      groups.set(key, group);
      continue;
    }

    if (MATERIAL_FEATURES.has(parsed.feature.toLowerCase())) {
      skipped.push({ channel, reason: "material-channel" });
      continue;
    }

    const morphIndex = element.morphFeatureKeys.indexOf(parsed.feature);
    if (morphIndex < 0) {
      skipped.push({ channel, reason: "unknown-feature" });
      continue;
    }
    const key = `${parsed.segment}|morphTargetInfluences|${parsed.feature}`;
    groups.set(key, {
      element,
      property: "morphTargetInfluences",
      byIndex: new Map([[morphIndex, track]]),
      channels: [channel],
    });
  }

  return groups;
}

/**
 * Bakes a clip's node-level channels into glTF-shaped keyframe tracks.
 *
 * Channels that cannot be expressed in glTF — material features, and anything
 * above the node layer that needs graph sampling — are reported in
 * `report.skipped` rather than dropped quietly.
 */
export function bakeClipToTrackSpecs(options: {
  clip: AnimationClipIR;
  targets: BakeTargetIndex;
}): BakeClipResult {
  const { clip, targets } = options;
  const skipped: BakeSkippedChannel[] = [];
  const groups = groupTracks(clip, targets, skipped);

  const tracks: BakedTrackSpec[] = [];
  const bakedChannels: string[] = [];
  const lossy = new Set<BakeLossy>();

  for (const group of groups.values()) {
    const contributing = [...group.byIndex.values()];
    const times = unionTimes(contributing);
    if (times.length === 0) {
      continue;
    }

    if (group.property === "morphTargetInfluences") {
      const [track] = contributing;
      const usesCubic =
        track!.interpolation === "cubic" ||
        track!.keyframes.some((keyframe) => keyframe.interpolation === "cubic");
      if (usesCubic) {
        // GLTFExporter's mergeMorphTargetTracks throws outright on
        // CUBICSPLINE morph tracks, so cubic morphs are resampled to linear
        // through the same key times.
        lossy.add("morph-cubic-to-linear");
      }
      const featureKey = parsePropsRigChannel(group.channels[0]!)!.feature;
      tracks.push({
        // Addressed by morph feature key: that is how the renderer keys
        // morphTargetDictionary, and what the exporter looks up.
        name: `${group.element.elementName}.morphTargetInfluences[${featureKey}]`,
        property: "morphTargetInfluences",
        elementName: group.element.elementName,
        times,
        values: times.map((time) => sampleTrackAt(track!, time)),
        stride: 1,
      });
      bakedChannels.push(...group.channels);
      continue;
    }

    // Vector channels carry every component per key, so un-animated ones are
    // held at the element's current value rather than left at zero.
    const rest =
      group.property === "position"
        ? group.element.translation
        : group.property === "scale"
          ? group.element.scale
          : group.element.rotationEuler;

    const componentAt = (componentIndex: number, time: number): number => {
      const track = group.byIndex.get(componentIndex);
      return track ? sampleTrackAt(track, time) : rest[componentIndex]!;
    };

    if (group.property === "quaternion") {
      lossy.add("euler-to-quaternion");
      const values: number[] = [];
      const quaternion = new Quaternion();
      const euler = new Euler();
      for (const time of times) {
        euler.set(
          componentAt(0, time),
          componentAt(1, time),
          componentAt(2, time),
          "ZYX",
        );
        quaternion.setFromEuler(euler);
        values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      }
      tracks.push({
        name: `${group.element.elementName}.quaternion`,
        property: "quaternion",
        elementName: group.element.elementName,
        times,
        values,
        stride: 4,
      });
      bakedChannels.push(...group.channels);
      continue;
    }

    const values: number[] = [];
    for (const time of times) {
      values.push(
        componentAt(0, time),
        componentAt(1, time),
        componentAt(2, time),
      );
    }
    tracks.push({
      name: `${group.element.elementName}.${group.property}`,
      property: group.property,
      elementName: group.element.elementName,
      times,
      values,
      stride: 3,
    });
    bakedChannels.push(...group.channels);
  }

  tracks.sort((left, right) => left.name.localeCompare(right.name));
  bakedChannels.sort();
  skipped.sort((left, right) => left.channel.localeCompare(right.channel));

  return {
    tracks,
    report: { bakedChannels, skipped, lossy: [...lossy].sort() },
  };
}
