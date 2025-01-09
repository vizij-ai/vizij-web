import { memo } from "react";
import { useShallow } from "zustand/shallow";
import { getLookup } from "@semio/utils";
import { NumberSlider } from "./number-slider";
import { useVizijStore } from "../hooks/use-vizij-store";

function InnerController({
  animatableId,
  namespace,
}: {
  animatableId: string;
  namespace?: string;
}) {
  const setValue = useVizijStore(useShallow((state) => state.setValue));
  const animatable = useVizijStore(useShallow((state) => state.animatables[animatableId]));
  const lookupId = getLookup(namespace ?? "default", animatableId);
  const rawValue = useVizijStore(useShallow((state) => state.values.get(lookupId)));

  if (animatable.type === "number") {
    return (
      <NumberSlider
        value={(rawValue ?? animatable.default) as number}
        onChange={(v) => {
          setValue(animatableId, namespace ?? "default", v);
        }}
        min={animatable.constraints.min}
        max={animatable.constraints.max}
      />
    );
  }
}

export const Controller = memo(InnerController);
