import type { AnimationClip, KeyframeTrack } from "three";
import { cloneDeepSafe } from "@vizij/utils";
import type {
  VizijAnimationClipData,
  VizijAnimationTrackData,
} from "../../types/animations";

type PlainObject = Record<string, unknown>;

interface RobotFeatureInfo {
  feature: string;
  componentId: string;
  valueType?: string;
}

function extractComponentValues(
  allValues: number[],
  numComponents: number,
  componentIndex: number,
): number[] {
  const result: number[] = [];
  for (let i = 0; i < allValues.length / numComponents; i++) {
    result.push(allValues[i * numComponents + componentIndex]);
  }
  return result;
}

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "number" ? v : Number(v)));
  }
  if (
    value &&
    typeof value === "object" &&
    "buffer" in (value as any) &&
    typeof (value as any).length === "number"
  ) {
    // Typed array
    return Array.from(value as any);
  }
  return [];
}

interface RenderableLike {
  renderableId: string;
  nodeName?: string;
  features: Record<string, RobotFeatureInfo>;
}

interface RobotNodeInfo {
  renderableId: string;
  nodeName?: string;
  features: Record<string, RobotFeatureInfo>;
}

interface ChannelComponentInfo {
  component?: string;
  componentIndex?: number;
}

const CHANNEL_PATH_TO_TRACK_PROPERTY: Record<string, string> = {
  translation: "position",
  rotation: "quaternion",
  scale: "scale",
  weights: "morphTargetInfluences",
};

function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]",
  );
}

function clonePlainObject<T extends PlainObject>(
  value: T | undefined,
): T | undefined {
  if (!value) {
    return undefined;
  }
  return cloneDeepSafe(value);
}

function inferValueSize(valueType: string | undefined): number {
  switch (valueType) {
    case "boolean":
    case "number":
    case "string":
      return 1;
    case "vector2":
      return 2;
    case "vector3":
    case "euler":
    case "rgb":
    case "hsl":
      return 3;
    case "vector4":
    case "quaternion":
      return 4;
    default:
      return 1;
  }
}

function componentNameToIndex(component?: string): number | undefined {
  if (!component || typeof component !== "string") {
    return undefined;
  }
  const normalized = component.trim().toLowerCase();
  if (normalized.length === 0) {
    return undefined;
  }
  const componentOrder: Record<string, number> = {
    x: 0,
    y: 1,
    z: 2,
    w: 3,
    r: 0,
    g: 1,
    b: 2,
    a: 3,
    u: 0,
    v: 1,
  };
  return componentOrder[normalized];
}

