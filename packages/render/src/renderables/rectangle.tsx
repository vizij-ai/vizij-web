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
import { Plane, Line } from "@react-three/drei";
import { Mesh, MeshStandardMaterial } from "three";
import { Line2 } from "three-stdlib";
import { useFeatures } from "../hooks/use-features";
import { useVizijStore } from "../hooks/use-vizij-store";
import { VizijActions } from "../store-types";
import { Rectangle } from "../types/rectangle";
import { createStoredRenderable } from "../functions/create-stored-data";

export interface RenderedRectangleProps {
  id: string;
  namespace: string;
}

function InnerRenderedRectangle({ id, namespace }: RenderedRectangleProps): ReactNode {
  const rectangleRef = useRef<Mesh>() as RefObject<Mesh>;
  const materialRef = useRef<MeshStandardMaterial>() as RefObject<MeshStandardMaterial>;
  const lineRef = useRef<Mesh>() as RefObject<Line2>;
  const strokeOffsetRef = useRef<number>(0);
  const strokeWidthRef = useRef<number>(0);

  const rectangle = useVizijStore(useShallow((state) => state.world[id] as Rectangle));

  const animatables = useVizijStore(useShallow((state) => state.animatables));

  const animatableValues = useMemo(() => {
    const av: Record<string, AnimatableValue> = {};
    Object.values(rectangle.features).forEach((feat) => {
      if (feat.animated) {
        const animatable = animatables[feat.value];
        av[animatable.id] = animatable;
      }
    });
    return av;
  }, [rectangle.features, animatables]);

  const userData = {
    gltfExtensions: {
      RobotData: createStoredRenderable(rectangle, animatableValues),
    },
  };

  useFeatures(namespace, rectangle.features, {
    translation: (pos: RawValue) => {
      if (rectangleRef.current?.position && instanceOfRawVector3(pos)) {
        rectangleRef.current!.position.set(pos.x as number, pos.y as number, pos.z as number);
      } else if (rectangleRef.current?.position && instanceOfRawVector2(pos)) {
        const currentZ = rectangleRef.current.position.z;
        rectangleRef.current!.position.set(pos.x as number, pos.y as number, currentZ);
      }
      if (lineRef.current?.position && instanceOfRawVector3(pos)) {
        lineRef.current!.position.set(pos.x as number, pos.y as number, pos.z as number);
      } else if (lineRef.current?.position && instanceOfRawVector2(pos)) {
        const currentZ = lineRef.current.position.z;
        lineRef.current!.position.set(pos.x as number, pos.y as number, currentZ);
      }
    },
    rotation: (rot: RawValue) => {
      if (rectangleRef.current?.rotation && instanceOfRawEuler(rot)) {
        rectangleRef.current!.rotation.set(rot.x, rot.y, rot.z, "ZYX");
      } else if (rectangleRef.current?.rotation && instanceOfRawNumber(rot)) {
        rectangleRef.current!.rotation.set(0, 0, 0);
        rectangleRef.current.rotateZ(rot);
      }
      if (lineRef.current?.rotation && instanceOfRawEuler(rot)) {
        lineRef.current!.rotation.set(rot.x, rot.y, rot.z, "ZYX");
      } else if (lineRef.current?.rotation && instanceOfRawNumber(rot)) {
        lineRef.current!.rotation.set(0, 0, 0);
        lineRef.current.rotateZ(rot);
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
      if (rectangleRef.current && instanceOfRawNumber(height)) {
        rectangleRef.current.scale.set(rectangleRef.current.scale.x, height, 1);
      }
      if (rectangleRef.current && lineRef.current && instanceOfRawNumber(height)) {
        const offset =
          (strokeOffsetRef.current * strokeWidthRef.current) / 2 + strokeOffsetRef.current * -1;
        lineRef.current.scale.set(rectangleRef.current.scale.x + offset, height + offset, 1);
      }
    },
    width: (width: RawValue) => {
      if (rectangleRef.current && instanceOfRawNumber(width)) {
        rectangleRef.current.scale.set(width, rectangleRef.current.scale.y, 1);
      }
      if (rectangleRef.current && lineRef.current && instanceOfRawNumber(width)) {
        const offset =
          (strokeOffsetRef.current * strokeWidthRef.current) / 2 + strokeOffsetRef.current * -1;
        lineRef.current.scale.set(width + offset, rectangleRef.current.scale.y + offset, 1);
      }
    },
    strokeOpacity: (strokeOpacity: RawValue) => {
      if (lineRef.current?.material && instanceOfRawNumber(strokeOpacity)) {
        lineRef.current.material.opacity = strokeOpacity;
        if (strokeOpacity < 1.0) {
          lineRef.current.material.transparent = true;
        } else {
          lineRef.current.material.transparent = false;
        }
        lineRef.current.material.needsUpdate = true;
      }
    },
    strokeColor: (strokeColor: RawValue) => {
      if (lineRef.current?.material.color) {
        if (instanceOfRawRGB(strokeColor)) {
          lineRef.current.material.color.setRGB(strokeColor.r, strokeColor.g, strokeColor.b);
          lineRef.current.material.needsUpdate = true;
        } else if (instanceOfRawHSL(strokeColor)) {
          lineRef.current.material.color.setHSL(strokeColor.h, strokeColor.s, strokeColor.l);
          lineRef.current.material.needsUpdate = true;
        }
      }
    },
    strokeWidth: (strokeWidth: RawValue) => {
      if (lineRef.current?.material && rectangleRef.current) {
        if (instanceOfRawNumber(strokeWidth)) {
          strokeWidthRef.current = strokeWidth;
          const offset = (strokeWidth * strokeOffsetRef.current) / 2 + strokeOffsetRef.current * -1;
          lineRef.current.scale.set(
            rectangleRef.current.scale.x + offset,
            rectangleRef.current.scale.y + offset,
            1,
          );
          lineRef.current.material.linewidth = strokeWidth;
          lineRef.current.material.needsUpdate = true;
        }
      }
    },
    strokeOffset: (strokeOffset: RawValue) => {
      if (lineRef.current?.material && rectangleRef.current) {
        if (instanceOfRawNumber(strokeOffset)) {
          strokeOffsetRef.current = strokeOffset;
          const offset = (strokeOffset * strokeWidthRef.current) / 2 + strokeOffset * -1;
          lineRef.current.scale.set(
            rectangleRef.current.scale.x + offset,
            rectangleRef.current.scale.y + offset,
            1,
          );
        }
      }
    },
  });

  const setReference = useVizijStore(useShallow((state: VizijActions) => state.setReference));

  const points = useMemo(() => {
    return [
      [-0.5, 0.5, 0],
      [0.5, 0.5, 0],
      [0.5, -0.5, 0],
      [-0.5, -0.5, 0],
      [-0.5, 0.5, 0],
    ] as [number, number, number][];
  }, []);

  useEffect(() => {
    setReference(rectangle.id, namespace, rectangleRef);
  }, [rectangle.id, namespace, rectangleRef, setReference]);

  return (
    <>
      <Plane ref={rectangleRef} userData={userData} args={[1, 1]}>
        <meshStandardMaterial attach="material" ref={materialRef} />
      </Plane>
      {showLine(rectangle) && <Line ref={lineRef} points={points} />}
    </>
  );
}

export const RenderedRectangle = memo(InnerRenderedRectangle);

const showLine = (rectangle: Rectangle) => {
  if ("strokeOpacity" in rectangle.features) {
    return true;
  } else if ("strokeColor" in rectangle.features) {
    return true;
  } else if ("strokeWidth" in rectangle.features) {
    return true;
  } else if ("strokeOffset" in rectangle.features) {
    return true;
  }
  return false;
};
