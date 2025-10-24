import type { AnimatableValue } from "@vizij/utils";
import { cloneRawValue } from "@vizij/utils";

type Traversable = {
  traverse: (callback: (object: Record<string, any>) => void) => void;
};

export function applyDefaultsToRobotData(
  bodies: Traversable[],
  animatablesById: Record<string, AnimatableValue>,
): void {
  bodies.forEach((root) => {
    root.traverse((object: Record<string, any>) => {
      const robotData = object.userData?.gltfExtensions?.RobotData;
      if (!robotData || !robotData.features) {
        return;
      }
      Object.values(robotData.features).forEach((feature: unknown) => {
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
      });
    });
  });
}
