import type {
  AnimatableValue,
  RawValue,
  VectorDescriptorType,
} from "@vizij/utils";
import type { Feature } from "@vizij/render";

const XYZ_COMPONENTS = ["x", "y", "z"] as const;
const RGB_COMPONENTS = ["r", "g", "b"] as const;

export type VectorComponent =
  | (typeof XYZ_COMPONENTS)[number]
  | (typeof RGB_COMPONENTS)[number];

export interface RenderableLike {
  id: string;
  name?: string;
  type: string;
  features?: Record<
    string,
    | undefined
    | {
        animated: boolean;
        value: any;
      }
  >;
}

export type SupportedKind =
  | { type: "number" }
  | { type: "vector3"; descriptorType: VectorDescriptorType };

interface BaseFeatureEntry {
  id: string;
  elementId: string;
  elementName: string;
  elementType: string;
  featureKey: string;
  defaultLabel: string;
  featureLabel: string;
  animated: boolean;
  animatableId?: string;
  descriptor?: AnimatableValue;
  staticValue?: RawValue;
}

export interface NumberFeatureEntry extends BaseFeatureEntry {
  type: "number";
}

export interface VectorFeatureEntry extends BaseFeatureEntry {
  type: "vector3";
  vector: {
    descriptorType: VectorDescriptorType;
    components: readonly VectorComponent[];
  };
}

export type FeatureEntry = NumberFeatureEntry | VectorFeatureEntry;

const FEATURE_SORT_SEQUENCE = [
  "translation",
  "scale",
  "rotation",
  "opacity",
  "color",
] as const;

const FEATURE_SORT_ORDER = new Map<string, number>(
  FEATURE_SORT_SEQUENCE.map((key, index) => [key, index]),
);

function getFeatureSortRank(featureKey: string): number {
  const normalized = featureKey.toLowerCase();
  const rank = FEATURE_SORT_ORDER.get(normalized);
  return rank !== undefined ? rank : FEATURE_SORT_SEQUENCE.length;
}

function formatFeatureLabel(key: string): string {
  if (!key) return "Feature";
  return key
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveFeatureLabel(
  featureKey: string,
  descriptor: AnimatableValue | undefined,
): string {
  const descriptorLabel =
    descriptor?.pub?.output?.trim() || descriptor?.name?.trim();
  if (descriptorLabel && descriptorLabel.length > 0) {
    return descriptorLabel;
  }
  return formatFeatureLabel(featureKey);
}

function getComponentsForDescriptor(
  descriptorType: VectorDescriptorType,
): readonly VectorComponent[] {
  return (
    descriptorType === "rgb" ? RGB_COMPONENTS : XYZ_COMPONENTS
  ) as readonly VectorComponent[];
}

function resolveSupportedKind(
  featureKey: string,
  descriptor: AnimatableValue | undefined,
  value: Feature["value"] | undefined,
): SupportedKind | null {
  const key = featureKey.toLowerCase();

  switch (key) {
    case "color":
      return { type: "vector3", descriptorType: "rgb" };
    case "opacity":
      return { type: "number" };
    case "rotation":
      return { type: "vector3", descriptorType: "euler" };
    case "translation":
      return { type: "vector3", descriptorType: "vector3" };
    case "scale":
      return { type: "vector3", descriptorType: "vector3" };
    default:
      break;
  }

  if (descriptor) {
    if (descriptor.type === "number") {
      return { type: "number" };
    }
    if (
      descriptor.type === "vector3" ||
      descriptor.type === "euler" ||
      descriptor.type === "rgb"
    ) {
      const descriptorType =
        descriptor.type === "vector3" ? "vector3" : descriptor.type;
      if (descriptorType === "rgb") {
        return { type: "vector3", descriptorType: "rgb" };
      }
      return {
        type: "vector3",
        descriptorType: descriptorType as Exclude<VectorDescriptorType, "rgb">,
      };
    }
    return null;
  }

  if (typeof value === "number") {
    return { type: "number" };
  }

  return null;
}

export function buildFeatureEntries(
  world: Record<string, RenderableLike>,
  animatables: Record<string, AnimatableValue>,
  labelOverrides: Record<string, string> = {},
): FeatureEntry[] {
  const entries: FeatureEntry[] = [];

  Object.values(world).forEach((renderable) => {
    const elementName = renderable.name || renderable.id;
    if (!renderable.features) {
      return;
    }

    Object.entries(renderable.features).forEach(([featureKey, feature]) => {
      if (!feature) {
        return;
      }

      if (feature.animated) {
        const descriptor = animatables[feature.value];
        if (!descriptor) {
          return;
        }
        const supported = resolveSupportedKind(
          featureKey,
          descriptor,
          descriptor.default,
        );
        if (!supported) {
          return;
        }

        const entryId = `${renderable.id}:${featureKey}`;
        const defaultLabel = deriveFeatureLabel(featureKey, descriptor);
        const storedLabel =
          "label" in feature && typeof feature.label === "string"
            ? feature.label.trim()
            : "";
        const override = labelOverrides[entryId]?.trim();
        const featureLabel =
          override && override.length > 0
            ? override
            : storedLabel && storedLabel.length > 0
              ? storedLabel
              : defaultLabel;

        if (supported.type === "number") {
          entries.push({
            id: entryId,
            elementId: renderable.id,
            elementName,
            elementType: renderable.type,
            featureKey,
            defaultLabel,
            featureLabel,
            animated: true,
            animatableId: feature.value,
            descriptor,
            type: "number",
          });
          return;
        }

        entries.push({
          id: entryId,
          elementId: renderable.id,
          elementName,
          elementType: renderable.type,
          featureKey,
          defaultLabel,
          featureLabel,
          animated: true,
          animatableId: feature.value,
          descriptor,
          type: "vector3",
          vector: {
            descriptorType: supported.descriptorType,
            components: getComponentsForDescriptor(supported.descriptorType),
          },
        });
        return;
      }

      const supported = resolveSupportedKind(
        featureKey,
        undefined,
        feature.value,
      );
      if (!supported) {
        return;
      }

      const entryId = `${renderable.id}:${featureKey}`;
      const defaultLabel = deriveFeatureLabel(featureKey, undefined);
      const storedLabel =
        "label" in feature && typeof feature.label === "string"
          ? feature.label.trim()
          : "";
      const override = labelOverrides[entryId]?.trim();
      const featureLabel =
        override && override.length > 0
          ? override
          : storedLabel && storedLabel.length > 0
            ? storedLabel
            : defaultLabel;

      if (supported.type === "number") {
        entries.push({
          id: entryId,
          elementId: renderable.id,
          elementName,
          elementType: renderable.type,
          featureKey,
          defaultLabel,
          featureLabel,
          animated: false,
          staticValue: feature.value,
          type: "number",
        });
        return;
      }

      entries.push({
        id: entryId,
        elementId: renderable.id,
        elementName,
        elementType: renderable.type,
        featureKey,
        defaultLabel,
        featureLabel,
        animated: false,
        staticValue: feature.value,
        type: "vector3",
        vector: {
          descriptorType: supported.descriptorType,
          components: getComponentsForDescriptor(supported.descriptorType),
        },
      });
    });
  });

  return entries.sort((a, b) => {
    if (a.elementName === b.elementName) {
      const rankA = getFeatureSortRank(a.featureKey);
      const rankB = getFeatureSortRank(b.featureKey);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return a.featureLabel.localeCompare(b.featureLabel);
    }
    return a.elementName.localeCompare(b.elementName);
  });
}
