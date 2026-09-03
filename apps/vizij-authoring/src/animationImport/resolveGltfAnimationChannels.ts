import { buildPropsRigInputPath } from "../rig/autoInputs";
import {
  expandChannelToScalarTargets,
  type GltfAnimationChannel,
  type GltfScalarChannelTarget,
} from "./gltfAnimationChannels";
import type { PropsRigTargetCatalog } from "./propsRigTargetCatalog";

/** glTF channel path -> Vizij feature key. */
const FEATURE_KEY_BY_CHANNEL_PATH = {
  translation: "translation",
  rotation: "rotation",
  scale: "scale",
} as const;

export type ChannelResolutionFailure =
  | "unnamed-node"
  | "no-morph-targets"
  | "no-matching-input";

export interface ResolvedScalarChannel {
  target: GltfScalarChannelTarget;
  /** Canonical propsrig input path this scalar curve drives. */
  propsRigPath: string;
}

export interface UnresolvedScalarChannel {
  target: GltfScalarChannelTarget;
  reason: ChannelResolutionFailure;
  /** Path that was attempted, when one could be built. */
  attemptedPath?: string;
}

export interface ChannelResolutionResult {
  resolved: ResolvedScalarChannel[];
  unresolved: UnresolvedScalarChannel[];
}

/**
 * Feature key a scalar target maps to, or null when it cannot be determined
 * (an unnamed morph, or a `weights` channel on a mesh with no target names).
 */
function resolveFeatureKey(target: GltfScalarChannelTarget): string | null {
  if (target.channel.path === "weights") {
    return target.morphFeatureKey ?? null;
  }
  return FEATURE_KEY_BY_CHANNEL_PATH[target.channel.path] ?? null;
}

/**
 * Resolves glTF animation channels onto Vizij propsrig input paths by name.
 *
 * The mapping is exact, not fuzzy: a glTF node name and the Vizij element name
 * must normalize to the same path segment, and a morph name must produce the
 * same feature key import produced. Both derivations go through the shared
 * helpers (`buildPropsRigInputPath`, `deriveMorphFeatureKeys`) so generation
 * and resolution cannot drift apart.
 *
 * Every input scalar appears in exactly one of `resolved` or `unresolved` —
 * nothing is dropped silently.
 */
export function resolveGltfAnimationChannels(options: {
  channels: ReadonlyArray<GltfAnimationChannel>;
  catalog: PropsRigTargetCatalog;
}): ChannelResolutionResult {
  const { channels, catalog } = options;
  const resolved: ResolvedScalarChannel[] = [];
  const unresolved: UnresolvedScalarChannel[] = [];

  for (const channel of channels) {
    if (!channel.nodeName) {
      // Without a node name there is nothing to match on. Report once for the
      // channel rather than per scalar it would have produced.
      unresolved.push({
        target: { channel, valueIndex: 0 },
        reason: "unnamed-node",
      });
      continue;
    }

    const scalarTargets = expandChannelToScalarTargets(channel);
    if (scalarTargets.length === 0) {
      unresolved.push({
        target: { channel, valueIndex: 0 },
        reason: "no-morph-targets",
      });
      continue;
    }

    for (const target of scalarTargets) {
      const featureKey = resolveFeatureKey(target);
      if (!featureKey) {
        unresolved.push({ target, reason: "no-morph-targets" });
        continue;
      }

      const propsRigPath = buildPropsRigInputPath({
        elementName: channel.nodeName,
        featureKey,
        component: target.component ?? null,
      });

      if (catalog.hasInputPath(propsRigPath)) {
        resolved.push({ target, propsRigPath });
      } else {
        unresolved.push({
          target,
          reason: "no-matching-input",
          attemptedPath: propsRigPath,
        });
      }
    }
  }

  return { resolved, unresolved };
}
