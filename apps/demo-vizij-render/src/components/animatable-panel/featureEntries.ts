import type { AnimatableValue } from "@vizij/utils";
import type { Feature } from "@vizij/render";
import {
  FeatureEntry,
  RenderableLike,
  SupportedKind,
  VectorDescriptorType,
  VectorComponent,
} from "./types";
import { RGB_COMPONENTS, XYZ_COMPONENTS } from "./constants";

function formatFeatureLabel(key: string): string {
  if (!key) return "Feature";
  return key
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

        if (supported.type === "number") {
          entries.push({
            id: `${renderable.id}:${featureKey}`,
            elementId: renderable.id,
            elementName,
            elementType: renderable.type,
            featureKey,
            featureLabel: formatFeatureLabel(featureKey),
            animated: true,
            animatableId: feature.value,
            descriptor,
            type: "number",
          });
          return;
        }

        entries.push({
          id: `${renderable.id}:${featureKey}`,
          elementId: renderable.id,
          elementName,
          elementType: renderable.type,
          featureKey,
          featureLabel: formatFeatureLabel(featureKey),
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

      if (supported.type === "number") {
        entries.push({
          id: `${renderable.id}:${featureKey}`,
          elementId: renderable.id,
          elementName,
          elementType: renderable.type,
          featureKey,
          featureLabel: formatFeatureLabel(featureKey),
          animated: false,
          staticValue: feature.value,
          type: "number",
        });
        return;
      }

      entries.push({
        id: `${renderable.id}:${featureKey}`,
        elementId: renderable.id,
        elementName,
        elementType: renderable.type,
        featureKey,
        featureLabel: formatFeatureLabel(featureKey),
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
      return a.featureLabel.localeCompare(b.featureLabel);
    }
    return a.elementName.localeCompare(b.elementName);
  });
}