function readComponentInfo(target: unknown): ChannelComponentInfo {
  if (!target || typeof target !== "object") {
    return {};
  }
  const sources: unknown[] = [];
  const record = target as Record<string, unknown>;
  const extensions = (record as any).extensions;
  if (extensions && typeof extensions === "object") {
    const vizijChannel = (extensions as any).VizijChannel;
    if (isPlainObject(vizijChannel)) {
      sources.push(vizijChannel);
    }
    const robotChannel = (extensions as any).RobotChannel;
    if (isPlainObject(robotChannel)) {
      sources.push(robotChannel);
    }
  }
  const extras = (record as any).extras;
  if (isPlainObject(extras)) {
    sources.push(extras);
  }

  let component: string | undefined;
  let componentIndex: number | undefined;

  for (const source of sources) {
    if (!isPlainObject(source)) {
      continue;
    }
    if (typeof source.component === "string" && !component) {
      component = source.component;
    }
    if (typeof source.axis === "string" && !component) {
      component = source.axis;
    }
    if (typeof source.channel === "string" && !component) {
      component = source.channel;
    }
    if (
      Object.prototype.hasOwnProperty.call(source, "componentIndex") &&
      componentIndex == null
    ) {
      const value = (source as PlainObject).componentIndex;
      if (typeof value === "number") {
        componentIndex = value;
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(source, "axisIndex") &&
      componentIndex == null
    ) {
      const value = (source as PlainObject).axisIndex;
      if (typeof value === "number") {
        componentIndex = value;
      }
    }
  }

  if (componentIndex == null) {
    componentIndex = componentNameToIndex(component);
  }

  return { component, componentIndex };
}

function resolveRobotNodeIndex(
  parserJson: unknown,
): Map<number, RobotNodeInfo> {
  const indexMap = new Map<number, RobotNodeInfo>();
  if (!parserJson || typeof parserJson !== "object") {
    return indexMap;
  }
  const json = parserJson as Record<string, unknown>;
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  nodes.forEach((node, nodeIndex) => {
    if (!node || typeof node !== "object") {
      return;
    }
    const extensions = (node as any).extensions;
    const robotData = extensions?.RobotData;
    let renderableId: string | undefined;
    const features: Record<string, RobotFeatureInfo> = {};
    const nodeName =
      typeof (node as any).name === "string" && (node as any).name.length > 0
        ? ((node as any).name as string)
        : undefined;

    if (robotData && typeof robotData === "object") {
      renderableId = typeof robotData.id === "string" ? robotData.id : undefined;
      const robotFeatures = (robotData as any).features;
      if (robotFeatures && typeof robotFeatures === "object") {
        Object.entries(robotFeatures as Record<string, unknown>).forEach(
          ([featureKey, featureValue]) => {
            if (
              !featureValue ||
              typeof featureValue !== "object" ||
              !(featureValue as any).animated
            ) {
              return;
            }
            const value = (featureValue as any).value;
            const componentId =
              value && typeof value === "object" && typeof value.id === "string"
                ? (value.id as string)
                : undefined;
            if (!componentId) {
              return;
            }
            const valueType =
              value && typeof value === "object" && typeof value.type === "string"
                ? (value.type as string)
                : undefined;
            features[featureKey] = {
              feature: featureKey,
              componentId,
              valueType,
            };
          },
        );
      }
    } else {
      // Fallback for standard nodes: use node name as ID and provide default features
      // Align with importGroup/importMesh which uses group.name || group.uuid
      // Since we don't have UUIDs here, we use nodeIndex as a secondary fallback.
      renderableId = nodeName || `fallback:${nodeIndex}`;

      features.translation = {
        feature: "translation",
        componentId: `${renderableId}:translation`,
        valueType: "vector3",
      };
      features.rotation = {
        feature: "rotation",
        componentId: `${renderableId}:rotation`,
        valueType: "euler",
      };
      features.scale = {
        feature: "scale",
        componentId: `${renderableId}:scale`,
        valueType: "vector3",
      };

      // Handle morph targets if this node has a mesh
      const meshIndex = (node as any).mesh;
      if (typeof meshIndex === "number") {
        const gltfMeshes = (parserJson as any).meshes || [];
        const mesh = gltfMeshes[meshIndex];
        if (mesh) {
          const targetNames = mesh.extras?.targetNames || [];
          const weights = mesh.weights || [];
          const targetCount = Math.max(targetNames.length, weights.length);

          if (targetCount > 0) {
            for (let i = 0; i < targetCount; i++) {
              const name = targetNames[i] || `morph_${i + 1}`;
              // Sanitize to match import-geometry.ts logic (simplified)
              const safeName = name.toLowerCase().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || `morph_${i + 1}`;
              features[`weights:${i}`] = {
                feature: safeName,
                componentId: `${renderableId}:${safeName}`,
                valueType: "number",
              };
            }
          }
        }
      }
    }

    if (renderableId) {
      indexMap.set(nodeIndex, {
        renderableId,
        nodeName,
        features,
      });
    }
  });

  return indexMap;
}

function mapChannelPathToProperty(path: unknown): string | undefined {
  if (typeof path !== "string") {
    return undefined;
  }
  return CHANNEL_PATH_TO_TRACK_PROPERTY[path] ?? path;
}

function resolveFeatureKey(channelTarget: unknown): string | undefined {
  if (!channelTarget || typeof channelTarget !== "object") {
    return undefined;
  }
  const target = channelTarget as Record<string, unknown>;
  const extensions = (target as any).extensions;
  if (extensions && typeof extensions === "object") {
    const vizij = (extensions as any).VizijChannel;
    if (isPlainObject(vizij)) {
      const feature = (vizij as PlainObject).feature;
      if (typeof feature === "string") {
        return feature;
      }
    }
    const robot = (extensions as any).RobotChannel;
    if (isPlainObject(robot)) {
      const feature = (robot as PlainObject).feature;
      if (typeof feature === "string") {
        return feature;
      }
    }
  }
  const extras = (target as any).extras;
  if (isPlainObject(extras)) {
    const feature = (extras as PlainObject).feature;
    if (typeof feature === "string") {
      return feature;
    }
    const channel = (extras as PlainObject).channel;
    if (typeof channel === "string") {
      return channel;
    }
  }
  const path = target.path;
  return typeof path === "string" ? path : undefined;
}

function resolveTrackForChannel(
  clip: AnimationClip | undefined,
  channelIndex: number,
  expectedProperty: string | undefined,
  nodeName: string | undefined,
): KeyframeTrack | undefined {
  if (!clip) {
    return undefined;
  }
  const orderedTrack = clip.tracks[channelIndex];
  if (orderedTrack) {
    return orderedTrack;
  }
  if (!expectedProperty) {
    return undefined;
  }
  const property = expectedProperty;

  const matches = (track: KeyframeTrack) => {
    const name = track?.name ?? "";
    if (!name) {
      return false;
    }
    if (nodeName && name === `${nodeName}.${property}`) {
      return true;
    }
    if (
      nodeName &&
      name.startsWith(`${nodeName}.`) &&
      name.endsWith(property)
    ) {
      return true;
    }
    if (!nodeName && name.endsWith(property)) {
      return true;
    }
    return false;
  };

  return clip.tracks.find(matches);
}

function resolveClipDuration(
  clip: AnimationClip | undefined,
  tracks: VizijAnimationTrackData[],
): number {
  if (clip && Number.isFinite(clip.duration) && clip.duration >= 0) {
    return clip.duration;
  }
  let maxTime = 0;
  tracks.forEach((track) => {
    if (!track.times.length) {
      return;
    }
    const lastTime = track.times[track.times.length - 1] ?? 0;
    if (lastTime > maxTime) {
      maxTime = lastTime;
    }
  });
  return maxTime;
}

function resolveClipId(
  animation: PlainObject,
  clip: AnimationClip | undefined,
  index: number,
): string {
  if (typeof animation.name === "string" && animation.name.length > 0) {
    return animation.name;
  }
  if (clip?.name && clip.name.length > 0) {
    return clip.name;
  }
  return `gltf-animation-${index}`;
}

export function extractVizijAnimations(
  parserJson: unknown,
  clips?: AnimationClip[],
): VizijAnimationClipData[] {
  const animations: VizijAnimationClipData[] = [];

  if (!parserJson || typeof parserJson !== "object") {
    return animations;
  }

  const robotNodeIndex = resolveRobotNodeIndex(parserJson);
  if (robotNodeIndex.size === 0) {
    console.warn("[vizij-render] extractVizijAnimations: No robot nodes found in parserJson. Map size: 0");
    return animations;
  }

  const json = parserJson as Record<string, unknown>;
  const gltfAnimations = Array.isArray(json.animations) ? json.animations : [];
  if (gltfAnimations.length === 0) {
    console.warn("[vizij-render] extractVizijAnimations: No animations found in parserJson.animations");
    return animations;
  }

  gltfAnimations.forEach((animation, animationIndex) => {
    if (!animation || typeof animation !== "object") {
      return;
    }
    const animationRecord = animation as PlainObject;
    const channels = Array.isArray(animationRecord.channels)
      ? animationRecord.channels
      : [];
    if (channels.length === 0) {
      return;
    }

    const samplers = Array.isArray(animationRecord.samplers)
      ? animationRecord.samplers
      : [];
    const clip = Array.isArray(clips) ? clips[animationIndex] : undefined;

    const trackData: VizijAnimationTrackData[] = [];

    channels.forEach((channel, channelIndex) => {
      if (!channel || typeof channel !== "object") {
        return;
      }
      const channelRecord = channel as PlainObject;
      const target = channelRecord.target;
      const nodeIndex =
        target &&
          typeof target === "object" &&
          typeof (target as any).node === "number"
          ? ((target as any).node as number)
          : undefined;
      if (nodeIndex == null || !robotNodeIndex.has(nodeIndex)) {
        return;
      }

      const robotNode = robotNodeIndex.get(nodeIndex)!;
      const featureKey = resolveFeatureKey(target);
      if (!featureKey) {
        return;
      }
      const featureInfo = robotNode.features[featureKey];
      if (!featureInfo) {
        return;
      }

      const propertyName = mapChannelPathToProperty(
        target && typeof target === "object"
          ? ((target as any).path as unknown)
          : undefined,
      );
      const track = resolveTrackForChannel(
        clip,
        channelIndex,
        propertyName,
        robotNode.nodeName,
      );
      if (!track) {
        return;
      }

      const samplerIndex =
        typeof channelRecord.sampler === "number" ? channelRecord.sampler : -1;
      const sampler =
        samplerIndex >= 0 && samplerIndex < samplers.length
          ? (samplers[samplerIndex] as PlainObject | undefined)
          : undefined;
      const interpolation =
        sampler && typeof sampler.interpolation === "string"
          ? (sampler.interpolation as string)
          : undefined;

      // Special handling for weights (morph targets) which can contain multiple components
      if (propertyName === "morphTargetInfluences") {
        const numTargets = track.getValueSize();
        for (let i = 0; i < numTargets; i++) {
          const weightFeature = robotNode.features[`weights:${i}`];
          if (!weightFeature) continue;

          trackData.push({
            componentId: weightFeature.componentId,
            feature: weightFeature.feature,
            renderableId: robotNode.renderableId,
            nodeIndex,
            nodeName: robotNode.nodeName,
            path: "weights",
            componentIndex: i,
            valueType: "number",
            valueSize: 1,
            interpolation,
            times: toNumberArray(track.times),
            values: extractComponentValues(toNumberArray((track as any).values), numTargets, i),
          });
        }
      } else {
        let valueSize =
          typeof track.getValueSize === "function"
            ? track.getValueSize()
            : inferValueSize(featureInfo.valueType);
        if (!Number.isFinite(valueSize) || valueSize <= 0) {
          valueSize = inferValueSize(featureInfo.valueType);
        }

        const { component, componentIndex } = readComponentInfo(target);

        trackData.push({
          componentId: featureInfo.componentId,
          feature: featureInfo.feature,
          renderableId: robotNode.renderableId,
          nodeIndex,
          nodeName: robotNode.nodeName,
          path:
            target &&
              typeof target === "object" &&
              typeof (target as any).path === "string"
              ? ((target as any).path as string)
              : undefined,
          component,
          componentIndex,
          valueType: featureInfo.valueType,
          valueSize,
          interpolation,
          times: toNumberArray(track.times),
          values: toNumberArray((track as any).values),
        });
      }
    });

    if (trackData.length === 0) {
      return;
    }

    animations.push({
      id: resolveClipId(animationRecord, clip, animationIndex),
      name:
        typeof animationRecord.name === "string" &&
          animationRecord.name.length > 0
          ? (animationRecord.name as string)
          : clip?.name,
      duration: resolveClipDuration(clip, trackData),
      index: animationIndex,
      metadata: clonePlainObject(
        animationRecord.extras as PlainObject | undefined,
      ),
      tracks: trackData,
    });
  });

  return animations;
}
