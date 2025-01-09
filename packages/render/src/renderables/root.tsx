import { ReactNode, memo, RefObject, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { RawValue, instanceOfRawNumber } from "@semio/utils";
import { useFeatures } from "../hooks/use-features";
import { useVizijStore } from "../hooks/use-vizij-store";
import { VizijActions } from "../store-types";
import { Renderable } from "./renderable";
import { Root } from "../types/root";

export interface RenderedRootProps {
  id: string;
  namespace: string;
}

function InnerRenderedRoot({ id, namespace }: RenderedRootProps): ReactNode {
  const maskRef = useRef<SVGRectElement>() as RefObject<SVGRectElement>;
  const ref = useRef<SVGRectElement>() as RefObject<SVGRectElement>;
  const root = useVizijStore(useShallow((state) => state.world[id] as Root));

  useFeatures(namespace, root.features, {
    height: (height: RawValue) => {
      if (ref.current && instanceOfRawNumber(height)) {
        ref.current.setAttribute("height", height.toString());
      }
      if (maskRef.current && instanceOfRawNumber(height)) {
        maskRef.current.setAttribute("height", height.toString());
      }
    },
    width: (width: RawValue) => {
      if (ref.current && instanceOfRawNumber(width)) {
        ref.current.setAttribute("width", width.toString());
      }
      if (maskRef.current && instanceOfRawNumber(width)) {
        maskRef.current.setAttribute("width", width.toString());
      }
    },
  });

  const setReference = useVizijStore(useShallow((state: VizijActions) => state.setReference));

  useEffect(() => {
    setReference(root.id, namespace, ref);
  }, [root.id, namespace, ref, setReference]);

  return (
    <>
      <mask id={`${namespace}.${root.id}.mask`}>
        <rect ref={maskRef} x={0} y={0} fill="white" />
      </mask>
      <rect id={`${namespace}.${root.id}.spacer`} ref={ref} x={0} y={0} fill="transparent" />
      <g id={`${namespace}.${root.id}`} mask={`url(#${namespace}.${root.id}.mask)`}>
        {root.children.map((child) => (
          <Renderable key={child} id={child} namespace={namespace} />
        ))}
      </g>
    </>
  );
}

export const RenderedRoot = memo(InnerRenderedRoot);
