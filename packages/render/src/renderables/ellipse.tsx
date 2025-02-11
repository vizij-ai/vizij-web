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
import { Circle, Line } from "@react-three/drei";
import { Mesh, MeshStandardMaterial } from "three";
import { Line2 } from "three-stdlib";
import { useFeatures } from "../hooks/use-features";
import { useVizijStore } from "../hooks/use-vizij-store";
import { VizijActions } from "../store-types";
import { Ellipse } from "../types/ellipse";
import { createStoredRenderable } from "../functions/create-stored-data";

export interface RenderedEllipseProps {
  id: string;
  namespace: string;
  chain: string[];
}

function InnerRenderedEllipse({ id, namespace, chain }: RenderedEllipseProps): ReactNode {
  const ellipseRef = useRef<Mesh>() as RefObject<Mesh>;
  const materialRef = useRef<MeshStandardMaterial>() as RefObject<MeshStandardMaterial>;
  const lineRef = useRef<Mesh>() as RefObject<Line2>;
  const strokeOffsetRef = useRef<number>(0);
  const strokeWidthRef = useRef<number>(0);
  const onElementClick = useVizijStore(useShallow((state) => state.onElementClick));

  const ellipse = useVizijStore(useShallow((state) => state.world[id] as Ellipse));
  const refIsNull = !ellipse.refs[namespace]?.current;

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
      if (lineRef.current?.position && instanceOfRawVector3(pos)) {
        lineRef.current!.position.set(pos.x as number, pos.y as number, pos.z as number);
      } else if (lineRef.current?.position && instanceOfRawVector2(pos)) {
        const currentZ = lineRef.current.position.z;
        lineRef.current!.position.set(pos.x as number, pos.y as number, currentZ);
      }
    },
    rotation: (rot: RawValue) => {
      if (ellipseRef.current?.rotation && instanceOfRawEuler(rot)) {
        ellipseRef.current!.rotation.set(rot.x, rot.y, rot.z, "ZYX");
      } else if (ellipseRef.current?.rotation && instanceOfRawNumber(rot)) {
        ellipseRef.current!.rotation.set(0, 0, 0);
        ellipseRef.current.rotateZ(rot);
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
      if (ellipseRef.current && instanceOfRawNumber(height)) {
        ellipseRef.current.scale.set(ellipseRef.current.scale.x, height, 1);
      }
      if (ellipseRef.current && lineRef.current && instanceOfRawNumber(height)) {
        const offset =
          (strokeOffsetRef.current * strokeWidthRef.current) / 2 + strokeOffsetRef.current * -1;
        lineRef.current.scale.set(ellipseRef.current.scale.x + offset, height + offset, 1);
      }
    },
    width: (width: RawValue) => {
      if (ellipseRef.current && instanceOfRawNumber(width)) {
        ellipseRef.current.scale.set(width, ellipseRef.current.scale.y, 1);
      }
      if (ellipseRef.current && lineRef.current && instanceOfRawNumber(width)) {
        const offset =
          (strokeOffsetRef.current * strokeWidthRef.current) / 2 + strokeOffsetRef.current * -1;
        lineRef.current.scale.set(width + offset, ellipseRef.current.scale.y + offset, 1);
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
      if (lineRef.current?.material && ellipseRef.current) {
        if (instanceOfRawNumber(strokeWidth)) {
          strokeWidthRef.current = strokeWidth;
          const offset = (strokeWidth * strokeOffsetRef.current) / 2 + strokeOffsetRef.current * -1;
          lineRef.current.scale.set(
            ellipseRef.current.scale.x + offset,
            ellipseRef.current.scale.y + offset,
            1,
          );
          lineRef.current.material.linewidth = strokeWidth;
          lineRef.current.material.needsUpdate = true;
        }
      }
    },
    strokeOffset: (strokeOffset: RawValue) => {
      if (lineRef.current?.material && ellipseRef.current) {
        if (instanceOfRawNumber(strokeOffset)) {
          strokeOffsetRef.current = strokeOffset;
          const offset = (strokeOffset * strokeWidthRef.current) / 2 + strokeOffset * -1;
          lineRef.current.scale.set(
            ellipseRef.current.scale.x + offset,
            ellipseRef.current.scale.y + offset,
            1,
          );
        }
      }
    },
  });

  const setReference = useVizijStore(useShallow((state: VizijActions) => state.setReference));

  const points = useMemo(() => {
    // Compute a line based on a set of 100 points around the circle
    const n = 600;
    const p = [];
    const angleStep = (2 * Math.PI) / n; // Angle between each point in radians

    for (let i = 0; i < n; i++) {
      const angle = i * angleStep;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      p.push([x, y, 0]);
    }
    return p as [number, number, number][];
  }, []);

  useEffect(() => {
    if (ellipseRef.current && refIsNull) setReference(ellipse.id, namespace, ellipseRef);
  }, [ellipse.id, namespace, ellipseRef, setReference, refIsNull]);

  return (
    <>
      <Circle
        ref={ellipseRef}
        userData={userData}
        args={[1, 100]}
        onClick={(e) => {
          onElementClick({ id, type: "ellipse", namespace }, [...chain, id], e);
        }}
      >
        <meshStandardMaterial attach="material" ref={materialRef} />
      </Circle>
      {showLine(ellipse) && <Line ref={lineRef} points={points} />}
    </>
  );
}

export const RenderedEllipse = memo(InnerRenderedEllipse);

const showLine = (ellipse: Ellipse) => {
  if ("strokeOpacity" in ellipse.features) {
    return true;
  } else if ("strokeColor" in ellipse.features) {
    return true;
  } else if ("strokeWidth" in ellipse.features) {
    return true;
  } else if ("strokeOffset" in ellipse.features) {
    return true;
  }
  return false;
};
