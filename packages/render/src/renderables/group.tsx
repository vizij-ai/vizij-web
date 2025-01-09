import { ReactNode, memo, RefObject, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { RawValue, instanceOfRawNumber, instanceOfRawVector2 } from "@semio/utils";
import { useFeatures } from "../hooks/use-features";
import { useVizijStore } from "../hooks/use-vizij-store";
import { VizijActions } from "../store-types";
import { Renderable } from "./renderable";
import { Group } from "../types/group";

export interface RenderedGroupProps {
  id: string;
  namespace: string;
}

function InnerRenderedGroup({ id, namespace }: RenderedGroupProps): ReactNode {
  const ref = useRef<SVGGElement>() as RefObject<SVGGElement>;
  const group = useVizijStore(useShallow((state) => state.world[id] as Group));

  useFeatures(namespace, group.features, {
    translation: (pos: RawValue) => {
      if (ref.current && instanceOfRawVector2(pos)) {
        // TODO use gpu-accelerated transforms instead
        const translation = `translate(${pos.x} ${pos.y})`;
        const rotation = ref.current.getAttribute("rotation") ?? "rotate(0rad)";
        const scale = ref.current.getAttribute("scale") ?? "scale(1 1)";
        const transform = `${rotation} ${translation} ${scale}`;
        ref.current.setAttribute("translation", translation);
        ref.current.setAttribute("transform", transform);
      }
    },
    rotation: (rot: RawValue) => {
      if (ref.current && instanceOfRawNumber(rot)) {
        const translation = ref.current.getAttribute("translation") ?? "translate(0 0)";
        const rotation = `rotate(${rot}rad)`;
        const scale = ref.current.getAttribute("scale") ?? "scale(1 1)";
        const transform = `${rotation} ${translation} ${scale}`;
        ref.current.setAttribute("rotation", rotation);
        ref.current.setAttribute("transform", transform);
      }
    },
    scale: (scl: RawValue) => {
      if (ref.current && instanceOfRawVector2(scl)) {
        const translation = ref.current.getAttribute("translation") ?? "translate(0 0)";
        const rotation = ref.current.getAttribute("rotation") ?? "rotate(0rad)";
        const scale = `scale(${scl.x} ${scl.y})`;
        const transform = `${rotation} ${translation} ${scale}`;
        ref.current.setAttribute("scale", scale);
        ref.current.setAttribute("transform", transform);
      } else if (ref.current && instanceOfRawNumber(scl)) {
        const translation = ref.current.getAttribute("translation") ?? "translate(0 0)";
        const rotation = ref.current.getAttribute("rotation") ?? "rotate(0rad)";
        const scale = `scale(${scl} ${scl})`;
        const transform = `${rotation} ${translation} ${scale}`;
        ref.current.setAttribute("scale", scale);
        ref.current.setAttribute("transform", transform);
      }
    },
  });

  const setReference = useVizijStore(useShallow((state: VizijActions) => state.setReference));

  useEffect(() => {
    setReference(group.id, namespace, ref);
  }, [group.id, namespace, ref, setReference]);

  return (
    <g ref={ref} id={`${namespace}.${group.id}`}>
      {group.children.map((child) => (
        <Renderable key={child} id={child} namespace={namespace} />
      ))}
    </g>
  );
}

export const RenderedGroup = memo(InnerRenderedGroup);
