import { ReactNode, memo, RefObject, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  RawValue,
  instanceOfRawNumber,
  instanceOfRawVector2,
  instanceOfRawRGB,
  instanceOfRawHSL,
  toDegrees,
} from "@semio/utils";
import { useFeatures } from "../hooks/use-features";
import { useVizijStore } from "../hooks/use-vizij-store";
import { VizijActions } from "../store-types";
import { Ellipse } from "../types/ellipse";

export interface RenderedEllipseProps {
  id: string;
  namespace: string;
}

function InnerRenderedEllipse({ id, namespace }: RenderedEllipseProps): ReactNode {
  const groupRef = useRef<SVGGElement>() as RefObject<SVGGElement>;
  const ellipseRef = useRef<SVGEllipseElement>() as RefObject<SVGEllipseElement>;

  const ellipse = useVizijStore(useShallow((state) => state.world[id] as Ellipse));

  useFeatures(namespace, ellipse.features, {
    translation: (pos: RawValue) => {
      if (groupRef.current && instanceOfRawVector2(pos)) {
        // TODO use gpu-accelerated transforms instead
        const translation = `translate(${pos.x},${pos.y})`;
        const rotation = groupRef.current.getAttribute("rotation") ?? "rotate(0)";
        const transform = `${translation} ${rotation}`;
        groupRef.current.setAttribute("translation", translation);
        groupRef.current.setAttribute("transform", transform);
      }
    },
    rotation: (rot: RawValue) => {
      if (groupRef.current && instanceOfRawNumber(rot)) {
        const translation = groupRef.current.getAttribute("translation") ?? "translate(0 0)";
        const rotation = `rotate(${toDegrees(rot)})`;
        const transform = `${translation} ${rotation}`;
        groupRef.current.setAttribute("rotation", rotation);
        groupRef.current.setAttribute("transform", transform);
      }
    },
    height: (height: RawValue) => {
      if (ellipseRef.current && instanceOfRawNumber(height)) {
        ellipseRef.current.setAttribute("ry", `${height / 2}px`);
      }
    },
    width: (width: RawValue) => {
      if (ellipseRef.current && instanceOfRawNumber(width)) {
        ellipseRef.current.setAttribute("rx", `${width / 2}px`);
      }
    },
    fillOpacity: (fillOpacity: RawValue) => {
      if (ellipseRef.current && instanceOfRawNumber(fillOpacity)) {
        ellipseRef.current.setAttribute("fill-opacity", fillOpacity.toString());
      }
    },
    strokeOpacity: (strokeOpacity: RawValue) => {
      if (ellipseRef.current && instanceOfRawNumber(strokeOpacity)) {
        ellipseRef.current.setAttribute("stroke-opacity", strokeOpacity.toString());
      }
    },
    fillColor: (fillColor: RawValue) => {
      if (ellipseRef.current && instanceOfRawRGB(fillColor)) {
        ellipseRef.current.setAttribute(
          "fill",
          `rgb(${fillColor.r * 255},${fillColor.g * 255},${fillColor.b * 255})`,
        );
      } else if (ellipseRef.current && instanceOfRawHSL(fillColor)) {
        ellipseRef.current.setAttribute(
          "fill",
          `hsl(${fillColor.h * 255},${fillColor.s * 255},${fillColor.l * 255})`,
        );
      }
    },
    strokeColor: (strokeColor: RawValue) => {
      if (ellipseRef.current && instanceOfRawRGB(strokeColor)) {
        ellipseRef.current.setAttribute(
          "stroke",
          `rgb(${strokeColor.r * 255},${strokeColor.g * 255},${strokeColor.b * 255})`,
        );
      } else if (ellipseRef.current && instanceOfRawHSL(strokeColor)) {
        ellipseRef.current.setAttribute(
          "stroke",
          `hsl(${strokeColor.h * 255},${strokeColor.s * 255},${strokeColor.l * 255})`,
        );
      }
    },
  });

  const setReference = useVizijStore(useShallow((state: VizijActions) => state.setReference));

  useEffect(() => {
    setReference(ellipse.id, namespace, groupRef);
  }, [ellipse.id, namespace, groupRef, setReference]);

  return (
    <g ref={groupRef}>
      <ellipse ref={ellipseRef} id={`${namespace}.${ellipse.id}`} />
    </g>
  );
}

export const RenderedEllipse = memo(InnerRenderedEllipse);
