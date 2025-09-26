import { memo } from "react";
import { useShallow } from "zustand/shallow";
import { clsx } from "clsx";
import { getLookup, RawEuler, RawRGB, RawValue, RawVector3 } from "utils";
import { ColorPickerPopover, SliderNumberField, Size } from "@semio/ui";
import { useVizijStore } from "../hooks/use-vizij-store";

function InnerController({
  animatableId,
  namespace,
  subfield,
  className,
}: {
  animatableId: string;
  namespace?: string;
  subfield?: string;
  className?: string;
}) {
  const setValue = useVizijStore(useShallow((state) => state.setValue));
  const animatable = useVizijStore(
    useShallow((state) => state.animatables[animatableId]),
  );
  const lookupId = getLookup(namespace ?? "default", animatableId);
  const rawValue: RawValue | undefined = useVizijStore(
    useShallow((state) => state.values.get(lookupId)),
  );

  if (animatable.type === "number") {
    return (
      <div className={clsx("flex flex-col w-full", className)}>
        <SliderNumberField
          size={Size.Sm}
          value={(rawValue ?? animatable.default) as number}
          onChange={(v) => {
            setValue(animatableId, namespace ?? "default", v);
          }}
          min={animatable.constraints.min}
          max={animatable.constraints.max}
        />
      </div>
    );
  } else if (animatable.type === "vector3" && !subfield) {
    return (
      <div className={clsx("flex flex-col gap-2", className)}>
        {["x", "y", "z"].map((axis) => {
          return (
            <InnerController
              animatableId={animatableId}
              namespace={namespace}
              subfield={axis}
              key={axis}
            />
          );
        })}
      </div>
    );
  } else if (animatable.type === "vector2" && !subfield) {
    return (
      <div className={clsx("flex flex-col gap-2", className)}>
        {["x", "y"].map((axis) => {
          return (
            <InnerController
              animatableId={animatableId}
              namespace={namespace}
              subfield={axis}
              key={axis}
            />
          );
        })}
      </div>
    );
  } else if (animatable.type === "euler" && !subfield) {
    return (
      <div className={clsx("flex flex-col gap-2", className)}>
        {["x", "y", "z"].map((axis) => {
          return (
            <InnerController
              animatableId={animatableId}
              namespace={namespace}
              subfield={axis}
              key={axis}
            />
          );
        })}
      </div>
    );
  } else if (animatable.type === "rgb" && !subfield) {
    return (
      <div className={clsx("flex flex-col gap-2", className)}>
        <ColorPickerPopover
          value={
            rawValue
              ? convertRGBRange(rawValue as RawRGB, "255")
              : convertRGBRange(animatable.default as RawRGB, "255")
          }
          onChange={(v) => {
            setValue(
              animatableId,
              namespace ?? "default",
              convertRGBRange(v, "1"),
            );
          }}
        />
      </div>
    );
  } else if (
    animatable.type === "vector3" &&
    subfield &&
    ["x", "y", "z"].includes(subfield)
  ) {
    const axis = subfield as "x" | "y" | "z";
    const currentVec: RawVector3 =
      (rawValue as RawVector3 | undefined) ??
      (animatable.default as RawVector3);
    return (
      <SliderNumberField
        label={axis}
        size={Size.Sm}
        value={currentVec[axis]}
        onChange={(v) => {
          setValue(animatableId, namespace ?? "default", {
            ...currentVec,
            [axis]: v,
          });
        }}
        min={animatable.constraints.min?.[vectorIndexLookup[axis]] ?? undefined}
        max={animatable.constraints.max?.[vectorIndexLookup[axis]] ?? undefined}
      />
    );
  } else if (
    animatable.type === "vector2" &&
    subfield &&
    ["x", "y"].includes(subfield)
  ) {
    const axis = subfield as "x" | "y";
    const currentVec: RawVector3 =
      (rawValue as RawVector3 | undefined) ??
      (animatable.default as RawVector3);
    return (
      <SliderNumberField
        label={axis}
        size={Size.Sm}
        value={currentVec[axis]}
        onChange={(v) => {
          setValue(animatableId, namespace ?? "default", {
            ...currentVec,
            [axis]: v,
          });
        }}
        min={animatable.constraints.min?.[vectorIndexLookup[axis]] ?? undefined}
        max={animatable.constraints.max?.[vectorIndexLookup[axis]] ?? undefined}
      />
    );
  } else if (
    animatable.type === "euler" &&
    subfield &&
    ["x", "y", "z"].includes(subfield)
  ) {
    const axis = subfield as "x" | "y" | "z";
    const currentVec: RawEuler =
      (rawValue as RawEuler | undefined) ?? (animatable.default as RawEuler);
    return (
      <SliderNumberField
        label={axis}
        size={Size.Sm}
        value={currentVec[axis]}
        onChange={(v) => {
          setValue(animatableId, namespace ?? "default", {
            ...currentVec,
            [axis]: v,
          });
        }}
        min={animatable.constraints.min?.[vectorIndexLookup[axis]] ?? undefined}
        max={animatable.constraints.max?.[vectorIndexLookup[axis]] ?? undefined}
      />
    );
  } else if (
    animatable.type === "rgb" &&
    subfield &&
    ["r", "g", "b"].includes(subfield)
  ) {
    const axis = subfield as "r" | "g" | "b";
    const currentVec: RawRGB =
      (rawValue as RawRGB | undefined) ?? (animatable.default as RawRGB);
    return (
      <SliderNumberField
        label={axis}
        size={Size.Sm}
        value={currentVec[axis]}
        strictText
        strictSlider
        onChange={(v) => {
          setValue(animatableId, namespace ?? "default", {
            ...currentVec,
            [axis]: v,
          });
        }}
        min={animatable.constraints.min?.[vectorIndexLookup[axis]] ?? undefined}
        max={animatable.constraints.max?.[vectorIndexLookup[axis]] ?? undefined}
      />
    );
  }
}

export const Controller = memo(InnerController);

const vectorIndexLookup = {
  x: 0,
  y: 1,
  z: 2,
  r: 0,
  g: 1,
  b: 2,
};

const convertRGBRange = (color: RawRGB, to: "255" | "1") => {
  if (to === "255") {
    return {
      r: color.r * 255,
      g: color.g * 255,
      b: color.b * 255,
    };
  } else if (to === "1") {
    return {
      r: color.r / 255,
      g: color.g / 255,
      b: color.b / 255,
    };
  }
  return color;
};
