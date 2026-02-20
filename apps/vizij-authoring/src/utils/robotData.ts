import type { AnimatableValue } from "@vizij/utils";
import { cloneRawValue } from "@vizij/utils";

type Traversable = {
  traverse: (callback: (object: Record<string, any>) => void) => void;
};

function isTraversable(value: unknown): value is Traversable {
  return (
    typeof value === "object" &&
    value !== null &&
    "traverse" in value &&
    typeof (value as { traverse?: unknown }).traverse === "function"
  );
}

export function applyDefaultsToRobotData(
  bodies: Array<Traversable | null | undefined>,
  animatablesById: Record<string, AnimatableValue>,
  labelOverrides: Record<string, string> = {},
): void {
  bodies.forEach((root) => {
    if (!isTraversable(root)) {
      return;
    }
    root.traverse((object: Record<string, any>) => {
      const robotData = object.userData?.gltfExtensions?.RobotData;
      if (!robotData || !robotData.features) {
        return;
      }
      Object.entries(robotData.features).forEach(
        ([featureKey, feature]: [string, unknown]) => {
          if (
            feature &&
            typeof feature === "object" &&
            (feature as { animated?: boolean }).animated &&
            (feature as { value?: AnimatableValue }).value
          ) {
            const current = (feature as { value: AnimatableValue }).value;
            const updated = animatablesById[current.id];
            if (updated) {
              (feature as { value: AnimatableValue }).value = {
                ...(updated as AnimatableValue),
                default: cloneRawValue(
                  updated.default,
                ) as AnimatableValue["default"],
              } as AnimatableValue;
            }
          }
          const entryId =
            typeof robotData?.id === "string"
              ? `${robotData.id}:${featureKey}`
              : null;
          const override =
            entryId && typeof labelOverrides[entryId] === "string"
              ? labelOverrides[entryId]!.trim()
              : "";
          if (override) {
            (feature as { label?: string }).label = override;
          } else if ("label" in (feature as { label?: string })) {
            delete (feature as { label?: string }).label;
          }
        },
      );
    });
  });
}
