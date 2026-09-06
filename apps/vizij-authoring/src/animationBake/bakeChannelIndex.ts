import { buildPropsRigInputPath } from "../rig/autoInputs";

/**
 * What the rig graph writes, and what to call it.
 *
 * The rig graph's output nodes do NOT write `propsrig/...` paths — they write
 * **animatable ids** (uuids), and for a vector feature they write one *joined
 * vector* at a single path rather than a scalar per component. Reading a real
 * exported bundle:
 *
 * ```text
 * [rig] outputs=95
 *    OUT "0a74c35b-5198-471f-8044-1bf8d8cffd77"
 *    OUT "44fdef3d-a85a-410f-a619-617f94e9a781"
 * ```
 *
 * So sampling has to record those ids, decode vectors, and map each component
 * back to its canonical channel name. `world` carries that mapping already:
 * each renderable's `features[featureKey].value` is the animatable id driving
 * it.
 */

/** One store path the graph writes, and the channel name of each component. */
export interface SampledOutputSpec {
  /** Store path to read — an animatable id for rig graph outputs. */
  path: string;
  /**
   * Canonical channel name per component, in component order. A vector
   * feature has three; a scalar feature has one.
   */
  channels: string[];
  /** For reporting only. */
  elementName: string;
  featureKey: string;
}

type RenderableLike = {
  name?: unknown;
  id?: unknown;
  features?: Record<string, { animated?: unknown; value?: unknown } | null>;
};

type AnimatableLike = {
  type?: unknown;
  default?: unknown;
};

const VECTOR_COMPONENTS = ["x", "y", "z"] as const;

/**
 * Whether an animatable's value is a vector, decided from its default.
 *
 * Read off the data rather than from the feature key: a feature named
 * `translation` is a vector on every rig we have, but the graph's `join` nodes
 * are what actually determine the written shape, and the default mirrors it.
 */
function isVectorAnimatable(animatable: AnimatableLike | undefined): boolean {
  const value = animatable?.default;
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return VECTOR_COMPONENTS.some((key) => typeof record[key] === "number");
}

/**
 * Map every animated feature in `world` to the store path the graph writes
 * for it and the canonical channel names of its components.
 *
 * `restrictToPaths`, when given, keeps only entries the graph actually
 * declares as outputs — so a feature marked animated in the world but not
 * wired in the exported graph is dropped rather than sampled as a dead path.
 */
export function buildBakeChannelIndex(options: {
  world: Record<string, RenderableLike>;
  animatables: Record<string, AnimatableLike>;
  restrictToPaths?: ReadonlySet<string>;
}): SampledOutputSpec[] {
  const { world, animatables, restrictToPaths } = options;
  const specs: SampledOutputSpec[] = [];
  const seen = new Set<string>();

  for (const renderable of Object.values(world)) {
    const elementName =
      (typeof renderable?.name === "string" && renderable.name) ||
      (typeof renderable?.id === "string" && renderable.id) ||
      "";
    if (!elementName || !renderable.features) {
      continue;
    }

    for (const [featureKey, feature] of Object.entries(renderable.features)) {
      if (!feature?.animated || typeof feature.value !== "string") {
        continue;
      }
      const animatableId = feature.value;
      if (seen.has(animatableId)) {
        continue;
      }
      if (restrictToPaths && !restrictToPaths.has(animatableId)) {
        continue;
      }
      seen.add(animatableId);

      const vector = isVectorAnimatable(animatables[animatableId]);
      const channels = vector
        ? VECTOR_COMPONENTS.map((component) =>
            buildPropsRigInputPath({ elementName, featureKey, component }),
          )
        : [buildPropsRigInputPath({ elementName, featureKey })];

      specs.push({ path: animatableId, channels, elementName, featureKey });
    }
  }

  return specs;
}
