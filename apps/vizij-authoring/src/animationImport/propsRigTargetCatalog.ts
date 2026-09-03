import { buildPropsRigInputPath } from "../rig/autoInputs";
import type { GltfJsonLike } from "./gltfAnimationChannels";

/**
 * The only thing channel resolution needs from the target face: whether a
 * propsrig input path exists.
 *
 * Two implementations exist by design. `buildCatalogFromRobotData` reads a
 * GLB's `RobotData` extension and is what the corpus regression test uses;
 * the live authoring surface builds one from managed standard inputs. Keeping
 * the resolver behind this interface means it never depends on which.
 */
export interface PropsRigTargetCatalog {
  hasInputPath: (path: string) => boolean;
  readonly size: number;
}

interface RobotDataFeatureLike {
  animated?: unknown;
  value?: { type?: unknown } | null;
}

interface RobotDataLike {
  id?: unknown;
  name?: unknown;
  features?: Record<string, RobotDataFeatureLike | null> | null;
}

/**
 * Component sets per animatable value type, mirroring the vector descriptors
 * `buildFeatureEntries` produces. Only types that can carry an imported
 * animation channel are listed; anything else is treated as scalar.
 */
const COMPONENTS_BY_TYPE: Record<string, ReadonlyArray<"x" | "y" | "z">> = {
  vector3: ["x", "y", "z"],
  euler: ["x", "y", "z"],
  vector2: ["x", "y"],
};

function asRobotData(value: unknown): RobotDataLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as RobotDataLike;
}

/**
 * Catalog backed by the face's live managed standard inputs.
 *
 * This is the production source: it reflects the rig actually loaded, including
 * any collision suffixes `ensureUniquePath` assigned, which a `RobotData`-derived
 * catalog does not model.
 */
export function buildCatalogFromInputPaths(
  inputs: Iterable<{ path: string }>,
): PropsRigTargetCatalog {
  const paths = new Set<string>();
  for (const input of inputs) {
    const path = input?.path?.trim();
    if (path) {
      paths.add(path);
    }
  }
  return createPropsRigTargetCatalog(paths);
}

export function createPropsRigTargetCatalog(
  paths: Iterable<string>,
): PropsRigTargetCatalog {
  const set = new Set(paths);
  return {
    hasInputPath: (path) => set.has(path),
    get size() {
      return set.size;
    },
  };
}

/**
 * Builds a catalog of the propsrig input paths a Vizij face would generate,
 * derived from the `RobotData` extension embedded in a GLB.
 *
 * This mirrors what `buildAutoRigInputBlueprints` produces at load time, but
 * without needing a parsed Three scene, so it is usable from plain tests.
 * Note it does not model `ensureUniquePath` collision suffixes: those only
 * appear when two element names normalize onto the same segment, which no
 * current asset does (asserted by the corpus test).
 */
export function buildCatalogFromRobotData(
  json: GltfJsonLike,
): PropsRigTargetCatalog {
  const paths = new Set<string>();

  for (const node of json.nodes ?? []) {
    const extensions = (node as { extensions?: unknown } | null)?.extensions;
    if (!extensions || typeof extensions !== "object") {
      continue;
    }
    const robotData = asRobotData(
      (extensions as Record<string, unknown>).RobotData,
    );
    const features = robotData?.features;
    if (!features) {
      continue;
    }

    const elementName =
      (typeof robotData?.name === "string" && robotData.name) ||
      (typeof robotData?.id === "string" && robotData.id) ||
      "";
    if (!elementName) {
      continue;
    }

    for (const [featureKey, feature] of Object.entries(features)) {
      if (!feature?.animated) {
        continue;
      }
      const valueType =
        typeof feature.value?.type === "string" ? feature.value.type : "";
      const components = COMPONENTS_BY_TYPE[valueType];
      if (components) {
        for (const component of components) {
          paths.add(
            buildPropsRigInputPath({ elementName, featureKey, component }),
          );
        }
        continue;
      }
      paths.add(buildPropsRigInputPath({ elementName, featureKey }));
    }
  }

  return createPropsRigTargetCatalog(paths);
}

/**
 * Element names present in a GLB's `RobotData`, keyed by the propsrig path
 * segment they normalize to. Used to detect name-normalization collisions,
 * which would make `ensureUniquePath` suffixes load-bearing.
 */
export function collectRobotDataElementNames(
  json: GltfJsonLike,
): Map<string, Set<string>> {
  const bySegment = new Map<string, Set<string>>();

  for (const node of json.nodes ?? []) {
    const extensions = (node as { extensions?: unknown } | null)?.extensions;
    if (!extensions || typeof extensions !== "object") {
      continue;
    }
    const robotData = asRobotData(
      (extensions as Record<string, unknown>).RobotData,
    );
    if (!robotData) {
      continue;
    }
    const elementName =
      (typeof robotData.name === "string" && robotData.name) ||
      (typeof robotData.id === "string" && robotData.id) ||
      "";
    if (!elementName) {
      continue;
    }
    // Reuse the real path builder so the segment rule cannot drift: the
    // element segment is the second path token.
    const segment = buildPropsRigInputPath({
      elementName,
      featureKey: "probe",
    }).split("/")[2];
    const bucket = bySegment.get(segment);
    if (bucket) {
      bucket.add(elementName);
    } else {
      bySegment.set(segment, new Set([elementName]));
    }
  }

  return bySegment;
}
