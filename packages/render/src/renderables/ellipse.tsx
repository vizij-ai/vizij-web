import { ReactNode, memo, RefObject, useEffect, useRef, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  RawValue,
  AnimatableValue,
  instanceOfRawNumber,
  instanceOfRawVector2,
  instanceOfRawVector3,
  instanceOfRawEuler,
  instanceOfRawRGB,
  instanceOfRawHSL,
} from "@semio/utils";
import { Circle } from "@react-three/drei";
import { Mesh, MeshStandardMaterial } from "three";
import { useFeatures } from "../hooks/use-features";
import { useVizijStore } from "../hooks/use-vizij-store";
import { VizijActions } from "../store-types";
import { Ellipse } from "../types/ellipse";
import { createStoredRenderable } from "../functions/create-stored-data";

export interface RenderedEllipseProps {
  id: string;
  namespace: string;
}

function InnerRenderedEllipse({ id, namespace }: RenderedEllipseProps): ReactNode {
  const ellipseRef = useRef<Mesh>() as RefObject<Mesh>;
  const materialRef = useRef<MeshStandardMaterial>() as RefObject<MeshStandardMaterial>;

  const ellipse = useVizijStore(useShallow((state) => state.world[id] as Ellipse));

  const animatables = useVizijStore(useShallow((state) => state.animatables));

  const animatableValues = useMemo(() => {
    const av: Record<string, AnimatableValue> = {};
    Object.values(ellipse.features).forEach((feat) => {
      if (feat.animated) {
        const animatable = animatables[feat.value];
        av[animatable.id] = animatable;
      }
    });
    return av;
  }, [ellipse.features, animatables]);

  const userData = {
    gltfExtensions: {
      RobotData: createStoredRenderable(ellipse, animatableValues),
    },
  };

  useFeatures(namespace, ellipse.features, {
    translation: (pos: RawValue) => {
      if (ellipseRef.current?.position && instanceOfRawVector3(pos)) {
        ellipseRef.current!.position.set(pos.x as number, pos.y as number, pos.z as number);
      } else if (ellipseRef.current?.position && instanceOfRawVector2(pos)) {
        const currentZ = ellipseRef.current.position.z;
        ellipseRef.current!.position.set(pos.x as number, pos.y as number, currentZ);
      }
    },
    rotation: (rot: RawValue) => {
      if (ellipseRef.current?.rotation && instanceOfRawEuler(rot)) {
        ellipseRef.current!.rotation.set(rot.x, rot.y, rot.z, "ZYX");
      } else if (ellipseRef.current?.rotation && instanceOfRawNumber(rot)) {
        ellipseRef.current!.rotation.set(0, 0, 0);
        ellipseRef.current.rotateZ(rot);
      }
    },
    fillOpacity: (op: RawValue) => {
      if (materialRef.current?.opacity !== undefined && instanceOfRawNumber(op)) {
        materialRef.current.opacity = op;
        if (op < 1.0) {
          materialRef.current.transparent = true;
        } else {
          materialRef.current.transparent = false;
        }
        materialRef.current.needsUpdate = true;
      }
    },
    fillColor: (color: RawValue) => {
      if (materialRef.current?.color) {
        if (instanceOfRawRGB(color)) {
          materialRef.current.color.setRGB(color.r, color.g, color.b);
          materialRef.current.needsUpdate = true;
        } else if (instanceOfRawHSL(color)) {
          materialRef.current.color.setHSL(color.h, color.s, color.l);
          materialRef.current.needsUpdate = true;
        }
      }
    },
    height: (height: RawValue) => {
      if (ellipseRef.current && instanceOfRawNumber(height)) {
        ellipseRef.current.scale.set(ellipseRef.current.scale.x, height, 1);
      }
    },
    width: (width: RawValue) => {
      if (ellipseRef.current && instanceOfRawNumber(width)) {
        ellipseRef.current.scale.set(width, ellipseRef.current.scale.y, 1);
      }
    },
    // strokeOpacity: (strokeOpacity: RawValue) => {
    //   if (ellipseRef.current && instanceOfRawNumber(strokeOpacity)) {
    //     ellipseRef.current.setAttribute("stroke-opacity", strokeOpacity.toString());
    //   }
    // },
    // strokeColor: (strokeColor: RawValue) => {
    //   if (ellipseRef.current && instanceOfRawRGB(strokeColor)) {
    //     ellipseRef.current.setAttribute(
    //       "stroke",
    //       `rgb(${(strokeColor.r * 255).toString()},${(strokeColor.g * 255).toString()},${(strokeColor.b * 255).toString()})`,
    //     );
    //   } else if (ellipseRef.current && instanceOfRawHSL(strokeColor)) {
    //     ellipseRef.current.setAttribute(
    //       "stroke",
    //       `hsl(${(strokeColor.h * 255).toString()},${(strokeColor.s * 255).toString()},${(strokeColor.l * 255).toString()})`,
    //     );
    //   }
    // },
  });

  const setReference = useVizijStore(useShallow((state: VizijActions) => state.setReference));

  useEffect(() => {
    setReference(ellipse.id, namespace, ellipseRef);
  }, [ellipse.id, namespace, ellipseRef, setReference]);

  return (
    <Circle ref={ellipseRef} userData={userData} args={[1]}>
      <meshStandardMaterial attach="material" ref={materialRef} />
    </Circle>
  );
}

export const RenderedEllipse = memo(InnerRenderedEllipse);
